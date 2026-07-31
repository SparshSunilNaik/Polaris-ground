import type { TimelineEvent } from '../domain/models'
export const getRecentEvents = (events: TimelineEvent[]): TimelineEvent[] => events.slice(0, 8)
