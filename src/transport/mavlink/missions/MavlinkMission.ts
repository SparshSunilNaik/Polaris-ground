import type { MissionItem, MissionItemType } from '../../../domain/models'
import type { MavlinkMessage } from '../messages/MavlinkMessage'

export const MAVLINK_MISSION_TYPE = 0
export const MAV_FRAME_GLOBAL_RELATIVE_ALT = 3
export const MAV_MISSION_RESULT_ACCEPTED = 0
export const MAV_MISSION_RESULT_UNSUPPORTED_FRAME = 2
export const MAV_MISSION_RESULT_UNSUPPORTED = 3
export const MAV_MISSION_RESULT_OPERATION_CANCELLED = 15
export const MAX_DUPLICATE_MISSION_ITEM_RESENDS = 2

export const MAVLINK_MISSION_MESSAGE = {
  REQUEST_LIST: 43,
  COUNT: 44,
  CLEAR_ALL: 45,
  ITEM_REACHED: 46,
  ACK: 47,
  REQUEST_INT: 51,
  CURRENT: 42,
  ITEM_INT: 73,
} as const

const MAVLINK_MISSION_CRC_EXTRA: Record<number, number> = {
  [MAVLINK_MISSION_MESSAGE.REQUEST_LIST]: 132,
  [MAVLINK_MISSION_MESSAGE.COUNT]: 221,
  [MAVLINK_MISSION_MESSAGE.CLEAR_ALL]: 232,
  [MAVLINK_MISSION_MESSAGE.ITEM_REACHED]: 11,
  [MAVLINK_MISSION_MESSAGE.ACK]: 153,
  [MAVLINK_MISSION_MESSAGE.REQUEST_INT]: 196,
  [MAVLINK_MISSION_MESSAGE.CURRENT]: 28,
  [MAVLINK_MISSION_MESSAGE.ITEM_INT]: 38,
}

const MAV_CMD_BY_ITEM_TYPE: Record<MissionItemType, number> = {
  takeoff: 22,
  waypoint: 16,
  land: 21,
  'return-to-launch': 20,
}

const ITEM_TYPE_BY_MAV_CMD: Record<number, MissionItemType | undefined> = {
  16: 'waypoint',
  20: 'return-to-launch',
  21: 'land',
  22: 'takeoff',
}

export interface DecodedMissionRequest {
  sequence: number
  missionType: number
}

export interface DecodedMissionCount {
  count: number
  missionType: number
}

export interface DecodedMissionAck {
  result: number
  missionType: number
}

export interface DecodedMissionItem {
  sequence: number
  item: MissionItem
  missionType: number
}

export const encodeMissionRequestList = (
  targetSystem: number,
  targetComponent: number,
  sequence: number,
): Uint8Array =>
  encodeMissionFrame(
    MAVLINK_MISSION_MESSAGE.REQUEST_LIST,
    sequence,
    new Uint8Array([targetSystem, targetComponent, MAVLINK_MISSION_TYPE]),
  )

export const encodeMissionCount = (
  count: number,
  targetSystem: number,
  targetComponent: number,
  sequence: number,
): Uint8Array => {
  const payload = targetPayload(5, targetSystem, targetComponent)
  new DataView(payload.buffer).setUint16(0, count, true)
  payload[4] = MAVLINK_MISSION_TYPE
  return encodeMissionFrame(MAVLINK_MISSION_MESSAGE.COUNT, sequence, payload)
}

export const encodeMissionRequestInt = (
  itemSequence: number,
  targetSystem: number,
  targetComponent: number,
  sequence: number,
): Uint8Array => {
  const payload = targetPayload(5, targetSystem, targetComponent)
  new DataView(payload.buffer).setUint16(0, itemSequence, true)
  payload[4] = MAVLINK_MISSION_TYPE
  return encodeMissionFrame(MAVLINK_MISSION_MESSAGE.REQUEST_INT, sequence, payload)
}

export const encodeMissionItemInt = (
  item: MissionItem,
  itemSequence: number,
  targetSystem: number,
  targetComponent: number,
  sequence: number,
): Uint8Array => {
  const payload = new Uint8Array(38)
  const view = new DataView(payload.buffer)
  view.setFloat32(0, item.holdTimeSeconds ?? 0, true)
  view.setFloat32(4, item.acceptanceRadiusMeters ?? 0, true)
  view.setInt32(16, Math.round(item.latitude * 1e7), true)
  view.setInt32(20, Math.round(item.longitude * 1e7), true)
  view.setFloat32(24, item.altitudeMeters, true)
  view.setUint16(28, itemSequence, true)
  view.setUint16(30, MAV_CMD_BY_ITEM_TYPE[item.type], true)
  payload[32] = targetSystem
  payload[33] = targetComponent
  payload[34] = MAV_FRAME_GLOBAL_RELATIVE_ALT
  payload[35] = itemSequence === 0 ? 1 : 0
  payload[36] = 1
  payload[37] = MAVLINK_MISSION_TYPE
  return encodeMissionFrame(MAVLINK_MISSION_MESSAGE.ITEM_INT, sequence, payload)
}

