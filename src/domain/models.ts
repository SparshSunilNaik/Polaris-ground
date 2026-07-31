export type VehicleConnectionState =
  'disconnected' | 'connecting' | 'connected' | 'degraded' | 'reconnecting' | 'error'

export type AutonomyState =
  'unavailable' | 'idle' | 'preparing' | 'active' | 'paused' | 'landing' | 'interrupted' | 'fault'
export type MissionState = 'idle' | 'ready' | 'running' | 'completed' | 'interrupted' | 'failed'
export type SafetyState = 'unknown' | 'safe' | 'caution' | 'warning' | 'critical'
export type VehicleAction = 'arm' | 'disarm' | 'takeoff' | 'land' | 'returnToLaunch'
export type CommandStatus = 'pending' | 'accepted' | 'rejected' | 'timed_out'

export interface VehicleCommand {
  id: string
  action: VehicleAction
  status: CommandStatus
  requestedAt: number
  completedAt?: number
  message: string
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
  vehicle: VehicleIdentity
  telemetry: VehicleTelemetry
  autonomy: AutonomyState
  mission: MissionSnapshot
  safety: SafetyState
  avoidanceStatus: string
  commands: VehicleCommand[]
  timeline: TimelineEvent[]
}
