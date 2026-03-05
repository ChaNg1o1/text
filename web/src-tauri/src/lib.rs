use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{Manager, State};

struct BackendRuntime {
    api_origin: String,
    child: Mutex<Option<Child>>,
}

impl BackendRuntime {
    fn new(api_origin: String, child: Child) -> Self {
        Self {
            api_origin,
            child: Mutex::new(Some(child)),
        }
    }

    fn shutdown(&self) {
        if let Ok(mut lock) = self.child.lock() {
            if let Some(mut child) = lock.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

#[tauri::command]
fn get_api_origin(state: State<'_, BackendRuntime>) -> String {
    state.api_origin.clone()
}

fn find_free_port() -> Result<u16, String> {
    let listener = TcpListener::bind(("127.0.0.1", 0)).map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    drop(listener);
    Ok(port)
}

fn backend_binary_filename() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        "text-api.exe"
    }

    #[cfg(not(target_os = "windows"))]
    {
        "text-api"
    }
}

fn resolve_backend_binary<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf, String> {
    let filename = backend_binary_filename();
    let dev_candidate = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("bin")
        .join(filename);

    // In `tauri dev`, prefer the workspace copy over any `target/debug/bin` copy.
    // This avoids stale/corrupted debug artifacts and keeps sidecar behavior
    // aligned with the latest rebuilt binary.
    if cfg!(debug_assertions) && dev_candidate.exists() {
        return Ok(dev_candidate);
    }

    let resource_candidate = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join("bin")
        .join(filename);
    if resource_candidate.exists() {
        return Ok(resource_candidate);
    }

    if dev_candidate.exists() {
        return Ok(dev_candidate);
    }

    Err(format!(
        "Bundled backend binary not found. Tried: {} and {}",
        resource_candidate.display(),
        dev_candidate.display()
    ))
}

fn health_check(port: u16) -> bool {
    let addr = std::net::SocketAddr::from(([127, 0, 0, 1], port));
    let mut stream = match TcpStream::connect_timeout(&addr, Duration::from_millis(300)) {
        Ok(stream) => stream,
        Err(_) => return false,
    };

    let _ = stream.set_read_timeout(Some(Duration::from_millis(400)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(400)));

    let request = b"GET /api/v1/health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n";
    if stream.write_all(request).is_err() {
        return false;
    }

    let mut buf = [0_u8; 256];
    if let Ok(n) = stream.read(&mut buf) {
        if n == 0 {
            return false;
        }
        let head = String::from_utf8_lossy(&buf[..n]);
        return head.contains(" 200 ") || head.contains(" 200\r\n");
    }

    false
}

fn wait_until_ready(child: &mut Child, port: u16) -> Result<(), String> {
    let deadline = Instant::now() + Duration::from_secs(60);

    loop {
        if let Ok(Some(status)) = child.try_wait() {
            let mut detail = format!("Embedded backend exited early: {status}");
            #[cfg(unix)]
            {
                use std::os::unix::process::ExitStatusExt;
                if status.signal() == Some(9) {
                    detail.push_str(
                        " (SIGKILL). On macOS this usually indicates AMFI rejected the sidecar code signature.",
                    );
                }
            }
            return Err(detail);
        }

        if health_check(port) {
            return Ok(());
        }

        if Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            return Err("Embedded backend did not become ready in time.".to_string());
        }

        std::thread::sleep(Duration::from_millis(250));
    }
}

fn sidecar_debug_enabled() -> bool {
    std::env::var("TEXT_TAURI_DEBUG_SIDECAR")
        .map(|raw| {
            let value = raw.trim().to_ascii_lowercase();
            !(value.is_empty() || value == "0" || value == "false" || value == "off")
        })
        .unwrap_or(false)
}

fn dev_backend_mode() -> String {
    std::env::var("TEXT_TAURI_DEV_BACKEND")
        .unwrap_or_else(|_| "auto".to_string())
        .trim()
        .to_ascii_lowercase()
}

fn repo_root_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("..")
}

fn apply_backend_process_env(command: &mut Command, port: u16, debug_sidecar: bool) {
    let log_level = if debug_sidecar { "debug" } else { "warning" };
    let access_log = if debug_sidecar { "1" } else { "0" };
    command
        .env("TEXT_HOST", "127.0.0.1")
        .env("TEXT_PORT", port.to_string())
        .env("TEXT_PRELOAD_EMBEDDING", "false")
        .env("TEXT_API_LOG_LEVEL", log_level)
        .env("TEXT_API_ACCESS_LOG", access_log);

    if debug_sidecar {
        command.stdout(Stdio::inherit()).stderr(Stdio::inherit());
    } else {
        command.stdout(Stdio::null()).stderr(Stdio::null());
    }
}

#[cfg(not(target_os = "windows"))]
fn dev_venv_python(repo_root: &Path) -> PathBuf {
    repo_root.join(".venv").join("bin").join("python")
}

