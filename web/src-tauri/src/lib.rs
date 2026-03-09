use std::fs::File;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{Emitter, Manager, State};

struct BackendRuntime {
    api_origin: String,
    child: Mutex<Option<Child>>,
}

impl BackendRuntime {
    fn new(api_origin: String) -> Self {
        Self {
            api_origin,
            child: Mutex::new(None),
        }
    }

    fn shutdown(&self) {
        if let Ok(mut lock) = self.child.lock() {
            if let Some(mut child) = lock.take() {
                graceful_kill(&mut child);
            }
        }
    }
}

impl Drop for BackendRuntime {
    fn drop(&mut self) {
        self.shutdown();
    }
}

fn graceful_kill(child: &mut Child) {
    #[cfg(unix)]
    {
        let pid = child.id() as i32;
        // SAFETY: killpg sends a signal to a process group we created
        // via process_group(0) at spawn time. The pid equals the pgid.
        unsafe {
            libc::killpg(pid, libc::SIGTERM);
        }

        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            match child.try_wait() {
                Ok(Some(_)) => return,
                Ok(None) if Instant::now() >= deadline => break,
                Ok(None) => std::thread::sleep(Duration::from_millis(100)),
                Err(_) => break,
            }
        }

        unsafe {
            libc::killpg(pid, libc::SIGKILL);
        }
        let _ = child.wait();
    }

    #[cfg(not(unix))]
    {
        let _ = child.kill();
        let _ = child.wait();
    }
}

#[tauri::command]
fn get_api_origin(state: State<'_, BackendRuntime>) -> String {
    state.api_origin.clone()
}

#[tauri::command]
fn save_file(app: tauri::AppHandle, content: String, filename: String) -> Result<String, String> {
    let safe_name = Path::new(&filename)
        .file_name()
        .ok_or("Invalid filename")?;
    let dir = app.path().download_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(safe_name);
    std::fs::write(&path, &content).map_err(|e| e.to_string())?;
    Ok(path.display().to_string())
}

fn find_free_port() -> Result<u16, String> {
    for _ in 0..3 {
        if let Ok(listener) = TcpListener::bind(("127.0.0.1", 0)) {
            if let Ok(addr) = listener.local_addr() {
                return Ok(addr.port());
            }
        }
    }
    Err("Failed to find a free port after 3 attempts".into())
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
        .join("text-api")
        .join(filename);

    if cfg!(debug_assertions) && dev_candidate.exists() {
        return Ok(dev_candidate);
    }

    let resource_candidate = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join("bin")
        .join("text-api")
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
    let mut stream = match TcpStream::connect_timeout(&addr, Duration::from_millis(120)) {
        Ok(stream) => stream,
        Err(_) => return false,
    };

    let _ = stream.set_read_timeout(Some(Duration::from_millis(160)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(160)));

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
    let mut sleep_ms = 20_u64;

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

        std::thread::sleep(Duration::from_millis(sleep_ms));
        sleep_ms = (sleep_ms + 15).min(120);
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

fn apply_backend_process_env(
    command: &mut Command,
    port: u16,
    debug_sidecar: bool,
    log_dir: Option<&Path>,
) {
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
    } else if let Some(dir) = log_dir {
        let _ = std::fs::create_dir_all(dir);
        let log_path = dir.join("text-api-stderr.log");
        match File::create(&log_path) {
            Ok(log_file) => {
                command.stdout(Stdio::null()).stderr(Stdio::from(log_file));
            }
            Err(_) => {
                command.stdout(Stdio::null()).stderr(Stdio::null());
            }
        }
    } else {
        command.stdout(Stdio::null()).stderr(Stdio::null());
    }

    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
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
    log_dir: Option<&Path>,
) -> Result<Option<Child>, String> {
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
        apply_backend_process_env(&mut command, port, debug_sidecar, log_dir);
        match command.spawn() {
            Ok(mut child) => match wait_until_ready(&mut child, port) {
                Ok(()) => {
                    if debug_sidecar {
                        eprintln!("Started dev source backend at http://127.0.0.1:{port}");
                    }
                    return Ok(Some(child));
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

fn spawn_backend_child<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    port: u16,
) -> Result<Child, String> {
    let debug_sidecar = sidecar_debug_enabled();
    let log_dir = app.path().app_log_dir().ok();

    if let Some(child) = try_spawn_dev_source_backend(port, debug_sidecar, log_dir.as_deref())? {
        return Ok(child);
    }

    let backend_binary = resolve_backend_binary(app)?;
    ensure_macos_codesign(&backend_binary)?;

    let mut command = Command::new(&backend_binary);
    apply_backend_process_env(&mut command, port, debug_sidecar, log_dir.as_deref());

    let mut child = command.spawn().map_err(|e| {
        format!(
            "Failed to start embedded backend '{}': {e}",
            backend_binary.display()
        )
    })?;

    wait_until_ready(&mut child, port)?;
    Ok(child)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            // Create the main window programmatically so we can configure WKWebView
            // to allow media autoplay without user gesture.
            #[cfg(target_os = "macos")]
            let main_window = {
                use objc2::MainThreadMarker;
                use objc2_web_kit::{WKAudiovisualMediaTypes, WKWebViewConfiguration};

                // SAFETY: setup() runs on the main thread in a Tauri app.
                let mtm = unsafe { MainThreadMarker::new_unchecked() };
                let config = unsafe { WKWebViewConfiguration::new(mtm) };
                unsafe {
                    config.setMediaTypesRequiringUserActionForPlayback(
                        WKAudiovisualMediaTypes::None,
                    );
                }

                tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::default())
                    .title("text")
                    .inner_size(1320.0, 860.0)
                    .min_inner_size(960.0, 640.0)
                    .resizable(true)
                    .background_color(tauri::webview::Color(2, 4, 7, 255))
                    .with_webview_configuration(config)
                    .build()
                    .map_err(|e| {
                        std::io::Error::new(std::io::ErrorKind::Other, e.to_string())
                    })?
            };

            #[cfg(not(target_os = "macos"))]
            let main_window = {
                let builder =
                    tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::default())
                        .title("text")
                        .inner_size(1320.0, 860.0)
                        .min_inner_size(960.0, 640.0)
                        .resizable(true)
                        .background_color(tauri::webview::Color(2, 4, 7, 255));

                #[cfg(target_os = "windows")]
                // WebView2 still enforces a user gesture for media unless autoplay is enabled explicitly.
                let builder = builder.additional_browser_args(
                    "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --autoplay-policy=no-user-gesture-required",
                );

                builder.build().map_err(|e| {
                    std::io::Error::new(std::io::ErrorKind::Other, e.to_string())
                })?
            };
            let _ = main_window;

            let port = find_free_port()
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
            let api_origin = format!("http://127.0.0.1:{port}");
            app.manage(BackendRuntime::new(api_origin));

            let handle = app.handle().clone();
            std::thread::spawn(move || {
                match spawn_backend_child(&handle, port) {
                    Ok(child) => {
                        if let Some(state) = handle.try_state::<BackendRuntime>() {
                            if let Ok(mut lock) = state.child.lock() {
                                *lock = Some(child);
                            }
                        }
                        let _ = handle.emit("backend-ready", ());
                    }
                    Err(err) => {
                        eprintln!("Backend startup failed: {err}");
                        let _ = handle.emit("backend-error", &err);
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_api_origin, save_file])
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
