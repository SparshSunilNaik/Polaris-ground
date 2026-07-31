import { describe, expect, it } from 'vitest'
import { translateMavlinkMessage } from './MavlinkTranslator'

describe('translateMavlinkMessage', () => {
  it('translates heartbeat discovery without exposing protocol types', () => {
    const update = translateMavlinkMessage(
      { messageId: 0, systemId: 7, componentId: 1, payload: new Uint8Array([0, 0, 0, 0, 0, 0, 0x80]) },
      1,
    )
    expect(update?.vehicle).toMatchObject({ id: 'SYS-7', componentId: 1, armed: true })
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
