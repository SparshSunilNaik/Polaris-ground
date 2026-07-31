import type { GroundStationSnapshot, TimelineEvent } from '../domain/models'
import { MavlinkConnection } from '../transport/mavlink/connection/MavlinkConnection'
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
  timeline: [],
})

export class MavlinkVehicleProvider implements VehicleProvider {
  private snapshot = initial()
  private listeners = new Set<(value: GroundStationSnapshot) => void>()
  private connection: MavlinkConnection
  private timestamp = 0
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined
  private lastHeartbeat = 0
  private receivedHeartbeats = 0
  constructor(endpoint = import.meta.env.VITE_MAVLINK_BIND_ADDRESS ?? '0.0.0.0:14550') {
    this.connection = new MavlinkConnection(endpoint, (message) => this.handle(message))
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
  dispose(): void {
    this.stopHeartbeatMonitor()
    this.connection.dispose()
    this.listeners.clear()
  }
  private handle(message: Parameters<typeof translateMavlinkMessage>[0]): void {
    if (message.messageId === 0) {
      this.receivedHeartbeats += 1
      if (import.meta.env.DEV && (this.receivedHeartbeats <= 3 || this.receivedHeartbeats % 50 === 0))
        console.debug(`MAVLink heartbeat received (${this.receivedHeartbeats})`)
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
