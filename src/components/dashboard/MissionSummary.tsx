import type { GroundStationSnapshot } from '../../domain/models'
import { getMissionSummary } from '../../services/MissionService'
import { Panel } from '../ui/Panel'
import { ProgressBar } from '../ui/ProgressBar'
import { SectionHeader } from '../ui/SectionHeader'
export function MissionSummary({ snapshot }: { snapshot: GroundStationSnapshot }) {
  const { mission } = snapshot
  return (
    <Panel>
      <SectionHeader
        eyebrow="MISSION"
        title={mission.state === 'running' ? 'Running' : mission.state}
        action={
          <span className={`safety safety-${snapshot.safety}`}>
            {snapshot.safety === 'safe' ? 'Healthy' : snapshot.safety}
          </span>
        }
      />
      <dl className="summary-list">
        <div>
          <dt>Plan</dt>
          <dd>{mission.name}</dd>
        </div>
        <div>
          <dt>Progress</dt>
          <dd>{getMissionSummary(mission)}</dd>
        </div>
        <div>
          <dt>Avoidance</dt>
          <dd>{snapshot.avoidanceStatus}</dd>
        </div>
      </dl>
      <ProgressBar value={mission.progressPercent} label="Mission progress" />
    </Panel>
  )
}
