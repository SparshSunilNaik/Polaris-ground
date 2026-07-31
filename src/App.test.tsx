import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockRejectedValue(new Error('browser')) }))
describe('App', () => {
  afterEach(() => vi.clearAllMocks())
  it('renders telemetry, timeline and its monitoring-only constraint', async () => {
    render(<App />)
    expect(await screen.findByText(/monitoring only/i)).toBeVisible()
    expect(screen.getByText('Battery')).toBeVisible()
    expect(screen.getByText('Recent activity')).toBeVisible()
    expect(screen.queryByText(/takeoff|land|rtl|kill/i)).not.toBeInTheDocument()
  })
  it('navigates to a clean placeholder workspace', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Diagnostics' }))
    expect(screen.getByText('Diagnostics workspace')).toBeVisible()
  })
})
