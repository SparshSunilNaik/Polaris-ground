import { ConnectionBadge } from '../ui/ConnectionBadge'
import type { GroundStationSnapshot } from '../../domain/models'
export function TopBar({
  page,
  snapshot,
  onSettings,
}: {
  page: string
  snapshot: GroundStationSnapshot
  onSettings: () => void
}) {
  return (
    <header className="top-bar">
      <div>
        <p className="eyebrow">LIVE OPERATIONS</p>
        <h1>{page}</h1>
      </div>
      <div className="top-bar-status">
        <ConnectionBadge state={snapshot.connection} />
        <span>
          {snapshot.vehicle.name} · {snapshot.vehicle.id}
        </span>
        <button aria-label="Open settings" onClick={onSettings}>
          Settings
        </button>
      </div>
    </header>
  )
}
