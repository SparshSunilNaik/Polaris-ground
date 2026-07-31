use std::{
    net::UdpSocket,
    sync::{mpsc, Mutex},
    time::Duration,
};
use tauri::Emitter;

#[derive(Default)]
struct MavlinkListenerState {
    stop_sender: Mutex<Option<mpsc::Sender<()>>>,
}

#[tauri::command]
fn start_mavlink_listener(
    app: tauri::AppHandle,
    state: tauri::State<MavlinkListenerState>,
    bind_address: String,
) -> Result<(), String> {
    let mut sender = state
        .stop_sender
        .lock()
        .map_err(|_| "MAVLink listener state is unavailable")?;
    if sender.is_some() {
        return Ok(());
    }
    let socket = UdpSocket::bind(&bind_address)
        .map_err(|error| format!("Unable to bind MAVLink UDP listener: {error}"))?;
    socket
        .set_read_timeout(Some(Duration::from_millis(250)))
        .map_err(|error| error.to_string())?;
    let (stop_sender, stop_receiver) = mpsc::channel();
    *sender = Some(stop_sender);
    std::thread::spawn(move || {
        let mut buffer = [0_u8; 280];
        let mut received_frames = 0_u64;
        loop {
            if stop_receiver.try_recv().is_ok() {
                break;
            }
            if let Ok((length, _)) = socket.recv_from(&mut buffer) {
                received_frames += 1;
                if received_frames <= 3 || received_frames % 100 == 0 {
                    log::debug!(
                        "MAVLink UDP frame received; count={received_frames}, bytes={length}"
                    );
                }
                let _ = app.emit("mavlink-frame", buffer[..length].to_vec());
            }
        }
    });
    Ok(())
}

#[tauri::command]
fn stop_mavlink_listener(state: tauri::State<MavlinkListenerState>) -> Result<(), String> {
    let mut sender = state
        .stop_sender
        .lock()
        .map_err(|_| "MAVLink listener state is unavailable")?;
    if let Some(stop) = sender.take() {
        let _ = stop.send(());
    }
    Ok(())
}

#[tauri::command]
fn get_app_info() -> AppInfo {
    AppInfo {
        name: "Polaris Ground",
        version: env!("CARGO_PKG_VERSION"),
    }
}

#[tauri::command]
fn get_platform_info() -> PlatformInfo {
    PlatformInfo {
        operating_system: std::env::consts::OS,
        architecture: std::env::consts::ARCH,
    }
}

#[derive(serde::Serialize)]
struct AppInfo {
    name: &'static str,
    version: &'static str,
}

#[derive(serde::Serialize)]
struct PlatformInfo {
    operating_system: &'static str,
    architecture: &'static str,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(MavlinkListenerState::default())
        .invoke_handler(tauri::generate_handler![
            get_app_info,
            get_platform_info,
            start_mavlink_listener,
            stop_mavlink_listener
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exposes_app_metadata() {
        assert_eq!(get_app_info().name, "Polaris Ground");
    }

    #[test]
    fn exposes_platform_metadata() {
        assert!(!get_platform_info().operating_system.is_empty());
    }
}
