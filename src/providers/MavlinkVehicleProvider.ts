import { completeMissionTransfer, createMissionTransfer } from '../domain/missionTransfer'
import { MAXIMUM_WAYPOINT_COUNT, validateMissionPlan } from '../domain/missionValidation'
import { isManualControlInputActive, neutralManualControlInput } from '../domain/manualControl'
import type {
  GroundStationSnapshot,
  ManualControlInput,
  MissionFailureReason,
  MissionOperationReceipt,
  MissionItem,
  MissionPlan,
  MissionTransferOperation,
  MissionTransferType,
  MissionValidationResult,
  TimelineEvent,
  VehicleAction,
  VehicleCommand,
} from '../domain/models'
import { MavlinkConnection } from '../transport/mavlink/connection/MavlinkConnection'
import { encodeCommandLong, mavlinkCommandFor } from '../transport/mavlink/commands/MavlinkCommand'
import {
  encodeBodyVelocitySetpoint,
  encodeSetFlightMode,
  MAV_CMD_DO_SET_MODE,
  PX4_CUSTOM_MAIN_MODE_OFFBOARD,
  PX4_CUSTOM_MAIN_MODE_POSCTL,
} from '../transport/mavlink/manual/MavlinkManualControl'
import { translateMavlinkMessage } from '../transport/mavlink/translator/MavlinkTranslator'
import {
  decodeMissionAck,
  decodeMissionCount,
  decodeMissionCurrent,
  decodeMissionItemInt,
  decodeMissionItemReached,
  decodeMissionRequestInt,
  encodeMissionAck,
  encodeMissionClearAll,
  encodeMissionCount,
  encodeMissionItemInt,
  encodeMissionRequestInt,
  encodeMissionRequestList,
  MAVLINK_MISSION_MESSAGE,
  MAVLINK_MISSION_TYPE,
  MAV_MISSION_RESULT_ACCEPTED,
  MAV_MISSION_RESULT_UNSUPPORTED,
  MAV_MISSION_RESULT_UNSUPPORTED_FRAME,
  MAX_DUPLICATE_MISSION_ITEM_RESENDS,
} from '../transport/mavlink/missions/MavlinkMission'
import type { VehicleProvider } from './VehicleProvider'

export const MISSION_TRANSFER_TIMEOUT_MS = 5000
export const MANUAL_CONTROL_RATE_HZ = 10
export const MANUAL_CONTROL_PRESTREAM_FRAMES = 3
export const MANUAL_CONTROL_OFFBOARD_TIMEOUT_MS = 2000
export const MANUAL_CONTROL_NEUTRAL_FRAMES = 3
const MAXIMUM_MISSION_ITEM_COUNT = MAXIMUM_WAYPOINT_COUNT + 2
type MissionStage = 'waiting_for_count' | 'waiting_for_request' | 'waiting_for_item' | 'waiting_for_ack'
type ActiveMissionTransfer = {
  operation: MissionTransferOperation
  stage: MissionStage
  targetSystem: number
  targetComponent: number
  plan?: MissionPlan
  requestedItems: Map<number, number>
  downloadedItems: MissionItem[]
  expectedSequence: number
  itemCount: number
}

const initial = (): GroundStationSnapshot => ({
  connection: 'disconnected',
  vehicle: {
    id: 'Awaiting vehicle',
    name: 'MAVLink vehicle',
    type: 'Unknown',
    flightMode: 'Awaiting heartbeat',
    armed: false,
  },
  telemetry: {
    position: { latitude: 0, longitude: 0, altitudeMeters: 0 },
    attitude: { rollDegrees: 0, pitchDegrees: 0, headingDegrees: 0 },
    groundSpeedMps: 0,
    battery: { percent: 0, voltage: 0, remainingMinutes: 0 },
    link: { qualityPercent: 0, latencyMs: 0, packetLossPercent: 0 },
  },
  autonomy: 'unavailable',
  mission: {
    state: 'idle',
    name: 'No mission reported',
    currentWaypoint: 0,
    totalWaypoints: 0,
    progressPercent: 0,
  },
  safety: 'unknown',
  avoidanceStatus: 'Unavailable',
  commands: [],
  manualControl: {
    status: 'disabled',
    input: neutralManualControlInput(),
    message: 'Keyboard control is disabled.',
  },
  timeline: [],
})

