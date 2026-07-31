import type {
  GroundStationSnapshot,
  MissionOperationReceipt,
  MissionPlan,
  MissionValidationResult,
  VehicleAction,
  VehicleCommand,
} from '../domain/models'

export interface VehicleProvider {
  connect(): Promise<void>
  disconnect(): Promise<void>
  getSnapshot(): GroundStationSnapshot
  subscribe(listener: (snapshot: GroundStationSnapshot) => void): () => void
  sendCommand(action: VehicleAction): Promise<VehicleCommand>
  downloadMission(): Promise<MissionOperationReceipt>
  uploadMission(plan: MissionPlan): Promise<MissionOperationReceipt>
  clearMission(): Promise<MissionOperationReceipt>
  validateMission(plan: MissionPlan): MissionValidationResult
  dispose(): void
}
