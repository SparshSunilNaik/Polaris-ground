import { completeMissionTransfer, createMissionTransfer } from '../domain/missionTransfer'
import { isManualControlInputActive, neutralManualControlInput } from '../domain/manualControl'
import { validateMissionPlan } from '../domain/missionValidation'
import type {
  GroundStationSnapshot,
  ManualControlInput,
  MissionOperationReceipt,
  MissionPlan,
  MissionTransferType,
  MissionValidationResult,
  TimelineEvent,
  VehicleAction,
  VehicleCommand,
} from '../domain/models'
import type { VehicleProvider } from './VehicleProvider'

const perimeterSurveyPlan: MissionPlan = {
  id: 'perimeter-survey',
  name: 'Perimeter Survey',
  items: [
    {
      id: 'takeoff',
      type: 'takeoff',
      latitude: 37.7749,
      longitude: -122.4194,
      altitudeMeters: 24,
      altitudeReference: 'relative-to-home',
    },
    {
      id: 'survey-1',
      type: 'waypoint',
      latitude: 37.7751,
      longitude: -122.4192,
      altitudeMeters: 24,
      altitudeReference: 'relative-to-home',
    },
    {
      id: 'land',
      type: 'land',
      latitude: 37.7749,
      longitude: -122.4194,
      altitudeMeters: 0,
      altitudeReference: 'relative-to-home',
    },
  ],
}

const initialSnapshot = (): GroundStationSnapshot => ({
  connection: 'disconnected',
  diagnostics: {
    provider: 'mock',
    listenerState: 'stopped',
    receivedMessageCount: 0,
    transportErrorCount: 0,
    reconnectAttempts: 0,
  },
  vehicle: { id: 'PG-01', name: 'Polaris Scout', type: 'Multirotor', flightMode: 'Mission', armed: true },
  telemetry: {
    position: { latitude: 37.7749, longitude: -122.4194, altitudeMeters: 24 },
    attitude: { rollDegrees: 1.2, pitchDegrees: -0.7, headingDegrees: 84 },
    groundSpeedMps: 6.4,
    battery: { percent: 86, voltage: 15.7, remainingMinutes: 19 },
    link: { qualityPercent: 96, latencyMs: 42, packetLossPercent: 0.2 },
  },
  autonomy: 'active',
  mission: {
    state: 'running',
    name: 'Perimeter Survey',
    currentWaypoint: 3,
    totalWaypoints: 8,
    progressPercent: 38,
    activePlan: perimeterSurveyPlan,
    vehiclePlan: perimeterSurveyPlan,
  },
  safety: 'safe',
  avoidanceStatus: 'Standby',
  commands: [],
  manualControl: {
    status: 'disabled',
    input: neutralManualControlInput(),
    message: 'Keyboard control is disabled.',
  },
  timeline: [
    {
      id: 'start',
      timestamp: 0,
      severity: 'info',
      label: 'Mission active',
      message: 'Perimeter Survey is underway.',
    },
  ],
})

export class MockVehicleProvider implements VehicleProvider {
  private snapshot = initialSnapshot()
  private listeners = new Set<(snapshot: GroundStationSnapshot) => void>()
  private timer: ReturnType<typeof setInterval> | undefined
  private tick = 0
  private commandSequence = 0
  private missionSequence = 0
  private manualControlTimer: ReturnType<typeof setInterval> | undefined
  private manualControlPrestreamFrames = 0

