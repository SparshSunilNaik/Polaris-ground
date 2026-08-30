import type { ManualControlInput } from '../../../domain/models'

export const MAVLINK_SET_POSITION_TARGET_LOCAL_NED = 84
export const MAVLINK_SET_POSITION_TARGET_LOCAL_NED_CRC_EXTRA = 143
export const MAV_FRAME_BODY_NED = 8
export const MAV_CMD_DO_SET_MODE = 176
export const MAV_MODE_FLAG_CUSTOM_MODE_ENABLED = 1
export const PX4_CUSTOM_MAIN_MODE_POSCTL = 3
export const PX4_CUSTOM_MAIN_MODE_OFFBOARD = 6
export const MANUAL_CONTROL_HORIZONTAL_SPEED_MPS = 0.5
export const MANUAL_CONTROL_VERTICAL_SPEED_MPS = 0.3
export const MANUAL_CONTROL_YAW_RATE_RADIANS_PER_SECOND = (20 * Math.PI) / 180
export const SET_POSITION_TARGET_VELOCITY_YAW_RATE_TYPE_MASK = 0x05c7

export const encodeBodyVelocitySetpoint = (
  input: ManualControlInput,
  targetSystem: number,
  targetComponent: number,
  sequence: number,
): Uint8Array => {
  const payload = new Uint8Array(53)
  const view = new DataView(payload.buffer)
  view.setFloat32(16, input.forward * MANUAL_CONTROL_HORIZONTAL_SPEED_MPS, true)
  view.setFloat32(20, input.right * MANUAL_CONTROL_HORIZONTAL_SPEED_MPS, true)
  // Body NED uses positive Z down; the domain uses positive up.
  view.setFloat32(24, input.up === 0 ? 0 : -input.up * MANUAL_CONTROL_VERTICAL_SPEED_MPS, true)
  view.setFloat32(44, input.yawRight * MANUAL_CONTROL_YAW_RATE_RADIANS_PER_SECOND, true)
  view.setUint16(48, SET_POSITION_TARGET_VELOCITY_YAW_RATE_TYPE_MASK, true)
  payload[50] = targetSystem
  payload[51] = targetComponent
  payload[52] = MAV_FRAME_BODY_NED
  return encodeV2Frame(
    MAVLINK_SET_POSITION_TARGET_LOCAL_NED,
    payload,
    sequence,
    MAVLINK_SET_POSITION_TARGET_LOCAL_NED_CRC_EXTRA,
  )
}

export const encodeSetFlightMode = (
  customMainMode: number,
  targetSystem: number,
  targetComponent: number,
  sequence: number,
): Uint8Array => {
  const payload = new Uint8Array(33)
  const view = new DataView(payload.buffer)
  view.setFloat32(0, MAV_MODE_FLAG_CUSTOM_MODE_ENABLED, true)
  view.setFloat32(4, customMainMode, true)
  view.setUint16(28, MAV_CMD_DO_SET_MODE, true)
  payload[30] = targetSystem
  payload[31] = targetComponent
  return encodeV2Frame(76, payload, sequence, 152)
}

const encodeV2Frame = (
  messageId: number,
  payload: Uint8Array,
  sequence: number,
  crcExtra: number,
): Uint8Array => {
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
