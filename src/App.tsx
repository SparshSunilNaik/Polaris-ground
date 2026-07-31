import { useEffect } from 'react'
import { CameraPlaceholder } from './components/dashboard/CameraPlaceholder'
import { MissionSummary } from './components/dashboard/MissionSummary'
import { TimelineCard } from './components/dashboard/TimelineCard'
import { VehicleStatusCard } from './components/dashboard/VehicleStatusCard'
import { AppShell } from './components/layout/AppShell'
import { NavigationRail } from './components/layout/NavigationRail'
import { StatusBar } from './components/layout/StatusBar'
import { TopBar } from './components/layout/TopBar'
import { EmptyState } from './components/ui/EmptyState'
import { MetricDisplay } from './components/ui/MetricDisplay'
import { getAppInfo } from './lib/tauri'
import { createGroundStationService, startGroundStation } from './services/GroundStationService'
import { getTelemetryHealth } from './services/TelemetryService'
import { useGroundStationStore, useWorkspaceStore } from './stores/groundStationStore'
import './index.css'

export default function App() {
  const snapshot = useGroundStationStore((state) => state.snapshot)
  const page = useWorkspaceStore((state) => state.activeWorkspace)
  const setPage = useWorkspaceStore((state) => state.setActiveWorkspace)
  useEffect(() => {
    const service = createGroundStationService()
    const stop = startGroundStation(service)
    void getAppInfo().catch(() => undefined)
    return stop
  }, [])
  if (!snapshot) return <main className="loading-state">Loading Polaris Ground...</main>
  const { telemetry } = snapshot
  const telemetryHealth = getTelemetryHealth(telemetry)
  return (
    <AppShell>
      <NavigationRail active={page} onSelect={setPage} />
      <div className="application-frame">
        <TopBar page={page} snapshot={snapshot} onSettings={() => setPage('Settings')} />
        <div className="workspace" id="main-content">
          {page !== 'Operate' ? (
            <EmptyState
              title={`${page} workspace`}
              description="This operator workspace is prepared for a later Polaris Ground milestone."
            />
          ) : (
            <>
              <section className="dashboard-grid dashboard-primary">
                <CameraPlaceholder />
                <VehicleStatusCard snapshot={snapshot} />
              </section>
              <section className="metrics">
                {' '}
                <MetricDisplay
                  label="Battery"
                  value={`${telemetry.battery.percent.toFixed(0)}%`}
                  detail={`${telemetry.battery.remainingMinutes.toFixed(0)} min remaining`}
                />
                <MetricDisplay
                  label="Altitude"
                  value={`${telemetry.position.altitudeMeters.toFixed(1)} m`}
                  detail="Above home"
                />
                <MetricDisplay
                  label="Ground speed"
                  value={`${telemetry.groundSpeedMps.toFixed(1)} m/s`}
                  detail="Stable flight"
                />
                <MetricDisplay
                  label="Link quality"
                  value={`${telemetry.link.qualityPercent}%`}
                  detail={`${telemetryHealth} · ${telemetry.link.latencyMs} ms`}
                />
              </section>
              <section className="dashboard-grid dashboard-secondary">
                <MissionSummary snapshot={snapshot} />
                <TimelineCard events={snapshot.timeline} />
              </section>
            </>
          )}
        </div>
        <StatusBar snapshot={snapshot} />
      </div>
    </AppShell>
  )
}
