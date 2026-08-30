# Manual Flight

Manual Flight is an explicitly enabled, keyboard-operated PX4 Offboard velocity-control feature. React owns keyboard interaction and derives a transport-independent `ManualControlInput`; `VehicleService` forwards domain input through the `VehicleProvider` contract. The selected provider owns control timing, lifecycle transitions, and failure handling. The MAVLink provider uses the existing Tauri-owned UDP connection, so Manual Flight does not create a second socket and React does not import MAVLink types.

```text
ManualFlight UI -> VehicleService -> VehicleProvider -> MAVLink adapter -> Tauri UDP socket -> PX4
```

## Keyboard Mapping

| Key                      | Operator intent                               |
| ------------------------ | --------------------------------------------- |
| `W` / `S`                | Forward / backward                            |
| `A` / `D`                | Left / right                                  |
| Arrow Up / Arrow Down    | Up / down                                     |
| Arrow Left / Arrow Right | Yaw left / yaw right                          |
| Escape                   | Disable keyboard control and neutralize input |

The normalized domain axes are `forward`, `right`, `up`, and `yawRight`. Each axis is `-1`, `0`, or `1`. Axes combine independently for diagonal input, and simultaneous opposing keys neutralize only their shared axis.

Manual Flight tracks an explicit set of held keys. Initial keydown adds a key, keyup removes it, and operating-system keyboard-repeat events do not change the set. Input is ignored when an editable field, content-editable element, select control, or dialog owns the event.

## PX4 Transport

The MAVLink provider owns a 10 Hz setpoint loop. It sends `SET_POSITION_TARGET_LOCAL_NED` (`84`) in `MAV_FRAME_BODY_NED` (`8`) with velocity and yaw-rate fields enabled by type mask `0x05c7`.

Domain axes are converted as follows:

| Domain input | BODY_NED field      | Limit        |
| ------------ | ------------------- | ------------ |
| `forward`    | X velocity          | 0.5 m/s      |
| `right`      | Y velocity          | 0.5 m/s      |
| `up`         | Negative Z velocity | 0.3 m/s      |
| `yawRight`   | Positive yaw rate   | 20 degrees/s |

BODY_NED uses positive Z down, so operator-positive `up` becomes negative Z velocity. Positive `yawRight` becomes positive NED yaw rate.

## Offboard Lifecycle

Keyboard control never enables implicitly from focus or connection state. The operator must select **Enable Keyboard Control** while the vehicle is connected, armed, and reporting valid position telemetry.

The provider lifecycle is:

1. `disabled`: no active keyboard control.
2. `prestreaming`: transmit three neutral BODY_NED setpoints.
3. `entering_offboard`: request PX4 Offboard mode while continuing neutral setpoints.
4. `enabled_neutral`: PX4 heartbeat has confirmed Offboard and input is neutral.
5. `active`: PX4 is in Offboard and normalized input is nonzero.
6. `failed` or `unavailable`: control cannot continue or prerequisites are absent.

Input held during prestreaming is retained but is not transmitted until PX4 confirms Offboard. A PX4 heartbeat leaving Offboard while control is enabled is a terminal safety transition.

## Neutralization And Focus Safety

Key release recomputes input from the remaining held keys, returning an axis to neutral when appropriate. Escape clears every held key, publishes neutral input, disables keyboard control, sends a bounded sequence of neutral frames while transport remains usable, and requests Position mode. Escape never disarms the vehicle.

Window blur, hidden-document state, leaving the operator workspace, disconnect, provider failure, provider disposal, and application shutdown also clear held input and neutralize or terminate the provider lifecycle. No event-age timeout is applied to legitimately held keys.

## Mock Provider

`MockVehicleProvider` implements the same provider contract and deterministic lifecycle. It simulates prestreaming, Offboard entry, neutral and active states, directional position/altitude changes, and disable/disposal cleanup without importing or constructing MAVLink frames. This keeps UI and domain behavior testable independently of PX4 and native transport.

## Validation

### Live Validated

- Standalone Polaris Ground connection to PX4 SITL
- Arm acknowledgement and armed state
- Takeoff and actual climb to approximately 4.4 m
- Neutral prestreaming and PX4 Offboard heartbeat confirmation
- Held `W` forward control and actual movement at approximately 0.5 m/s
- Escape neutralization and Manual Flight returning to `disabled`
- Observed ground speed returning to 0.0 m/s after Escape
- Land acknowledgement, landing, and disarm at approximately 0.2 m

### Automated/Test Validated

- Individual forward, backward, lateral, vertical, and yaw direction mapping
- BODY_NED sign conversion and control limits
- Diagonal input and opposing-key neutralization
- Key release, including release after snapshot/callback rerenders
- Editable-input and dialog suppression
- Focus-loss and workspace-unmount neutralization
- MAVLink provider prestream, Offboard, active, neutral, failure, and disposal lifecycle
- Deterministic mock lifecycle and movement behavior

### Remaining Validation Limitations

- A standalone native macOS keyup event was not conclusively observed through the Accessibility automation harness. Key-release behavior is covered by automated tests.
- Position-mode fallback was requested after Escape, but a subsequent PX4 heartbeat independently confirming Position mode was not captured.

These are validation limitations, not observed failures, and do not block this milestone. Manual Flight must not be used on hardware until staged hardware validation, effective PX4 failsafe parameters, and operator procedures are established.
