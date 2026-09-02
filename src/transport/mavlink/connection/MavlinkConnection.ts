import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { decodeFrames, type MavlinkMessage } from '../messages/MavlinkMessage'
import { encodeGroundHeartbeat } from '../commands/MavlinkCommand'

const groundHeartbeatFrames = Array.from({ length: 256 }, (_, sequence) =>
  Array.from(encodeGroundHeartbeat(sequence)),
)
let nextConnectionId = 0

export class MavlinkConnection {
  private unlisten: UnlistenFn | undefined
  private readonly endpoint: string
  private readonly remoteAddress: string
  private readonly onMessage: (message: MavlinkMessage) => void
  private readonly connectionId = `mavlink-connection-${++nextConnectionId}`
  private connectPromise: Promise<void> | undefined
  private connected = false

  constructor(endpoint: string, remoteAddress: string, onMessage: (message: MavlinkMessage) => void) {
    this.endpoint = endpoint
    this.remoteAddress = remoteAddress
    this.onMessage = onMessage
  }
  async connect(): Promise<void> {
    if (this.connected) return
    if (this.connectPromise) return this.connectPromise
    const pending = this.start()
    this.connectPromise = pending
    try {
      await pending
    } finally {
      if (this.connectPromise === pending) this.connectPromise = undefined
    }
  }
  async disconnect(): Promise<void> {
    if (this.connectPromise)
      try {
        await this.connectPromise
      } catch {
        return
      }
    if (!this.connected) return
    this.connected = false
    try {
      await invoke('stop_mavlink_listener', { connectionId: this.connectionId })
    } finally {
      this.unlisten?.()
      this.unlisten = undefined
    }
  }
  async reconnect(): Promise<void> {
    await this.disconnect()
    await this.connect()
  }
  send(frame: Uint8Array, remoteAddress: string): Promise<void> {
    return invoke('send_mavlink_frame', { remoteAddress, frame: Array.from(frame) })
  }
  dispose(): void {
    void this.disconnect()
  }
  private async start(): Promise<void> {
    const unlisten = await listen<number[]>('mavlink-frame', ({ payload }) => {
      decodeFrames(new Uint8Array(payload)).forEach(this.onMessage)
    })
    try {
      await invoke('start_mavlink_listener', {
        bindAddress: this.endpoint,
        connectionId: this.connectionId,
        heartbeatRemoteAddress: this.remoteAddress,
        heartbeatFrames: groundHeartbeatFrames,
      })
      this.unlisten = unlisten
      this.connected = true
    } catch (error) {
      unlisten()
      throw error
    }
  }
}
