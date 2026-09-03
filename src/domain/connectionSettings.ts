export type VehicleProviderKind = 'mock' | 'mavlink'

export interface ConnectionSettings {
  provider: VehicleProviderKind
  bindHost: string
  bindPort: string
  remoteHost: string
  remotePort: string
}

export interface ConnectionSettingsValidation {
  valid: boolean
  issues: Partial<Record<keyof ConnectionSettings, string>>
}

export const connectionSettingsStorageKey = 'polaris-ground.connection-settings.v1'

export const defaultConnectionSettings = (): ConnectionSettings => ({
  provider: import.meta.env.VITE_VEHICLE_PROVIDER === 'mavlink' ? 'mavlink' : 'mock',
  bindHost: '127.0.0.1',
  bindPort: '14540',
  remoteHost: '127.0.0.1',
  remotePort: '14580',
})

export const validateConnectionSettings = (settings: ConnectionSettings): ConnectionSettingsValidation => {
  const issues: ConnectionSettingsValidation['issues'] = {}
  if (!isHost(settings.bindHost)) issues.bindHost = 'Enter a valid host or IP address.'
  if (!isPort(settings.bindPort)) issues.bindPort = 'Enter a UDP port from 1 to 65535.'
  if (!isHost(settings.remoteHost)) issues.remoteHost = 'Enter a valid host or IP address.'
  if (!isPort(settings.remotePort)) issues.remotePort = 'Enter a UDP port from 1 to 65535.'
  return { valid: Object.keys(issues).length === 0, issues }
}

export const loadConnectionSettings = (): ConnectionSettings => {
  const defaults = defaultConnectionSettings()
  if (typeof localStorage === 'undefined') return defaults
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(connectionSettingsStorageKey) ?? 'null')
    if (!isConnectionSettings(stored) || !validateConnectionSettings(stored).valid) return defaults
    return stored
  } catch {
    return defaults
  }
}

export const saveConnectionSettings = (settings: ConnectionSettings): void => {
  if (typeof localStorage !== 'undefined')
    localStorage.setItem(connectionSettingsStorageKey, JSON.stringify(settings))
}

const isConnectionSettings = (value: unknown): value is ConnectionSettings => {
  if (!value || typeof value !== 'object') return false
  const settings = value as Record<string, unknown>
  return (
    (settings.provider === 'mock' || settings.provider === 'mavlink') &&
    typeof settings.bindHost === 'string' &&
    typeof settings.bindPort === 'string' &&
    typeof settings.remoteHost === 'string' &&
    typeof settings.remotePort === 'string'
  )
}

export const endpointFor = (host: string, port: string): string => `${host.trim()}:${port.trim()}`
const isHost = (value: string): boolean => /^[a-zA-Z0-9.-]+$/.test(value.trim()) && !value.includes('..')
const isPort = (value: string): boolean => {
  if (!/^\d{1,5}$/.test(value.trim())) return false
  const port = Number(value)
  return port >= 1 && port <= 65535
}
