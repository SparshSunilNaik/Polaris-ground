import { useEffect, useRef, useState } from 'react'
import { OperatorMap } from './components/dashboard/OperatorMap'
import { ConnectionDiagnostics } from './components/dashboard/ConnectionDiagnostics'
import { ConnectionSettings } from './components/dashboard/ConnectionSettings'
import { MissionSummary } from './components/dashboard/MissionSummary'
import { MissionWorkspace } from './components/dashboard/MissionWorkspace'
import { ManualFlight } from './components/dashboard/ManualFlight'
import { TimelineCard } from './components/dashboard/TimelineCard'
import { VehicleActions } from './components/dashboard/VehicleActions'
import { VehicleStatusCard } from './components/dashboard/VehicleStatusCard'
import { AppShell } from './components/layout/AppShell'
import { NavigationRail } from './components/layout/NavigationRail'
import { StatusBar } from './components/layout/StatusBar'
import { TopBar } from './components/layout/TopBar'
import { EmptyState } from './components/ui/EmptyState'
import { MetricDisplay } from './components/ui/MetricDisplay'
import { getAppInfo } from './lib/tauri'
import {
  applyConnectionSettings,
  createGroundStationService,
  startGroundStation,
} from './services/GroundStationService'
import { getTelemetryHealth } from './services/TelemetryService'
import { useGroundStationStore, useWorkspaceStore } from './stores/groundStationStore'
import type { MissionPlan, VehicleAction } from './domain/models'
import {
  loadConnectionSettings,
  defaultConnectionSettings,
  saveConnectionSettings,
  validateConnectionSettings,
  type ConnectionSettings as Settings,
} from './domain/connectionSettings'
import type { VehicleService } from './services/VehicleService'
import './index.css'

