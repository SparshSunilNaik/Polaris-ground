import type { VehicleConnectionState } from '../../domain/models'
export function ConnectionBadge({ state }: { state: VehicleConnectionState }) {
  return <span className={`badge badge-${state}`}>{state === 'connected' ? 'Connected' : state}</span>
}
