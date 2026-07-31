import type { GroundStationSnapshot } from '../../domain/models'
export function StatusBar({ snapshot }: { snapshot: GroundStationSnapshot }) {
  return (
    <footer className="status-bar">
      <span>Simulation provider</span>
      <span>{snapshot.telemetry.link.latencyMs} ms link latency</span>
      <span>Monitoring-only session</span>
    </footer>
  )
}
