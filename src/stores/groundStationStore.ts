import { create } from 'zustand'
import type { GroundStationSnapshot, VehicleConnectionState } from '../domain/models'

interface GroundStationStore {
  snapshot: GroundStationSnapshot | null
  connection: VehicleConnectionState
  setSnapshot: (snapshot: GroundStationSnapshot) => void
}

interface WorkspaceStore {
  activeWorkspace: string
  setActiveWorkspace: (activeWorkspace: string) => void
}

export const useGroundStationStore = create<GroundStationStore>((set) => ({
  snapshot: null,
  connection: 'disconnected',
  setSnapshot: (snapshot) => set({ snapshot, connection: snapshot.connection }),
}))

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  activeWorkspace: 'Operate',
  setActiveWorkspace: (activeWorkspace) => set({ activeWorkspace }),
}))

export const applySnapshot = (snapshot: GroundStationSnapshot): void =>
  useGroundStationStore.getState().setSnapshot(snapshot)
