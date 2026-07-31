import type { GroundStationSnapshot, TimelineEvent, VehicleAction, VehicleCommand } from '../domain/models'
import { MavlinkConnection } from '../transport/mavlink/connection/MavlinkConnection'
import { encodeCommandLong, mavlinkCommandFor } from '../transport/mavlink/commands/MavlinkCommand'
import { translateMavlinkMessage } from '../transport/mavlink/translator/MavlinkTranslator'
import type { VehicleProvider } from './VehicleProvider'

const initial = (): GroundStationSnapshot => ({
  connection: 'disconnected',
  vehicle: {
    id: 'Awaiting vehicle',
    name: 'MAVLink vehicle',
    type: 'Unknown',
    flightMode: 'Awaiting heartbeat',
    armed: false,
  },
  telemetry: {
    position: { latitude: 0, longitude: 0, altitudeMeters: 0 },
    attitude: { rollDegrees: 0, pitchDegrees: 0, headingDegrees: 0 },
    groundSpeedMps: 0,
    battery: { percent: 0, voltage: 0, remainingMinutes: 0 },
    link: { qualityPercent: 0, latencyMs: 0, packetLossPercent: 0 },
  },
  autonomy: 'unavailable',
  mission: {
    state: 'idle',
    name: 'No mission reported',
    currentWaypoint: 0,
    totalWaypoints: 0,
    progressPercent: 0,
  },
  safety: 'unknown',
  avoidanceStatus: 'Unavailable',
  commands: [],
  timeline: [],
})

