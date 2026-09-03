import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GroundStationSnapshot, MissionPlan } from '../../domain/models'
import { OperatorMap } from './OperatorMap'

let mapClick: ((event: { latlng: { lat: number; lng: number } }) => void) | undefined
vi.mock('leaflet', () => ({ divIcon: (value: unknown) => value }))
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TileLayer: () => null,
  Polyline: () => null,
  Marker: ({ title, eventHandlers }: { title: string; eventHandlers?: { click: () => void } }) => (
    <button aria-label={title} onClick={eventHandlers?.click} type="button">
      {title}
    </button>
  ),
  useMap: () => ({ flyTo: vi.fn(), fitBounds: vi.fn() }),
  useMapEvents: (events: { click: (event: { latlng: { lat: number; lng: number } }) => void }) => {
    mapClick = events.click
    return {}
  },
}))

const plan: MissionPlan = {
  id: 'draft',
  name: 'Draft',
  items: [
    {
      id: 'one',
      type: 'waypoint',
      latitude: 37.78,
      longitude: -122.42,
      altitudeMeters: 20,
      altitudeReference: 'relative-to-home',
      holdTimeSeconds: 0,
      acceptanceRadiusMeters: 0,
    },
  ],
}
const snapshot = (connection: GroundStationSnapshot['connection'] = 'connected'): GroundStationSnapshot => ({
  connection,
  vehicle: { id: 'SYS-1', name: 'Polaris', type: 'quadrotor', flightMode: 'Position', armed: false },
  telemetry: {
    position: { latitude: 37.7749, longitude: -122.4194, altitudeMeters: 10 },
    attitude: { rollDegrees: 0, pitchDegrees: 0, headingDegrees: 92 },
    groundSpeedMps: 0,
    battery: { percent: 90, voltage: 15, remainingMinutes: 12 },
    link: { qualityPercent: 100, latencyMs: 20, packetLossPercent: 0 },
  },
  autonomy: 'idle',
  mission: { state: 'ready', name: 'Draft', currentWaypoint: 0, totalWaypoints: 1, progressPercent: 0 },
  safety: 'safe',
  avoidanceStatus: 'Available',
  commands: [],
  manualControl: { status: 'disabled', input: { forward: 0, right: 0, up: 0, yawRight: 0 }, message: '' },
  timeline: [],
})

describe('OperatorMap', () => {
  beforeEach(() => {
    mapClick = undefined
  })
  it('renders live vehicle and distinguishable draft and vehicle-plan waypoints', () => {
    render(
      <OperatorMap
        localPlan={plan}
        onAddWaypoint={vi.fn()}
        onSelectWaypoint={vi.fn()}
        snapshot={{
          ...snapshot(),
          mission: { ...snapshot().mission, vehiclePlan: { ...plan, id: 'vehicle' } },
        }}
      />,
    )
    expect(screen.getByLabelText(/Polaris live position/i)).toBeVisible()
    expect(screen.getByLabelText('Local draft waypoint 1')).toBeVisible()
    expect(screen.getByLabelText('Vehicle plan waypoint 1')).toBeVisible()
    expect(screen.getByText('Live')).toBeVisible()
  })
  it('marks degraded telemetry and forwards map clicks as local draft waypoints', () => {
    const onAddWaypoint = vi.fn()
    render(
      <OperatorMap
        localPlan={plan}
        onAddWaypoint={onAddWaypoint}
        onSelectWaypoint={vi.fn()}
        snapshot={snapshot('degraded')}
      />,
    )
    expect(screen.getByText('Telemetry stale')).toBeVisible()
    mapClick?.({ latlng: { lat: 40.1, lng: -73.9 } })
    expect(onAddWaypoint).toHaveBeenCalledWith({ latitude: 40.1, longitude: -73.9 })
  })
  it('synchronizes map waypoint selection through its callback', () => {
    const onSelectWaypoint = vi.fn()
    render(
      <OperatorMap
        localPlan={plan}
        onAddWaypoint={vi.fn()}
        onSelectWaypoint={onSelectWaypoint}
        snapshot={snapshot()}
      />,
    )
    fireEvent.click(screen.getByLabelText('Local draft waypoint 1'))
    expect(onSelectWaypoint).toHaveBeenCalledWith('one')
  })
})
