use std::{
    collections::{HashMap, HashSet},
    net::{SocketAddr, UdpSocket},
    sync::{mpsc, Mutex},
    thread::JoinHandle,
    time::{Duration, Instant},
};
use tauri::Emitter;

const GCS_HEARTBEAT_INTERVAL: Duration = Duration::from_secs(1);
const VEHICLE_HEARTBEAT_TIMEOUT: Duration = Duration::from_secs(3);

#[derive(Default)]
struct MavlinkListenerState {
    stop_sender: Mutex<Option<mpsc::Sender<()>>>,
    socket: Mutex<Option<UdpSocket>>,
    owners: Mutex<HashSet<String>>,
    worker: Mutex<Option<JoinHandle<()>>>,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct VehicleLinkEvent {
    connection_id: String,
    state: &'static str,
    system_id: u8,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct TransportEvent {
    connection_id: String,
    message: String,
}

struct MavlinkListenerConfig {
    heartbeat_remote_address: SocketAddr,
    heartbeat_frames: Vec<Vec<u8>>,
    heartbeat_interval: Duration,
    vehicle_heartbeat_timeout: Duration,
    connection_id: String,
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
    owners.insert(connection_id.clone());
    *state
        .socket
        .lock()
        .map_err(|_| "MAVLink socket state is unavailable")? = Some(sender_socket);
    let config_connection_id = connection_id.clone();
    let worker = std::thread::spawn(move || {
        run_mavlink_listener(
            socket,
            stop_receiver,
            MavlinkListenerConfig {
                heartbeat_remote_address,
                heartbeat_frames,
                heartbeat_interval: GCS_HEARTBEAT_INTERVAL,
                vehicle_heartbeat_timeout: VEHICLE_HEARTBEAT_TIMEOUT,
                connection_id,
            },
            |frame| {
                let _ = app.emit("mavlink-frame", frame.to_vec());
            },
            |event| {
                let _ = app.emit("mavlink-vehicle-link", event);
            },
            |message| {
                let _ = app.emit(
                    "mavlink-transport",
                    TransportEvent {
                        connection_id: config_connection_id.clone(),
                        message,
                    },
                );
            },
        )
    });
    *state
        .worker
        .lock()
        .map_err(|_| "MAVLink listener worker is unavailable")? = Some(worker);
    Ok(())
}

fn run_mavlink_listener(
    socket: UdpSocket,
    stop_receiver: mpsc::Receiver<()>,
    config: MavlinkListenerConfig,
    mut on_frame: impl FnMut(&[u8]),
    mut on_vehicle_link: impl FnMut(VehicleLinkEvent),
    mut on_transport_failure: impl FnMut(String),
) {
    let mut buffer = [0_u8; 280];
    let mut received_frames = 0_u64;
    let mut heartbeat_index = 0;
    let mut next_heartbeat = Instant::now();
    let mut vehicle_heartbeats = HashMap::new();
    let mut lost_vehicle_systems = HashSet::new();
    loop {
        if stop_receiver.try_recv().is_ok() {
            break;
        }
        if Instant::now() >= next_heartbeat {
            if let Err(error) = socket.send_to(
                &config.heartbeat_frames[heartbeat_index],
                config.heartbeat_remote_address,
            ) {
                log::warn!("Unable to send MAVLink GCS heartbeat: {error}");
                on_transport_failure(format!("MAVLink GCS heartbeat send failed: {error}"));
            }
            heartbeat_index = (heartbeat_index + 1) % config.heartbeat_frames.len();
            next_heartbeat = Instant::now() + config.heartbeat_interval;
        }
        match socket.recv_from(&mut buffer) {
            Ok((length, _)) => {
                received_frames += 1;
                if received_frames <= 3 || received_frames % 100 == 0 {
                    log::debug!(
                        "MAVLink UDP frame received; count={received_frames}, bytes={length}"
                    );
                }
                on_frame(&buffer[..length]);
                if let Some(system_id) = heartbeat_system_id(&buffer[..length]) {
                    let is_new_system = vehicle_heartbeats
                        .insert(system_id, Instant::now())
                        .is_none();
                    if is_new_system || lost_vehicle_systems.remove(&system_id) {
                        on_vehicle_link(VehicleLinkEvent {
                            connection_id: config.connection_id.clone(),
                            state: "restored",
                            system_id,
                        });
                    }
                }
            }
            Err(error)
                if error.kind() == std::io::ErrorKind::WouldBlock
                    || error.kind() == std::io::ErrorKind::TimedOut => {}
            Err(error) => on_transport_failure(format!("MAVLink UDP receive failed: {error}")),
        }
        let now = Instant::now();
        let lost_systems = vehicle_heartbeats
            .iter()
            .filter_map(|(system_id, last_heartbeat)| {
                (now.duration_since(*last_heartbeat) > config.vehicle_heartbeat_timeout
                    && lost_vehicle_systems.insert(*system_id))
                .then_some(*system_id)
            })
            .collect::<Vec<_>>();
        for system_id in lost_systems {
            on_vehicle_link(VehicleLinkEvent {
                connection_id: config.connection_id.clone(),
                state: "lost",
                system_id,
            });
        }
    }
}

fn heartbeat_system_id(frame: &[u8]) -> Option<u8> {
    (frame.len() >= 10 && frame[0] == 0xfd && frame[7] == 0 && frame[8] == 0 && frame[9] == 0)
        .then_some(frame[5])
}

#[tauri::command]
fn stop_mavlink_listener(
    state: tauri::State<MavlinkListenerState>,
    connection_id: String,
) -> Result<(), String> {
    let (stop_sender, worker) = {
        let mut owners = state
            .owners
            .lock()
            .map_err(|_| "MAVLink listener ownership is unavailable")?;
        if !release_listener_owner(&mut owners, &connection_id) {
            return Ok(());
        }
        let stop_sender = state
            .stop_sender
            .lock()
            .map_err(|_| "MAVLink listener state is unavailable")?
            .take();
        *state
            .socket
            .lock()
            .map_err(|_| "MAVLink socket state is unavailable")? = None;
        let worker = state
            .worker
            .lock()
            .map_err(|_| "MAVLink listener worker is unavailable")?
            .take();
        (stop_sender, worker)
    };
    if let Some(stop) = stop_sender {
        let _ = stop.send(());
    }
    if let Some(worker) = worker {
        worker
            .join()
            .map_err(|_| "MAVLink listener worker did not stop cleanly")?;
    }
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
                MavlinkListenerConfig {
                    heartbeat_remote_address: remote,
                    heartbeat_frames: vec![vec![1], vec![2], vec![3]],
                    heartbeat_interval: Duration::from_millis(20),
                    vehicle_heartbeat_timeout: Duration::from_secs(3),
                    connection_id: "test".into(),
                },
                |_| {},
                |_| {},
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
    fn native_listener_emits_single_restore_and_timeout_loss() {
        let vehicle_socket = UdpSocket::bind("127.0.0.1:0").expect("bind vehicle test socket");
        let ground_socket = UdpSocket::bind("127.0.0.1:0").expect("bind ground test socket");
        ground_socket
            .set_read_timeout(Some(Duration::from_millis(5)))
            .expect("set ground timeout");
        let ground_address = ground_socket.local_addr().expect("ground test address");
        let vehicle_address = vehicle_socket.local_addr().expect("vehicle test address");
        let (stop_sender, stop_receiver) = mpsc::channel();
        let (events_sender, events_receiver) = mpsc::channel();
        let worker = std::thread::spawn(move || {
            run_mavlink_listener(
                ground_socket,
                stop_receiver,
                MavlinkListenerConfig {
                    heartbeat_remote_address: vehicle_address,
                    heartbeat_frames: vec![vec![1]],
                    heartbeat_interval: Duration::from_secs(1),
                    vehicle_heartbeat_timeout: Duration::from_millis(30),
                    connection_id: "test".into(),
                },
                |_| {},
                |event| {
                    events_sender
                        .send(event)
                        .expect("record vehicle link event")
                },
                |_| {},
            )
        });

        let heartbeat = [0xfd, 1, 0, 0, 0, 42, 1, 0, 0, 0];
        vehicle_socket
            .send_to(&heartbeat, ground_address)
            .expect("send vehicle heartbeat");
        let restored = events_receiver
            .recv_timeout(Duration::from_millis(100))
            .expect("receive restored event");
        let lost = events_receiver
            .recv_timeout(Duration::from_millis(150))
            .expect("receive lost event");
        stop_sender.send(()).expect("stop native listener");
        worker.join().expect("join native listener");

        assert_eq!(restored.state, "restored");
        assert_eq!(restored.system_id, 42);
        assert_eq!(lost.state, "lost");
        assert_eq!(lost.system_id, 42);
        assert!(events_receiver.try_recv().is_err());
    }

    #[test]
    fn heartbeat_from_another_vehicle_does_not_mask_selected_vehicle_loss() {
        let vehicle_socket = UdpSocket::bind("127.0.0.1:0").expect("bind vehicle test socket");
        let ground_socket = UdpSocket::bind("127.0.0.1:0").expect("bind ground test socket");
        ground_socket
            .set_read_timeout(Some(Duration::from_millis(5)))
            .expect("set ground timeout");
        let ground_address = ground_socket.local_addr().expect("ground test address");
        let vehicle_address = vehicle_socket.local_addr().expect("vehicle test address");
        let (stop_sender, stop_receiver) = mpsc::channel();
        let (events_sender, events_receiver) = mpsc::channel();
        let worker = std::thread::spawn(move || {
            run_mavlink_listener(
                ground_socket,
                stop_receiver,
                MavlinkListenerConfig {
                    heartbeat_remote_address: vehicle_address,
                    heartbeat_frames: vec![vec![1]],
                    heartbeat_interval: Duration::from_secs(1),
                    vehicle_heartbeat_timeout: Duration::from_millis(30),
                    connection_id: "test".into(),
                },
                |_| {},
                |event| {
                    events_sender
                        .send(event)
                        .expect("record vehicle link event")
                },
                |_| {},
            )
        });

        for system_id in [42, 43] {
            vehicle_socket
                .send_to(&[0xfd, 1, 0, 0, 0, system_id, 1, 0, 0, 0], ground_address)
                .expect("send vehicle heartbeat");
        }
        for _ in 0..3 {
            std::thread::sleep(Duration::from_millis(15));
            vehicle_socket
                .send_to(&[0xfd, 1, 0, 0, 0, 43, 1, 0, 0, 0], ground_address)
                .expect("send other vehicle heartbeat");
        }
        let mut events = Vec::new();
        while let Ok(event) = events_receiver.recv_timeout(Duration::from_millis(50)) {
            events.push(event);
            if events
                .iter()
                .any(|event| event.state == "lost" && event.system_id == 42)
            {
                break;
            }
        }
        stop_sender.send(()).expect("stop native listener");
        worker.join().expect("join native listener");

        assert!(events
            .iter()
            .any(|event| event.state == "lost" && event.system_id == 42));
        assert!(!events
            .iter()
            .any(|event| event.state == "lost" && event.system_id == 43));
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