#[cfg(target_os = "windows")]
fn dev_venv_python(repo_root: &Path) -> PathBuf {
    repo_root.join(".venv").join("Scripts").join("python.exe")
}

fn try_spawn_dev_source_backend(
    port: u16,
    debug_sidecar: bool,
) -> Result<Option<BackendRuntime>, String> {
    if !cfg!(debug_assertions) {
        return Ok(None);
    }

    let mode = dev_backend_mode();
    if mode == "binary" {
        return Ok(None);
    }

    let repo_root = repo_root_dir();
    let entry = repo_root
        .join("scripts")
        .join("release")
        .join("text_api_entry.py");
    if !entry.exists() {
        let detail = format!("Dev backend entry not found at '{}'", entry.display());
        if mode == "python" {
            return Err(detail);
        }
        return Ok(None);
    }

    let mut launchers: Vec<Command> = Vec::new();
    let venv_python = dev_venv_python(&repo_root);
    if venv_python.exists() {
        let mut cmd = Command::new(venv_python);
        cmd.arg(&entry);
        launchers.push(cmd);
    }

    let mut uv_cmd = Command::new("uv");
    uv_cmd.arg("run").arg("python").arg(&entry);
    launchers.push(uv_cmd);

    let mut last_error: Option<String> = None;
    for mut command in launchers {
        command.current_dir(&repo_root);
        apply_backend_process_env(&mut command, port, debug_sidecar);
        match command.spawn() {
            Ok(mut child) => match wait_until_ready(&mut child, port) {
                Ok(()) => {
                    let api_origin = format!("http://127.0.0.1:{port}");
                    if debug_sidecar {
                        eprintln!("Started dev source backend at {api_origin}");
                    }
                    return Ok(Some(BackendRuntime::new(api_origin, child)));
                }
                Err(err) => {
                    last_error = Some(err);
                }
            },
            Err(err) => {
                last_error = Some(format!("Failed to spawn dev backend process: {err}"));
            }
        }
    }

    if mode == "python" {
        return Err(last_error.unwrap_or_else(|| "Unknown dev backend launch error".to_string()));
    }

    if debug_sidecar {
        if let Some(detail) = last_error {
            eprintln!(
                "Dev source backend launch failed, falling back to bundled sidecar: {detail}"
            );
        }
    }
    Ok(None)
}

#[cfg(target_os = "macos")]
fn ensure_macos_codesign(path: &Path) -> Result<(), String> {
    let verify = Command::new("/usr/bin/codesign")
        .args(["--verify", "--deep", "--strict", "--verbose=1"])
        .arg(path)
        .output()
        .map_err(|e| {
            format!(
                "Failed to run codesign verification for '{}': {e}",
                path.display()
            )
        })?;
    if verify.status.success() {
        return Ok(());
    }

    let resign = Command::new("/usr/bin/codesign")
        .args(["--force", "--sign", "-", "--timestamp=none"])
        .arg(path)
        .output()
        .map_err(|e| {
            format!(
                "Failed to run codesign ad-hoc signing for '{}': {e}",
                path.display()
            )
        })?;
    if !resign.status.success() {
        return Err(format!(
            "macOS sidecar signature is invalid and automatic re-signing failed for '{}': {}",
            path.display(),
            String::from_utf8_lossy(&resign.stderr).trim()
        ));
    }

    let reverify = Command::new("/usr/bin/codesign")
        .args(["--verify", "--deep", "--strict", "--verbose=1"])
        .arg(path)
        .output()
        .map_err(|e| {
            format!(
                "Failed to re-run codesign verification for '{}': {e}",
                path.display()
            )
        })?;
    if !reverify.status.success() {
        return Err(format!(
            "macOS sidecar signature re-verification failed for '{}': {}",
            path.display(),
            String::from_utf8_lossy(&reverify.stderr).trim()
        ));
    }

    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn ensure_macos_codesign(_path: &Path) -> Result<(), String> {
    Ok(())
}

fn spawn_backend<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<BackendRuntime, String> {
    let port = find_free_port()?;
    let debug_sidecar = sidecar_debug_enabled();

    if let Some(runtime) = try_spawn_dev_source_backend(port, debug_sidecar)? {
        return Ok(runtime);
    }

    let backend_binary = resolve_backend_binary(app)?;
    ensure_macos_codesign(&backend_binary)?;
    let api_origin = format!("http://127.0.0.1:{port}");

    let mut command = Command::new(&backend_binary);
    apply_backend_process_env(&mut command, port, debug_sidecar);

    let mut child = command.spawn().map_err(|e| {
        format!(
            "Failed to start embedded backend '{}': {e}",
            backend_binary.display()
        )
    })?;

    wait_until_ready(&mut child, port)?;
    Ok(BackendRuntime::new(api_origin, child))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .setup(|app| {
            let backend = spawn_backend(app.handle())
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
            app.manage(backend);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_api_origin])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if matches!(
            event,
            tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit
        ) {
            if let Some(state) = app_handle.try_state::<BackendRuntime>() {
                state.shutdown();
            }
        }
    });
}
