import type { GroundStationSnapshot } from '../domain/models'

export interface VehicleProvider {
  connect(): Promise<void>
  disconnect(): Promise<void>
  getSnapshot(): GroundStationSnapshot
  subscribe(listener: (snapshot: GroundStationSnapshot) => void): () => void
  dispose(): void
}
