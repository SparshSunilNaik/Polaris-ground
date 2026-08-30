import type { TimelineEvent, VehicleAttitude, VehiclePosition } from '../../../domain/models'
import type { MavlinkMessage } from '../messages/MavlinkMessage'

const view = (payload: Uint8Array) => new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
const text = (payload: Uint8Array) => new TextDecoder().decode(payload).replace(/\0.*$/, '').trim()
export type MavlinkUpdate = {
  vehicle?: {
    id: string
    componentId: number
    name: string
    type: string
    flightMode: string
    armed: boolean
  }
  battery?: { percent: number; voltage: number; remainingMinutes: number }
  position?: VehiclePosition
  attitude?: VehicleAttitude
  groundSpeedMps?: number
  event?: TimelineEvent
}

export const translateMavlinkMessage = (message: MavlinkMessage, timestamp: number): MavlinkUpdate | null => {
  const payload = message.payload
  switch (message.messageId) {
    case 0:
      return {
        vehicle: {
          id: `SYS-${message.systemId}`,
          componentId: message.componentId,
          name: `Vehicle ${message.systemId}`,
          type: 'MAVLink vehicle',
          flightMode: flightMode(payload),
          armed: (payload[6] & 0x80) !== 0,
        },
      }
    case 1:
      return payload.length >= 18
        ? {
            battery: {
              voltage: view(payload).getUint16(14, true) / 1000,
              percent: Math.max(0, Math.min(100, payload[30] ?? 0)),
              remainingMinutes: 0,
            },
          }
        : null
    case 30:
      return payload.length >= 16
        ? {
            attitude: {
              rollDegrees: view(payload).getFloat32(4, true) * 57.2958,
              pitchDegrees: view(payload).getFloat32(8, true) * 57.2958,
              headingDegrees: (view(payload).getFloat32(12, true) * 57.2958 + 360) % 360,
            },
          }
        : null
    case 33:
      return payload.length >= 28
        ? {
            position: {
              latitude: view(payload).getInt32(4, true) / 1e7,
              longitude: view(payload).getInt32(8, true) / 1e7,
              altitudeMeters: view(payload).getInt32(12, true) / 1000,
            },
            groundSpeedMps: Math.hypot(
              view(payload).getInt16(20, true) / 100,
              view(payload).getInt16(22, true) / 100,
            ),
          }
        : null
    case 253:
      return {
        event: {
          id: `status-${timestamp}`,
          timestamp,
          severity: payload[0] >= 4 ? 'warning' : 'info',
          label: 'Vehicle status',
          message: text(payload.slice(1)) || 'Vehicle reported an update.',
        },
      }
    default:
      return null
  }
}

const flightMode = (payload: Uint8Array): string => {
  if (payload.length < 7) return 'Unknown'
  const mainMode = (view(payload).getUint32(0, true) >>> 16) & 0xff
  return { 3: 'Position', 4: 'Mission', 5: 'Return', 6: 'Offboard', 9: 'Land' }[mainMode] ?? 'Active'
}
