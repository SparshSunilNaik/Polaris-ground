import type { ConnectionSettings as Settings } from '../../domain/connectionSettings'

export function ConnectionSettings({
  settings,
  issues,
  applying,
  onChange,
  onSave,
  onCancel,
  onRestoreDefaults,
  onApply,
}: {
  settings: Settings
  issues: Partial<Record<keyof Settings, string>>
  applying: boolean
  onChange: (settings: Settings) => void
  onSave: () => void
  onCancel: () => void
  onRestoreDefaults: () => void
  onApply: () => void
}) {
  return (
    <section className="panel connection-settings">
      <p className="eyebrow">Transport configuration</p>
      <h2>Connection Settings</h2>
      <p className="settings-copy">Changes are saved locally and applied by replacing the active provider.</p>
      <label>
        Provider
        <select
          value={settings.provider}
          onChange={(event) =>
            onChange({ ...settings, provider: event.target.value as Settings['provider'] })
          }
        >
          <option value="mock">Simulation</option>
          <option value="mavlink">MAVLink UDP</option>
        </select>
      </label>
      <label>
        Bind host
        <input
          aria-invalid={Boolean(issues.bindHost)}
          value={settings.bindHost}
          onChange={(event) => onChange({ ...settings, bindHost: event.target.value })}
        />
        {issues.bindHost && <small role="alert">{issues.bindHost}</small>}
      </label>
      <label>
        Bind UDP port
        <input
          aria-invalid={Boolean(issues.bindPort)}
          value={settings.bindPort}
          onChange={(event) => onChange({ ...settings, bindPort: event.target.value })}
        />
        {issues.bindPort && <small role="alert">{issues.bindPort}</small>}
      </label>
      <label>
        Remote host
        <input
          aria-invalid={Boolean(issues.remoteHost)}
          value={settings.remoteHost}
          onChange={(event) => onChange({ ...settings, remoteHost: event.target.value })}
        />
        {issues.remoteHost && <small role="alert">{issues.remoteHost}</small>}
      </label>
      <label>
        Remote UDP port
        <input
          aria-invalid={Boolean(issues.remotePort)}
          value={settings.remotePort}
          onChange={(event) => onChange({ ...settings, remotePort: event.target.value })}
        />
        {issues.remotePort && <small role="alert">{issues.remotePort}</small>}
      </label>
      <div className="settings-actions">
        <button className="action-button" onClick={onSave} type="button">
          Save
        </button>
        <button className="action-button" onClick={onCancel} type="button">
          Cancel edits
        </button>
        <button className="action-button" onClick={onRestoreDefaults} type="button">
          Restore Defaults
        </button>
        <button className="mission-open" disabled={applying} onClick={onApply} type="button">
          {applying ? 'Applying...' : 'Apply and reconnect'}
        </button>
      </div>
    </section>
  )
}
