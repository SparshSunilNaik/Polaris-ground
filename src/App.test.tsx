import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockRejectedValue(new Error('browser')) }))
describe('App', () => {
  afterEach(() => vi.clearAllMocks())
  it('renders telemetry, timeline, and confirmation-gated vehicle actions', async () => {
    render(<App />)
    expect(await screen.findByText(/monitoring only/i)).toBeVisible()
    expect(screen.getByText('Battery')).toBeVisible()
    expect(screen.getByText('Recent activity')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Land' }))
    expect(screen.getByRole('dialog')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Confirm Land' })).toBeVisible()
  })
  it('navigates to a clean placeholder workspace', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Diagnostics' }))
    expect(screen.getByText('Diagnostics workspace')).toBeVisible()
  })
})