export class MavlinkVehicleProvider implements VehicleProvider {
  private snapshot = initial()
  private listeners = new Set<(value: GroundStationSnapshot) => void>()
  private connection: MavlinkConnection
  private timestamp = 0
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined
  private lastHeartbeat = 0
  private commandSequence = 0
  private frameSequence = 0
  private missionSequence = 0
  private activeMissionTransfer: ActiveMissionTransfer | undefined
  private missionTimeout: ReturnType<typeof setTimeout> | undefined
  private manualControlTimer: ReturnType<typeof setInterval> | undefined
  private manualControlEntryTimeout: ReturnType<typeof setTimeout> | undefined
  private manualControlPrestreamFrames = 0
  private manualControlNeutralFrames = 0
  private readonly remoteAddress: string
  private readonly commandTimeoutMs: number
  constructor(
    endpoint = import.meta.env.VITE_MAVLINK_BIND_ADDRESS ?? '0.0.0.0:14550',
    remoteAddress = import.meta.env.VITE_MAVLINK_REMOTE_ADDRESS ?? '127.0.0.1:14540',
    commandTimeoutMs = 5000,
  ) {
    this.connection = new MavlinkConnection(endpoint, remoteAddress, (message) => this.handle(message))
    this.remoteAddress = remoteAddress
    this.commandTimeoutMs = commandTimeoutMs
  }
  async connect(): Promise<void> {
    this.set({ ...this.snapshot, connection: 'connecting' })
    try {
      await this.connection.connect()
      this.startHeartbeatMonitor()
      this.set({
        ...this.snapshot,
        connection: 'connected',
        timeline: [
          this.event('info', 'Listening for vehicle', 'Waiting for a MAVLink heartbeat.'),
          ...this.snapshot.timeline,
        ],
      })
    } catch {
      this.set({
        ...this.snapshot,
        connection: 'error',
        timeline: [
          this.event('warning', 'Connection unavailable', 'Could not start the MAVLink listener.'),
          ...this.snapshot.timeline,
        ],
      })
    }
  }
  async disconnect(): Promise<void> {
    this.disableManualControl('Vehicle disconnected.')
    this.failActiveMission('transport_error', 'Mission transfer interrupted by disconnect.')
    this.stopHeartbeatMonitor()
    await this.connection.disconnect()
    this.set({
      ...this.snapshot,
      connection: 'disconnected',
      timeline: [
        this.event('info', 'Vehicle disconnected', 'MAVLink listener stopped.'),
        ...this.snapshot.timeline,
      ],
    })
  }
  getSnapshot(): GroundStationSnapshot {
    return this.snapshot
  }
  subscribe(listener: (value: GroundStationSnapshot) => void): () => void {
    this.listeners.add(listener)
    listener(this.snapshot)
    return () => this.listeners.delete(listener)
  }
  async sendCommand(action: VehicleAction): Promise<VehicleCommand> {
    const duplicate = this.snapshot.commands.find(
      (command) =>
        command.status === 'pending' && mavlinkCommandFor(command.action) === mavlinkCommandFor(action),
    )
    if (duplicate)
      return this.recordCommand(action, 'rejected', 'A matching command is already awaiting a response.')
    const { componentId } = this.snapshot.vehicle
    if (this.snapshot.connection !== 'connected' || componentId === undefined) {
      return this.recordCommand(action, 'rejected', 'Vehicle identity is not available.')
    }
    const command = this.recordCommand(
      action,
      'pending',
      `${actionLabel(action)} sent; awaiting vehicle acknowledgement.`,
    )
    try {
      await this.connection.send(
        encodeCommandLong(
          action,
          Number(this.snapshot.vehicle.id.replace('SYS-', '')),
          componentId,
          this.frameSequence++,
        ),
        this.remoteAddress,
      )
      setTimeout(() => this.timeoutCommand(command.id), this.commandTimeoutMs)
    } catch {
      this.completeCommand(command.id, 'rejected', 'Command could not be sent to the vehicle.')
    }
    return command
  }
  async enableManualControl(): Promise<void> {
    const { componentId, armed } = this.snapshot.vehicle
    const { latitude, longitude } = this.snapshot.telemetry.position
    if (this.snapshot.connection !== 'connected' || componentId === undefined || !armed) {
      this.setManualControl('unavailable', 'Keyboard control requires a connected, armed vehicle.')
      return
    }
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || (latitude === 0 && longitude === 0)) {
      this.setManualControl('unavailable', 'Keyboard control requires a valid vehicle position.')
      return
    }
    if (!['disabled', 'unavailable', 'failed'].includes(this.snapshot.manualControl.status)) return
    this.manualControlPrestreamFrames = 0
    this.manualControlNeutralFrames = 0
    this.setManualControl('prestreaming', 'Preparing neutral control setpoints before Offboard mode.')
    this.startManualControlLoop()
    this.manualControlTick()
  }
  updateManualControl(input: ManualControlInput): void {
    const status = this.snapshot.manualControl.status
    if (!['prestreaming', 'entering_offboard', 'enabled_neutral', 'active'].includes(status)) return
    const nextStatus =
      status === 'enabled_neutral' || status === 'active'
        ? isManualControlInputActive(input)
          ? 'active'
          : 'enabled_neutral'
        : status
    this.setManualControl(nextStatus, this.snapshot.manualControl.message, input)
  }
  disableManualControl(reason = 'Keyboard control disabled.'): void {
    this.clearManualControlEntryTimeout()
    const wasTransmitting = this.manualControlTimer !== undefined
    this.manualControlPrestreamFrames = 0
    this.setManualControl('disabled', reason)
    if (!wasTransmitting) return
    this.manualControlNeutralFrames = MANUAL_CONTROL_NEUTRAL_FRAMES
    this.sendManualFlightMode(PX4_CUSTOM_MAIN_MODE_POSCTL)
  }
  async downloadMission(): Promise<MissionOperationReceipt> {
    if (this.activeMissionTransfer)
      return this.localMissionRejection(
        'download',
        'Another mission transfer is already active.',
        'transfer_in_progress',
      )
    const active = this.startMissionTransfer('download', 'Mission download requested.')
    if (!active)
      return this.localMissionRejection('download', 'Vehicle identity is not available.', 'not_connected')
    this.sendMissionFrame(
      active,
      encodeMissionRequestList(active.targetSystem, active.targetComponent, this.frameSequence++),
      'waiting_for_count',
    )
    return missionReceipt(active.operation)
  }
  async uploadMission(plan: MissionPlan): Promise<MissionOperationReceipt> {
    const validation = this.validateMission(plan)
    if (!validation.valid)
      return this.localMissionRejection(
        'upload',
        validation.issues[0]?.message ?? 'Mission plan is invalid.',
        'invalid_mission',
      )
    if (this.activeMissionTransfer)
      return this.localMissionRejection(
        'upload',
        'Another mission transfer is already active.',
        'transfer_in_progress',
      )
    const active = this.startMissionTransfer('upload', 'Mission upload requested.', plan)
    if (!active)
      return this.localMissionRejection('upload', 'Vehicle identity is not available.', 'not_connected')
    this.sendMissionFrame(
      active,
      encodeMissionCount(
        plan.items.length,
        active.targetSystem,
        active.targetComponent,
        this.frameSequence++,
      ),
      'waiting_for_request',
    )
    return missionReceipt(active.operation)
  }
  async clearMission(): Promise<MissionOperationReceipt> {
    if (this.activeMissionTransfer)
      return this.localMissionRejection(
        'clear',
        'Another mission transfer is already active.',
        'transfer_in_progress',
      )
    const active = this.startMissionTransfer('clear', 'Mission clear requested.')
    if (!active)
      return this.localMissionRejection('clear', 'Vehicle identity is not available.', 'not_connected')
    this.sendMissionFrame(
      active,
      encodeMissionClearAll(active.targetSystem, active.targetComponent, this.frameSequence++),
      'waiting_for_ack',
    )
    return missionReceipt(active.operation)
  }
  validateMission(plan: MissionPlan): MissionValidationResult {
    return validateMissionPlan(plan)
  }
  dispose(): void {
    this.disableManualControl('Keyboard control disabled because the provider is closing.')
    this.failActiveMission('transport_error', 'Mission transfer interrupted by provider disposal.')
    this.stopHeartbeatMonitor()
    this.connection.dispose()
    this.listeners.clear()
  }
  private handle(message: Parameters<typeof translateMavlinkMessage>[0]): void {
    if (message.messageId === 77) this.handleCommandAck(message)
    if (this.handleMissionMessage(message)) return
    if (message.messageId === 0) {
      const restored = this.snapshot.connection === 'degraded'
      this.lastHeartbeat = Date.now()
      if (restored)
        this.set({
          ...this.snapshot,
          connection: 'connected',
          timeline: [
            this.event('info', 'Heartbeat restored', 'Vehicle telemetry resumed.'),
            ...this.snapshot.timeline,
          ],
        })
    }
    const update = translateMavlinkMessage(message, ++this.timestamp)
    if (!update) return
    const timeline = update.event
      ? [update.event, ...this.snapshot.timeline].slice(0, 30)
      : this.snapshot.timeline
    this.set({
      ...this.snapshot,
      connection: 'connected',
      vehicle: update.vehicle ?? this.snapshot.vehicle,
      telemetry: {
        ...this.snapshot.telemetry,
        battery: update.battery ?? this.snapshot.telemetry.battery,
        position: update.position ?? this.snapshot.telemetry.position,
        attitude: update.attitude ?? this.snapshot.telemetry.attitude,
        groundSpeedMps: update.groundSpeedMps ?? this.snapshot.telemetry.groundSpeedMps,
        link: { ...this.snapshot.telemetry.link, qualityPercent: 100 },
      },
      timeline,
    })
    if (update.vehicle) this.syncManualControlFlightMode(update.vehicle.flightMode)
  }
  private event(severity: TimelineEvent['severity'], label: string, message: string): TimelineEvent {
    return { id: `${label}-${++this.timestamp}`, timestamp: this.timestamp, severity, label, message }
  }
  private set(snapshot: GroundStationSnapshot): void {
    this.snapshot = snapshot
    this.listeners.forEach((listener) => listener(snapshot))
  }
  private handleCommandAck(message: Parameters<typeof translateMavlinkMessage>[0]): void {
    if (message.payload.length < 3) return
    if (message.systemId !== Number(this.snapshot.vehicle.id.replace('SYS-', ''))) return
    const payload = new DataView(
      message.payload.buffer,
      message.payload.byteOffset,
      message.payload.byteLength,
    )
    const mavlinkCommand = payload.getUint16(0, true)
    const result = message.payload[2]
    if (
      mavlinkCommand === MAV_CMD_DO_SET_MODE &&
      this.snapshot.manualControl.status === 'entering_offboard'
    ) {
      if (result !== 0 && result !== 5) this.failManualControl('PX4 rejected the Offboard mode request.')
      return
    }
    if (result === 5) return
    const command = this.snapshot.commands.find(
      (entry) => entry.status === 'pending' && mavlinkCommandFor(entry.action) === mavlinkCommand,
    )
    if (!command) return
    if (result === 0)
      this.completeCommand(command.id, 'accepted', `${actionLabel(command.action)} accepted by vehicle.`)
    else this.completeCommand(command.id, 'rejected', `${actionLabel(command.action)} rejected by vehicle.`)
  }
  private timeoutCommand(id: string): void {
    this.completeCommand(
      id,
      'timed_out',
      'No vehicle acknowledgement was received before the command timed out.',
    )
  }
  private recordCommand(
    action: VehicleAction,
    status: VehicleCommand['status'],
    message: string,
  ): VehicleCommand {
    const command: VehicleCommand = {
      id: `mavlink-command-${++this.commandSequence}`,
      action,
      status,
      requestedAt: Date.now(),
      completedAt: status === 'pending' ? undefined : Date.now(),
      message,
    }
    this.set({
      ...this.snapshot,
      commands: [command, ...this.snapshot.commands].slice(0, 20),
      timeline: [
        this.event(
          commandSeverity(command.status),
          `${actionLabel(command.action)} ${command.status.replace('_', ' ')}`,
          command.message,
        ),
        ...this.snapshot.timeline,
      ].slice(0, 30),
    })
    return command
  }
  private completeCommand(id: string, status: VehicleCommand['status'], message: string): void {
    const current = this.snapshot.commands.find((command) => command.id === id)
    if (!current || current.status !== 'pending') return
    const command = { ...current, status, completedAt: Date.now(), message }
    this.set({
      ...this.snapshot,
      commands: this.snapshot.commands.map((entry) => (entry.id === id ? command : entry)),
      timeline: [
        this.event(
          commandSeverity(command.status),
          `${actionLabel(command.action)} ${command.status.replace('_', ' ')}`,
          command.message,
        ),
        ...this.snapshot.timeline,
      ].slice(0, 30),
    })
  }
  private startManualControlLoop(): void {
    if (this.manualControlTimer) return
    this.manualControlTimer = setInterval(() => this.manualControlTick(), 1000 / MANUAL_CONTROL_RATE_HZ)
  }
  private stopManualControlLoop(): void {
    if (this.manualControlTimer) clearInterval(this.manualControlTimer)
    this.manualControlTimer = undefined
  }
  private manualControlTick(): void {
    const status = this.snapshot.manualControl.status
    if (status === 'disabled' || status === 'failed') {
      if (this.manualControlNeutralFrames <= 0) return this.stopManualControlLoop()
      this.manualControlNeutralFrames -= 1
    } else if (!['prestreaming', 'entering_offboard', 'enabled_neutral', 'active'].includes(status)) {
      return this.stopManualControlLoop()
    }
    const { componentId } = this.snapshot.vehicle
    const targetSystem = Number(this.snapshot.vehicle.id.replace('SYS-', ''))
    if (
      componentId === undefined ||
      !Number.isInteger(targetSystem) ||
      this.snapshot.connection !== 'connected'
    ) {
      this.failManualControl('Keyboard control lost vehicle connectivity.')
      return
    }
    const input =
      status === 'enabled_neutral' || status === 'active'
        ? this.snapshot.manualControl.input
        : neutralManualControlInput()
    void this.connection
      .send(
        encodeBodyVelocitySetpoint(input, targetSystem, componentId, this.frameSequence++),
        this.remoteAddress,
      )
      .catch(() => this.failManualControl('Keyboard control setpoint could not be sent.', false))
    if (status === 'prestreaming' && ++this.manualControlPrestreamFrames >= MANUAL_CONTROL_PRESTREAM_FRAMES) {
      this.setManualControl('entering_offboard', 'Waiting for PX4 to enter Offboard mode.')
      this.sendManualFlightMode(PX4_CUSTOM_MAIN_MODE_OFFBOARD)
      this.clearManualControlEntryTimeout()
      this.manualControlEntryTimeout = setTimeout(
        () => this.failManualControl('PX4 did not confirm Offboard mode in time.'),
        MANUAL_CONTROL_OFFBOARD_TIMEOUT_MS,
      )
    }
  }
  private sendManualFlightMode(customMainMode: number): void {
    const { componentId } = this.snapshot.vehicle
    const targetSystem = Number(this.snapshot.vehicle.id.replace('SYS-', ''))
    if (
      componentId === undefined ||
      !Number.isInteger(targetSystem) ||
      this.snapshot.connection !== 'connected'
    )
      return
    void this.connection
      .send(
        encodeSetFlightMode(customMainMode, targetSystem, componentId, this.frameSequence++),
        this.remoteAddress,
      )
      .catch(() => this.failManualControl('Keyboard control mode request could not be sent.', false))
  }
  private syncManualControlFlightMode(flightMode: string): void {
    const status = this.snapshot.manualControl.status
    if (status === 'entering_offboard' && flightMode === 'Offboard') {
      this.clearManualControlEntryTimeout()
      this.setManualControl(
        isManualControlInputActive(this.snapshot.manualControl.input) ? 'active' : 'enabled_neutral',
        'Keyboard control is enabled and transmitting neutral setpoints.',
      )
      return
    }
    if ((status === 'enabled_neutral' || status === 'active') && flightMode !== 'Offboard')
      this.failManualControl('Keyboard control disabled because PX4 left Offboard mode.')
  }
  private setManualControl(
    status: GroundStationSnapshot['manualControl']['status'],
    message: string,
    input?: ManualControlInput,
  ): void {
    const resolvedInput =
      input ??
      (['disabled', 'unavailable', 'failed'].includes(status)
        ? neutralManualControlInput()
        : this.snapshot.manualControl.input)
    this.set({ ...this.snapshot, manualControl: { status, input: resolvedInput, message } })
  }
  private failManualControl(message: string, sendNeutral = true): void {
    this.clearManualControlEntryTimeout()
    this.manualControlNeutralFrames =
      sendNeutral && this.manualControlTimer ? MANUAL_CONTROL_NEUTRAL_FRAMES : 0
    this.setManualControl('failed', message)
    if (sendNeutral) this.sendManualFlightMode(PX4_CUSTOM_MAIN_MODE_POSCTL)
    if (this.manualControlNeutralFrames === 0) this.stopManualControlLoop()
  }
  private clearManualControlEntryTimeout(): void {
    if (this.manualControlEntryTimeout) clearTimeout(this.manualControlEntryTimeout)
    this.manualControlEntryTimeout = undefined
  }
  private startMissionTransfer(
    type: MissionTransferType,
    message: string,
    plan?: MissionPlan,
  ): ActiveMissionTransfer | undefined {
    const targetSystem = Number(this.snapshot.vehicle.id.replace('SYS-', ''))
    const targetComponent = this.snapshot.vehicle.componentId
    if (
      this.snapshot.connection !== 'connected' ||
      !Number.isInteger(targetSystem) ||
      targetComponent === undefined
    )
      return undefined
    const operation = {
      ...createMissionTransfer(`mavlink-mission-${++this.missionSequence}`, type, Date.now(), message),
      status: 'in_progress' as const,
    }
    const active: ActiveMissionTransfer = {
      operation,
      stage:
        type === 'download'
          ? 'waiting_for_count'
          : type === 'upload'
            ? 'waiting_for_request'
            : 'waiting_for_ack',
      targetSystem,
      targetComponent,
      plan,
      requestedItems: new Map(),
      downloadedItems: [],
      expectedSequence: 0,
      itemCount: 0,
    }
    this.activeMissionTransfer = active
    this.set({
      ...this.snapshot,
      mission: {
        ...this.snapshot.mission,
        activePlan: plan ?? this.snapshot.mission.activePlan,
        activeTransfer: operation,
        mostRecentTransfer: operation,
      },
      timeline: [
        this.event('info', `${missionLabel(type)} requested`, message),
        this.event('info', `${missionLabel(type)} started`, `${missionLabel(type)} started.`),
        ...this.snapshot.timeline,
      ].slice(0, 30),
    })
    return active
  }
  private localMissionRejection(
    type: MissionTransferType,
    message: string,
    failureReason: MissionTransferOperation['failureReason'],
  ): MissionOperationReceipt {
    const transfer = completeMissionTransfer(
      createMissionTransfer(`mavlink-mission-${++this.missionSequence}`, type, Date.now(), message),
      'failed',
      Date.now(),
      message,
      failureReason,
    )
    this.set({
      ...this.snapshot,
      mission: { ...this.snapshot.mission, mostRecentTransfer: transfer },
      timeline: [
        this.event('warning', `${missionLabel(type)} rejected`, message),
        ...this.snapshot.timeline,
      ].slice(0, 30),
    })
    return missionReceipt(transfer)
  }
  private sendMissionFrame(active: ActiveMissionTransfer, frame: Uint8Array, stage: MissionStage): void {
    active.stage = stage
    this.armMissionTimeout(active)
    void this.connection.send(frame, this.remoteAddress).catch(() => {
      if (this.activeMissionTransfer?.operation.id === active.operation.id)
        this.failActiveMission('transport_error', 'Mission protocol frame could not be sent.')
    })
  }
  private armMissionTimeout(active: ActiveMissionTransfer): void {
    this.clearMissionTimeout()
    const operationId = active.operation.id
    this.missionTimeout = setTimeout(() => {
      if (this.activeMissionTransfer?.operation.id !== operationId) return
      this.failActiveMission(
        'timed_out',
        `Mission transfer timed out while ${active.stage.replaceAll('_', ' ')}.`,
      )
    }, MISSION_TRANSFER_TIMEOUT_MS)
  }
  private clearMissionTimeout(): void {
    if (this.missionTimeout) clearTimeout(this.missionTimeout)
    this.missionTimeout = undefined
  }
  private handleMissionMessage(message: Parameters<typeof translateMavlinkMessage>[0]): boolean {
    if (!Object.values(MAVLINK_MISSION_MESSAGE).includes(message.messageId as never)) return false
    const knownSystem = Number(this.snapshot.vehicle.id.replace('SYS-', ''))
    if (Number.isInteger(knownSystem) && message.systemId !== knownSystem) return true
    const active = this.activeMissionTransfer
    if (message.messageId === MAVLINK_MISSION_MESSAGE.CURRENT) {
      this.updateMissionCurrent(decodeMissionCurrent(message))
      return true
    }
    if (message.messageId === MAVLINK_MISSION_MESSAGE.ITEM_REACHED) {
      this.updateMissionItemReached(decodeMissionItemReached(message))
      return true
    }
    if (!active || message.systemId !== active.targetSystem) return true
    if (message.messageId === MAVLINK_MISSION_MESSAGE.ACK) return this.handleMissionAck(message, active)
    if (message.messageId === MAVLINK_MISSION_MESSAGE.REQUEST_INT)
      return this.handleMissionRequest(message, active)
    if (message.messageId === MAVLINK_MISSION_MESSAGE.COUNT) return this.handleMissionCount(message, active)
    if (message.messageId === MAVLINK_MISSION_MESSAGE.ITEM_INT) return this.handleMissionItem(message, active)
    return true
  }
  private handleMissionAck(
    message: Parameters<typeof translateMavlinkMessage>[0],
    active: ActiveMissionTransfer,
  ): boolean {
    const ack = decodeMissionAck(message)
    if (!ack) return this.failMissionProtocol('Malformed mission acknowledgement.')
    if (ack.missionType !== MAVLINK_MISSION_TYPE)
      return this.failMissionProtocol('Unsupported mission type acknowledgement.')
    if (ack.result !== MAV_MISSION_RESULT_ACCEPTED) {
      const reason =
        ack.result === MAV_MISSION_RESULT_UNSUPPORTED || ack.result === MAV_MISSION_RESULT_UNSUPPORTED_FRAME
          ? 'unsupported'
          : 'vehicle_rejected'
      return this.failActiveMission(reason, `${missionLabel(active.operation.type)} rejected by vehicle.`)
    }
    if (active.operation.type === 'upload' && active.stage === 'waiting_for_ack')
      return this.succeedActiveMission('Mission upload accepted.', active.plan)
    if (active.operation.type === 'clear' && active.stage === 'waiting_for_ack')
      return this.succeedActiveMission('Mission cleared.', emptyVehicleMission())
    return this.failMissionProtocol('Unexpected mission acknowledgement during download.')
  }
  private handleMissionRequest(
    message: Parameters<typeof translateMavlinkMessage>[0],
    active: ActiveMissionTransfer,
  ): boolean {
    const request = decodeMissionRequestInt(message)
    if (!request) return this.failMissionProtocol('Malformed mission item request.')
    if (request.missionType !== MAVLINK_MISSION_TYPE)
      return this.failMissionProtocol('Unsupported mission type request.')
    if (active.operation.type !== 'upload' || !active.plan)
      return this.failMissionProtocol('Unexpected mission item request.')
    if (request.sequence >= active.plan.items.length)
      return this.failMissionProtocol('Vehicle requested an out-of-range mission item.')
    const requestCount = (active.requestedItems.get(request.sequence) ?? 0) + 1
    if (requestCount > MAX_DUPLICATE_MISSION_ITEM_RESENDS + 1)
      return this.failMissionProtocol('Vehicle repeatedly requested the same mission item.')
    active.requestedItems.set(request.sequence, requestCount)
    const allItemsSent = active.requestedItems.size === active.plan.items.length
    this.set({
      ...this.snapshot,
      timeline: [
        this.event(
          'info',
          'Mission upload progress',
          `Uploading item ${request.sequence + 1} of ${active.plan.items.length}.`,
        ),
        ...this.snapshot.timeline,
      ].slice(0, 30),
    })
    this.sendMissionFrame(
      active,
      encodeMissionItemInt(
        active.plan.items[request.sequence],
        request.sequence,
        active.targetSystem,
        active.targetComponent,
        this.frameSequence++,
      ),
      allItemsSent ? 'waiting_for_ack' : 'waiting_for_request',
    )
    return true
  }
  private handleMissionCount(
    message: Parameters<typeof translateMavlinkMessage>[0],
    active: ActiveMissionTransfer,
  ): boolean {
    const count = decodeMissionCount(message)
    if (!count) return this.failMissionProtocol('Malformed mission count.')
    if (count.missionType !== MAVLINK_MISSION_TYPE)
      return this.failMissionProtocol('Unsupported mission type count.')
    if (active.operation.type !== 'download' || active.stage !== 'waiting_for_count')
      return this.failMissionProtocol('Unexpected mission count.')
    if (count.count > MAXIMUM_MISSION_ITEM_COUNT)
      return this.failMissionProtocol('Vehicle reported an unsupported mission item count.')
    active.itemCount = count.count
    if (count.count === 0) {
      void this.connection.send(
        encodeMissionAck(
          MAV_MISSION_RESULT_ACCEPTED,
          active.targetSystem,
          active.targetComponent,
          this.frameSequence++,
        ),
        this.remoteAddress,
      )
      return this.succeedActiveMission('Mission download completed.', emptyVehicleMission())
    }
    this.sendMissionFrame(
      active,
      encodeMissionRequestInt(0, active.targetSystem, active.targetComponent, this.frameSequence++),
      'waiting_for_item',
    )
    return true
  }
  private handleMissionItem(
    message: Parameters<typeof translateMavlinkMessage>[0],
    active: ActiveMissionTransfer,
  ): boolean {
    const item = decodeMissionItemInt(message)
    if (!item) return this.failMissionProtocol('Malformed or unsupported mission item.')
    if (item.missionType !== MAVLINK_MISSION_TYPE)
      return this.failMissionProtocol('Unsupported mission type item.')
    if (active.operation.type !== 'download' || active.stage !== 'waiting_for_item')
      return this.failMissionProtocol('Unexpected mission item.')
    if (item.sequence !== active.expectedSequence)
      return this.failMissionProtocol('Mission item sequence was out of order.')
    active.downloadedItems.push(item.item)
    active.expectedSequence += 1
    if (active.expectedSequence === active.itemCount) {
      void this.connection.send(
        encodeMissionAck(
          MAV_MISSION_RESULT_ACCEPTED,
          active.targetSystem,
          active.targetComponent,
          this.frameSequence++,
        ),
        this.remoteAddress,
      )
      return this.succeedActiveMission('Mission download completed.', {
        id: `vehicle-mission-${active.operation.id}`,
        name: 'Vehicle mission',
        items: active.downloadedItems,
      })
    }
    this.sendMissionFrame(
      active,
      encodeMissionRequestInt(
        active.expectedSequence,
        active.targetSystem,
        active.targetComponent,
        this.frameSequence++,
      ),
      'waiting_for_item',
    )
    return true
  }
  private failMissionProtocol(message: string): true {
    this.failActiveMission('transport_error', message)
    return true
  }
  private succeedActiveMission(message: string, vehiclePlan?: MissionPlan): true {
    const active = this.activeMissionTransfer
    if (!active) return true
    this.clearMissionTimeout()
    this.activeMissionTransfer = undefined
    const operation = completeMissionTransfer(active.operation, 'succeeded', Date.now(), message)
    const itemCount = vehiclePlan?.items.length ?? this.snapshot.mission.totalWaypoints
    this.set({
      ...this.snapshot,
      mission: {
        ...this.snapshot.mission,
        name: vehiclePlan?.name ?? this.snapshot.mission.name,
        state: itemCount === 0 ? 'idle' : 'ready',
        currentWaypoint: 0,
        totalWaypoints: itemCount,
        progressPercent: 0,
        vehiclePlan: vehiclePlan ?? this.snapshot.mission.vehiclePlan,
        activeTransfer: undefined,
        mostRecentTransfer: operation,
      },
      timeline: [
        this.event('info', missionSuccessLabel(active.operation.type), message),
        ...this.snapshot.timeline,
      ].slice(0, 30),
    })
    return true
  }
  private failActiveMission(reason: MissionFailureReason, message: string): true {
    const active = this.activeMissionTransfer
    if (!active) return true
    this.clearMissionTimeout()
    this.activeMissionTransfer = undefined
    const operation = completeMissionTransfer(active.operation, 'failed', Date.now(), message, reason)
    this.set({
      ...this.snapshot,
      mission: { ...this.snapshot.mission, activeTransfer: undefined, mostRecentTransfer: operation },
      timeline: [
        this.event('warning', missionFailureLabel(active.operation.type, reason), message),
        ...this.snapshot.timeline,
      ].slice(0, 30),
    })
    return true
  }
  private updateMissionCurrent(sequence: number | null): void {
    const total = this.snapshot.mission.totalWaypoints
    if (sequence === null || sequence >= total) return
    this.set({ ...this.snapshot, mission: { ...this.snapshot.mission, currentWaypoint: sequence + 1 } })
  }
  private updateMissionItemReached(sequence: number | null): void {
    const total = this.snapshot.mission.totalWaypoints
    if (sequence === null || sequence >= total) return
    this.set({
      ...this.snapshot,
      mission: {
        ...this.snapshot.mission,
        currentWaypoint: Math.max(this.snapshot.mission.currentWaypoint, sequence + 1),
        progressPercent: Math.max(
          this.snapshot.mission.progressPercent,
          Math.round(((sequence + 1) / total) * 100),
        ),
      },
      timeline: [
        this.event('info', 'Mission item reached', `Vehicle reached mission item ${sequence + 1}.`),
        ...this.snapshot.timeline,
      ].slice(0, 30),
    })
  }
  private startHeartbeatMonitor(): void {
    this.stopHeartbeatMonitor()
    this.lastHeartbeat = Date.now()
    this.heartbeatTimer = setInterval(() => {
      if (Date.now() - this.lastHeartbeat <= 3000 || this.snapshot.connection !== 'connected') return
      this.set({
        ...this.snapshot,
        connection: 'degraded',
        timeline: [
          this.event('warning', 'Heartbeat lost', 'Vehicle telemetry has not been received for 3 seconds.'),
          ...this.snapshot.timeline,
        ],
      })
    }, 500)
  }
  private stopHeartbeatMonitor(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = undefined
  }
}

