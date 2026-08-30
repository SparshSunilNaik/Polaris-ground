import type {
  GroundStationSnapshot,
  ManualControlInput,
  MissionOperationReceipt,
  MissionPlan,
  MissionValidationResult,
  VehicleAction,
  VehicleCommand,
} from '../domain/models'
import type { VehicleProvider } from '../providers/VehicleProvider'

export class VehicleService {
  private readonly provider: VehicleProvider

  constructor(provider: VehicleProvider) {
    this.provider = provider
  }
  connect(): Promise<void> {
    return this.provider.connect()
  }
  disconnect(): Promise<void> {
    return this.provider.disconnect()
  }
  getSnapshot(): GroundStationSnapshot {
    return this.provider.getSnapshot()
  }
  subscribe(listener: (snapshot: GroundStationSnapshot) => void): () => void {
    return this.provider.subscribe(listener)
  }
  sendCommand(action: VehicleAction): Promise<VehicleCommand> {
    return this.provider.sendCommand(action)
  }
  enableManualControl(): Promise<void> {
    return this.provider.enableManualControl()
  }
  updateManualControl(input: ManualControlInput): void {
    this.provider.updateManualControl(input)
  }
  disableManualControl(reason?: string): void {
    this.provider.disableManualControl(reason)
  }
  downloadMission(): Promise<MissionOperationReceipt> {
    return this.provider.downloadMission()
  }
  uploadMission(plan: MissionPlan): Promise<MissionOperationReceipt> {
    return this.provider.uploadMission(plan)
  }
  clearMission(): Promise<MissionOperationReceipt> {
    return this.provider.clearMission()
  }
  validateMission(plan: MissionPlan): MissionValidationResult {
    return this.provider.validateMission(plan)
  }
  dispose(): void {
    this.provider.dispose()
  }
}
