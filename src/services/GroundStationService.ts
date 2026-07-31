import { MockVehicleProvider } from '../providers/MockVehicleProvider'
import { MavlinkVehicleProvider } from '../providers/MavlinkVehicleProvider'
import { applySnapshot } from '../stores/groundStationStore'
import { VehicleService } from './VehicleService'

export const createGroundStationService = (): VehicleService =>
  new VehicleService(
    import.meta.env.VITE_VEHICLE_PROVIDER === 'mavlink'
      ? new MavlinkVehicleProvider()
      : new MockVehicleProvider(),
  )

export const startGroundStation = (service: VehicleService): (() => void) => {
  const unsubscribe = service.subscribe(applySnapshot)
  void service.connect()
  return () => {
    unsubscribe()
    service.dispose()
  }
}
