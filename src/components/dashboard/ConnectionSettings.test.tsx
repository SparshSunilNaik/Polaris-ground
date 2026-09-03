import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ConnectionSettings } from './ConnectionSettings'

const settings = {
  provider: 'mavlink' as const,
  bindHost: '127.0.0.1',
  bindPort: '14540',
  remoteHost: '127.0.0.1',
  remotePort: '14580',
}

describe('ConnectionSettings', () => {
  it('exposes save, cancel, defaults, and explicit apply actions', () => {
    const onChange = vi.fn()
    const onSave = vi.fn()
    const onCancel = vi.fn()
    const onRestoreDefaults = vi.fn()
    const onApply = vi.fn()
    render(
      <ConnectionSettings
        applying={false}
        issues={{}}
        onApply={onApply}
        onCancel={onCancel}
        onChange={onChange}
        onRestoreDefaults={onRestoreDefaults}
        onSave={onSave}
        settings={settings}
      />,
    )

    fireEvent.change(screen.getByLabelText('Bind host'), { target: { value: '0.0.0.0' } })
    expect(onChange).toHaveBeenCalledWith({ ...settings, bindHost: '0.0.0.0' })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel edits' }))
    fireEvent.click(screen.getByRole('button', { name: 'Restore Defaults' }))
    fireEvent.click(screen.getByRole('button', { name: 'Apply and reconnect' }))
    expect(onSave).toHaveBeenCalledOnce()
    expect(onCancel).toHaveBeenCalledOnce()
    expect(onRestoreDefaults).toHaveBeenCalledOnce()
    expect(onApply).toHaveBeenCalledOnce()
  })

  it('disables apply while a replacement provider is being started', () => {
    render(
      <ConnectionSettings
        applying
        issues={{}}
        onApply={vi.fn()}
        onCancel={vi.fn()}
        onChange={vi.fn()}
        onRestoreDefaults={vi.fn()}
        onSave={vi.fn()}
        settings={settings}
      />,
    )
    expect(screen.getByRole('button', { name: 'Applying...' })).toBeDisabled()
  })
})
