import type {
  MissionFailureReason,
  MissionTransferOperation,
  MissionTransferStatus,
  MissionTransferType,
} from './models'

const terminalStatuses: ReadonlySet<MissionTransferStatus> = new Set(['succeeded', 'failed', 'cancelled'])

export const createMissionTransfer = (
  id: string,
  type: MissionTransferType,
  requestedAt: number,
  message?: string,
): MissionTransferOperation => ({ id, type, status: 'pending', requestedAt, message })

export const updateMissionTransfer = (
  operation: MissionTransferOperation,
  status: Exclude<MissionTransferStatus, 'pending'>,
  message?: string,
): MissionTransferOperation => {
  if (isMissionTransferTerminal(operation)) return operation
  return { ...operation, status, message: message ?? operation.message }
}

export const completeMissionTransfer = (
  operation: MissionTransferOperation,
  status: Extract<MissionTransferStatus, 'succeeded' | 'failed' | 'cancelled'>,
  completedAt: number,
  message?: string,
  failureReason?: MissionFailureReason,
): MissionTransferOperation => {
  if (isMissionTransferTerminal(operation)) return operation
  return { ...operation, status, completedAt, message: message ?? operation.message, failureReason }
}

export const isMissionTransferTerminal = (operation: MissionTransferOperation): boolean =>
  terminalStatuses.has(operation.status)
