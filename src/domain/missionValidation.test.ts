import { describe, expect, it } from 'vitest'
import { MAXIMUM_WAYPOINT_COUNT, MAXIMUM_ALTITUDE_METERS, validateMissionPlan } from './missionValidation'
import type { MissionPlan } from './models'

const validPlan = (): MissionPlan => ({
  id: 'survey',
  name: 'Survey',
  items: [
    {
      id: 'takeoff',
      type: 'takeoff',
      latitude: 37.7,
      longitude: -122.4,
      altitudeMeters: 20,
      altitudeReference: 'relative-to-home',
    },
    {
      id: 'waypoint-1',
      type: 'waypoint',
      latitude: 37.71,
      longitude: -122.41,
      altitudeMeters: 25,
      altitudeReference: 'relative-to-home',
    },
    {
      id: 'land',
      type: 'land',
      latitude: 37.7,
      longitude: -122.4,
      altitudeMeters: 0,
      altitudeReference: 'relative-to-home',
    },
  ],
})

describe('validateMissionPlan', () => {
  it('accepts a valid relative-to-home mission plan', () => {
    expect(validateMissionPlan(validPlan())).toEqual({ valid: true, issues: [] })
  })

  it('reports coordinate, altitude, and altitude-reference failures', () => {
    const plan = validPlan()
    plan.items[1] = {
      ...plan.items[1],
      latitude: 91,
      longitude: Number.NaN,
      altitudeMeters: MAXIMUM_ALTITUDE_METERS + 1,
      altitudeReference: 'absolute' as never,
    }
    expect(validateMissionPlan(plan).issues.map((issue) => issue.code)).toEqual([
      'unsupported_altitude_reference',
      'invalid_latitude',
      'invalid_longitude',
      'invalid_altitude',
    ])
  })

  it('enforces waypoint count and takeoff/land ordering', () => {
    const noWaypoints = validPlan()
    noWaypoints.items = [noWaypoints.items[0], noWaypoints.items[2]]
    expect(validateMissionPlan(noWaypoints).issues.map((issue) => issue.code)).toContain('too_few_waypoints')

    const invalidOrder = validPlan()
    invalidOrder.items = [invalidOrder.items[1], invalidOrder.items[0], invalidOrder.items[2]]
    expect(validateMissionPlan(invalidOrder).issues.map((issue) => issue.code)).toContain('takeoff_order')

    const tooMany = validPlan()
    tooMany.items = Array.from({ length: MAXIMUM_WAYPOINT_COUNT + 1 }, (_, index) => ({
      ...tooMany.items[1],
      id: `waypoint-${index}`,
    }))
    expect(validateMissionPlan(tooMany).issues.map((issue) => issue.code)).toContain('too_many_waypoints')
  })
})
