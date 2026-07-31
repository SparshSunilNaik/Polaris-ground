import type { GroundStationSnapshot } from '../domain/models'
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
  dispose(): void {
    this.provider.dispose()
  }
}
