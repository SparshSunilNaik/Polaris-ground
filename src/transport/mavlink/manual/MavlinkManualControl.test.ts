import { describe, expect, it } from 'vitest'
import { neutralManualControlInput } from '../../../domain/manualControl'
import {
  encodeBodyVelocitySetpoint,
  MAV_FRAME_BODY_NED,
  MANUAL_CONTROL_YAW_RATE_RADIANS_PER_SECOND,
  SET_POSITION_TARGET_VELOCITY_YAW_RATE_TYPE_MASK,
} from './MavlinkManualControl'

const payloadFor = (input: Parameters<typeof encodeBodyVelocitySetpoint>[0]) =>
  new DataView(encodeBodyVelocitySetpoint(input, 1, 1, 7).buffer, 10, 53)

describe('encodeBodyVelocitySetpoint', () => {
  it('encodes BODY_NED velocity-only setpoints with yaw rate', () => {
    const frame = encodeBodyVelocitySetpoint({ forward: 1, right: -1, up: 1, yawRight: -1 }, 1, 1, 7)
    const payload = new DataView(frame.buffer, 10, 53)
    expect([...frame.slice(0, 10)]).toEqual([0xfd, 53, 0, 0, 7, 255, 190, 84, 0, 0])
    expect(payload.getFloat32(16, true)).toBe(0.5)
    expect(payload.getFloat32(20, true)).toBe(-0.5)
    expect(payload.getFloat32(24, true)).toBeCloseTo(-0.3)
    expect(payload.getFloat32(44, true)).toBeCloseTo(-MANUAL_CONTROL_YAW_RATE_RADIANS_PER_SECOND)
    expect(payload.getUint16(48, true)).toBe(SET_POSITION_TARGET_VELOCITY_YAW_RATE_TYPE_MASK)
    expect(payload.getUint8(52)).toBe(MAV_FRAME_BODY_NED)
  })

  it('uses positive BODY_NED z for down and positive yaw rate for yaw right', () => {
    expect(payloadFor({ forward: -1, right: 1, up: -1, yawRight: 1 }).getFloat32(16, true)).toBe(-0.5)
    expect(payloadFor({ forward: -1, right: 1, up: -1, yawRight: 1 }).getFloat32(20, true)).toBe(0.5)
    expect(payloadFor({ forward: -1, right: 1, up: -1, yawRight: 1 }).getFloat32(24, true)).toBeCloseTo(0.3)
    expect(payloadFor({ forward: -1, right: 1, up: -1, yawRight: 1 }).getFloat32(44, true)).toBeCloseTo(
      MANUAL_CONTROL_YAW_RATE_RADIANS_PER_SECOND,
    )
    expect(payloadFor(neutralManualControlInput()).getFloat32(24, true)).toBe(0)
  })
})
