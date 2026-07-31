import type { GroundStationSnapshot, TimelineEvent } from '../domain/models'
import type { VehicleProvider } from './VehicleProvider'

const initialSnapshot = (): GroundStationSnapshot => ({
  connection: 'disconnected',
  vehicle: { id: 'PG-01', name: 'Polaris Scout', type: 'Multirotor', flightMode: 'Mission', armed: true },
  telemetry: {
    position: { latitude: 37.7749, longitude: -122.4194, altitudeMeters: 24 },
    attitude: { rollDegrees: 1.2, pitchDegrees: -0.7, headingDegrees: 84 },
    groundSpeedMps: 6.4,
    battery: { percent: 86, voltage: 15.7, remainingMinutes: 19 },
    link: { qualityPercent: 96, latencyMs: 42, packetLossPercent: 0.2 },
  },
  autonomy: 'active',
  mission: {
    state: 'running',
    name: 'Perimeter Survey',
    currentWaypoint: 3,
    totalWaypoints: 8,
    progressPercent: 38,
  },
  safety: 'safe',
  avoidanceStatus: 'Standby',
  timeline: [
    {
      id: 'start',
      timestamp: 0,
      severity: 'info',
      label: 'Mission active',
      message: 'Perimeter Survey is underway.',
    },
  ],
})

export class MockVehicleProvider implements VehicleProvider {
  private snapshot = initialSnapshot()
  private listeners = new Set<(snapshot: GroundStationSnapshot) => void>()
  private timer: ReturnType<typeof setInterval> | undefined
  private tick = 0

  async connect(): Promise<void> {
    this.update({ connection: 'connecting' })
    await Promise.resolve()
    this.update({ connection: 'connected' })
    this.timer ??= setInterval(() => this.advance(), 1000)
  }
  async disconnect(): Promise<void> {
    this.stopTimer()
    this.update({ connection: 'disconnected' })
  }
  getSnapshot(): GroundStationSnapshot {
    return this.snapshot
  }
  subscribe(listener: (snapshot: GroundStationSnapshot) => void): () => void {
    this.listeners.add(listener)
    listener(this.snapshot)
    return () => this.listeners.delete(listener)
  }
  dispose(): void {
    this.stopTimer()
    this.listeners.clear()
  }
  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
  }
  private advance(): void {
    this.tick += 1
    const prior = this.snapshot
    const progress = Math.min(100, prior.mission.progressPercent + 2)
    const waypoint = Math.min(
      prior.mission.totalWaypoints,
      1 + Math.ceil((progress / 100) * prior.mission.totalWaypoints),
    )
    const completed = progress === 100
    const timeline: TimelineEvent[] =
      this.tick === 8
        ? [
            {
              id: `safety-${this.tick}`,
              timestamp: this.tick,
              severity: 'warning',
              label: 'Safety advisory',
              message: 'Crosswind observed. Flight path remains monitored.',
            },
            ...prior.timeline,
          ]
        : prior.timeline
    if (completed && prior.mission.state !== 'completed')
      timeline.unshift({
        id: 'complete',
        timestamp: this.tick,
        severity: 'info',
        label: 'Mission completed',
        message: 'All survey waypoints reached.',
      })
    this.snapshot = {
      ...prior,
      telemetry: {
        ...prior.telemetry,
        position: {
          ...prior.telemetry.position,
          altitudeMeters: Number((24 + Math.sin(this.tick / 2) * 3).toFixed(1)),
        },
        groundSpeedMps: Number((6.4 + Math.sin(this.tick) * 0.8).toFixed(1)),
        battery: {
          ...prior.telemetry.battery,
          percent: Math.max(0, prior.telemetry.battery.percent - 0.15),
          remainingMinutes: Math.max(0, prior.telemetry.battery.remainingMinutes - 0.04),
        },
      },
      mission: {
        ...prior.mission,
        currentWaypoint: waypoint,
        progressPercent: progress,
        state: completed ? 'completed' : 'running',
      },
      autonomy: completed ? 'idle' : 'active',
      safety: this.tick === 8 ? 'warning' : completed ? 'safe' : prior.safety,
      timeline: timeline.slice(0, 30),
    }
    this.emit()
  }
  private update(change: Partial<GroundStationSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...change }
    this.emit()
  }
  private emit(): void {
    this.listeners.forEach((listener) => listener(this.snapshot))
  }
}
