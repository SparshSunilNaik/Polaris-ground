import { MockVehicleProvider } from '../providers/MockVehicleProvider'
import { MavlinkVehicleProvider } from '../providers/MavlinkVehicleProvider'
import type { ConnectionSettings } from '../domain/connectionSettings'
import {
  loadConnectionSettings,
  endpointFor,
  saveConnectionSettings,
  validateConnectionSettings,
} from '../domain/connectionSettings'
import { applySnapshot } from '../stores/groundStationStore'
import { VehicleService } from './VehicleService'

export const createGroundStationService = (settings = loadConnectionSettings()): VehicleService =>
  new VehicleService(createProvider(settings))

export const applyConnectionSettings = async (
  service: VehicleService,
  settings: ConnectionSettings,
): Promise<void> => {
  const validation = validateConnectionSettings(settings)
  if (!validation.valid) throw new Error('Connection settings are invalid.')
  saveConnectionSettings(settings)
  await service.replaceProvider(createProvider(settings))
}

export const startGroundStation = (service: VehicleService): (() => void) => {
  const unsubscribe = service.subscribe(applySnapshot)
  void service.connect()
  return () => {
    unsubscribe()
    service.dispose()
  }
}

const createProvider = (settings: ConnectionSettings) =>
  settings.provider === 'mavlink'
    ? new MavlinkVehicleProvider(
        endpointFor(settings.bindHost, settings.bindPort),
        endpointFor(settings.remoteHost, settings.remotePort),
      )
    : new MockVehicleProvider()
