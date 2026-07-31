# Vehicle Provider

`VehicleProvider` provides `connect`, `disconnect`, `getSnapshot`, `subscribe`, and `dispose`. It emits a product-facing `GroundStationSnapshot`, not protocol packets. `MockVehicleProvider` models bounded values and owns its interval, which `disconnect` and `dispose` clear.

Future adapters must normalize their source at this boundary and must not be imported by dashboard components or Zustand stores.
