import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { decodeFrame, type MavlinkMessage } from '../messages/MavlinkMessage'

export class MavlinkConnection {
  private unlisten: UnlistenFn | undefined
  private readonly endpoint: string
  private readonly onMessage: (message: MavlinkMessage) => void

  constructor(endpoint: string, onMessage: (message: MavlinkMessage) => void) {
    this.endpoint = endpoint
    this.onMessage = onMessage
  }
  async connect(): Promise<void> {
    this.unlisten = await listen<number[]>('mavlink-frame', ({ payload }) => {
      const message = decodeFrame(new Uint8Array(payload))
      if (message) this.onMessage(message)
    })
    await invoke('start_mavlink_listener', { bindAddress: this.endpoint })
  }
  async disconnect(): Promise<void> {
    await invoke('stop_mavlink_listener')
    this.unlisten?.()
    this.unlisten = undefined
  }
  async reconnect(): Promise<void> {
    await this.disconnect()
    await this.connect()
  }
  dispose(): void {
    void this.disconnect()
  }
}
