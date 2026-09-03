import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { decodeFrames, type MavlinkMessage } from '../messages/MavlinkMessage'
import { encodeGroundHeartbeat } from '../commands/MavlinkCommand'

const groundHeartbeatFrames = Array.from({ length: 256 }, (_, sequence) =>
  Array.from(encodeGroundHeartbeat(sequence)),
)
let nextConnectionId = 0
type VehicleLinkEvent = { connectionId: string; state: 'lost' | 'restored'; systemId: number }
type TransportEvent = { connectionId: string; message: string }

export class MavlinkConnection {
  private unlisten: UnlistenFn | undefined
  private linkUnlisten: UnlistenFn | undefined
  private transportUnlisten: UnlistenFn | undefined
  private readonly endpoint: string
  private readonly remoteAddress: string
  private readonly onMessage: (message: MavlinkMessage) => void
  private readonly onVehicleLink: (event: Omit<VehicleLinkEvent, 'connectionId'>) => void
  private readonly onTransportFailure: (event: Omit<TransportEvent, 'connectionId'>) => void
  private readonly connectionId = `mavlink-connection-${++nextConnectionId}`
  private connected = false
  private lifecycle = Promise.resolve()

  constructor(
    endpoint: string,
    remoteAddress: string,
    onMessage: (message: MavlinkMessage) => void,
    onVehicleLink: (event: Omit<VehicleLinkEvent, 'connectionId'>) => void = () => undefined,
    onTransportFailure: (event: Omit<TransportEvent, 'connectionId'>) => void = () => undefined,
  ) {
    this.endpoint = endpoint
    this.remoteAddress = remoteAddress
    this.onMessage = onMessage
    this.onVehicleLink = onVehicleLink
    this.onTransportFailure = onTransportFailure
  }
  async connect(): Promise<void> {
    return this.queue(async () => {
      if (this.connected) return
      await this.start()
    })
  }
  async disconnect(): Promise<void> {
    return this.queue(async () => {
      if (!this.connected) return
      this.connected = false
      try {
        await invoke('stop_mavlink_listener', { connectionId: this.connectionId })
      } finally {
        this.unlisten?.()
        this.unlisten = undefined
        this.linkUnlisten?.()
        this.linkUnlisten = undefined
        this.transportUnlisten?.()
        this.transportUnlisten = undefined
      }
    })
  }
  async reconnect(): Promise<void> {
    await this.disconnect()
    await this.connect()
  }
  send(frame: Uint8Array, remoteAddress: string): Promise<void> {
    return invoke<void>('send_mavlink_frame', { remoteAddress, frame: Array.from(frame) }).catch((error) => {
      this.onTransportFailure({ message: String(error) })
      throw error
    })
  }
  dispose(): void {
    void this.disconnect()
  }
  private async start(): Promise<void> {
    const unlisten = await listen<number[]>('mavlink-frame', ({ payload }) => {
      decodeFrames(new Uint8Array(payload)).forEach(this.onMessage)
    })
    const linkUnlisten = await listen<VehicleLinkEvent>('mavlink-vehicle-link', ({ payload }) => {
      if (payload.connectionId === this.connectionId)
        this.onVehicleLink({ state: payload.state, systemId: payload.systemId })
    })
    const transportUnlisten = await listen<TransportEvent>('mavlink-transport', ({ payload }) => {
      if (payload.connectionId === this.connectionId) this.onTransportFailure({ message: payload.message })
    })
    try {
      await invoke('start_mavlink_listener', {
        bindAddress: this.endpoint,
        connectionId: this.connectionId,
        heartbeatRemoteAddress: this.remoteAddress,
        heartbeatFrames: groundHeartbeatFrames,
      })
      this.unlisten = unlisten
      this.linkUnlisten = linkUnlisten
      this.transportUnlisten = transportUnlisten
      this.connected = true
    } catch (error) {
      unlisten()
      linkUnlisten()
      transportUnlisten()
      throw error
    }
  }
  private queue<T>(task: () => Promise<T>): Promise<T> {
    const pending = this.lifecycle.then(task, task)
    this.lifecycle = pending.then(
      () => undefined,
      () => undefined,
    )
    return pending
  }
}
