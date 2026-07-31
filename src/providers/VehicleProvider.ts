import type { GroundStationSnapshot, VehicleAction, VehicleCommand } from '../domain/models'

export interface VehicleProvider {
  connect(): Promise<void>
  disconnect(): Promise<void>
  getSnapshot(): GroundStationSnapshot
  subscribe(listener: (snapshot: GroundStationSnapshot) => void): () => void
  sendCommand(action: VehicleAction): Promise<VehicleCommand>
  dispose(): void
}
