import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  invoke: vi.fn().mockResolvedValue(undefined),
  listen: vi.fn(),
  unlisten: vi.fn(),
}))
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }))
vi.mock('@tauri-apps/api/event', () => ({ listen: mocks.listen }))

import { MavlinkConnection } from './MavlinkConnection'

describe('MavlinkConnection lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.invoke.mockClear()
    mocks.listen.mockReset().mockResolvedValue(mocks.unlisten)
    mocks.unlisten.mockClear()
  })
  afterEach(() => vi.useRealTimers())

  it('delegates recurring heartbeats to one native listener across repeated connects', async () => {
    const connection = new MavlinkConnection('127.0.0.1:14540', '127.0.0.1:14580', vi.fn())

    await Promise.all([connection.connect(), connection.connect()])
    await connection.connect()
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000)

    expect(mocks.listen).toHaveBeenCalledTimes(1)
    const starts = mocks.invoke.mock.calls.filter(([command]) => command === 'start_mavlink_listener')
    expect(starts).toHaveLength(1)
    expect(starts[0]?.[1]).toMatchObject({
      bindAddress: '127.0.0.1:14540',
      heartbeatRemoteAddress: '127.0.0.1:14580',
    })
    expect(starts[0]?.[1].connectionId).toMatch(/^mavlink-connection-/)
    expect(starts[0]?.[1].heartbeatFrames).toHaveLength(256)
    expect(starts[0]?.[1].heartbeatFrames[0][4]).toBe(0)
    expect(starts[0]?.[1].heartbeatFrames[255][4]).toBe(255)
    expect(mocks.invoke.mock.calls.some(([command]) => command === 'send_mavlink_frame')).toBe(false)

    await connection.disconnect()
    await connection.disconnect()
    const stops = mocks.invoke.mock.calls.filter(([command]) => command === 'stop_mavlink_listener')
    expect(stops).toHaveLength(1)
    expect(stops[0]?.[1].connectionId).toBe(starts[0]?.[1].connectionId)
    expect(mocks.unlisten).toHaveBeenCalledTimes(1)
  })

  it('removes the frontend subscription when native startup fails', async () => {
    mocks.invoke.mockRejectedValueOnce(new Error('bind failed'))
    const connection = new MavlinkConnection('127.0.0.1:14540', '127.0.0.1:14580', vi.fn())

    await expect(connection.connect()).rejects.toThrow('bind failed')

    expect(mocks.unlisten).toHaveBeenCalledTimes(1)
    await connection.disconnect()
    expect(mocks.invoke.mock.calls.filter(([command]) => command === 'stop_mavlink_listener')).toHaveLength(0)
  })
})
