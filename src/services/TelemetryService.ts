import type { VehicleTelemetry } from '../domain/models'
export const getTelemetryHealth = (telemetry: VehicleTelemetry): 'Healthy' | 'Attention' =>
  telemetry.link.qualityPercent >= 80 && telemetry.battery.percent >= 25 ? 'Healthy' : 'Attention'
