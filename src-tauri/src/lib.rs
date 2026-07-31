#[cfg_attr(mobile, tauri::mobile_entry_point)]
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

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![get_app_info, get_platform_info])
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
