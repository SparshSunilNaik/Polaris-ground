use std::{
    collections::HashSet,
    net::{SocketAddr, UdpSocket},
    sync::{mpsc, Mutex},
    time::{Duration, Instant},
};
use tauri::Emitter;

const GCS_HEARTBEAT_INTERVAL: Duration = Duration::from_secs(1);

#[derive(Default)]
struct MavlinkListenerState {
    stop_sender: Mutex<Option<mpsc::Sender<()>>>,
    socket: Mutex<Option<UdpSocket>>,
    owners: Mutex<HashSet<String>>,
}

#[tauri::command]
fn start_mavlink_listener(
    app: tauri::AppHandle,
    state: tauri::State<MavlinkListenerState>,
    bind_address: String,
    connection_id: String,
    heartbeat_remote_address: String,
    heartbeat_frames: Vec<Vec<u8>>,
) -> Result<(), String> {
    let mut sender = state
        .stop_sender
        .lock()
        .map_err(|_| "MAVLink listener state is unavailable")?;
    let mut owners = state
        .owners
        .lock()
        .map_err(|_| "MAVLink listener ownership is unavailable")?;
    if sender.is_some() {
        owners.insert(connection_id);
        return Ok(());
    }
    if heartbeat_frames.is_empty() || heartbeat_frames.iter().any(Vec::is_empty) {
        return Err("MAVLink heartbeat frames are unavailable".into());
    }
    let heartbeat_remote_address = heartbeat_remote_address
        .parse::<SocketAddr>()
        .map_err(|error| format!("Invalid MAVLink heartbeat address: {error}"))?;
    let socket = UdpSocket::bind(&bind_address)
        .map_err(|error| format!("Unable to bind MAVLink UDP listener: {error}"))?;
    socket
        .set_read_timeout(Some(Duration::from_millis(250)))
        .map_err(|error| error.to_string())?;
    let sender_socket = socket.try_clone().map_err(|error| error.to_string())?;
    let (stop_sender, stop_receiver) = mpsc::channel();
    *sender = Some(stop_sender);
    owners.insert(connection_id);
    *state
        .socket
        .lock()
        .map_err(|_| "MAVLink socket state is unavailable")? = Some(sender_socket);
    std::thread::spawn(move || {
        run_mavlink_listener(
            socket,
            stop_receiver,
            heartbeat_remote_address,
            heartbeat_frames,
            GCS_HEARTBEAT_INTERVAL,
            |frame| {
                let _ = app.emit("mavlink-frame", frame.to_vec());
            },
        )
    });
    Ok(())
}

fn run_mavlink_listener(
    socket: UdpSocket,
    stop_receiver: mpsc::Receiver<()>,
    heartbeat_remote_address: SocketAddr,
    heartbeat_frames: Vec<Vec<u8>>,
    heartbeat_interval: Duration,
    mut on_frame: impl FnMut(&[u8]),
) {
    let mut buffer = [0_u8; 280];
    let mut received_frames = 0_u64;
    let mut heartbeat_index = 0;
    let mut next_heartbeat = Instant::now();
    loop {
        if stop_receiver.try_recv().is_ok() {
            break;
        }
        if Instant::now() >= next_heartbeat {
            if let Err(error) =
                socket.send_to(&heartbeat_frames[heartbeat_index], heartbeat_remote_address)
            {
                log::warn!("Unable to send MAVLink GCS heartbeat: {error}");
            }
            heartbeat_index = (heartbeat_index + 1) % heartbeat_frames.len();
            next_heartbeat = Instant::now() + heartbeat_interval;
        }
        if let Ok((length, _)) = socket.recv_from(&mut buffer) {
            received_frames += 1;
            if received_frames <= 3 || received_frames % 100 == 0 {
                log::debug!("MAVLink UDP frame received; count={received_frames}, bytes={length}");
            }
            on_frame(&buffer[..length]);
        }
    }
}

#[tauri::command]
fn stop_mavlink_listener(
    state: tauri::State<MavlinkListenerState>,
    connection_id: String,
) -> Result<(), String> {
    let mut sender = state
        .stop_sender
        .lock()
        .map_err(|_| "MAVLink listener state is unavailable")?;
    let mut owners = state
        .owners
        .lock()
        .map_err(|_| "MAVLink listener ownership is unavailable")?;
    if !release_listener_owner(&mut owners, &connection_id) {
        return Ok(());
    }
    if let Some(stop) = sender.take() {
        let _ = stop.send(());
    }
    *state
        .socket
        .lock()
        .map_err(|_| "MAVLink socket state is unavailable")? = None;
    Ok(())
}

fn release_listener_owner(owners: &mut HashSet<String>, connection_id: &str) -> bool {
    owners.remove(connection_id) && owners.is_empty()
}

#[tauri::command]
fn send_mavlink_frame(
    state: tauri::State<MavlinkListenerState>,
    remote_address: String,
    frame: Vec<u8>,
) -> Result<(), String> {
    if frame.is_empty() {
        return Err("MAVLink frame cannot be empty".into());
    }
    let socket = state
        .socket
        .lock()
        .map_err(|_| "MAVLink socket state is unavailable")?;
    let socket = socket.as_ref().ok_or("MAVLink listener is not running")?;
    let local_address = socket.local_addr().map_err(|error| error.to_string())?;
    socket
        .send_to(&frame, &remote_address)
        .map_err(|error| format!("Unable to send MAVLink UDP frame: {error}"))?;
    log::info!(
        "MAVLink command frame sent from {local_address} to {remote_address}; bytes={}",
        frame.len()
    );
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
            stop_mavlink_listener,
            send_mavlink_frame
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

    #[test]
    fn native_listener_sends_heartbeats_without_frontend_scheduling() {
        let px4_socket = UdpSocket::bind("127.0.0.1:0").expect("bind PX4 test socket");
        px4_socket
            .set_read_timeout(Some(Duration::from_millis(200)))
            .expect("set PX4 timeout");
        let ground_socket = UdpSocket::bind("127.0.0.1:0").expect("bind Ground test socket");
        ground_socket
            .set_read_timeout(Some(Duration::from_millis(5)))
            .expect("set Ground timeout");
        let (stop_sender, stop_receiver) = mpsc::channel();
        let remote = px4_socket.local_addr().expect("PX4 test address");
        let worker = std::thread::spawn(move || {
            run_mavlink_listener(
                ground_socket,
                stop_receiver,
                remote,
                vec![vec![1], vec![2], vec![3]],
                Duration::from_millis(20),
                |_| {},
            )
        });

        let mut heartbeats = Vec::new();
        while heartbeats.len() < 4 {
            let mut frame = [0_u8; 1];
            px4_socket.recv_from(&mut frame).expect("receive heartbeat");
            heartbeats.push(frame[0]);
        }
        stop_sender.send(()).expect("stop native listener");
        worker.join().expect("join native listener");

        assert_eq!(heartbeats, vec![1, 2, 3, 1]);
    }

    #[test]
    fn native_listener_stops_only_after_its_last_owner_is_released() {
        let mut owners = HashSet::from(["old".to_owned(), "current".to_owned()]);

        assert!(!release_listener_owner(&mut owners, "old"));
        assert_eq!(owners, HashSet::from(["current".to_owned()]));
        assert!(!release_listener_owner(&mut owners, "stale"));
        assert!(release_listener_owner(&mut owners, "current"));
    }
}
