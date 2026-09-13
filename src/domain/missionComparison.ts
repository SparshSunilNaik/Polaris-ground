import type { MissionItem, MissionPlan } from './models'

export type MissionSyncState = 'no_vehicle_plan' | 'in_sync' | 'differs'

export interface MissionComparisonTolerance {
  latitudeDegrees: number
  longitudeDegrees: number
  altitudeMeters: number
  holdTimeSeconds: number
  acceptanceRadiusMeters: number
}

export const DEFAULT_MISSION_COMPARISON_TOLERANCE: MissionComparisonTolerance = {
  latitudeDegrees: 0.000001,
  longitudeDegrees: 0.000001,
  altitudeMeters: 0.01,
  holdTimeSeconds: 0.01,
  acceptanceRadiusMeters: 0.01,
}

export const compareMissionPlans = (
  local: MissionPlan,
  vehicle: MissionPlan | undefined,
  tolerance: MissionComparisonTolerance = DEFAULT_MISSION_COMPARISON_TOLERANCE,
): MissionSyncState => {
  if (!vehicle) return 'no_vehicle_plan'
  if (local.items.length !== vehicle.items.length) return 'differs'
  return local.items.every((item, index) => itemMatchesVehicle(item, vehicle.items[index], tolerance))
    ? 'in_sync'
    : 'differs'
}

const itemMatchesVehicle = (
  local: MissionItem,
  vehicle: MissionItem | undefined,
  tolerance: MissionComparisonTolerance,
): boolean => {
  if (!vehicle) return false
  return (
    local.type === vehicle.type &&
    local.altitudeReference === vehicle.altitudeReference &&
    withinTolerance(local.latitude, vehicle.latitude, tolerance.latitudeDegrees) &&
    withinTolerance(local.longitude, vehicle.longitude, tolerance.longitudeDegrees) &&
    withinTolerance(local.altitudeMeters, vehicle.altitudeMeters, tolerance.altitudeMeters) &&
    withinTolerance(local.holdTimeSeconds ?? 0, vehicle.holdTimeSeconds ?? 0, tolerance.holdTimeSeconds) &&
    withinTolerance(
      local.acceptanceRadiusMeters ?? 0,
      vehicle.acceptanceRadiusMeters ?? 0,
      tolerance.acceptanceRadiusMeters,
    )
  )
}

const withinTolerance = (left: number, right: number, tolerance: number): boolean =>
  Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= tolerance
