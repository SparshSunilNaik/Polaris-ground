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
})
