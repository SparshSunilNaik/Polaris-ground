import type { GroundStationSnapshot } from '../../domain/models'
export function StatusBar({ snapshot }: { snapshot: GroundStationSnapshot }) {
  const stale = snapshot.connection === 'degraded'
  return (
    <footer className="status-bar">
      <span>Simulation provider</span>
      <span>
        {stale ? 'Vehicle telemetry stale' : `${snapshot.telemetry.link.latencyMs} ms link latency`}
      </span>
      <span>Monitoring-only session</span>
    </footer>
  )
}
