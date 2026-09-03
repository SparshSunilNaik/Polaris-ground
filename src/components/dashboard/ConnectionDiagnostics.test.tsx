import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MockVehicleProvider } from '../../providers/MockVehicleProvider'
import { ConnectionDiagnostics } from './ConnectionDiagnostics'

describe('ConnectionDiagnostics', () => {
  it('reports available counters and copies the product-facing diagnostic summary', async () => {
    const provider = new MockVehicleProvider()
    await provider.connect()
    const snapshot = provider.getSnapshot()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    render(<ConnectionDiagnostics onReconnect={vi.fn()} snapshot={snapshot} />)

    expect(screen.getByText('Messages received')).toBeVisible()
    expect(screen.getByText('Transport errors')).toBeVisible()
    expect(screen.getByText('Listener liveness')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Copy Diagnostics' }))
    expect(await screen.findByText('Diagnostics copied.')).toBeVisible()
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('Polaris Ground diagnostics\nConnection: Connected\nProvider: mock'),
    )
    provider.dispose()
  })
})
