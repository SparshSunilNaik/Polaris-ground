import { divIcon, type LatLngExpression, type LatLngTuple } from 'leaflet'
import { MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import type { GroundStationSnapshot, MissionPlan } from '../../domain/models'
import { Panel } from '../ui/Panel'
import { SectionHeader } from '../ui/SectionHeader'
import 'leaflet/dist/leaflet.css'

type Coordinates = { latitude: number; longitude: number }
const fallbackCenter: LatLngExpression = [37.7749, -122.4194]

export function OperatorMap({
  snapshot,
  localPlan,
  selectedWaypointId,
  onSelectWaypoint,
  onAddWaypoint,
}: {
  snapshot: GroundStationSnapshot
  localPlan?: MissionPlan
  selectedWaypointId?: string
  onSelectWaypoint: (id: string) => void
  onAddWaypoint: (position: Coordinates) => void
}) {
  const vehiclePosition = availablePosition(snapshot)
  const center = vehiclePosition ? point(vehiclePosition) : (missionCenter(localPlan) ?? fallbackCenter)
  const stale = snapshot.connection !== 'connected'
  return (
    <Panel className="operator-map-panel">
      <SectionHeader
        eyebrow="SITUATIONAL AWARENESS"
        title="Operator map"
        action={
          <span className={`map-state ${stale ? 'stale' : 'live'}`}>
            {stale ? 'Telemetry stale' : 'Live'}
          </span>
        }
      />
      <div className={`operator-map ${stale ? 'telemetry-stale' : ''}`}>
        <MapContainer center={center} zoom={vehiclePosition ? 16 : 13} scrollWheelZoom>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapClick onAddWaypoint={onAddWaypoint} />
          <MapControls vehiclePosition={vehiclePosition} localPlan={localPlan} />
          <MissionLayer
            plan={localPlan}
            selectedWaypointId={selectedWaypointId}
            onSelectWaypoint={onSelectWaypoint}
            tone="draft"
          />
          <MissionLayer
            plan={snapshot.mission.vehiclePlan}
            onSelectWaypoint={onSelectWaypoint}
            tone="vehicle"
          />
          {vehiclePosition && (
            <Marker
              icon={vehicleIcon(snapshot.telemetry.attitude.headingDegrees, stale)}
              position={point(vehiclePosition)}
              title={`${snapshot.vehicle.name} ${stale ? 'telemetry stale' : 'live position'}`}
            />
          )}
        </MapContainer>
        <div className="map-legend" aria-label="Map legend">
          <span>
            <i className="vehicle" /> Vehicle
          </span>
          <span>
            <i className="draft" /> Local draft
          </span>
          <span>
            <i className="vehicle-plan" /> Vehicle readback
          </span>
        </div>
      </div>
      <p className="map-note">Click the map to add a local waypoint. Map edits never transmit a mission.</p>
    </Panel>
  )
}

function MissionLayer({
  plan,
  selectedWaypointId,
  onSelectWaypoint,
  tone,
}: {
  plan?: MissionPlan
  selectedWaypointId?: string
  onSelectWaypoint: (id: string) => void
  tone: 'draft' | 'vehicle'
}) {
  const items = plan?.items.filter(validMissionItem) ?? []
  const positions = items.map(point)
  return (
    <>
      {positions.length > 1 && (
        <Polyline pathOptions={{ className: `mission-line ${tone}` }} positions={positions} />
      )}
      {items.map((item, index) => (
        <Marker
          icon={waypointIcon(index + 1, tone, item.id === selectedWaypointId)}
          key={`${tone}-${item.id}`}
          eventHandlers={{ click: () => onSelectWaypoint(item.id) }}
          position={point(item)}
          title={`${tone === 'draft' ? 'Local draft' : 'Vehicle plan'} waypoint ${index + 1}`}
        />
      ))}
    </>
  )
}

function MapClick({ onAddWaypoint }: { onAddWaypoint: (position: Coordinates) => void }) {
  useMapEvents({
    click: (event) => onAddWaypoint({ latitude: event.latlng.lat, longitude: event.latlng.lng }),
  })
  return null
}

function MapControls({
  vehiclePosition,
  localPlan,
}: {
  vehiclePosition?: Coordinates
  localPlan?: MissionPlan
}) {
  const map = useMap()
  return (
    <div className="map-controls leaflet-control">
      <button
        disabled={!vehiclePosition}
        onClick={() => vehiclePosition && map.flyTo(point(vehiclePosition), 16)}
        type="button"
      >
        Center vehicle
      </button>
      <button
        disabled={!localPlan?.items.some(validMissionItem)}
        onClick={() =>
          map.fitBounds(localPlan!.items.filter(validMissionItem).map(point), { padding: [32, 32] })
        }
        type="button"
      >
        Fit mission
      </button>
    </div>
  )
}

const point = ({ latitude, longitude }: Coordinates): LatLngTuple => [latitude, longitude]
const validMissionItem = (item: Coordinates): boolean =>
  Number.isFinite(item.latitude) && Number.isFinite(item.longitude)
const availablePosition = (snapshot: GroundStationSnapshot): Coordinates | undefined => {
  const position = snapshot.telemetry.position
  return snapshot.connection !== 'disconnected' &&
    validMissionItem(position) &&
    (position.latitude !== 0 || position.longitude !== 0)
    ? position
    : undefined
}
const missionCenter = (plan?: MissionPlan): LatLngExpression | undefined => {
  const item = plan?.items.find(validMissionItem)
  return item && point(item)
}
const vehicleIcon = (heading: number, stale: boolean) =>
  divIcon({
    className: 'map-icon-container',
    html: `<span class="map-vehicle-marker ${stale ? 'stale' : ''}" style="--heading: ${heading}deg">&#9650;</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  })
const waypointIcon = (sequence: number, tone: 'draft' | 'vehicle', selected: boolean) =>
  divIcon({
    className: 'map-icon-container',
    html: `<span class="map-waypoint ${tone} ${selected ? 'selected' : ''}">${sequence}</span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  })
