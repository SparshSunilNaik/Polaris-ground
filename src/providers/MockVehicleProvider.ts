import type { GroundStationSnapshot, TimelineEvent, VehicleAction, VehicleCommand } from '../domain/models'
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
  commands: [],
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
  private commandSequence = 0

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
  async sendCommand(action: VehicleAction): Promise<VehicleCommand> {
    const duplicate = this.snapshot.commands.find(
      (command) => command.action === action && command.status === 'pending',
    )
    if (duplicate)
      return this.recordCommand(action, 'rejected', 'A matching command is already awaiting a response.')
    if (this.snapshot.connection !== 'connected')
      return this.recordCommand(action, 'rejected', 'Vehicle is not connected.')
    const command = this.recordCommand(action, 'pending', `${actionLabel(action)} requested.`)
    setTimeout(
      () => this.completeCommand(command.id, 'accepted', `${actionLabel(action)} accepted by vehicle.`),
      300,
    )
    return command
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
  private recordCommand(
    action: VehicleAction,
    status: VehicleCommand['status'],
    message: string,
  ): VehicleCommand {
    const command: VehicleCommand = {
      id: `mock-command-${++this.commandSequence}`,
      action,
      status,
      requestedAt: Date.now(),
      completedAt: status === 'pending' ? undefined : Date.now(),
      message,
    }
    this.snapshot = {
      ...this.snapshot,
      commands: [command, ...this.snapshot.commands].slice(0, 20),
      timeline: [commandEvent(command, this.tick), ...this.snapshot.timeline].slice(0, 30),
    }
    this.emit()
    return command
  }
  private completeCommand(id: string, status: VehicleCommand['status'], message: string): void {
    const current = this.snapshot.commands.find((command) => command.id === id)
    if (!current || current.status !== 'pending') return
    const command = { ...current, status, completedAt: Date.now(), message }
    this.snapshot = {
      ...this.snapshot,
      commands: this.snapshot.commands.map((entry) => (entry.id === id ? command : entry)),
      timeline: [commandEvent(command, this.tick), ...this.snapshot.timeline].slice(0, 30),
    }
    this.emit()
  }
}

const actionLabel = (action: VehicleAction): string =>
  ({ arm: 'Arm', disarm: 'Disarm', takeoff: 'Take off', land: 'Land', returnToLaunch: 'Return to launch' })[
    action
  ]

const commandEvent = (command: VehicleCommand, timestamp: number): TimelineEvent => ({
  id: `command-${command.id}-${command.status}`,
  timestamp,
  severity: command.status === 'rejected' || command.status === 'timed_out' ? 'warning' : 'info',
  label: `${actionLabel(command.action)} ${command.status.replace('_', ' ')}`,
  message: command.message,
})