export class MavlinkVehicleProvider implements VehicleProvider {
  private snapshot = initial()
  private listeners = new Set<(value: GroundStationSnapshot) => void>()
  private connection: MavlinkConnection
  private timestamp = 0
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined
  private lastHeartbeat = 0
  private commandSequence = 0
  private frameSequence = 0
  private readonly remoteAddress: string
  private readonly commandTimeoutMs: number
  constructor(
    endpoint = import.meta.env.VITE_MAVLINK_BIND_ADDRESS ?? '0.0.0.0:14550',
    remoteAddress = import.meta.env.VITE_MAVLINK_REMOTE_ADDRESS ?? '127.0.0.1:14540',
    commandTimeoutMs = 5000,
  ) {
    this.connection = new MavlinkConnection(endpoint, remoteAddress, (message) => this.handle(message))
    this.remoteAddress = remoteAddress
    this.commandTimeoutMs = commandTimeoutMs
  }
  async connect(): Promise<void> {
    this.set({ ...this.snapshot, connection: 'connecting' })
    try {
      await this.connection.connect()
      this.startHeartbeatMonitor()
      this.set({
        ...this.snapshot,
        connection: 'connected',
        timeline: [
          this.event('info', 'Listening for vehicle', 'Waiting for a MAVLink heartbeat.'),
          ...this.snapshot.timeline,
        ],
      })
    } catch {
      this.set({
        ...this.snapshot,
        connection: 'error',
        timeline: [
          this.event('warning', 'Connection unavailable', 'Could not start the MAVLink listener.'),
          ...this.snapshot.timeline,
        ],
      })
    }
  }
  async disconnect(): Promise<void> {
    this.stopHeartbeatMonitor()
    await this.connection.disconnect()
    this.set({
      ...this.snapshot,
      connection: 'disconnected',
      timeline: [
        this.event('info', 'Vehicle disconnected', 'MAVLink listener stopped.'),
        ...this.snapshot.timeline,
      ],
    })
  }
  getSnapshot(): GroundStationSnapshot {
    return this.snapshot
  }
  subscribe(listener: (value: GroundStationSnapshot) => void): () => void {
    this.listeners.add(listener)
    listener(this.snapshot)
    return () => this.listeners.delete(listener)
  }
  async sendCommand(action: VehicleAction): Promise<VehicleCommand> {
    const duplicate = this.snapshot.commands.find(
      (command) =>
        command.status === 'pending' && mavlinkCommandFor(command.action) === mavlinkCommandFor(action),
    )
    if (duplicate)
      return this.recordCommand(action, 'rejected', 'A matching command is already awaiting a response.')
    const { componentId } = this.snapshot.vehicle
    if (this.snapshot.connection !== 'connected' || componentId === undefined) {
      return this.recordCommand(action, 'rejected', 'Vehicle identity is not available.')
    }
    const command = this.recordCommand(
      action,
      'pending',
      `${actionLabel(action)} sent; awaiting vehicle acknowledgement.`,
    )
    try {
      await this.connection.send(
        encodeCommandLong(
          action,
          Number(this.snapshot.vehicle.id.replace('SYS-', '')),
          componentId,
          this.frameSequence++,
        ),
        this.remoteAddress,
      )
      setTimeout(() => this.timeoutCommand(command.id), this.commandTimeoutMs)
    } catch {
      this.completeCommand(command.id, 'rejected', 'Command could not be sent to the vehicle.')
    }
    return command
  }
  dispose(): void {
    this.stopHeartbeatMonitor()
    this.connection.dispose()
    this.listeners.clear()
  }
  private handle(message: Parameters<typeof translateMavlinkMessage>[0]): void {
    if (message.messageId === 77) this.handleCommandAck(message)
    if (message.messageId === 0) {
      const restored = this.snapshot.connection === 'degraded'
      this.lastHeartbeat = Date.now()
      if (restored)
        this.set({
          ...this.snapshot,
          connection: 'connected',
          timeline: [
            this.event('info', 'Heartbeat restored', 'Vehicle telemetry resumed.'),
            ...this.snapshot.timeline,
          ],
        })
    }
    const update = translateMavlinkMessage(message, ++this.timestamp)
    if (!update) return
    const timeline = update.event
      ? [update.event, ...this.snapshot.timeline].slice(0, 30)
      : this.snapshot.timeline
    this.set({
      ...this.snapshot,
      connection: 'connected',
      vehicle: update.vehicle ?? this.snapshot.vehicle,
      telemetry: {
        ...this.snapshot.telemetry,
        battery: update.battery ?? this.snapshot.telemetry.battery,
        position: update.position ?? this.snapshot.telemetry.position,
        attitude: update.attitude ?? this.snapshot.telemetry.attitude,
        groundSpeedMps: update.groundSpeedMps ?? this.snapshot.telemetry.groundSpeedMps,
        link: { ...this.snapshot.telemetry.link, qualityPercent: 100 },
      },
      timeline,
    })
  }
  private event(severity: TimelineEvent['severity'], label: string, message: string): TimelineEvent {
    return { id: `${label}-${++this.timestamp}`, timestamp: this.timestamp, severity, label, message }
  }
  private set(snapshot: GroundStationSnapshot): void {
    this.snapshot = snapshot
    this.listeners.forEach((listener) => listener(snapshot))
  }
  private handleCommandAck(message: Parameters<typeof translateMavlinkMessage>[0]): void {
    if (message.payload.length < 3) return
    if (message.systemId !== Number(this.snapshot.vehicle.id.replace('SYS-', ''))) return
    const payload = new DataView(
      message.payload.buffer,
      message.payload.byteOffset,
      message.payload.byteLength,
    )
    const mavlinkCommand = payload.getUint16(0, true)
    const result = message.payload[2]
    if (result === 5) return
    const command = this.snapshot.commands.find(
      (entry) => entry.status === 'pending' && mavlinkCommandFor(entry.action) === mavlinkCommand,
    )
    if (!command) return
    if (result === 0)
      this.completeCommand(command.id, 'accepted', `${actionLabel(command.action)} accepted by vehicle.`)
    else this.completeCommand(command.id, 'rejected', `${actionLabel(command.action)} rejected by vehicle.`)
  }
  private timeoutCommand(id: string): void {
    this.completeCommand(
      id,
      'timed_out',
      'No vehicle acknowledgement was received before the command timed out.',
    )
  }
  private recordCommand(
    action: VehicleAction,
    status: VehicleCommand['status'],
    message: string,
  ): VehicleCommand {
    const command: VehicleCommand = {
      id: `mavlink-command-${++this.commandSequence}`,
      action,
      status,
      requestedAt: Date.now(),
      completedAt: status === 'pending' ? undefined : Date.now(),
      message,
    }
    this.set({
      ...this.snapshot,
      commands: [command, ...this.snapshot.commands].slice(0, 20),
      timeline: [
        this.event(
          commandSeverity(command.status),
          `${actionLabel(command.action)} ${command.status.replace('_', ' ')}`,
          command.message,
        ),
        ...this.snapshot.timeline,
      ].slice(0, 30),
    })
    return command
  }
  private completeCommand(id: string, status: VehicleCommand['status'], message: string): void {
    const current = this.snapshot.commands.find((command) => command.id === id)
    if (!current || current.status !== 'pending') return
    const command = { ...current, status, completedAt: Date.now(), message }
    this.set({
      ...this.snapshot,
      commands: this.snapshot.commands.map((entry) => (entry.id === id ? command : entry)),
      timeline: [
        this.event(
          commandSeverity(command.status),
          `${actionLabel(command.action)} ${command.status.replace('_', ' ')}`,
          command.message,
        ),
        ...this.snapshot.timeline,
      ].slice(0, 30),
    })
  }
  private startHeartbeatMonitor(): void {
    this.stopHeartbeatMonitor()
    this.lastHeartbeat = Date.now()
    this.heartbeatTimer = setInterval(() => {
      if (Date.now() - this.lastHeartbeat <= 3000 || this.snapshot.connection !== 'connected') return
      this.set({
        ...this.snapshot,
        connection: 'degraded',
        timeline: [
          this.event('warning', 'Heartbeat lost', 'Vehicle telemetry has not been received for 3 seconds.'),
          ...this.snapshot.timeline,
        ],
      })
    }, 500)
  }
  private stopHeartbeatMonitor(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = undefined
  }
}

const actionLabel = (action: VehicleAction): string =>
  ({ arm: 'Arm', disarm: 'Disarm', takeoff: 'Take off', land: 'Land', returnToLaunch: 'Return to launch' })[
    action
  ]

const commandSeverity = (status: VehicleCommand['status']): TimelineEvent['severity'] =>
  status === 'rejected' || status === 'timed_out' ? 'warning' : 'info'
