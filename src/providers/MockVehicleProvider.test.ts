import { afterEach, describe, expect, it, vi } from 'vitest'
import { MockVehicleProvider } from './MockVehicleProvider'

describe('MockVehicleProvider', () => {
  afterEach(() => vi.useRealTimers())

  it('transitions deterministically and progresses telemetry and mission', async () => {
    vi.useFakeTimers()
    const provider = new MockVehicleProvider()
    const states: string[] = []
    provider.subscribe((snapshot) => states.push(snapshot.connection))
    await provider.connect()
    const initial = provider.getSnapshot()
    vi.advanceTimersByTime(1000)
    const next = provider.getSnapshot()
    expect(states).toEqual(['disconnected', 'connecting', 'connected', 'connected'])
    expect(next.telemetry.position.altitudeMeters).not.toBe(initial.telemetry.position.altitudeMeters)
    expect(next.mission.progressPercent).toBeGreaterThan(initial.mission.progressPercent)
    await provider.disconnect()
    expect(provider.getSnapshot().connection).toBe('disconnected')
  })

  it('keeps timeline newest first and cleans its timer on dispose', async () => {
    vi.useFakeTimers()
    const provider = new MockVehicleProvider()
    await provider.connect()
    vi.advanceTimersByTime(8000)
    expect(provider.getSnapshot().timeline[0]?.severity).toBe('warning')
    provider.dispose()
    const snapshot = provider.getSnapshot()
    vi.advanceTimersByTime(5000)
    expect(provider.getSnapshot()).toEqual(snapshot)
  })

  it('simulates an acknowledged command and rejects a duplicate while it is pending', async () => {
    vi.useFakeTimers()
    const provider = new MockVehicleProvider()
    await provider.connect()
    const command = await provider.sendCommand('land')
    const duplicate = await provider.sendCommand('land')
    expect(command.status).toBe('pending')
    expect(duplicate.status).toBe('rejected')
    vi.advanceTimersByTime(300)
    expect(provider.getSnapshot().commands.find((entry) => entry.id === command.id)?.status).toBe('accepted')
    expect(provider.getSnapshot().timeline[0]?.label).toBe('Land accepted')
  })

  it('completes deterministic mock mission transfers', async () => {
    const provider = new MockVehicleProvider()
    const receipt = await provider.downloadMission()
    expect(receipt).toMatchObject({
      type: 'download',
      status: 'succeeded',
      message: 'Mission download completed.',
    })
    expect(provider.getSnapshot().mission.mostRecentTransfer).toMatchObject({
      id: receipt.operationId,
      type: receipt.type,
      status: receipt.status,
      failureReason: undefined,
    })
  })
})
