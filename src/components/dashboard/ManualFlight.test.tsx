import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MockVehicleProvider } from '../../providers/MockVehicleProvider'
import { ManualFlight } from './ManualFlight'

describe('ManualFlight keyboard safety', () => {
  afterEach(() => document.body.replaceChildren())

  it('tracks held keys, releases to neutral, and disables on focus loss', async () => {
    const provider = new MockVehicleProvider()
    await provider.connect()
    const snapshot = {
      ...provider.getSnapshot(),
      manualControl: {
        status: 'enabled_neutral' as const,
        input: { forward: 0, right: 0, up: 0, yawRight: 0 },
        message: 'Ready.',
      },
    }
    const onInput = vi.fn()
    const onDisable = vi.fn()
    render(<ManualFlight snapshot={snapshot} onEnable={vi.fn()} onDisable={onDisable} onInput={onInput} />)
    fireEvent.keyDown(window, { code: 'KeyW' })
    fireEvent.keyDown(window, { code: 'KeyA' })
    expect(onInput).toHaveBeenLastCalledWith({ forward: 1, right: -1, up: 0, yawRight: 0 })
    fireEvent.keyUp(window, { code: 'KeyW' })
    expect(onInput).toHaveBeenLastCalledWith({ forward: 0, right: -1, up: 0, yawRight: 0 })
    fireEvent.blur(window)
    expect(onInput).toHaveBeenLastCalledWith({ forward: 0, right: 0, up: 0, yawRight: 0 })
    expect(onDisable).toHaveBeenCalledWith('Keyboard control disabled because the application lost focus.')
    provider.dispose()
  })

  it('preserves held keys across callback rerenders and neutralizes when unmounted', async () => {
    const provider = new MockVehicleProvider()
    await provider.connect()
    const snapshot = {
      ...provider.getSnapshot(),
      manualControl: {
        status: 'enabled_neutral' as const,
        input: { forward: 0, right: 0, up: 0, yawRight: 0 },
        message: 'Ready.',
      },
    }
    const onInput = vi.fn()
    const onDisable = vi.fn()
    const view = render(
      <ManualFlight
        snapshot={snapshot}
        onEnable={vi.fn()}
        onDisable={(reason) => onDisable(reason)}
        onInput={(input) => onInput(input)}
      />,
    )
    fireEvent.keyDown(window, { code: 'KeyW' })
    view.rerender(
      <ManualFlight
        snapshot={{ ...snapshot, manualControl: { ...snapshot.manualControl, status: 'active' } }}
        onEnable={vi.fn()}
        onDisable={(reason) => onDisable(reason)}
        onInput={(input) => onInput(input)}
      />,
    )
    fireEvent.keyUp(window, { code: 'KeyW' })
    expect(onInput).toHaveBeenLastCalledWith({ forward: 0, right: 0, up: 0, yawRight: 0 })
    view.unmount()
    expect(onDisable).toHaveBeenLastCalledWith(
      'Keyboard control disabled because the operator workspace was closed.',
    )
    provider.dispose()
  })

  it('does not capture movement keys from editable targets', async () => {
    const provider = new MockVehicleProvider()
    await provider.connect()
    const snapshot = {
      ...provider.getSnapshot(),
      manualControl: {
        status: 'enabled_neutral' as const,
        input: { forward: 0, right: 0, up: 0, yawRight: 0 },
        message: 'Ready.',
      },
    }
    const onInput = vi.fn()
    render(
      <>
        <input aria-label="Draft input" />
        <ManualFlight snapshot={snapshot} onEnable={vi.fn()} onDisable={vi.fn()} onInput={onInput} />
      </>,
    )
    fireEvent.keyDown(screen.getByLabelText('Draft input'), { code: 'KeyW' })
    expect(onInput).not.toHaveBeenCalled()
    provider.dispose()
  })
})
