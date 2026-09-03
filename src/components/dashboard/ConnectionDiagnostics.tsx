import { useState } from 'react'
import type { ConnectionDiagnostics as Diagnostics, GroundStationSnapshot } from '../../domain/models'

const connectionLabel = (state: GroundStationSnapshot['connection']) =>
  ({
    disconnected: 'Disconnected',
    connecting: 'Connecting',
    connected: 'Connected',
    degraded: 'Telemetry degraded',
    reconnecting: 'Reconnecting',
    error: 'Connection error',
  })[state]

export function ConnectionDiagnostics({
  snapshot,
  onReconnect,
}: {
  snapshot: GroundStationSnapshot
  onReconnect: () => void
}) {
  const diagnostics = snapshot.diagnostics
  const [copyStatus, setCopyStatus] = useState<string>()
  const copyDiagnostics = async () => {
    const text = diagnosticsText(snapshot, diagnostics)
    try {
      if (navigator.clipboard) await navigator.clipboard.writeText(text)
      else copyWithTextarea(text)
      setCopyStatus('Diagnostics copied.')
    } catch {
      try {
        copyWithTextarea(text)
        setCopyStatus('Diagnostics copied.')
      } catch {
        setCopyStatus('Could not copy diagnostics.')
      }
    }
  }
  return (
    <section className="panel diagnostics-panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Transport health</p>
          <h2>Diagnostics</h2>
        </div>
        <div className="diagnostics-actions">
          <button className="mission-open" onClick={() => void copyDiagnostics()} type="button">
            Copy Diagnostics
          </button>
          <button className="mission-open" onClick={onReconnect} type="button">
            Reconnect
          </button>
        </div>
      </div>
      <dl className="summary-list">
        <div>
          <dt>Connection</dt>
          <dd>{connectionLabel(snapshot.connection)}</dd>
        </div>
        <div>
          <dt>Provider</dt>
          <dd>{diagnostics?.provider === 'mavlink' ? 'MAVLink UDP' : 'Simulation'}</dd>
        </div>
        <div>
          <dt>Listener</dt>
          <dd>{diagnostics?.listenerState ?? 'Unknown'}</dd>
        </div>
        {diagnostics?.bindAddress && (
          <div>
            <dt>Bind address</dt>
            <dd>{diagnostics.bindAddress}</dd>
          </div>
        )}
        {diagnostics?.remoteAddress && (
          <div>
            <dt>Vehicle address</dt>
            <dd>{diagnostics.remoteAddress}</dd>
          </div>
        )}
        <div>
          <dt>Reconnect attempts</dt>
          <dd>{diagnostics?.reconnectAttempts ?? 0}</dd>
        </div>
        <div>
          <dt>Messages received</dt>
          <dd>{diagnostics?.receivedMessageCount ?? 0}</dd>
        </div>
        <div>
          <dt>Transport errors</dt>
          <dd>{diagnostics?.transportErrorCount ?? 0}</dd>
        </div>
        <div>
          <dt>Listener liveness</dt>
          <dd>{diagnostics?.listenerState === 'listening' ? 'Listening' : 'Not listening'}</dd>
        </div>
        <div>
          <dt>Telemetry freshness</dt>
          <dd>{freshnessLabel(diagnostics?.lastMessageAt)}</dd>
        </div>
        <div>
          <dt>Last heartbeat</dt>
          <dd>{formatTime(diagnostics?.lastHeartbeatAt)}</dd>
        </div>
        <div>
          <dt>Link</dt>
          <dd>
            {snapshot.connection === 'degraded'
              ? 'Telemetry stale'
              : `${snapshot.telemetry.link.latencyMs} ms latency`}
          </dd>
        </div>
      </dl>
      {diagnostics?.lastError && <p className="diagnostic-error">{diagnostics.lastError}</p>}
      {copyStatus && (
        <p aria-live="polite" className="settings-copy">
          {copyStatus}
        </p>
      )}
    </section>
  )
}

const freshnessLabel = (timestamp?: number): string => {
  if (!timestamp) return 'No telemetry received'
  const ageSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  return ageSeconds < 3 ? `Current (${ageSeconds}s ago)` : `Stale (${ageSeconds}s ago)`
}

const formatTime = (timestamp?: number): string =>
  timestamp ? new Date(timestamp).toLocaleTimeString() : 'No heartbeat received'

const copyWithTextarea = (text: string): void => {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.append(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  textarea.remove()
  if (!copied) throw new Error('Clipboard fallback failed')
}

const diagnosticsText = (snapshot: GroundStationSnapshot, diagnostics: Diagnostics | undefined): string =>
  [
    'Polaris Ground diagnostics',
    `Connection: ${connectionLabel(snapshot.connection)}`,
    `Provider: ${diagnostics?.provider ?? 'unknown'}`,
    `Listener: ${diagnostics?.listenerState ?? 'unknown'}`,
    `Bind address: ${diagnostics?.bindAddress ?? 'n/a'}`,
    `Vehicle address: ${diagnostics?.remoteAddress ?? 'n/a'}`,
    `Messages received: ${diagnostics?.receivedMessageCount ?? 0}`,
    `Transport errors: ${diagnostics?.transportErrorCount ?? 0}`,
    `Reconnect attempts: ${diagnostics?.reconnectAttempts ?? 0}`,
    `Last message: ${diagnostics?.lastMessageAt ? new Date(diagnostics.lastMessageAt).toISOString() : 'n/a'}`,
    `Last heartbeat: ${diagnostics?.lastHeartbeatAt ? new Date(diagnostics.lastHeartbeatAt).toISOString() : 'n/a'}`,
    `Last error: ${diagnostics?.lastError ?? 'none'}`,
  ].join('\n')
