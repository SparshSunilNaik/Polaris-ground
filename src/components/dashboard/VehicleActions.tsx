import { useState } from 'react'
import type { GroundStationSnapshot, VehicleAction } from '../../domain/models'
import { Panel } from '../ui/Panel'
import { SectionHeader } from '../ui/SectionHeader'

const actions: { action: VehicleAction; label: string; description: string; tone?: 'danger' }[] = [
  { action: 'arm', label: 'Arm', description: 'Enable vehicle motors.' },
  { action: 'disarm', label: 'Disarm', description: 'Disable vehicle motors.', tone: 'danger' },
  { action: 'takeoff', label: 'Take off', description: 'Command a 10 m takeoff.', tone: 'danger' },
  { action: 'land', label: 'Land', description: 'Command the vehicle to land.', tone: 'danger' },
  {
    action: 'returnToLaunch',
    label: 'Return to launch',
    description: 'Return the vehicle to its launch position.',
    tone: 'danger',
  },
]

export function VehicleActions({
  snapshot,
  onConfirm,
}: {
  snapshot: GroundStationSnapshot
  onConfirm: (action: VehicleAction) => void
}) {
  const [selected, setSelected] = useState<(typeof actions)[number]>()
  const connected = snapshot.connection === 'connected'
  const pending = (action: VehicleAction) =>
    snapshot.commands.some((command) => command.action === action && command.status === 'pending')
  return (
    <Panel>
      <SectionHeader eyebrow="VEHICLE ACTIONS" title="Confirmed controls" />
      <p className="actions-note">
        Each action requires confirmation and reports an explicit vehicle outcome.
      </p>
      <div className="action-grid">
        {actions.map((item) => (
          <button
            className={`action-button ${item.tone ?? ''}`}
            disabled={!connected || pending(item.action)}
            key={item.action}
            onClick={() => setSelected(item)}
            type="button"
          >
            {pending(item.action) ? `${item.label}: pending` : item.label}
          </button>
        ))}
      </div>
      {selected && (
        <div
          aria-labelledby="command-confirmation-title"
          aria-modal="true"
          className="confirmation-backdrop"
          role="dialog"
        >
          <div className="confirmation-dialog">
            <p className="eyebrow">CONFIRM VEHICLE ACTION</p>
            <h2 id="command-confirmation-title">{selected.label}?</h2>
            <p>{selected.description} This command is sent once and cannot be cancelled by Polaris Ground.</p>
            <div className="confirmation-actions">
              <button onClick={() => setSelected(undefined)} type="button">
                Cancel
              </button>
              <button
                className="confirm-action"
                onClick={() => {
                  onConfirm(selected.action)
                  setSelected(undefined)
                }}
                type="button"
              >
                Confirm {selected.label}
              </button>
            </div>
          </div>
        </div>
      )}
    </Panel>
  )
}
