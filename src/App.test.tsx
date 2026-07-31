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
  it('renders the mission editor and requires confirmation before transfer actions', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Mission' }))
    expect(screen.getByText('Editable mission')).toBeVisible()
    expect(screen.getByText('Confirmed vehicle plan')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Upload mission' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Upload mission' }))
    expect(screen.getByRole('dialog')).toHaveTextContent(/Perimeter Survey.*3 items/i)
    expect(screen.getByRole('button', { name: 'Confirm Upload mission' })).toBeVisible()
  })
  it('edits local mission items without silently accepting incomplete coordinates', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Mission' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }))
    expect(screen.getByRole('button', { name: 'Remove item 4' })).toBeVisible()
    fireEvent.change(screen.getByLabelText('Item 1 latitude'), { target: { value: '' } })
    expect(screen.getByText(/takeoff: Latitude is outside the supported range/i)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Upload mission' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Remove item 4' }))
    expect(screen.queryByRole('button', { name: 'Remove item 4' })).not.toBeInTheDocument()
  })
  it('exposes live vehicle coordinates and copies them into a local item without transmission', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Mission' }))
    expect(screen.getByLabelText('Vehicle latitude')).toHaveValue('37.7749000')
    expect(screen.getByLabelText('Vehicle longitude')).toHaveValue('-122.4194000')
    fireEvent.click(screen.getByRole('button', { name: 'Use current vehicle position for item 2' }))
    expect(screen.getByLabelText('Item 2 latitude')).toHaveValue('37.7749000')
    expect(screen.getByLabelText('Item 2 longitude')).toHaveValue('-122.4194000')
    expect(screen.getByLabelText('Item 2 altitudeMeters')).toHaveValue('24')
  })
})
