import { describe, expect, it } from 'vitest'
import { compareMissionPlans } from './missionComparison'
import type { MissionPlan } from './models'

const plan = (): MissionPlan => ({
  id: 'local',
  name: 'Survey',
  items: [
    {
      id: 'local-item',
      type: 'waypoint',
      latitude: 37.7749,
      longitude: -122.4194,
      altitudeMeters: 25,
      altitudeReference: 'relative-to-home',
      holdTimeSeconds: 2,
      acceptanceRadiusMeters: 3,
    },
  ],
})

describe('compareMissionPlans', () => {
  it('reports the absence of a downloaded vehicle plan', () => {
    expect(compareMissionPlans(plan(), undefined)).toBe('no_vehicle_plan')
  })

  it('treats transport rounding and generated ids as in sync', () => {
    const vehicle = {
      ...plan(),
      id: 'vehicle',
      items: [{ ...plan().items[0], id: 'vehicle-item-0', latitude: 37.7749005, altitudeMeters: 25.005 }],
    }
    expect(compareMissionPlans(plan(), vehicle)).toBe('in_sync')
  })

  it('detects ordered semantic item differences', () => {
    const vehicle = { ...plan(), items: [{ ...plan().items[0], type: 'land' as const }] }
    expect(compareMissionPlans(plan(), vehicle)).toBe('differs')
  })
})
