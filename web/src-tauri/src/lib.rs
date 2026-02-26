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

    let resource_candidate = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join("bin")
        .join(filename);
    if resource_candidate.exists() {
        return Ok(resource_candidate);
    }

    let dev_candidate = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("bin")
        .join(filename);
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
            return Err(format!("Embedded backend exited early: {status}"));
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

fn spawn_backend<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<BackendRuntime, String> {
    let port = find_free_port()?;
    let backend_binary = resolve_backend_binary(app)?;
    let api_origin = format!("http://127.0.0.1:{port}");

    let mut command = Command::new(&backend_binary);
    command
        .env("TEXT_HOST", "127.0.0.1")
        .env("TEXT_PORT", port.to_string())
        .env("TEXT_PRELOAD_EMBEDDING", "false")
        .env("TEXT_API_LOG_LEVEL", "warning")
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    let mut child = command
        .spawn()
        .map_err(|e| format!("Failed to start embedded backend '{}': {e}", backend_binary.display()))?;

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
