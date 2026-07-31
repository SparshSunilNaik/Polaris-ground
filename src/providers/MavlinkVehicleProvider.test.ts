import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MavlinkMessage } from '../transport/mavlink/messages/MavlinkMessage'

const mocks = vi.hoisted(() => ({ invoke: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(vi.fn()) }))

import { MavlinkVehicleProvider } from './MavlinkVehicleProvider'

const heartbeat: MavlinkMessage = {
  messageId: 0,
  systemId: 1,
  componentId: 1,
  payload: new Uint8Array([0, 0, 0, 0, 0, 0, 0x80]),
}
const ack = (result: number): MavlinkMessage => ({
  messageId: 77,
  systemId: 1,
  componentId: 1,
  payload: new Uint8Array([144, 1, result]),
})
const transportHarness = (provider: MavlinkVehicleProvider): { handle(message: MavlinkMessage): void } =>
  provider as unknown as { handle(message: MavlinkMessage): void }

describe('MavlinkVehicleProvider commands', () => {
  beforeEach(() => mocks.invoke.mockClear())
  afterEach(() => vi.useRealTimers())

  it('correlates accepted and rejected COMMAND_ACK messages with pending commands', async () => {
    const provider = new MavlinkVehicleProvider('0.0.0.0:14550', '127.0.0.1:14540')
    await provider.connect()
    transportHarness(provider).handle(heartbeat)
    const accepted = await provider.sendCommand('arm')
    transportHarness(provider).handle(ack(0))
    expect(provider.getSnapshot().commands[0]).toMatchObject({ id: accepted.id, status: 'accepted' })
    const rejected = await provider.sendCommand('disarm')
    transportHarness(provider).handle(ack(2))
    expect(provider.getSnapshot().commands[0]).toMatchObject({ id: rejected.id, status: 'rejected' })
    expect(mocks.invoke).toHaveBeenCalledWith(
      'send_mavlink_frame',
      expect.objectContaining({ remoteAddress: '127.0.0.1:14540' }),
    )
  })

  it('times out a command without retrying it', async () => {
    vi.useFakeTimers()
    const provider = new MavlinkVehicleProvider('0.0.0.0:14550', '127.0.0.1:14540', 50)
    await provider.connect()
    transportHarness(provider).handle(heartbeat)
    const command = await provider.sendCommand('land')
    await vi.advanceTimersByTimeAsync(50)
    expect(provider.getSnapshot().commands[0]).toMatchObject({ id: command.id, status: 'timed_out' })
    expect(mocks.invoke.mock.calls.filter(([command]) => command === 'send_mavlink_frame')).toHaveLength(2)
  })
})
