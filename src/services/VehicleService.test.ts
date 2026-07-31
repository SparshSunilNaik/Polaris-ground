import { describe, expect, it } from 'vitest'
import type { MissionPlan } from '../domain/models'
import { MockVehicleProvider } from '../providers/MockVehicleProvider'
import { VehicleService } from './VehicleService'

const plan: MissionPlan = {
  id: 'test-plan',
  name: 'Test Plan',
  items: [
    {
      id: 'waypoint-1',
      type: 'waypoint',
      latitude: 37.7,
      longitude: -122.4,
      altitudeMeters: 20,
      altitudeReference: 'relative-to-home',
    },
  ],
}

describe('VehicleService mission methods', () => {
  it('delegates validation and mission transfer calls through the provider boundary', async () => {
    const service = new VehicleService(new MockVehicleProvider())
    expect(service.validateMission(plan)).toEqual({ valid: true, issues: [] })
    await expect(service.downloadMission()).resolves.toMatchObject({
      type: 'download',
      status: 'succeeded',
    })
    await expect(service.uploadMission(plan)).resolves.toMatchObject({ type: 'upload', status: 'succeeded' })
    await expect(service.clearMission()).resolves.toMatchObject({ type: 'clear', status: 'succeeded' })
    service.dispose()
  })
})
