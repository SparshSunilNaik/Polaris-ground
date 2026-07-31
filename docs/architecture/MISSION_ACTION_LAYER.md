# Mission Action Layer

Phase 1 introduces transport-independent mission plans and transfer lifecycle state. A `MissionPlan` contains ordered `takeoff`, `waypoint`, `land`, and `return-to-launch` items with latitude, longitude, altitude, and a `relative-to-home` altitude reference. MAVLink mission item types, frames, packets, timers, and request state remain below the provider boundary.

`validateMissionPlan` is pure and rejects invalid structural data, waypoint counts outside the supported bounds, invalid coordinates or altitude, unsupported altitude references, duplicate item ids, and invalid takeoff or land ordering. The validator is exposed as `VehicleService.validateMission` so future UI flows validate before requesting an upload.

`VehicleProvider` exposes `downloadMission`, `uploadMission`, and `clearMission`. Each returns an immediate `MissionOperationReceipt`; longer-running transfer state is represented by `MissionSnapshot.activeTransfer` and `MissionSnapshot.mostRecentTransfer`. Transfers use `pending`, `in_progress`, and terminal `succeeded`, `failed`, or `cancelled` states. Terminal operations cannot transition again, and Phase 1 defines no automatic retries.

## Phase 2 Protocol Ownership

`MavlinkVehicleProvider` owns mission protocol state and uses the existing listener-owned `MavlinkConnection` socket. It addresses only the discovered PX4 system/component and sends as GCS `255/190`. React, Zustand, and `VehicleService` receive only domain plans, receipts, snapshots, and operator-facing timeline events.

The adapter supports normal flight-plan mission type `0` only. It encodes `MISSION_REQUEST_LIST`, `MISSION_COUNT`, `MISSION_REQUEST_INT`, `MISSION_ITEM_INT`, `MISSION_ACK`, and `MISSION_CLEAR_ALL`; it decodes `MISSION_REQUEST_INT`, `MISSION_COUNT`, `MISSION_ITEM_INT`, `MISSION_ACK`, `MISSION_CURRENT`, and `MISSION_ITEM_REACHED`. It uses `MISSION_ITEM_INT` with `MAV_FRAME_GLOBAL_RELATIVE_ALT` and never infers an altitude frame. MAVLink 2's omitted trailing zero mission-type extension is interpreted as the normal mission type; any explicit nonzero type fails the active exchange.

Upload sends a validated `MISSION_COUNT`, responds only to requested in-range item sequences, then waits for terminal acknowledgement. A requested item may be resent at most twice after its first response; the provider never retries a full transfer. Download sends `MISSION_REQUEST_LIST`, validates `MISSION_COUNT`, requests items strictly in sequence, and publishes `vehiclePlan` only after every item has been received successfully. It acknowledges the completed download. Clear sends `MISSION_CLEAR_ALL` and only replaces `vehiclePlan` with a confirmed empty plan after accepted acknowledgement.

Each exchange has one five-second timer, rearmed while waiting for count, item request, item, or acknowledgement. Completion, failure, disconnect, and disposal clear the timer. A timeout, malformed message, out-of-order item, unsupported type, transport send failure, or disconnect ends the one active operation exactly once. Late acknowledgements are ignored after termination.

`MISSION_CURRENT` and `MISSION_ITEM_REACHED` update only validated mission-monitoring progress for the discovered vehicle. They do not complete or otherwise mutate an active transfer. Timeline entries use domain wording such as Mission upload started, Mission download completed, Mission cleared, and Mission transfer timed out.

Mission UI, map editing, mission execution controls, float-coordinate `MISSION_ITEM`, alternate mission types or altitude frames, automatic whole-transfer retries, and autonomy integration remain out of scope.

## Phase 3 UI Ownership

The Mission workspace owns an editable local draft in React component state. It calls `VehicleService.validateMission` for domain validation and uses provider snapshots as the sole source of transfer lifecycle, vehicle plan, and monitoring progress. The editable local draft is never replaced by a download or clear operation. The vehicle plan is read-only and is labeled as upload acknowledged until a successful download provides readback evidence.

Upload, download, and clear require explicit keyboard-accessible confirmation dialogs. Upload is blocked by domain validation, disconnected state, or an active transfer; clear explicitly states that it affects only the vehicle mission. No protocol identifiers, raw acknowledgements, frames, timers, or transfer cursors are exposed to the UI.

## PX4 SITL Validation

PX4 SITL validation used the listener-owned Ground socket at `127.0.0.1:14540` and PX4 endpoint `127.0.0.1:14580`, with Ground as the sole GCS peer. Telemetry discovery, GCS heartbeat, and existing command transport remained operational. Mission validation blocked invalid local plans before protocol transmission. Upload, ordered request handling, terminal acknowledgement, download/readback, clear acknowledgement, and empty-mission download completed through the same standalone Ground path.

PX4 accepted normal mission type `0`, relative-home frame `3`, and MAVLink 2 normal-mission extension handling. Ground's final successful-download acknowledgement was accepted. Mission transfer remains intentionally separate from execution controls; start, pause, resume, abort, maps, alternate frames, and autonomy integration are deferred beyond v0.4.
