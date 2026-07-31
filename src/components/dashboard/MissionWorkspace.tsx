import { useState } from 'react'
import type {
  GroundStationSnapshot,
  MissionItemType,
  MissionPlan,
  MissionValidationResult,
} from '../../domain/models'
import { Panel } from '../ui/Panel'
import { ProgressBar } from '../ui/ProgressBar'
import { SectionHeader } from '../ui/SectionHeader'

type DraftItem = Omit<
  MissionPlan['items'][number],
  'latitude' | 'longitude' | 'altitudeMeters' | 'holdTimeSeconds' | 'acceptanceRadiusMeters'
> & {
  latitude: string
  longitude: string
  altitudeMeters: string
  holdTimeSeconds: string
  acceptanceRadiusMeters: string
}
type Draft = { id: string; name: string; items: DraftItem[] }
type Confirmation = 'upload' | 'download' | 'clear'
const itemTypes: MissionItemType[] = ['takeoff', 'waypoint', 'land', 'return-to-launch']

export function MissionWorkspace({
  snapshot,
  validate,
  onUpload,
  onDownload,
  onClear,
}: {
  snapshot: GroundStationSnapshot
  validate: (plan: MissionPlan) => MissionValidationResult
  onUpload: (plan: MissionPlan) => Promise<void>
  onDownload: () => Promise<void>
  onClear: () => Promise<void>
}) {
  const [draft, setDraft] = useState<Draft>(() => draftFromPlan(snapshot.mission.activePlan ?? emptyPlan()))
  const [confirmation, setConfirmation] = useState<Confirmation>()
  const plan = toPlan(draft)
  const validation = validate(plan)
  const transferActive = Boolean(snapshot.mission.activeTransfer)
  const connected = snapshot.connection === 'connected'
  const position = availablePosition(snapshot)
  const updateItem = (id: string, change: Partial<DraftItem>) =>
    setDraft((current) => ({
      ...current,
      items: current.items.map((item) => (item.id === id ? { ...item, ...change } : item)),
    }))
  const moveItem = (index: number, direction: -1 | 1) =>
    setDraft((current) => {
      const target = index + direction
      if (target < 0 || target >= current.items.length) return current
      const items = [...current.items]
      ;[items[index], items[target]] = [items[target], items[index]]
      return { ...current, items }
    })
  const run = async () => {
    if (!confirmation) return
    const action = confirmation
    setConfirmation(undefined)
    if (action === 'upload') await onUpload(plan)
    if (action === 'download') await onDownload()
    if (action === 'clear') await onClear()
  }
  return (
    <div className="mission-workspace">
      <section className="mission-heading">
        <div>
          <p className="eyebrow">MISSION MANAGEMENT</p>
          <h1>Plans, transfer, and verification</h1>
        </div>
        <div className={`mission-transfer ${snapshot.mission.activeTransfer ? 'active' : ''}`}>
          <strong>{transferText(snapshot)}</strong>
          <span>{snapshot.mission.mostRecentTransfer?.message ?? 'No transfer has been requested.'}</span>
        </div>
      </section>
      <section aria-labelledby="vehicle-position-title" className="vehicle-position">
        <h2 id="vehicle-position-title">Vehicle Position</h2>
        <dl>
          <div>
            <dt>Latitude</dt>
            <dd>
              <input
                aria-label="Vehicle latitude"
                readOnly
                value={position?.latitude.toFixed(7) ?? 'Unavailable'}
              />
            </dd>
          </div>
          <div>
            <dt>Longitude</dt>
            <dd>
              <input
                aria-label="Vehicle longitude"
                readOnly
                value={position?.longitude.toFixed(7) ?? 'Unavailable'}
              />
            </dd>
          </div>
        </dl>
      </section>
      <section className="mission-layout">
        <Panel>
          <SectionHeader
            eyebrow="LOCAL DRAFT"
            title="Editable mission"
            action={<span className="draft-badge">Not vehicle-confirmed</span>}
          />
          <label className="mission-name">
            Mission name
            <input
              aria-label="Mission name"
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </label>
          <div className="mission-table-wrap">
            <table className="mission-table">
              <thead>
                <tr>
                  <th>Seq</th>
                  <th>Type</th>
                  <th>Latitude</th>
                  <th>Longitude</th>
                  <th>Altitude m</th>
                  <th>Hold s</th>
                  <th>Radius m</th>
                  <th>Order</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {draft.items.map((item, index) => (
                  <tr key={item.id}>
                    <td>{index + 1}</td>
                    <td>
                      <select
                        aria-label={`Item ${index + 1} type`}
                        value={item.type}
                        onChange={(event) =>
                          updateItem(item.id, { type: event.target.value as MissionItemType })
                        }
                      >
                        {itemTypes.map((type) => (
                          <option key={type} value={type}>
                            {labelFor(type)}
                          </option>
                        ))}
                      </select>
                    </td>
                    {(
                      [
                        'latitude',
                        'longitude',
                        'altitudeMeters',
                        'holdTimeSeconds',
                        'acceptanceRadiusMeters',
                      ] as const
                    ).map((field) => (
                      <td key={field}>
                        <input
                          aria-label={`Item ${index + 1} ${field}`}
                          inputMode="decimal"
                          value={item[field]}
                          onChange={(event) => updateItem(item.id, { [field]: event.target.value })}
                        />
                      </td>
                    ))}
                    <td>
                      <button
                        aria-label={`Use current vehicle position for item ${index + 1}`}
                        disabled={!position}
                        onClick={() =>
                          position &&
                          updateItem(item.id, {
                            latitude: position.latitude.toFixed(7),
                            longitude: position.longitude.toFixed(7),
                          })
                        }
                        type="button"
                      >
                        Use position
                      </button>
                    </td>
                    <td className="order-controls">
                      <button
                        aria-label={`Move item ${index + 1} up`}
                        disabled={index === 0}
                        onClick={() => moveItem(index, -1)}
                        type="button"
                      >
                        Up
                      </button>
                      <button
                        aria-label={`Move item ${index + 1} down`}
                        disabled={index === draft.items.length - 1}
                        onClick={() => moveItem(index, 1)}
                        type="button"
                      >
                        Down
                      </button>
                    </td>
                    <td>
                      <button
                        aria-label={`Remove item ${index + 1}`}
                        className="table-danger"
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            items: current.items.filter((entry) => entry.id !== item.id),
                          }))
                        }
                        type="button"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mission-editor-actions">
            <button
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  items: [...current.items, newDraftItem(current.items.length)],
                }))
              }
              type="button"
            >
              Add item
            </button>
            <span>Altitude reference: relative to home</span>
          </div>
          <Validation result={validation} />
          <div className="mission-actions">
            <button disabled={transferActive} onClick={() => undefined} type="button">
              Validate
            </button>
            <button
              className="confirm-action"
              disabled={!connected || transferActive || !validation.valid}
              onClick={() => setConfirmation('upload')}
              type="button"
            >
              Upload mission
            </button>
            <button
              disabled={!connected || transferActive}
              onClick={() => setConfirmation('download')}
              type="button"
            >
              Download from vehicle
            </button>
            <button
              className="table-danger"
              disabled={!connected || transferActive}
              onClick={() => setConfirmation('clear')}
              type="button"
            >
              Clear vehicle mission
            </button>
          </div>
        </Panel>
        <div className="mission-side">
          <Panel>
            <SectionHeader eyebrow="VEHICLE PLAN" title="Confirmed vehicle plan" />
            <VehiclePlan plan={snapshot.mission.vehiclePlan} local={plan} />
          </Panel>
          <Panel>
            <SectionHeader
              eyebrow="MISSION MONITORING"
              title={`${snapshot.mission.currentWaypoint} of ${snapshot.mission.totalWaypoints}`}
            />
            <ProgressBar value={snapshot.mission.progressPercent} label="Vehicle mission progress" />
          </Panel>
        </div>
      </section>
      {confirmation && (
        <ConfirmationDialog
          action={confirmation}
          plan={plan}
          onCancel={() => setConfirmation(undefined)}
          onConfirm={() => void run()}
        />
      )}
    </div>
  )
}

