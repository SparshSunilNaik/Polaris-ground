import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { decodeFrames, type MavlinkMessage } from '../messages/MavlinkMessage'
import { encodeGroundHeartbeat } from '../commands/MavlinkCommand'

export class MavlinkConnection {
  private unlisten: UnlistenFn | undefined
  private readonly endpoint: string
  private readonly remoteAddress: string
  private readonly onMessage: (message: MavlinkMessage) => void
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined
  private heartbeatSequence = 0

  constructor(endpoint: string, remoteAddress: string, onMessage: (message: MavlinkMessage) => void) {
    this.endpoint = endpoint
    this.remoteAddress = remoteAddress
    this.onMessage = onMessage
  }
  async connect(): Promise<void> {
    this.unlisten = await listen<number[]>('mavlink-frame', ({ payload }) => {
      decodeFrames(new Uint8Array(payload)).forEach(this.onMessage)
    })
    await invoke('start_mavlink_listener', { bindAddress: this.endpoint })
    await this.send(encodeGroundHeartbeat(this.heartbeatSequence++), this.remoteAddress)
    this.heartbeatTimer = setInterval(
      () => void this.send(encodeGroundHeartbeat(this.heartbeatSequence++), this.remoteAddress),
      1000,
    )
  }
  async disconnect(): Promise<void> {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = undefined
    await invoke('stop_mavlink_listener')
    this.unlisten?.()
    this.unlisten = undefined
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
}
