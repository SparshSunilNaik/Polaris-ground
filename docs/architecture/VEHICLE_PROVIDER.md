# Vehicle Provider

`VehicleProvider` provides `connect`, `disconnect`, `getSnapshot`, `subscribe`, `sendCommand`, and `dispose`. It emits a product-facing `GroundStationSnapshot`, not protocol packets. `sendCommand` accepts only a `VehicleAction` and returns a domain `VehicleCommand`; it never exposes protocol fields. `MockVehicleProvider` models bounded values and owns its interval, which `disconnect` and `dispose` clear.

Providers must produce a terminal command outcome (`accepted`, `rejected`, or `timed_out`), prevent a duplicate pending command, and never retry a command silently. Adapters must normalize their source at this boundary and must not be imported by dashboard components or Zustand stores.
