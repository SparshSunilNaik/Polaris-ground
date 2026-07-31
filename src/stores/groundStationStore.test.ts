import { describe, expect, it } from 'vitest'
import { MockVehicleProvider } from '../providers/MockVehicleProvider'
import { applySnapshot, useGroundStationStore, useWorkspaceStore } from './groundStationStore'

describe('ground station stores', () => {
  it('keeps the snapshot and derived connection state coherent', () => {
    const provider = new MockVehicleProvider()
    applySnapshot(provider.getSnapshot())
    expect(useGroundStationStore.getState().connection).toBe('disconnected')
    expect(useGroundStationStore.getState().snapshot?.vehicle.id).toBe('PG-01')
  })

  it('keeps transient workspace selection outside vehicle state', () => {
    useWorkspaceStore.getState().setActiveWorkspace('Diagnostics')
    expect(useWorkspaceStore.getState().activeWorkspace).toBe('Diagnostics')
  })
})
