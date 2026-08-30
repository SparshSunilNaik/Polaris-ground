import { useEffect, useEffectEvent, useRef } from 'react'
import {
  isManualControlInputActive,
  isManualControlKey,
  manualControlInputFromHeldKeys,
  neutralManualControlInput,
} from '../../domain/manualControl'
import type { GroundStationSnapshot, ManualControlInput } from '../../domain/models'
import { Panel } from '../ui/Panel'
import { SectionHeader } from '../ui/SectionHeader'

const controlStatuses = new Set(['prestreaming', 'entering_offboard', 'enabled_neutral', 'active'])

export function ManualFlight({
  snapshot,
  onEnable,
  onDisable,
  onInput,
}: {
  snapshot: GroundStationSnapshot
  onEnable: () => void
  onDisable: (reason?: string) => void
  onInput: (input: ManualControlInput) => void
}) {
  const heldKeys = useRef(new Set<string>())
  const controlEnabled = controlStatuses.has(snapshot.manualControl.status)
  const controlEnabledRef = useRef(controlEnabled)
  const publishInput = useEffectEvent(onInput)
  const disable = useEffectEvent(onDisable)
  useEffect(() => {
    controlEnabledRef.current = controlEnabled
  }, [controlEnabled])
  useEffect(() => {
    const held = heldKeys.current
    const publish = () => publishInput(manualControlInputFromHeldKeys(held))
    const clearAndDisable = (reason: string) => {
      if (!controlEnabled) return
      held.clear()
      publishInput(neutralManualControlInput())
      disable(reason)
    }
    const keydown = (event: KeyboardEvent) => {
      if (event.code === 'Escape' && controlEnabled) {
        event.preventDefault()
        clearAndDisable('Keyboard control disabled with Escape.')
        return
      }
      if (!controlEnabled || !isManualControlKey(event.code) || isEditableTarget(event.target)) return
      event.preventDefault()
      if (held.has(event.code)) return
      held.add(event.code)
      publish()
    }
    const keyup = (event: KeyboardEvent) => {
      if (!controlEnabled || !isManualControlKey(event.code) || !held.has(event.code)) return
      event.preventDefault()
      held.delete(event.code)
      publish()
    }
    const blur = () => clearAndDisable('Keyboard control disabled because the application lost focus.')
    const visibility = () => {
      if (document.hidden) clearAndDisable('Keyboard control disabled because the application was hidden.')
    }
    window.addEventListener('keydown', keydown, true)
    window.addEventListener('keyup', keyup, true)
    window.addEventListener('blur', blur)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      window.removeEventListener('keydown', keydown, true)
      window.removeEventListener('keyup', keyup, true)
      window.removeEventListener('blur', blur)
      document.removeEventListener('visibilitychange', visibility)
      held.clear()
    }
  }, [controlEnabled])
  useEffect(
    () => () => {
      if (!controlEnabledRef.current) return
      heldKeys.current.clear()
      publishInput(neutralManualControlInput())
      disable('Keyboard control disabled because the operator workspace was closed.')
    },
    [],
  )

  const ready = snapshot.connection === 'connected' && snapshot.vehicle.armed
  const active = isManualControlInputActive(snapshot.manualControl.input)
  return (
    <Panel>
      <SectionHeader
        eyebrow="MANUAL FLIGHT"
        title="Keyboard control"
        action={
          <span className={`manual-status ${snapshot.manualControl.status}`}>
            {statusLabel(snapshot.manualControl.status)}
          </span>
        }
      />
      <p className="actions-note">{snapshot.manualControl.message}</p>
      <dl className="manual-readiness">
        <div>
          <dt>Vehicle</dt>
          <dd>{snapshot.connection === 'connected' ? 'Connected' : 'Unavailable'}</dd>
        </div>
        <div>
          <dt>Arming</dt>
          <dd>{snapshot.vehicle.armed ? 'Armed' : 'Disarmed'}</dd>
        </div>
        <div>
          <dt>Input</dt>
          <dd>{active ? 'Active setpoint' : 'Neutral setpoint'}</dd>
        </div>
      </dl>
      <div className="manual-keyboard" aria-label="Keyboard flight mapping">
        <Key active={snapshot.manualControl.input.forward > 0} label="W" detail="Forward" />
        <Key active={snapshot.manualControl.input.forward < 0} label="S" detail="Back" />
        <Key active={snapshot.manualControl.input.right < 0} label="A" detail="Left" />
        <Key active={snapshot.manualControl.input.right > 0} label="D" detail="Right" />
        <Key active={snapshot.manualControl.input.up > 0} label="Up" detail="Up" />
        <Key active={snapshot.manualControl.input.up < 0} label="Down" detail="Down" />
        <Key active={snapshot.manualControl.input.yawRight < 0} label="Left" detail="Yaw left" />
        <Key active={snapshot.manualControl.input.yawRight > 0} label="Right" detail="Yaw right" />
      </div>
      <div className="manual-actions">
        {controlEnabled ? (
          <button className="table-danger" onClick={() => onDisable()} type="button">
            Disable Keyboard Control
          </button>
        ) : (
          <button className="action-button" disabled={!ready} onClick={onEnable} type="button">
            Enable Keyboard Control
          </button>
        )}
        <span>Escape disables control. Click into text fields to type normally.</span>
      </div>
    </Panel>
  )
}

const Key = ({ active, label, detail }: { active: boolean; label: string; detail: string }) => (
  <div className={`manual-key ${active ? 'active' : ''}`}>
    <kbd>{label}</kbd>
    <span>{detail}</span>
  </div>
)

const statusLabel = (status: GroundStationSnapshot['manualControl']['status']): string =>
  ({
    disabled: 'Disabled',
    prestreaming: 'Preparing',
    entering_offboard: 'Entering Offboard',
    enabled_neutral: 'Enabled neutral',
    active: 'Active',
    unavailable: 'Unavailable',
    failed: 'Failed',
  })[status]

const isEditableTarget = (target: EventTarget | null): boolean => {
  const element = target instanceof HTMLElement ? target : undefined
  return Boolean(element?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]'))
}
