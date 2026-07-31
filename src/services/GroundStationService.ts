import { MockVehicleProvider } from '../providers/MockVehicleProvider'
import { applySnapshot } from '../stores/groundStationStore'
import { VehicleService } from './VehicleService'

export const createGroundStationService = (): VehicleService => new VehicleService(new MockVehicleProvider())

export const startGroundStation = (service: VehicleService): (() => void) => {
  const unsubscribe = service.subscribe(applySnapshot)
  void service.connect()
  return () => {
    unsubscribe()
    service.dispose()
  }
}