  async connect(): Promise<void> {
    this.update({ connection: 'connecting', diagnostics: this.diagnostics('starting') })
    await Promise.resolve()
    this.update({ connection: 'connected', diagnostics: this.diagnostics('listening') })
    this.timer ??= setInterval(() => this.advance(), 1000)
  }
  async reconnect(): Promise<void> {
    await this.disconnect()
    await this.connect()
  }
  async disconnect(): Promise<void> {
    this.disableManualControl('Vehicle disconnected.')
    this.stopTimer()
    this.update({ connection: 'disconnected', diagnostics: this.diagnostics('stopped') })
  }
  getSnapshot(): GroundStationSnapshot {
    return this.snapshot
  }
  subscribe(listener: (snapshot: GroundStationSnapshot) => void): () => void {
    this.listeners.add(listener)
    listener(this.snapshot)
    return () => this.listeners.delete(listener)
  }
  async sendCommand(action: VehicleAction): Promise<VehicleCommand> {
    const duplicate = this.snapshot.commands.find(
      (command) => command.action === action && command.status === 'pending',
    )
    if (duplicate)
      return this.recordCommand(action, 'rejected', 'A matching command is already awaiting a response.')
    if (this.snapshot.connection !== 'connected')
      return this.recordCommand(action, 'rejected', 'Vehicle is not connected.')
    const command = this.recordCommand(action, 'pending', `${actionLabel(action)} requested.`)
    setTimeout(
      () => this.completeCommand(command.id, 'accepted', `${actionLabel(action)} accepted by vehicle.`),
      300,
    )
    return command
  }
  async enableManualControl(): Promise<void> {
    if (this.snapshot.connection !== 'connected' || !this.snapshot.vehicle.armed) {
      this.setManualControl('unavailable', 'Keyboard control requires a connected, armed vehicle.')
      return
    }
    this.manualControlPrestreamFrames = 0
    this.setManualControl('prestreaming', 'Preparing neutral control setpoints before Offboard mode.')
    this.manualControlTimer ??= setInterval(() => this.advanceManualControl(), 100)
  }
  updateManualControl(input: ManualControlInput): void {
    if (
      !['prestreaming', 'entering_offboard', 'enabled_neutral', 'active'].includes(
        this.snapshot.manualControl.status,
      )
    )
      return
    const status = this.snapshot.manualControl.status
    this.setManualControl(
      status === 'prestreaming' || status === 'entering_offboard'
        ? status
        : isManualControlInputActive(input)
          ? 'active'
          : 'enabled_neutral',
      isManualControlInputActive(input)
        ? 'Keyboard control is active.'
        : 'Keyboard control is transmitting neutral setpoints.',
      input,
    )
  }
  disableManualControl(reason = 'Keyboard control disabled.'): void {
    this.stopManualControl()
    this.setManualControl('disabled', reason)
  }
  async downloadMission(): Promise<MissionOperationReceipt> {
    return this.completeMissionOperation(
      'download',
      'Mission download completed.',
      this.snapshot.mission.vehiclePlan,
    )
  }
  async uploadMission(plan: MissionPlan): Promise<MissionOperationReceipt> {
    const validation = this.validateMission(plan)
    if (!validation.valid)
      return this.completeMissionOperation(
        'upload',
        validation.issues[0]?.message ?? 'Mission is invalid.',
        undefined,
        'invalid_mission',
      )
    return this.completeMissionOperation('upload', 'Mission upload accepted.', plan)
  }
  async clearMission(): Promise<MissionOperationReceipt> {
    return this.completeMissionOperation('clear', 'Mission cleared.', {
      id: 'mock-empty-mission',
      name: 'Vehicle mission',
      items: [],
    })
  }
  validateMission(plan: MissionPlan): MissionValidationResult {
    return validateMissionPlan(plan)
  }
  dispose(): void {
    this.disableManualControl('Keyboard control disabled because the provider is closing.')
    this.stopTimer()
    this.listeners.clear()
  }
  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
  }
  private stopManualControl(): void {
    if (this.manualControlTimer) clearInterval(this.manualControlTimer)
    this.manualControlTimer = undefined
  }
  private advanceManualControl(): void {
    if (this.snapshot.manualControl.status === 'prestreaming') {
      if (++this.manualControlPrestreamFrames >= 3)
        this.setManualControl('entering_offboard', 'Waiting for PX4 to enter Offboard mode.')
      return
    }
    if (this.snapshot.manualControl.status === 'entering_offboard') {
      this.setManualControl(
        'enabled_neutral',
        'Keyboard control is enabled and transmitting neutral setpoints.',
      )
      return
    }
    if (this.snapshot.manualControl.status !== 'active') return
    const input = this.snapshot.manualControl.input
    this.snapshot = {
      ...this.snapshot,
      telemetry: {
        ...this.snapshot.telemetry,
        position: {
          ...this.snapshot.telemetry.position,
          latitude: this.snapshot.telemetry.position.latitude + input.forward * 0.000001,
          longitude: this.snapshot.telemetry.position.longitude + input.right * 0.000001,
          altitudeMeters: this.snapshot.telemetry.position.altitudeMeters + input.up * 0.03,
        },
      },
    }
    this.emit()
  }
  private setManualControl(
    status: GroundStationSnapshot['manualControl']['status'],
    message: string,
    input = neutralManualControlInput(),
  ): void {
    this.snapshot = { ...this.snapshot, manualControl: { status, input, message } }
    this.emit()
  }
  private advance(): void {
    this.tick += 1
    const prior = this.snapshot
    const progress = Math.min(100, prior.mission.progressPercent + 2)
    const waypoint = Math.min(
      prior.mission.totalWaypoints,
      1 + Math.ceil((progress / 100) * prior.mission.totalWaypoints),
    )
    const completed = progress === 100
    const timeline: TimelineEvent[] =
      this.tick === 8
        ? [
            {
              id: `safety-${this.tick}`,
              timestamp: this.tick,
              severity: 'warning',
              label: 'Safety advisory',
              message: 'Crosswind observed. Flight path remains monitored.',
            },
            ...prior.timeline,
          ]
        : prior.timeline
    if (completed && prior.mission.state !== 'completed')
      timeline.unshift({
        id: 'complete',
        timestamp: this.tick,
        severity: 'info',
        label: 'Mission completed',
        message: 'All survey waypoints reached.',
      })
    this.snapshot = {
      ...prior,
      telemetry: {
        ...prior.telemetry,
        position: {
          ...prior.telemetry.position,
          altitudeMeters: Number((24 + Math.sin(this.tick / 2) * 3).toFixed(1)),
        },
        groundSpeedMps: Number((6.4 + Math.sin(this.tick) * 0.8).toFixed(1)),
        battery: {
          ...prior.telemetry.battery,
          percent: Math.max(0, prior.telemetry.battery.percent - 0.15),
          remainingMinutes: Math.max(0, prior.telemetry.battery.remainingMinutes - 0.04),
        },
      },
      mission: {
        ...prior.mission,
        currentWaypoint: waypoint,
        progressPercent: progress,
        state: completed ? 'completed' : 'running',
      },
      autonomy: completed ? 'idle' : 'active',
      safety: this.tick === 8 ? 'warning' : completed ? 'safe' : prior.safety,
      timeline: timeline.slice(0, 30),
      diagnostics: {
        ...prior.diagnostics!,
        lastEventAt: Date.now(),
        lastMessageAt: Date.now(),
        lastHeartbeatAt: Date.now(),
        receivedMessageCount: prior.diagnostics!.receivedMessageCount + 1,
      },
    }
    this.emit()
  }
  private update(change: Partial<GroundStationSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...change }
    this.emit()
  }
  private emit(): void {
    this.listeners.forEach((listener) => listener(this.snapshot))
  }
  private diagnostics(listenerState: NonNullable<GroundStationSnapshot['diagnostics']>['listenerState']) {
    const current = this.snapshot.diagnostics
    return {
      provider: 'mock' as const,
      listenerState,
      reconnectAttempts: 0,
      lastEventAt: Date.now(),
      receivedMessageCount: current?.receivedMessageCount ?? 0,
      transportErrorCount: current?.transportErrorCount ?? 0,
    }
  }
  private recordCommand(
    action: VehicleAction,
    status: VehicleCommand['status'],
    message: string,
  ): VehicleCommand {
    const command: VehicleCommand = {
      id: `mock-command-${++this.commandSequence}`,
      action,
      status,
      requestedAt: Date.now(),
      completedAt: status === 'pending' ? undefined : Date.now(),
      message,
    }
    this.snapshot = {
      ...this.snapshot,
      commands: [command, ...this.snapshot.commands].slice(0, 20),
      timeline: [commandEvent(command, this.tick), ...this.snapshot.timeline].slice(0, 30),
    }
    this.emit()
    return command
  }
  private completeCommand(id: string, status: VehicleCommand['status'], message: string): void {
    const current = this.snapshot.commands.find((command) => command.id === id)
    if (!current || current.status !== 'pending') return
    const command = { ...current, status, completedAt: Date.now(), message }
    this.snapshot = {
      ...this.snapshot,
      commands: this.snapshot.commands.map((entry) => (entry.id === id ? command : entry)),
      timeline: [commandEvent(command, this.tick), ...this.snapshot.timeline].slice(0, 30),
    }
    this.emit()
  }
  private completeMissionOperation(
    type: MissionTransferType,
    message: string,
    vehiclePlan?: MissionPlan,
    failureReason?: 'invalid_mission',
  ): MissionOperationReceipt {
    const transfer = completeMissionTransfer(
      createMissionTransfer(`mock-mission-${++this.missionSequence}`, type, Date.now(), message),
      failureReason ? 'failed' : 'succeeded',
      Date.now(),
      message,
      failureReason,
    )
    this.snapshot = {
      ...this.snapshot,
      mission: {
        ...this.snapshot.mission,
        activePlan: type === 'upload' && vehiclePlan ? vehiclePlan : this.snapshot.mission.activePlan,
        vehiclePlan: vehiclePlan ?? this.snapshot.mission.vehiclePlan,
        name: vehiclePlan?.name ?? this.snapshot.mission.name,
        currentWaypoint: type === 'clear' ? 0 : this.snapshot.mission.currentWaypoint,
        totalWaypoints:
          type === 'clear' ? 0 : (vehiclePlan?.items.length ?? this.snapshot.mission.totalWaypoints),
        progressPercent: type === 'clear' ? 0 : this.snapshot.mission.progressPercent,
        mostRecentTransfer: transfer,
      },
    }
    this.emit()
    return {
      operationId: transfer.id,
      type: transfer.type,
      status: transfer.status,
      requestedAt: transfer.requestedAt,
      message: transfer.message,
      failureReason: transfer.failureReason,
    }
  }
}

const actionLabel = (action: VehicleAction): string =>
  ({ arm: 'Arm', disarm: 'Disarm', takeoff: 'Take off', land: 'Land', returnToLaunch: 'Return to launch' })[
    action
  ]

const commandEvent = (command: VehicleCommand, timestamp: number): TimelineEvent => ({
  id: `command-${command.id}-${command.status}`,
  timestamp,
  severity: command.status === 'rejected' || command.status === 'timed_out' ? 'warning' : 'info',
  label: `${actionLabel(command.action)} ${command.status.replace('_', ' ')}`,
  message: command.message,
})
