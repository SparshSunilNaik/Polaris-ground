import type { ManualControlInput } from './models'

export const neutralManualControlInput = (): ManualControlInput => ({
  forward: 0,
  right: 0,
  up: 0,
  yawRight: 0,
})

export const isManualControlInputActive = (input: ManualControlInput): boolean =>
  input.forward !== 0 || input.right !== 0 || input.up !== 0 || input.yawRight !== 0

export const manualControlInputFromHeldKeys = (heldKeys: ReadonlySet<string>): ManualControlInput => ({
  forward: axis(heldKeys, 'KeyW', 'KeyS'),
  right: axis(heldKeys, 'KeyD', 'KeyA'),
  up: axis(heldKeys, 'ArrowUp', 'ArrowDown'),
  yawRight: axis(heldKeys, 'ArrowRight', 'ArrowLeft'),
})

export const isManualControlKey = (key: string): boolean =>
  ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)

const axis = (heldKeys: ReadonlySet<string>, positiveKey: string, negativeKey: string): number =>
  Number(heldKeys.has(positiveKey)) - Number(heldKeys.has(negativeKey))
