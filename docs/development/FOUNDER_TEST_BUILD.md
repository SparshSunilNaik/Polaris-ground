# Polaris Ground Founder Test Build

## Build

- Version: `0.5.0-beta.1`
- Architecture: Apple Silicon (`arm64`)
- Minimum macOS version: 11.0
- Classification: **Internal Test Build - Not Notarized**
- Signing: ad-hoc signed; no Developer ID signature

This build is self-contained. Running Polaris Ground does not require the source repository, Node.js, pnpm, Rust, Tauri, Cargo, or a Vite development server.

## Install And Open

1. Open `Polaris-Ground-0.5.0-beta.1-arm64.dmg`.
2. Drag **Polaris Ground** into the **Applications** folder shown in the DMG.
3. Open **Polaris Ground** from Applications.
4. If macOS reports that the developer cannot be verified, Control-click **Polaris Ground** in Applications, choose **Open**, then confirm **Open**. Do not disable Gatekeeper globally.
5. Allow local-network access if macOS requests it.

## MAVLink Connection

This specific build has the validated PX4 SITL topology compiled into it:

- Provider: MAVLink
- Ground bind/listen address: `127.0.0.1:14540`
- Vehicle remote address: `127.0.0.1:14580`

The MAVLink endpoint must therefore run on the same Mac and send telemetry to UDP port `14540` while accepting Ground traffic on UDP port `14580`. No `.env` file is read after installation. Connecting to another host or changing ports requires another configured build; runtime endpoint editing is not included in this beta.

PX4 SITL or compatible vehicle software is needed to exercise live telemetry and controls, but it is not needed merely to install and open Polaris Ground.

## Basic Operation

- Confirm the top bar reports **Connected** before issuing commands.
- Arm and Disarm are in **Operate > Vehicle Actions** and each requires confirmation.
- Enable **Keyboard Control** explicitly before Manual Flight input is accepted.
- `W`/`S`: forward/back; `A`/`D`: left/right.
- Arrow Up/Down: up/down; Arrow Left/Right: yaw left/right.
- Release a key to neutralize that axis. Press Escape to clear input and disable Manual Flight. Escape never disarms.

## Known Limitations

- This internal build is not Developer ID signed or Apple notarized, so Gatekeeper may require the per-application opening step above.
- The MAVLink connection may become fragile or disconnect when Polaris Ground loses application focus or the user switches applications. TODO for a future v0.5.x improvement.
- Native macOS keyup was not conclusively observed through the Accessibility automation harness; deterministic automated tests cover key release.
- Position-mode fallback is requested after Escape, but an independent subsequent PX4 heartbeat confirming Position mode was not captured during milestone validation.
- Hardware use requires separate staged validation, appropriate PX4 failsafe configuration, and operator procedures.

## Report Issues

Include the build version, Mac model and macOS version, expected and observed behavior, exact reproduction steps, vehicle/PX4 configuration, and a screenshot of the application timeline or error when available.
