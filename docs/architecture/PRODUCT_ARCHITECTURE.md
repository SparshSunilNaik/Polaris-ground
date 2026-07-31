# Product Architecture

## Overall System

```mermaid
flowchart LR
  Operator[Operator] --> UI[Polaris Ground React UI]
  UI --> Services[Product services]
  Services --> Provider[VehicleProvider]
  Provider --> Mock[MockVehicleProvider]
  UI --> Tauri[Tauri safe metadata commands]
```

## UI Architecture

```mermaid
flowchart TD
  AppShell --> NavigationRail
  AppShell --> TopBar
  AppShell --> OperatorWorkspace
  OperatorWorkspace --> CameraPlaceholder
  OperatorWorkspace --> VehicleStatusCard
  OperatorWorkspace --> MissionSummary
  OperatorWorkspace --> TimelineCard
  AppShell --> StatusBar
```

## Service Architecture

```mermaid
flowchart LR
  GroundStationService --> VehicleService
  VehicleService --> VehicleProvider
  MissionService --> UI
  TelemetryService --> UI
  TimelineService --> UI
  DiscoveryService -. future .-> VehicleProvider
  ConfigurationService -. future .-> UI
```

## Provider And Future Transport

```mermaid
classDiagram
  class VehicleProvider { <<interface>>
    +connect()
    +disconnect()
    +getSnapshot()
    +subscribe()
    +dispose()
  }
  VehicleProvider <|.. MockVehicleProvider
  VehicleProvider <|.. FutureTransportProvider
```

## Data Flow

```mermaid
sequenceDiagram
  participant P as MockVehicleProvider
  participant S as VehicleService
  participant Z as Zustand Store
  participant U as React UI
  P->>S: GroundStationSnapshot
  S->>Z: applySnapshot
  Z->>U: selected state update
```

## Repository Layout

```mermaid
flowchart TD
  Root[Polaris Ground] --> Src[src]
  Src --> Components[components: operator UI]
  Src --> Services[services: product boundaries]
  Src --> Providers[providers: transport contracts]
  Src --> Stores[stores: application state]
  Root --> Tauri[src-tauri: native boundary]
  Root --> Docs[docs: product and architecture]
```

Operator components remain separate from future engineering tools. Future Vehicle Inspector, Protocol Inspector, Firmware Manager, Diagnostics, and raw telemetry views belong in a dedicated engineering feature area and must not alter the operator dashboard contract.
