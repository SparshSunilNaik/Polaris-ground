# Polaris Ground Roadmap

## Project Vision

Polaris Ground is an operator-first desktop Ground Control Station for the Polaris autonomy ecosystem. Its purpose is dependable vehicle supervision through clear state, telemetry, mission, safety, and operator feedback.

The application maintains a clean separation between UI, domain services, providers, adapters, and transport. The operator UI remains protocol-agnostic, while each capability is introduced incrementally and validated against PX4 SITL before broader claims are made. Polaris Ground will eventually integrate with Polaris autonomy capabilities without taking ownership of onboard autonomy decisions.

## Engineering Principles

- Operator safety before convenience
- Explicit command acknowledgement
- Protocol isolation
- Mock-first development where useful
- Incremental SITL validation
- Single-vehicle reliability before multi-vehicle scale
- Observable lifecycle and failure states
- No hidden autonomous actions from Ground
- Backward-compatible provider abstractions where practical

## Architecture Stability

The overall architecture is expected to evolve incrementally rather than through
large-scale rewrites.

New capabilities should integrate into the existing layering whenever practical.

Significant architectural changes require a clear technical justification and
should only be introduced when the current design demonstrably cannot satisfy
the required functionality.

Maintaining stable interfaces between the UI, domain services, providers,
adapters, and transport is preferred over introducing new abstractions
prematurely.

## Architecture Direction

```text
UI
  ↓
VehicleService
  ↓
VehicleProvider
  ↓
Telemetry / Command Adapters
  ↓
MAVLink Transport
  ↓
PX4
```

UI components must not import MAVLink types. Domain models belong above the transport boundary, and mock and MAVLink providers must implement the same provider contract. Inbound telemetry and outbound commands must remain independently testable.

Polaris Ground supervises and commands vehicles. Polaris Core owns autonomy logic, planning, navigation, reactive avoidance, safety supervision, and mission execution.

| Polaris Ground                              | Polaris Core                             |
| ------------------------------------------- | ---------------------------------------- |
| Operator interface and feedback             | Autonomy and planning                    |
| Telemetry, command, and mission supervision | Navigation and reactive avoidance        |
| Visualization and diagnostics               | Safety supervision and mission execution |

## Key Design Decisions

Current architectural decisions include:

- UI remains protocol-agnostic.
- Domain models are independent of MAVLink.
- VehicleProvider defines the primary integration boundary.
- Mock and MAVLink providers implement the same contract.
- Ground supervises vehicles but does not implement autonomy.
- Read and write transport paths remain independently testable.
- Safety-sensitive actions always require observable operator feedback.

## Completed Milestones

### v0.1.0 — Foundation

Complete.

- Tauri 2 desktop application with a React and TypeScript frontend
- Rust native layer, Zustand state management, and Tailwind styling
- VehicleProvider abstraction and deterministic MockVehicleProvider
- Initial operator workspace
- Testing, formatting, linting, build, and CI foundation

### v0.2.0 — Read-Only MAVLink Transport

Complete.

- Native UDP listener and MAVLink frame decoding
- Translation from selected MAVLink messages to domain telemetry
- MavlinkVehicleProvider and environment-based provider selection
- Heartbeat-based vehicle discovery, timeout, and automatic reconnect
- Live heading, altitude, speed, battery, timeline, and connection-state updates
- PX4 SITL validation and MAVLink 2 header-offset regression coverage
- Mock provider preserved

Known limitations:

- Transport is read-only; no outbound commands exist
- MAVLink CRC-extra and signature validation are not implemented
- Dedicated UDP 14560 coexistence stream is pending
- SITL validation used the existing 14540 API stream

## Planned Milestones

### v0.3.0 — Command Transport and Vehicle Actions

Complete. Polaris Ground now provides a constrained, confirmation-gated outbound command path validated against PX4 SITL without QGroundControl.

- Arm, disarm, takeoff, land, Return to Launch, and selected flight-mode changes
- COMMAND_LONG encoding and COMMAND_ACK handling
- Pending, accepted, rejected, and timed-out command states
- Duplicate-command prevention and timeout handling
- Explicit confirmation for safety-sensitive actions
- Native UDP command transport and GCS heartbeat
- Standalone Ground Control Station sender identity and PX4 SITL validation

Architecture:

```text
UI → VehicleService → VehicleProvider → Command Adapter → MAVLink Encoder / Transport → PX4
```

Acceptance criteria:

- UI does not construct MAVLink packets
- Every command has an observable outcome
- Acknowledgements correlate with requests
- Timeout and rejection are distinct
- Commands are never silently retried
- Mock mode remains functional
- SITL validates arm, disarm, takeoff, land, and RTL
- Tests cover success, rejection, timeout, and duplicate prevention

Mission upload is explicitly excluded from v0.3.0.

### v0.4.0 — Mission Management

Candidate scope:

- Mission download and upload
- Waypoint list and editing
- Mission validation, progress, pause/resume where supported, and clear
- Operator confirmation before upload or replacement
- Synchronization between vehicle and local mission state

Acceptance criteria:

- Mission state uses domain models
- UI is independent of MAVLink mission message types
- Partial or failed uploads are reported clearly
- Vehicle and local mission differences are visible
- PX4 SITL validation is complete

Advanced autonomous planning remains in Polaris Core.

### v0.5.0 — Operator Workspace

Candidate scope:

- Map, telemetry, vehicle health, mission, timeline, and command-feedback panels
- Layout persistence and resizable panels
- Connection diagnostics and improved status hierarchy

Acceptance criteria:

- Important safety states are visible without secondary screens
- Disconnected, degraded, and healthy states are visually distinct
- Operator actions provide immediate feedback
- The workspace remains usable at common laptop resolutions

This milestone does not aim to replace QGroundControl.

### v0.6.0 — Camera and Autonomy Observability

Candidate scope:

- Camera/video panel and stream lifecycle
- Detection overlays and autonomy status
- Local-goal visibility, safety-supervisor state, and mission-event visualization
- Future VLA reasoning summaries where appropriate

Acceptance criteria:

- Video loss does not affect command or telemetry transport
- Overlays are separate from raw video
- Autonomy state is observational by default
- Operators can distinguish vehicle telemetry from AI-derived inference
- Visual inference cannot trigger hidden command execution

## Future Exploration

This section is non-committed exploration, not planned delivery scope.

- Dedicated coexistence telemetry port
- Multi-vehicle support
- Mission replay integration and recorded telemetry playback
- Offline map support
- Plugin architecture
- Remote operations and richer diagnostics
- Hardware-in-the-loop and real-vehicle validation

## Explicit Non-Goals

- Replacing QGroundControl entirely
- Implementing autonomy logic inside Ground
- ROS dependency
- Cloud accounts or authentication
- Multi-user collaboration
- Swarm control
- Marketplace or plugin ecosystem
- Unrestricted command scripting
- Automatic command execution from AI output
- Production real-vehicle claims before staged hardware validation

## Release Discipline

- `main` remains stable; work happens on focused feature branches
- Each milestone requires tests, builds, documentation, and SITL evidence
- Feature completion does not automatically imply release readiness
- Tags are created only after merge into `main`
- Generated files and runtime logs must not be committed
- Known limitations must be documented before release
- Safety-sensitive write features require explicit operator-facing validation

## Current Next Step

The immediate next milestone is **v0.4.0 — Mission Management**.

Before implementation, define command-domain interfaces, acknowledgement and timeout models, confirmation policy, supported PX4 commands, command safety constraints, and the SITL validation procedure.
