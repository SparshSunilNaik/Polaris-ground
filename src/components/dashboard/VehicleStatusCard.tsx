import { Panel } from '../ui/Panel'
import type { GroundStationSnapshot } from '../../domain/models'
export function VehicleStatusCard({ snapshot }: { snapshot: GroundStationSnapshot }) {
  return (
    <Panel className="vehicle-status">
      <p className="eyebrow">VEHICLE SUMMARY</p>
      <h2>{snapshot.vehicle.flightMode}</h2>
      <p className="state-line">
        <i /> {snapshot.vehicle.armed ? 'Vehicle armed' : 'Vehicle disarmed'}
      </p>
      <div className="heading">
        <strong>{snapshot.telemetry.attitude.headingDegrees}°</strong>
        <span>Heading</span>
      </div>
    </Panel>
  )
}
