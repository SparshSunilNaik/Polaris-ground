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
  private provider: VehicleProvider
  private listeners = new Map<(snapshot: GroundStationSnapshot) => void, () => void>()
  private lifecycle = Promise.resolve()

  constructor(provider: VehicleProvider) {
    this.provider = provider
  }
  connect(): Promise<void> {
    return this.provider.connect()
  }
  disconnect(): Promise<void> {
    return this.provider.disconnect()
  }
  reconnect(): Promise<void> {
    return this.provider.reconnect()
  }
  getSnapshot(): GroundStationSnapshot {
    return this.provider.getSnapshot()
  }
  subscribe(listener: (snapshot: GroundStationSnapshot) => void): () => void {
    this.listeners.set(listener, this.provider.subscribe(listener))
    return () => {
      this.listeners.get(listener)?.()
      this.listeners.delete(listener)
    }
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
    this.listeners.forEach((unsubscribe) => unsubscribe())
    this.listeners.clear()
    this.provider.dispose()
  }
  replaceProvider(provider: VehicleProvider): Promise<void> {
    return this.queue(async () => {
      const previous = this.provider
      this.listeners.forEach((unsubscribe) => unsubscribe())
      await previous.disconnect()
      previous.dispose()
      this.provider = provider
      this.listeners.forEach((_, listener) => this.listeners.set(listener, provider.subscribe(listener)))
      await provider.connect()
    })
  }
  private queue<T>(task: () => Promise<T>): Promise<T> {
    const pending = this.lifecycle.then(task, task)
    this.lifecycle = pending.then(
      () => undefined,
      () => undefined,
    )
    return pending
  }
}
