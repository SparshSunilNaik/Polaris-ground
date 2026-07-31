# System Architecture

React renders product concepts from Zustand stores. A provider owns transport and normalizes updates into `GroundStationSnapshot`; UI code has no transport or protocol dependency. The first provider is deterministic simulation. A future MAVLink provider will satisfy the same interface.

The Tauri Rust boundary is intentionally narrow: app and platform metadata only. No filesystem, shell, process, network listener, USB, serial, or firmware capability is exposed.