export const encodeMissionAck = (
  result: number,
  targetSystem: number,
  targetComponent: number,
  sequence: number,
): Uint8Array =>
  encodeMissionFrame(
    MAVLINK_MISSION_MESSAGE.ACK,
    sequence,
    new Uint8Array([targetSystem, targetComponent, result, MAVLINK_MISSION_TYPE]),
  )

export const encodeMissionClearAll = (
  targetSystem: number,
  targetComponent: number,
  sequence: number,
): Uint8Array =>
  encodeMissionFrame(
    MAVLINK_MISSION_MESSAGE.CLEAR_ALL,
    sequence,
    new Uint8Array([targetSystem, targetComponent, MAVLINK_MISSION_TYPE]),
  )

export const decodeMissionRequestInt = (message: MavlinkMessage): DecodedMissionRequest | null =>
  message.messageId === MAVLINK_MISSION_MESSAGE.REQUEST_INT && message.payload.length >= 4
    ? { sequence: view(message.payload).getUint16(0, true), missionType: missionType(message.payload, 4) }
    : null

export const decodeMissionCount = (message: MavlinkMessage): DecodedMissionCount | null =>
  message.messageId === MAVLINK_MISSION_MESSAGE.COUNT && message.payload.length >= 4
    ? { count: view(message.payload).getUint16(0, true), missionType: missionType(message.payload, 4) }
    : null

export const decodeMissionAck = (message: MavlinkMessage): DecodedMissionAck | null =>
  message.messageId === MAVLINK_MISSION_MESSAGE.ACK && message.payload.length >= 3
    ? { result: message.payload[2], missionType: missionType(message.payload, 3) }
    : null

export const decodeMissionItemInt = (message: MavlinkMessage): DecodedMissionItem | null => {
  if (message.messageId !== MAVLINK_MISSION_MESSAGE.ITEM_INT || message.payload.length < 37) return null
  const payload = message.payload
  const command = view(payload).getUint16(30, true)
  const type = ITEM_TYPE_BY_MAV_CMD[command]
  if (!type || payload[34] !== MAV_FRAME_GLOBAL_RELATIVE_ALT) return null
  return {
    sequence: view(payload).getUint16(28, true),
    missionType: missionType(payload, 37),
    item: {
      id: `vehicle-item-${view(payload).getUint16(28, true)}`,
      type,
      latitude: view(payload).getInt32(16, true) / 1e7,
      longitude: view(payload).getInt32(20, true) / 1e7,
      altitudeMeters: view(payload).getFloat32(24, true),
      altitudeReference: 'relative-to-home',
      holdTimeSeconds: view(payload).getFloat32(0, true),
      acceptanceRadiusMeters: view(payload).getFloat32(4, true),
    },
  }
}

export const decodeMissionCurrent = (message: MavlinkMessage): number | null =>
  message.messageId === MAVLINK_MISSION_MESSAGE.CURRENT && message.payload.length >= 2
    ? view(message.payload).getUint16(0, true)
    : null

export const decodeMissionItemReached = (message: MavlinkMessage): number | null =>
  message.messageId === MAVLINK_MISSION_MESSAGE.ITEM_REACHED && message.payload.length >= 2
    ? view(message.payload).getUint16(0, true)
    : null

const targetPayload = (length: number, targetSystem: number, targetComponent: number): Uint8Array => {
  const payload = new Uint8Array(length)
  payload[2] = targetSystem
  payload[3] = targetComponent
  return payload
}

const missionType = (payload: Uint8Array, offset: number): number => payload[offset] ?? MAVLINK_MISSION_TYPE
const view = (payload: Uint8Array): DataView =>
  new DataView(payload.buffer, payload.byteOffset, payload.byteLength)

const encodeMissionFrame = (messageId: number, sequence: number, payload: Uint8Array): Uint8Array => {
  const frame = new Uint8Array(10 + payload.length + 2)
  frame[0] = 0xfd
  frame[1] = payload.length
  frame[4] = sequence & 0xff
  frame[5] = 255
  frame[6] = 190
  frame[7] = messageId & 0xff
  frame[8] = (messageId >> 8) & 0xff
  frame[9] = (messageId >> 16) & 0xff
  frame.set(payload, 10)
  let crc = 0xffff
  for (const byte of frame.slice(1, 10 + payload.length)) crc = accumulate(crc, byte)
  crc = accumulate(crc, MAVLINK_MISSION_CRC_EXTRA[messageId])
  frame[10 + payload.length] = crc & 0xff
  frame[11 + payload.length] = crc >> 8
  return frame
}

const accumulate = (crc: number, byte: number): number => {
  let value = byte ^ (crc & 0xff)
  value ^= (value << 4) & 0xff
  return ((crc >> 8) ^ (value << 8) ^ (value << 3) ^ (value >> 4)) & 0xffff
}
