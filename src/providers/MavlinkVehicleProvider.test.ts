import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MissionPlan } from '../domain/models'
import { encodeMissionItemInt } from '../transport/mavlink/missions/MavlinkMission'
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
const missionPlan: MissionPlan = {
  id: 'test-mission',
  name: 'Test Mission',
  items: [
    {
      id: 'takeoff',
      type: 'takeoff',
      latitude: 37.7,
      longitude: -122.4,
      altitudeMeters: 20,
      altitudeReference: 'relative-to-home',
    },
    {
      id: 'waypoint',
      type: 'waypoint',
      latitude: 37.71,
      longitude: -122.41,
      altitudeMeters: 25,
      altitudeReference: 'relative-to-home',
    },
  ],
}
const missionRequest = (sequence: number): MavlinkMessage => ({
  messageId: 51,
  systemId: 1,
  componentId: 1,
  payload: new Uint8Array([sequence, 0, 255, 190, 0]),
})
const missionAck = (result: number): MavlinkMessage => ({
  messageId: 47,
  systemId: 1,
  componentId: 1,
  payload: new Uint8Array([255, 190, result, 0]),
})
const missionItem = (sequence: number): MavlinkMessage => {
  const frame = encodeMissionItemInt(missionPlan.items[sequence], sequence, 255, 190, 1)
  return { messageId: 73, systemId: 1, componentId: 1, payload: frame.slice(10, 48) }
}
const sentMessageIds = (): number[] =>
  mocks.invoke.mock.calls
    .filter(([command]) => command === 'send_mavlink_frame')
    .map(([, args]) => args.frame[7])

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

  it('rejects a mission transfer locally without sending a MAVLink frame when disconnected', async () => {
    const provider = new MavlinkVehicleProvider('0.0.0.0:14550', '127.0.0.1:14540')
    const receipt = await provider.clearMission()
    expect(receipt).toMatchObject({
      type: 'clear',
      status: 'failed',
      failureReason: 'not_connected',
    })
    expect(mocks.invoke).not.toHaveBeenCalled()
    expect(provider.getSnapshot().mission.mostRecentTransfer).toMatchObject({
      id: receipt.operationId,
      type: receipt.type,
      status: receipt.status,
      failureReason: receipt.failureReason,
    })
  })

  it('uploads requested items, allows bounded duplicate requests, and completes only on ACK', async () => {
    const provider = new MavlinkVehicleProvider('0.0.0.0:14550', '127.0.0.1:14540')
    await provider.connect()
    transportHarness(provider).handle(heartbeat)
    mocks.invoke.mockClear()
    await expect(provider.uploadMission(missionPlan)).resolves.toMatchObject({
      type: 'upload',
      status: 'in_progress',
    })
    transportHarness(provider).handle(missionRequest(0))
    transportHarness(provider).handle(missionRequest(0))
    transportHarness(provider).handle(missionRequest(1))
    expect(provider.getSnapshot().mission.activeTransfer?.status).toBe('in_progress')
    transportHarness(provider).handle(missionAck(0))
    expect(sentMessageIds()).toEqual([44, 73, 73, 73])
    expect(provider.getSnapshot().mission).toMatchObject({
      activeTransfer: undefined,
      mostRecentTransfer: { status: 'succeeded', type: 'upload' },
      vehiclePlan: missionPlan,
    })
  })

  it('fails upload on an out-of-range request and ignores a late ACK', async () => {
    const provider = new MavlinkVehicleProvider('0.0.0.0:14550', '127.0.0.1:14540')
    await provider.connect()
    transportHarness(provider).handle(heartbeat)
    await provider.uploadMission(missionPlan)
    transportHarness(provider).handle(missionRequest(2))
    const failed = provider.getSnapshot().mission.mostRecentTransfer
    transportHarness(provider).handle(missionAck(0))
    expect(failed).toMatchObject({ status: 'failed', failureReason: 'transport_error' })
    expect(provider.getSnapshot().mission.mostRecentTransfer).toEqual(failed)
  })

  it('enforces one active transfer and maps an unsupported vehicle acknowledgement', async () => {
    const provider = new MavlinkVehicleProvider('0.0.0.0:14550', '127.0.0.1:14540')
    await provider.connect()
    transportHarness(provider).handle(heartbeat)
    mocks.invoke.mockClear()
    await provider.uploadMission(missionPlan)
    await expect(provider.clearMission()).resolves.toMatchObject({
      status: 'failed',
      failureReason: 'transfer_in_progress',
    })
    expect(sentMessageIds()).toEqual([44])
    transportHarness(provider).handle(missionAck(3))
    expect(provider.getSnapshot().mission.mostRecentTransfer).toMatchObject({
      status: 'failed',
      failureReason: 'unsupported',
    })
  })

  it('bounds duplicate item resends instead of retrying the full upload', async () => {
    const provider = new MavlinkVehicleProvider('0.0.0.0:14550', '127.0.0.1:14540')
    await provider.connect()
    transportHarness(provider).handle(heartbeat)
    await provider.uploadMission(missionPlan)
    transportHarness(provider).handle(missionRequest(0))
    transportHarness(provider).handle(missionRequest(0))
    transportHarness(provider).handle(missionRequest(0))
    transportHarness(provider).handle(missionRequest(0))
    expect(provider.getSnapshot().mission.mostRecentTransfer).toMatchObject({
      status: 'failed',
      failureReason: 'transport_error',
    })
  })

  it('downloads ordered items and publishes the completed plan once', async () => {
    const provider = new MavlinkVehicleProvider('0.0.0.0:14550', '127.0.0.1:14540')
    await provider.connect()
    transportHarness(provider).handle(heartbeat)
    mocks.invoke.mockClear()
    await provider.downloadMission()
    transportHarness(provider).handle({
      messageId: 44,
      systemId: 1,
      componentId: 1,
      payload: new Uint8Array([2, 0, 255, 190, 0]),
    })
    transportHarness(provider).handle(missionItem(0))
    transportHarness(provider).handle(missionItem(1))
    expect(sentMessageIds()).toEqual([43, 51, 51, 47])
    expect(provider.getSnapshot().mission.vehiclePlan).toMatchObject({
      id: 'vehicle-mission-mavlink-mission-1',
      items: [
        { id: 'vehicle-item-0', type: 'takeoff' },
        { id: 'vehicle-item-1', type: 'waypoint' },
      ],
    })
    expect(provider.getSnapshot().mission.mostRecentTransfer?.status).toBe('succeeded')
  })

  it('rejects out-of-order download items without publishing a partial plan', async () => {
    const provider = new MavlinkVehicleProvider('0.0.0.0:14550', '127.0.0.1:14540')
    await provider.connect()
    transportHarness(provider).handle(heartbeat)
    await provider.downloadMission()
    transportHarness(provider).handle({
      messageId: 44,
      systemId: 1,
      componentId: 1,
      payload: new Uint8Array([2, 0, 255, 190, 0]),
    })
    transportHarness(provider).handle(missionItem(1))
    expect(provider.getSnapshot().mission.vehiclePlan).toBeUndefined()
    expect(provider.getSnapshot().mission.mostRecentTransfer).toMatchObject({
      status: 'failed',
      failureReason: 'transport_error',
    })
  })

  it('completes an empty download and rejects an invalid item count', async () => {
    const emptyProvider = new MavlinkVehicleProvider('0.0.0.0:14550', '127.0.0.1:14540')
    await emptyProvider.connect()
    transportHarness(emptyProvider).handle(heartbeat)
    await emptyProvider.downloadMission()
    transportHarness(emptyProvider).handle({
      messageId: 44,
      systemId: 1,
      componentId: 1,
      payload: new Uint8Array([0, 0, 255, 190, 0]),
    })
    expect(emptyProvider.getSnapshot().mission).toMatchObject({
      vehiclePlan: { items: [] },
      mostRecentTransfer: { status: 'succeeded' },
    })

    const invalidProvider = new MavlinkVehicleProvider('0.0.0.0:14550', '127.0.0.1:14540')
    await invalidProvider.connect()
    transportHarness(invalidProvider).handle(heartbeat)
    await invalidProvider.downloadMission()
    transportHarness(invalidProvider).handle({
      messageId: 44,
      systemId: 1,
      componentId: 1,
      payload: new Uint8Array([255, 255, 255, 190, 0]),
    })
    expect(invalidProvider.getSnapshot().mission.vehiclePlan).toBeUndefined()
    expect(invalidProvider.getSnapshot().mission.mostRecentTransfer).toMatchObject({ status: 'failed' })
  })

  it('times out an active transfer once and fails it on disconnect', async () => {
    vi.useFakeTimers()
    const provider = new MavlinkVehicleProvider('0.0.0.0:14550', '127.0.0.1:14540')
    await provider.connect()
    transportHarness(provider).handle(heartbeat)
    await provider.uploadMission(missionPlan)
    await vi.advanceTimersByTimeAsync(5000)
    expect(provider.getSnapshot().mission.mostRecentTransfer).toMatchObject({
      status: 'failed',
      failureReason: 'timed_out',
    })
    transportHarness(provider).handle(heartbeat)
    await provider.uploadMission(missionPlan)
    await provider.disconnect()
    expect(provider.getSnapshot().mission.mostRecentTransfer).toMatchObject({
      status: 'failed',
      failureReason: 'transport_error',
    })
  })

  it('clears a confirmed vehicle mission and updates mission progress independently of transfers', async () => {
    const provider = new MavlinkVehicleProvider('0.0.0.0:14550', '127.0.0.1:14540')
    await provider.connect()
    transportHarness(provider).handle(heartbeat)
    await provider.uploadMission(missionPlan)
    transportHarness(provider).handle(missionRequest(0))
    transportHarness(provider).handle(missionRequest(1))
    transportHarness(provider).handle(missionAck(0))
    transportHarness(provider).handle({
      messageId: 42,
      systemId: 1,
      componentId: 1,
      payload: new Uint8Array([1, 0]),
    })
    transportHarness(provider).handle({
      messageId: 46,
      systemId: 1,
      componentId: 1,
      payload: new Uint8Array([1, 0]),
    })
    expect(provider.getSnapshot().mission).toMatchObject({ currentWaypoint: 2, progressPercent: 100 })
    await provider.clearMission()
    transportHarness(provider).handle(missionAck(0))
    expect(provider.getSnapshot().mission).toMatchObject({
      totalWaypoints: 0,
      progressPercent: 0,
      vehiclePlan: { items: [] },
      mostRecentTransfer: { status: 'succeeded', type: 'clear' },
    })
  })
})
