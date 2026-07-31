import type { MissionSnapshot } from '../domain/models'
export const getMissionSummary = (mission: MissionSnapshot): string =>
  `${mission.currentWaypoint} of ${mission.totalWaypoints} waypoints`
