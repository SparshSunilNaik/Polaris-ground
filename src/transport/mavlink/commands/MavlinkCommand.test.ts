import { describe, expect, it } from 'vitest'
import { encodeCommandLong, MAV_CMD } from './MavlinkCommand'

describe('encodeCommandLong', () => {
  it('encodes a MAVLink 2 arm COMMAND_LONG for the selected vehicle', () => {
    const frame = encodeCommandLong('arm', 7, 1, 9)
    const payload = new DataView(frame.buffer, 10, 33)
    expect([...frame.slice(0, 10)]).toEqual([0xfd, 33, 0, 0, 9, 255, 190, 76, 0, 0])
    expect(payload.getFloat32(0, true)).toBe(1)
    expect(payload.getUint16(28, true)).toBe(MAV_CMD.COMPONENT_ARM_DISARM)
    expect([...frame.slice(40)]).toEqual([7, 1, 0, 81, 233])
  })
})
