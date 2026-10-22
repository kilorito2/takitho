import { create } from 'zustand'

const MUTE_KEY = 'takitho-kitchen-muted'

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

let context: AudioContext | undefined

function audio(): AudioContext | undefined {
  if (context) return context
  if (typeof AudioContext === 'undefined') return undefined
  context = new AudioContext()
  return context
}

/** A two-tone service bell, synthesised (no asset to download or cache): a bright ding and a lower dong, twice. */
function playBell(ctx: AudioContext): void {
  const start = ctx.currentTime + 0.02
  const note = (freq: number, at: number, length: number) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.0001, start + at)
    gain.gain.exponentialRampToValueAtTime(0.35, start + at + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + at + length)
    osc.connect(gain).connect(ctx.destination)
    osc.start(start + at)
    osc.stop(start + at + length + 0.05)
  }
  for (const offset of [0, 0.9]) {
    note(1318.5, offset, 0.55)
    note(987.8, offset + 0.28, 0.6)
  }
}

interface SoundState {
  muted: boolean
  /** The browser lets us play (a click happened and the context is running). */
  unlocked: boolean
  toggleMute: () => void
  /** Call from a user gesture. Resolves to whether sound is now available. */
  unlock: () => Promise<boolean>
  ring: () => void
}

export const useSound = create<SoundState>()((set, get) => ({
  muted: readMuted(),
  unlocked: false,
  toggleMute: () => {
    const muted = !get().muted
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
    } catch {
      // Private mode: the choice just does not survive a reload.
    }
    set({ muted })
  },
  unlock: async () => {
    const ctx = audio()
    if (!ctx) return false
    try {
      await ctx.resume()
    } catch {
      return false
    }
    const unlocked = ctx.state === 'running'
    set({ unlocked })
    return unlocked
  },
  ring: () => {
    const ctx = audio()
    if (get().muted || ctx?.state !== 'running') return
    playBell(ctx)
  },
}))
