# Security And Safety

The application is monitoring-only. It exposes no flight action controls and no Rust command with hardware, filesystem, shell, process, or network-listening authority. The Tauri capability surface relies on the default minimal core permission set; new permissions require explicit review and documentation.
