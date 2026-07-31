import { describe, expect, it } from 'vitest'
import type { MissionItem } from '../../../domain/models'
import type { MavlinkMessage } from '../messages/MavlinkMessage'
import {
  decodeMissionAck,
  decodeMissionCount,
  decodeMissionCurrent,
  decodeMissionItemInt,
  decodeMissionItemReached,
  decodeMissionRequestInt,
  encodeMissionAck,
  encodeMissionClearAll,
  encodeMissionCount,
  encodeMissionItemInt,
  encodeMissionRequestInt,
  encodeMissionRequestList,
  MAVLINK_MISSION_MESSAGE,
} from './MavlinkMission'

const item: MissionItem = {
  id: 'waypoint-1',
  type: 'waypoint',
  latitude: -33.8688,
  longitude: 151.2093,
  altitudeMeters: 42.5,
  altitudeReference: 'relative-to-home',
}

const message = (messageId: number, payload: number[]): MavlinkMessage => ({
  messageId,
  systemId: 1,
  componentId: 1,
  payload: new Uint8Array(payload),
})

describe('MAVLink mission codec', () => {
  it('encodes normal-mission requests, count, acknowledgement, and clear with MAVLink 2 headers', () => {
    const frames = [
      encodeMissionRequestList(1, 1, 7),
      encodeMissionCount(3, 1, 1, 8),
      encodeMissionRequestInt(2, 1, 1, 9),
      encodeMissionAck(0, 1, 1, 10),
      encodeMissionClearAll(1, 1, 11),
    ]
    expect(frames.map((frame) => frame[7])).toEqual([
      MAVLINK_MISSION_MESSAGE.REQUEST_LIST,
      MAVLINK_MISSION_MESSAGE.COUNT,
      MAVLINK_MISSION_MESSAGE.REQUEST_INT,
      MAVLINK_MISSION_MESSAGE.ACK,
      MAVLINK_MISSION_MESSAGE.CLEAR_ALL,
    ])
    expect(frames.map((frame) => [frame[0], frame[4], frame[5], frame[6]])).toEqual([
      [0xfd, 7, 255, 190],
      [0xfd, 8, 255, 190],
      [0xfd, 9, 255, 190],
      [0xfd, 10, 255, 190],
      [0xfd, 11, 255, 190],
    ])
    expect(frames.every((frame) => frame.at(-1) !== 0 || frame.at(-2) !== 0)).toBe(true)
  })

  it('encodes MISSION_ITEM_INT with signed coordinates, relative altitude, and sequence fields', () => {
    const frame = encodeMissionItemInt(item, 2, 1, 1, 12)
    const payload = new DataView(frame.buffer, 10, 38)
    expect(frame[7]).toBe(MAVLINK_MISSION_MESSAGE.ITEM_INT)
    expect(payload.getInt32(16, true)).toBe(-338688000)
    expect(payload.getInt32(20, true)).toBe(1512093000)
    expect(payload.getFloat32(24, true)).toBe(42.5)
    expect(payload.getUint16(28, true)).toBe(2)
    expect(payload.getUint16(30, true)).toBe(16)
    expect([...frame.slice(42, 46)]).toEqual([1, 1, 3, 0])
  })

  it('decodes normal mission fields and accepts omitted zero-valued MAVLink 2 extensions', () => {
    expect(decodeMissionRequestInt(message(51, [2, 0, 255, 190]))).toEqual({ sequence: 2, missionType: 0 })
    expect(decodeMissionCount(message(44, [3, 0, 255, 190, 0]))).toEqual({ count: 3, missionType: 0 })
    expect(decodeMissionAck(message(47, [255, 190, 99, 0]))).toEqual({ result: 99, missionType: 0 })
    expect(decodeMissionCurrent(message(42, [4, 0]))).toBe(4)
    expect(decodeMissionItemReached(message(46, [5, 0]))).toBe(5)
  })

  it('decodes supported mission items and rejects truncated or unsupported frames', () => {
    const frame = encodeMissionItemInt(item, 2, 255, 190, 1)
    const payload = frame.slice(10, 48)
    expect(decodeMissionItemInt(message(73, [...payload]))).toMatchObject({
      sequence: 2,
      item: { ...item, id: 'vehicle-item-2' },
    })
    expect(decodeMissionItemInt(message(73, [...payload.slice(0, 36)]))).toBeNull()
    payload[34] = 0
    expect(decodeMissionItemInt(message(73, [...payload]))).toBeNull()
    expect(decodeMissionAck(message(47, [255, 190]))).toBeNull()
  })
})