export default function App() {
  const serviceRef = useRef<VehicleService | null>(null)
  const snapshot = useGroundStationStore((state) => state.snapshot)
  const page = useWorkspaceStore((state) => state.activeWorkspace)
  const setPage = useWorkspaceStore((state) => state.setActiveWorkspace)
  const [localMissionPlan, setLocalMissionPlan] = useState<MissionPlan>()
  const [selectedWaypointId, setSelectedWaypointId] = useState<string>()
  const [connectionSettings, setConnectionSettings] = useState<Settings>(loadConnectionSettings)
  const [savedConnectionSettings, setSavedConnectionSettings] = useState<Settings>(loadConnectionSettings)
  const [connectionIssues, setConnectionIssues] = useState<Partial<Record<keyof Settings, string>>>({})
  const [applyingSettings, setApplyingSettings] = useState(false)
  useEffect(() => {
    const service = createGroundStationService()
    serviceRef.current = service
    const stop = startGroundStation(service)
    void getAppInfo().catch(() => undefined)
    return () => {
      serviceRef.current = null
      stop()
    }
  }, [])
  if (!snapshot) return <main className="loading-state">Loading Polaris Ground...</main>
  const { telemetry } = snapshot
  const telemetryHealth = getTelemetryHealth(telemetry)
  const sendCommand = (action: VehicleAction) => {
    void serviceRef.current?.sendCommand(action)
  }
  const updateManualControl = (input: import('./domain/models').ManualControlInput) =>
    serviceRef.current?.updateManualControl(input)
  const validateMission = (plan: import('./domain/models').MissionPlan) =>
    serviceRef.current?.validateMission(plan) ?? {
      valid: false,
      issues: [{ code: 'service_unavailable', message: 'Vehicle service is unavailable.' }],
    }
  const addWaypoint = ({ latitude, longitude }: { latitude: number; longitude: number }) => {
    setLocalMissionPlan((current) => ({
      id: current?.id ?? 'local-mission',
      name: current?.name ?? 'Untitled mission',
      items: [
        ...(current?.items ?? snapshot.mission.activePlan?.items ?? []),
        {
          id: `local-item-${Date.now()}`,
          type: 'waypoint',
          latitude,
          longitude,
          altitudeMeters: Math.max(10, snapshot.telemetry.position.altitudeMeters),
          altitudeReference: 'relative-to-home',
          holdTimeSeconds: 0,
          acceptanceRadiusMeters: 0,
        },
      ],
    }))
  }
  const applySettings = async () => {
    const validation = validateConnectionSettings(connectionSettings)
    setConnectionIssues(validation.issues)
    if (!validation.valid || !serviceRef.current) return
    setApplyingSettings(true)
    try {
      await applyConnectionSettings(serviceRef.current, connectionSettings)
    } finally {
      setApplyingSettings(false)
    }
  }
  return (
    <AppShell>
      <NavigationRail active={page} onSelect={setPage} />
      <div className="application-frame">
        <TopBar page={page} snapshot={snapshot} onSettings={() => setPage('Settings')} />
        <div className="workspace" id="main-content">
          {page === 'Mission' ? (
            <MissionWorkspace
              snapshot={snapshot}
              validate={validateMission}
              onUpload={async (plan) => {
                await serviceRef.current?.uploadMission(plan)
              }}
              onDownload={async () => {
                await serviceRef.current?.downloadMission()
              }}
              onClear={async () => {
                await serviceRef.current?.clearMission()
              }}
              onDraftChange={setLocalMissionPlan}
              initialPlan={localMissionPlan}
              selectedWaypointId={selectedWaypointId}
              onSelectWaypoint={setSelectedWaypointId}
            />
          ) : page === 'Settings' ? (
            <ConnectionSettings
              applying={applyingSettings}
              issues={connectionIssues}
              onApply={() => void applySettings()}
              onSave={() => {
                const validation = validateConnectionSettings(connectionSettings)
                setConnectionIssues(validation.issues)
                if (!validation.valid) return
                saveConnectionSettings(connectionSettings)
                setSavedConnectionSettings(connectionSettings)
              }}
              onCancel={() => {
                setConnectionSettings(savedConnectionSettings)
                setConnectionIssues({})
              }}
              onRestoreDefaults={() => {
                const defaults = defaultConnectionSettings()
                setConnectionSettings(defaults)
                setConnectionIssues({})
              }}
              onChange={(settings) => {
                setConnectionSettings(settings)
                setConnectionIssues(validateConnectionSettings(settings).issues)
              }}
              settings={connectionSettings}
            />
          ) : page === 'Diagnostics' ? (
            <ConnectionDiagnostics
              snapshot={snapshot}
              onReconnect={() => void serviceRef.current?.reconnect()}
            />
          ) : page !== 'Operate' ? (
            <EmptyState
              title={`${page} workspace`}
              description="This operator workspace is prepared for a later Polaris Ground milestone."
            />
          ) : (
            <>
              <section className="dashboard-grid dashboard-primary">
                <OperatorMap
                  localPlan={localMissionPlan ?? snapshot.mission.activePlan}
                  onAddWaypoint={addWaypoint}
                  onSelectWaypoint={setSelectedWaypointId}
                  selectedWaypointId={selectedWaypointId}
                  snapshot={snapshot}
                />
                <div className="operator-side">
                  <VehicleStatusCard snapshot={snapshot} />
                  <MissionSummary onOpenMission={() => setPage('Mission')} snapshot={snapshot} />
                </div>
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
                <TimelineCard events={snapshot.timeline} />
              </section>
              <section className="dashboard-grid dashboard-actions">
                <VehicleActions snapshot={snapshot} onConfirm={sendCommand} />
                <ManualFlight
                  snapshot={snapshot}
                  onEnable={() => void serviceRef.current?.enableManualControl()}
                  onDisable={(reason) => serviceRef.current?.disableManualControl(reason)}
                  onInput={updateManualControl}
                />
              </section>
            </>
          )}
        </div>
        <StatusBar snapshot={snapshot} />
      </div>
    </AppShell>
  )
}
