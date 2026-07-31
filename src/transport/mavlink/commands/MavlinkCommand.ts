import type { VehicleAction } from '../../../domain/models'

export const MAV_CMD = {
  NAV_TAKEOFF: 22,
  NAV_LAND: 21,
  NAV_RETURN_TO_LAUNCH: 20,
  COMPONENT_ARM_DISARM: 400,
} as const

export const mavlinkCommandFor = (action: VehicleAction): number =>
  ({
    arm: MAV_CMD.COMPONENT_ARM_DISARM,
    disarm: MAV_CMD.COMPONENT_ARM_DISARM,
    takeoff: MAV_CMD.NAV_TAKEOFF,
    land: MAV_CMD.NAV_LAND,
    returnToLaunch: MAV_CMD.NAV_RETURN_TO_LAUNCH,
  })[action]

export const encodeCommandLong = (
  action: VehicleAction,
  targetSystem: number,
  targetComponent: number,
  sequence: number,
): Uint8Array => {
  const payload = new Uint8Array(33)
  const view = new DataView(payload.buffer)
  if (action === 'arm') view.setFloat32(0, 1, true)
  if (action === 'disarm') view.setFloat32(0, 0, true)
  if (action === 'takeoff') view.setFloat32(24, 10, true)
  view.setUint16(28, mavlinkCommandFor(action), true)
  payload[30] = targetSystem
  payload[31] = targetComponent
  payload[32] = 0
  return encodeV2Frame(76, payload, sequence, 255, 190, 152)
}

export const encodeGroundHeartbeat = (sequence: number): Uint8Array => {
  const payload = new Uint8Array(9)
  payload[4] = 6
  payload[5] = 8
  payload[7] = 4
  payload[8] = 3
  return encodeV2Frame(0, payload, sequence, 255, 190, 50)
}

const encodeV2Frame = (
  messageId: number,
  payload: Uint8Array,
  sequence: number,
  systemId: number,
  componentId: number,
  crcExtra: number,
): Uint8Array => {
  const frame = new Uint8Array(10 + payload.length + 2)
  frame[0] = 0xfd
  frame[1] = payload.length
  frame[4] = sequence & 0xff
  frame[5] = systemId
  frame[6] = componentId
  frame[7] = messageId & 0xff
  frame[8] = (messageId >> 8) & 0xff
  frame[9] = (messageId >> 16) & 0xff
  frame.set(payload, 10)
  let crc = 0xffff
  for (const byte of frame.slice(1, 10 + payload.length)) crc = accumulate(crc, byte)
  crc = accumulate(crc, crcExtra)
  frame[10 + payload.length] = crc & 0xff
  frame[11 + payload.length] = crc >> 8
  return frame
}

const accumulate = (crc: number, byte: number): number => {
  let value = byte ^ (crc & 0xff)
  value ^= (value << 4) & 0xff
  return ((crc >> 8) ^ (value << 8) ^ (value << 3) ^ (value >> 4)) & 0xffff
}
