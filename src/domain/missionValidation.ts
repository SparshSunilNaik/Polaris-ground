import type { MissionItem, MissionPlan, MissionValidationIssue, MissionValidationResult } from './models'

export const MINIMUM_WAYPOINT_COUNT = 1
export const MAXIMUM_WAYPOINT_COUNT = 500
export const MINIMUM_LATITUDE_DEGREES = -90
export const MAXIMUM_LATITUDE_DEGREES = 90
export const MINIMUM_LONGITUDE_DEGREES = -180
export const MAXIMUM_LONGITUDE_DEGREES = 180
export const MINIMUM_ALTITUDE_METERS = 0
export const MAXIMUM_ALTITUDE_METERS = 10_000
export const MINIMUM_HOLD_TIME_SECONDS = 0
export const MAXIMUM_HOLD_TIME_SECONDS = 600
export const MINIMUM_ACCEPTANCE_RADIUS_METERS = 0
export const MAXIMUM_ACCEPTANCE_RADIUS_METERS = 1_000

const supportedAltitudeReference = 'relative-to-home'

export const validateMissionPlan = (plan: MissionPlan): MissionValidationResult => {
  const issues: MissionValidationIssue[] = []
  if (!plan.id.trim()) issues.push({ code: 'missing_plan_id', message: 'Mission plan id is required.' })
  if (!plan.name.trim()) issues.push({ code: 'missing_plan_name', message: 'Mission plan name is required.' })

  const waypointCount = plan.items.filter((item) => item.type === 'waypoint').length
  if (waypointCount < MINIMUM_WAYPOINT_COUNT)
    issues.push({
      code: 'too_few_waypoints',
      message: `A mission requires at least ${MINIMUM_WAYPOINT_COUNT} waypoint.`,
    })
  if (waypointCount > MAXIMUM_WAYPOINT_COUNT)
    issues.push({
      code: 'too_many_waypoints',
      message: `A mission supports at most ${MAXIMUM_WAYPOINT_COUNT} waypoints.`,
    })

  const itemIds = new Set<string>()
  const takeoffIndexes: number[] = []
  const landIndexes: number[] = []
  plan.items.forEach((item, index) => {
    validateMissionItem(item, itemIds, issues)
    if (item.type === 'takeoff') takeoffIndexes.push(index)
    if (item.type === 'land') landIndexes.push(index)
  })

  if (takeoffIndexes.length > 1)
    issues.push({ code: 'multiple_takeoffs', message: 'A mission may contain only one takeoff item.' })
  if (takeoffIndexes.length === 1 && takeoffIndexes[0] !== 0)
    issues.push({ code: 'takeoff_order', message: 'A takeoff item must be the first mission item.' })
  if (landIndexes.length > 1)
    issues.push({ code: 'multiple_lands', message: 'A mission may contain only one land item.' })
  if (landIndexes.length === 1 && landIndexes[0] !== plan.items.length - 1)
    issues.push({ code: 'land_order', message: 'A land item must be the final mission item.' })

  return { valid: issues.length === 0, issues }
}

const validateMissionItem = (
  item: MissionItem,
  itemIds: Set<string>,
  issues: MissionValidationIssue[],
): void => {
  if (!item.id.trim()) issues.push({ code: 'missing_item_id', message: 'Mission item id is required.' })
  else if (itemIds.has(item.id))
    issues.push({ code: 'duplicate_item_id', message: 'Mission item ids must be unique.', itemId: item.id })
  else itemIds.add(item.id)

  if (!['takeoff', 'waypoint', 'land', 'return-to-launch'].includes(item.type))
    issues.push({
      code: 'unsupported_item_type',
      message: 'Mission item type is not supported.',
      itemId: item.id,
    })
  if (item.altitudeReference !== supportedAltitudeReference)
    issues.push({
      code: 'unsupported_altitude_reference',
      message: 'Only relative-to-home altitude is supported.',
      itemId: item.id,
    })
  if (
    !Number.isFinite(item.latitude) ||
    item.latitude < MINIMUM_LATITUDE_DEGREES ||
    item.latitude > MAXIMUM_LATITUDE_DEGREES
  )
    issues.push({
      code: 'invalid_latitude',
      message: 'Latitude is outside the supported range.',
      itemId: item.id,
    })
  if (
    !Number.isFinite(item.longitude) ||
    item.longitude < MINIMUM_LONGITUDE_DEGREES ||
    item.longitude > MAXIMUM_LONGITUDE_DEGREES
  )
    issues.push({
      code: 'invalid_longitude',
      message: 'Longitude is outside the supported range.',
      itemId: item.id,
    })
  if (
    !Number.isFinite(item.altitudeMeters) ||
    item.altitudeMeters < MINIMUM_ALTITUDE_METERS ||
    item.altitudeMeters > MAXIMUM_ALTITUDE_METERS
  )
    issues.push({
      code: 'invalid_altitude',
      message: 'Altitude is outside the supported range.',
      itemId: item.id,
    })
  if (
    item.holdTimeSeconds !== undefined &&
    (!Number.isFinite(item.holdTimeSeconds) ||
      item.holdTimeSeconds < MINIMUM_HOLD_TIME_SECONDS ||
      item.holdTimeSeconds > MAXIMUM_HOLD_TIME_SECONDS)
  )
    issues.push({
      code: 'invalid_hold_time',
      message: 'Hold time is outside the supported range.',
      itemId: item.id,
    })
  if (
    item.acceptanceRadiusMeters !== undefined &&
    (!Number.isFinite(item.acceptanceRadiusMeters) ||
      item.acceptanceRadiusMeters < MINIMUM_ACCEPTANCE_RADIUS_METERS ||
      item.acceptanceRadiusMeters > MAXIMUM_ACCEPTANCE_RADIUS_METERS)
  )
    issues.push({
      code: 'invalid_acceptance_radius',
      message: 'Acceptance radius is outside the supported range.',
      itemId: item.id,
    })
}
