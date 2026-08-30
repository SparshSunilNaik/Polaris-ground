import { describe, expect, it } from 'vitest'
import {
  isManualControlInputActive,
  manualControlInputFromHeldKeys,
  neutralManualControlInput,
} from './manualControl'

describe('manual control input', () => {
  it('maps each operator direction independently', () => {
    expect(manualControlInputFromHeldKeys(new Set(['KeyW']))).toMatchObject({ forward: 1 })
    expect(manualControlInputFromHeldKeys(new Set(['KeyS']))).toMatchObject({ forward: -1 })
    expect(manualControlInputFromHeldKeys(new Set(['KeyA']))).toMatchObject({ right: -1 })
    expect(manualControlInputFromHeldKeys(new Set(['KeyD']))).toMatchObject({ right: 1 })
    expect(manualControlInputFromHeldKeys(new Set(['ArrowUp']))).toMatchObject({ up: 1 })
    expect(manualControlInputFromHeldKeys(new Set(['ArrowDown']))).toMatchObject({ up: -1 })
    expect(manualControlInputFromHeldKeys(new Set(['ArrowLeft']))).toMatchObject({ yawRight: -1 })
    expect(manualControlInputFromHeldKeys(new Set(['ArrowRight']))).toMatchObject({ yawRight: 1 })
  })

  it('combines meaningful inputs and neutralizes opposing axes', () => {
    expect(manualControlInputFromHeldKeys(new Set(['KeyW', 'KeyA', 'ArrowUp', 'ArrowLeft']))).toEqual({
      forward: 1,
      right: -1,
      up: 1,
      yawRight: -1,
    })
    expect(
      manualControlInputFromHeldKeys(
        new Set(['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']),
      ),
    ).toEqual(neutralManualControlInput())
    expect(isManualControlInputActive(neutralManualControlInput())).toBe(false)
  })
})
