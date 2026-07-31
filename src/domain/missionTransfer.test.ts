import { describe, expect, it } from 'vitest'
import { completeMissionTransfer, createMissionTransfer, updateMissionTransfer } from './missionTransfer'

describe('mission transfer lifecycle', () => {
  it('creates, updates, and completes a transfer', () => {
    const pending = createMissionTransfer('upload-1', 'upload', 10, 'Upload requested.')
    const inProgress = updateMissionTransfer(pending, 'in_progress', 'Uploading mission.')
    const completed = completeMissionTransfer(inProgress, 'succeeded', 20, 'Mission uploaded.')

    expect(pending).toMatchObject({ status: 'pending', requestedAt: 10 })
    expect(inProgress).toMatchObject({ status: 'in_progress', message: 'Uploading mission.' })
    expect(completed).toMatchObject({ status: 'succeeded', completedAt: 20, message: 'Mission uploaded.' })
  })

  it('does not update an already terminal transfer', () => {
    const failed = completeMissionTransfer(
      createMissionTransfer('clear-1', 'clear', 10),
      'failed',
      20,
      'Vehicle rejected clear.',
      'vehicle_rejected',
    )
    expect(updateMissionTransfer(failed, 'in_progress')).toBe(failed)
    expect(completeMissionTransfer(failed, 'cancelled', 30)).toBe(failed)
  })
})
