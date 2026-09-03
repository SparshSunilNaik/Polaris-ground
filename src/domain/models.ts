export type VehicleConnectionState =
  'disconnected' | 'connecting' | 'connected' | 'degraded' | 'reconnecting' | 'error'

export interface ConnectionDiagnostics {
  provider: 'mock' | 'mavlink'
  bindAddress?: string
  remoteAddress?: string
  listenerState: 'stopped' | 'starting' | 'listening' | 'failed'
  lastEventAt?: number
  lastMessageAt?: number
  lastHeartbeatAt?: number
  lastError?: string
  receivedMessageCount: number
  transportErrorCount: number
  reconnectAttempts: number
}

export type AutonomyState =
  'unavailable' | 'idle' | 'preparing' | 'active' | 'paused' | 'landing' | 'interrupted' | 'fault'
export type MissionState = 'idle' | 'ready' | 'running' | 'completed' | 'interrupted' | 'failed'
export type SafetyState = 'unknown' | 'safe' | 'caution' | 'warning' | 'critical'
export type VehicleAction = 'arm' | 'disarm' | 'takeoff' | 'land' | 'returnToLaunch'
export type CommandStatus = 'pending' | 'accepted' | 'rejected' | 'timed_out'
export type ManualControlStatus =
  'disabled' | 'prestreaming' | 'entering_offboard' | 'enabled_neutral' | 'active' | 'unavailable' | 'failed'
export type MissionItemType = 'takeoff' | 'waypoint' | 'land' | 'return-to-launch'
export type MissionAltitudeReference = 'relative-to-home'
export type MissionTransferType = 'download' | 'upload' | 'clear'
export type MissionTransferStatus = 'pending' | 'in_progress' | 'succeeded' | 'failed' | 'cancelled'
export type MissionFailureReason =
  | 'unsupported'
  | 'not_connected'
  | 'transfer_in_progress'
  | 'invalid_mission'
  | 'vehicle_rejected'
  | 'transport_error'
  | 'timed_out'

export interface VehicleCommand {
  id: string
  action: VehicleAction
  status: CommandStatus
  requestedAt: number
  completedAt?: number
  message: string
}

export interface ManualControlInput {
  forward: number
  right: number
  up: number
  yawRight: number
}

export interface ManualControlSnapshot {
  status: ManualControlStatus
  input: ManualControlInput
  message: string
}

export interface MissionItem {
  id: string
  type: MissionItemType
  latitude: number
  longitude: number
  altitudeMeters: number
  altitudeReference: MissionAltitudeReference
  holdTimeSeconds?: number
  acceptanceRadiusMeters?: number
}

export interface MissionPlan {
  id: string
  name: string
  items: MissionItem[]
}

export interface MissionTransferOperation {
  id: string
  type: MissionTransferType
  status: MissionTransferStatus
  requestedAt: number
  completedAt?: number
  message?: string
  failureReason?: MissionFailureReason
}

export interface MissionOperationReceipt {
  operationId: string
  type: MissionTransferType
  status: MissionTransferStatus
  requestedAt: number
  message?: string
  failureReason?: MissionFailureReason
}

export interface MissionValidationIssue {
  code: string
  message: string
  itemId?: string
}

export interface MissionValidationResult {
  valid: boolean
  issues: MissionValidationIssue[]
}

export interface VehicleIdentity {
  id: string
  componentId?: number
  name: string
  type: string
  flightMode: string
  armed: boolean
}
export interface VehiclePosition {
  latitude: number
  longitude: number
  altitudeMeters: number
}
export interface VehicleAttitude {
  rollDegrees: number
  pitchDegrees: number
  headingDegrees: number
}
export interface BatteryState {
  percent: number
  voltage: number
  remainingMinutes: number
}
export interface LinkHealth {
  qualityPercent: number
  latencyMs: number
  packetLossPercent: number
}
export interface VehicleTelemetry {
  position: VehiclePosition
  attitude: VehicleAttitude
  groundSpeedMps: number
  battery: BatteryState
  link: LinkHealth
}
export interface MissionSnapshot {
  state: MissionState
  name: string
  currentWaypoint: number
  totalWaypoints: number
  progressPercent: number
  activePlan?: MissionPlan
  vehiclePlan?: MissionPlan
  activeTransfer?: MissionTransferOperation
  mostRecentTransfer?: MissionTransferOperation
}
export interface TimelineEvent {
  id: string
  timestamp: number
  severity: 'info' | 'caution' | 'warning' | 'critical'
  label: string
  message: string
}
export interface GroundStationSnapshot {
  connection: VehicleConnectionState
  diagnostics?: ConnectionDiagnostics
  vehicle: VehicleIdentity
  telemetry: VehicleTelemetry
  autonomy: AutonomyState
  mission: MissionSnapshot
  safety: SafetyState
  avoidanceStatus: string
  commands: VehicleCommand[]
  manualControl: ManualControlSnapshot
  timeline: TimelineEvent[]
}