const actionLabel = (action: VehicleAction): string =>
  ({ arm: 'Arm', disarm: 'Disarm', takeoff: 'Take off', land: 'Land', returnToLaunch: 'Return to launch' })[
    action
  ]

const commandSeverity = (status: VehicleCommand['status']): TimelineEvent['severity'] =>
  status === 'rejected' || status === 'timed_out' ? 'warning' : 'info'

const missionReceipt = (operation: MissionTransferOperation): MissionOperationReceipt => ({
  operationId: operation.id,
  type: operation.type,
  status: operation.status,
  requestedAt: operation.requestedAt,
  message: operation.message,
  failureReason: operation.failureReason,
})

const missionLabel = (type: MissionTransferType): string =>
  ({ download: 'Mission download', upload: 'Mission upload', clear: 'Mission clear' })[type]

const missionSuccessLabel = (type: MissionTransferType): string =>
  ({ download: 'Mission download completed', upload: 'Mission upload accepted', clear: 'Mission cleared' })[
    type
  ]

const missionFailureLabel = (type: MissionTransferType, reason: MissionFailureReason): string =>
  reason === 'timed_out' ? 'Mission transfer timed out' : `${missionLabel(type)} rejected`

const emptyVehicleMission = (): MissionPlan => ({
  id: 'vehicle-mission-empty',
  name: 'Vehicle mission',
  items: [],
})
