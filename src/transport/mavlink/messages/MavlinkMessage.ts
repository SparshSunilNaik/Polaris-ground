export interface MavlinkMessage {
  messageId: number
  systemId: number
  componentId: number
  payload: Uint8Array
}

export const decodeFrame = (frame: Uint8Array): MavlinkMessage | null => {
  const isV2 = frame[0] === 0xfd
  const headerSize = isV2 ? 10 : frame[0] === 0xfe ? 6 : 0
  if (!headerSize || frame.length < headerSize + 2) return null
  const payloadLength = frame[1]
  if (frame.length < headerSize + payloadLength + 2) return null
  const messageId = isV2 ? frame[7] | (frame[8] << 8) | (frame[9] << 16) : frame[5]
  return {
    messageId,
    systemId: frame[3],
    componentId: frame[4],
    payload: frame.slice(headerSize, headerSize + payloadLength),
  }
}
