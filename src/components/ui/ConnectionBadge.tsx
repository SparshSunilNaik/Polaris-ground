import type { VehicleConnectionState } from '../../domain/models'
export function ConnectionBadge({ state }: { state: VehicleConnectionState }) {
  const label = {
    disconnected: 'Disconnected',
    connecting: 'Connecting',
    connected: 'Connected',
    degraded: 'Telemetry degraded',
    reconnecting: 'Reconnecting',
    error: 'Connection error',
  }[state]
  return <span className={`badge badge-${state}`}>{label}</span>
}
