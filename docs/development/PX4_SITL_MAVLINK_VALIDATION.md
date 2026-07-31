# PX4 SITL Read-Only MAVLink Validation

Polaris Ground is a read-only MAVLink consumer. It has no command, mission, parameter, firmware, serial, USB, or control capability.

## Verified Fallback Topology

Live PX4 SITL validation used the existing onboard API stream:

```text
PX4 local 18570 --> QGroundControl remote 14550
PX4 local 14580 --> Polaris Ground listen 127.0.0.1:14540
```

QGroundControl remained unaffected. MAVSDK must not bind 14540 during this fallback validation.

Observed live values were system ID `1`, component ID `1`, heading approximately `95.97` degrees, altitude `0.2 m`, ground speed `0.0 m/s`, and battery `100%`. A stop/restart cycle produced one heartbeat-loss event after approximately three seconds, then the same running Ground application automatically reconnected and resumed telemetry with one restoration event.

## Provider Selection

```sh
VITE_VEHICLE_PROVIDER=mavlink VITE_MAVLINK_BIND_ADDRESS=0.0.0.0:14560 pnpm tauri dev
```

The default is `VITE_VEHICLE_PROVIDER=mock`.

## Planned Coexistence Topology

```text
PX4 SITL -- UDP telemetry --> QGroundControl :14550
         -- UDP telemetry --> Polaris Ground :14560
```

The dedicated `14560` stream is not yet validated. It remains the future option for simultaneous QGroundControl, MAVSDK, and Polaris Ground coexistence.

## Validation

Verified live: heartbeat discovery, system/component IDs, attitude heading, altitude, speed, battery value, timeout, single loss event, automatic reconnect, single restoration event, and UI recovery. STATUSTEXT was not observed. The MAVLink 2 system/component header offset regression has a deterministic unit test.

## Parser Integrity

The current decoder accepts MAVLink 1 and 2 framing, safely skips garbage bytes, rejects malformed datagram lengths, and handles multiple complete frames in one UDP datagram. It does not validate MAVLink CRC-extra or signatures. UDP datagrams are not reassembled across receives; a truncated datagram is discarded. Full dialect-aware CRC validation is a tracked hardening item before production flight-adjacent use.

## Clean Shutdown

Closing Polaris Ground invokes the native listener stop command and removes the frontend event subscription. Verify the dedicated port is available before relaunching.
