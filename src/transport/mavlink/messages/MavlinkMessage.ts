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
    systemId: frame[isV2 ? 5 : 3],
    componentId: frame[isV2 ? 6 : 4],
    payload: frame.slice(headerSize, headerSize + payloadLength),
  }
}

export const decodeFrames = (datagram: Uint8Array): MavlinkMessage[] => {
  const messages: MavlinkMessage[] = []
  for (let offset = 0; offset < datagram.length;) {
    const marker = datagram[offset]
    const headerSize = marker === 0xfd ? 10 : marker === 0xfe ? 6 : 0
    if (!headerSize) {
      offset += 1
      continue
    }
    const frameSize = headerSize + datagram[offset + 1] + 2
    if (offset + frameSize > datagram.length) break
    const message = decodeFrame(datagram.slice(offset, offset + frameSize))
    if (message) messages.push(message)
    offset += frameSize
  }
  return messages
}