function Validation({ result }: { result: MissionValidationResult }) {
  return (
    <div className={`mission-validation ${result.valid ? 'valid' : 'invalid'}`} role="status">
      {result.valid
        ? 'Mission validation passed.'
        : result.issues.map((issue) => (
            <p key={`${issue.code}-${issue.itemId ?? ''}`}>
              {issue.itemId ? `${issue.itemId}: ` : ''}
              {issue.message}
            </p>
          ))}
    </div>
  )
}
function VehiclePlan({ plan, local }: { plan?: MissionPlan; local: MissionPlan }) {
  if (!plan)
    return <p className="mission-muted">No vehicle-confirmed mission has been downloaded or acknowledged.</p>
  const differs =
    plan.items.length !== local.items.length ||
    plan.items.some((item, index) => {
      const localItem = local.items[index]
      return (
        !localItem ||
        item.type !== localItem.type ||
        item.latitude !== localItem.latitude ||
        item.longitude !== localItem.longitude ||
        item.altitudeMeters !== localItem.altitudeMeters
      )
    })
  return (
    <>
      <p className="mission-muted">
        Read-only.{' '}
        {differs
          ? 'Differs from local draft.'
          : 'Same structure as local draft; upload acknowledgement is not readback verification.'}
      </p>
      <ol className="vehicle-plan-list">
        {plan.items.map((item, index) => (
          <li key={item.id}>
            {index + 1}. {labelFor(item.type)} · {item.latitude.toFixed(5)}, {item.longitude.toFixed(5)} ·{' '}
            {item.altitudeMeters.toFixed(1)} m
          </li>
        ))}
      </ol>
    </>
  )
}
function ConfirmationDialog({
  action,
  plan,
  onCancel,
  onConfirm,
}: {
  action: Confirmation
  plan: MissionPlan
  onCancel: () => void
  onConfirm: () => void
}) {
  const copy =
    action === 'upload'
      ? `Upload “${plan.name || 'Unnamed mission'}” with ${plan.items.length} items to the vehicle?`
      : action === 'download'
        ? 'Download the vehicle mission into the read-only vehicle plan. The local draft will not be changed.'
        : 'Clear the vehicle mission. This destructive action does not erase the local draft.'
  return (
    <div
      aria-labelledby="mission-confirmation-title"
      aria-modal="true"
      className="confirmation-backdrop"
      role="dialog"
    >
      <div className="confirmation-dialog">
        <p className="eyebrow">CONFIRM MISSION ACTION</p>
        <h2 id="mission-confirmation-title">
          {action === 'clear' ? 'Clear vehicle mission?' : `${labelForAction(action)}?`}
        </h2>
        <p>{copy}</p>
        <div className="confirmation-actions">
          <button autoFocus onClick={onCancel} type="button">
            Cancel
          </button>
          <button className="confirm-action" onClick={onConfirm} type="button">
            Confirm {labelForAction(action)}
          </button>
        </div>
      </div>
    </div>
  )
}
const draftFromPlan = (plan: MissionPlan): Draft => ({
  id: plan.id,
  name: plan.name,
  items: plan.items.map((item) => ({
    ...item,
    latitude: String(item.latitude),
    longitude: String(item.longitude),
    altitudeMeters: String(item.altitudeMeters),
    holdTimeSeconds: String(item.holdTimeSeconds ?? 0),
    acceptanceRadiusMeters: String(item.acceptanceRadiusMeters ?? 0),
  })),
})
const toPlan = (draft: Draft): MissionPlan => ({
  ...draft,
  items: draft.items.map((item) => ({
    ...item,
    latitude: parseNumeric(item.latitude),
    longitude: parseNumeric(item.longitude),
    altitudeMeters: parseNumeric(item.altitudeMeters),
    holdTimeSeconds: parseNumeric(item.holdTimeSeconds),
    acceptanceRadiusMeters: parseNumeric(item.acceptanceRadiusMeters),
  })),
})
const parseNumeric = (value: string): number => (value.trim() === '' ? Number.NaN : Number(value))
const emptyPlan = (): MissionPlan => ({ id: 'local-mission', name: 'Untitled mission', items: [] })
const newDraftItem = (index: number): DraftItem => ({
  id: `local-item-${Date.now()}-${index}`,
  type: 'waypoint',
  latitude: '',
  longitude: '',
  altitudeMeters: '',
  altitudeReference: 'relative-to-home',
  holdTimeSeconds: '0',
  acceptanceRadiusMeters: '0',
})
const labelFor = (type: MissionItemType): string =>
  ({ takeoff: 'Takeoff', waypoint: 'Waypoint', land: 'Land', 'return-to-launch': 'Return to launch' })[type]
const labelForAction = (action: Confirmation): string =>
  ({ upload: 'Upload mission', download: 'Download mission', clear: 'Clear mission' })[action]
const transferText = (snapshot: GroundStationSnapshot): string => {
  const transfer = snapshot.mission.activeTransfer
  if (!transfer)
    return snapshot.mission.mostRecentTransfer?.status === 'succeeded'
      ? 'Latest transfer accepted'
      : 'No active transfer'
  return {
    upload: 'Preparing mission upload',
    download: 'Downloading vehicle mission',
    clear: 'Clearing vehicle mission',
  }[transfer.type]
}
const availablePosition = (
  snapshot: GroundStationSnapshot,
): { latitude: number; longitude: number } | undefined => {
  const { latitude, longitude } = snapshot.telemetry.position
  return Number.isFinite(latitude) && Number.isFinite(longitude) && (latitude !== 0 || longitude !== 0)
    ? { latitude, longitude }
    : undefined
}
