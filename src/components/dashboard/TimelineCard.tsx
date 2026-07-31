import type { TimelineEvent } from '../../domain/models'
import { getRecentEvents } from '../../services/TimelineService'
import { Panel } from '../ui/Panel'
import { SectionHeader } from '../ui/SectionHeader'
export function TimelineCard({ events }: { events: TimelineEvent[] }) {
  return (
    <Panel>
      <SectionHeader eyebrow="TIMELINE" title="Recent activity" />
      {getRecentEvents(events).map((event) => (
        <div className="event" key={event.id}>
          <i className={event.severity} />
          <div>
            <strong>{event.label}</strong>
            <p>{event.message}</p>
          </div>
          <time>+{event.timestamp}s</time>
        </div>
      ))}
    </Panel>
  )
}
