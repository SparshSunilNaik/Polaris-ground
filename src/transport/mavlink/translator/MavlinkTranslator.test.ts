import { describe, expect, it } from 'vitest'
import { translateMavlinkMessage } from './MavlinkTranslator'
import { decodeFrame, decodeFrames } from '../messages/MavlinkMessage'

describe('translateMavlinkMessage', () => {
  it('translates heartbeat discovery without exposing protocol types', () => {
    const update = translateMavlinkMessage(
      { messageId: 0, systemId: 7, componentId: 1, payload: new Uint8Array([0, 0, 0, 0, 0, 0, 0x80]) },
      1,
    )
    expect(update?.vehicle).toMatchObject({ id: 'SYS-7', componentId: 1, armed: true })
  })
  it('recovers valid frames after garbage and supports multiple frames per datagram', () => {
    const heartbeat = new Uint8Array([0xfe, 7, 0, 1, 7, 0, 0, 0, 0, 0, 0, 0, 0x80, 0, 0, 0])
    expect(decodeFrames(new Uint8Array([99, ...heartbeat, ...heartbeat]))).toHaveLength(2)
  })
  it('uses MAVLink 2 system and component header offsets', () => {
    const frame = new Uint8Array([0xfd, 7, 0, 0, 9, 42, 17, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x80, 0, 0])
    expect(decodeFrame(frame)).toMatchObject({
      messageId: 0,
      systemId: 42,
      componentId: 17,
      payload: frame.slice(10, 17),
    })
    expect(translateMavlinkMessage(decodeFrame(frame)!, 1)?.vehicle?.id).toBe('SYS-42')
  })
  it('translates status messages into product timeline events', () => {
    const update = translateMavlinkMessage(
      {
        messageId: 253,
        systemId: 1,
        componentId: 1,
        payload: new Uint8Array([4, ...new TextEncoder().encode('Battery warning')]),
      },
      3,
    )
    expect(update?.event).toMatchObject({ severity: 'warning', message: 'Battery warning' })
  })
})
