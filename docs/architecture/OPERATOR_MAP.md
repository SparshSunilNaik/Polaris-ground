# Operator Map

The Operator workspace uses React Leaflet with OpenStreetMap raster tiles. Leaflet is lightweight, works in the Tauri WebView, and requires no API key or proprietary map-provider account. Tile loading requires normal network access; offline maps are not part of this milestone.

`OperatorMap` consumes only `GroundStationSnapshot` and mission-domain models. It has no MAVLink or transport dependency. Map clicks update the local mission draft only; validation and upload/download/clear continue through `MissionWorkspace`, `VehicleService`, and `VehicleProvider`.
