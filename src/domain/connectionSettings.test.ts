import { beforeEach, describe, expect, it } from 'vitest'
import {
  connectionSettingsStorageKey,
  loadConnectionSettings,
  saveConnectionSettings,
  validateConnectionSettings,
} from './connectionSettings'

describe('connection settings', () => {
  beforeEach(() => {
    const values = new Map<string, string>()
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        clear: () => values.clear(),
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    })
  })

  it('validates UDP endpoint addresses', () => {
    expect(
      validateConnectionSettings({
        provider: 'mavlink',
        bindHost: '127.0.0.1',
        bindPort: '14540',
        remoteHost: '127.0.0.1',
        remotePort: '14580',
      }).valid,
    ).toBe(true)
    expect(
      validateConnectionSettings({
        provider: 'mavlink',
        bindHost: 'bad address',
        bindPort: 'bad',
        remoteHost: 'host',
        remotePort: '70000',
      }),
    ).toMatchObject({
      valid: false,
      issues: { bindHost: expect.any(String), bindPort: expect.any(String), remotePort: expect.any(String) },
    })
  })

  it('persists only valid settings and falls back for malformed stored data', () => {
    const settings = {
      provider: 'mavlink' as const,
      bindHost: '127.0.0.1',
      bindPort: '14540',
      remoteHost: '127.0.0.1',
      remotePort: '14580',
    }
    saveConnectionSettings(settings)
    expect(loadConnectionSettings()).toEqual(settings)
    localStorage.setItem(connectionSettingsStorageKey, '{bad json')
    expect(loadConnectionSettings().provider).toBeDefined()
  })
})
