import type { RoofingNeed } from './port/types.ts'
import { roofingIntent } from './roofing-intent.ts'

const HANDOFF_SHARE_REF = /^hshr_[A-Za-z0-9_-]{43}$/

export interface HomeownerEntryContext {
  readonly intent: RoofingNeed | null
  readonly handoff: string | null
}

/** Accept only an opaque share reference. No recipient or property data travels in this context. */
export function handoffShareRef(value: unknown): string | null {
  return typeof value === 'string' && HANDOFF_SHARE_REF.test(value) ? value : null
}

export function homeownerEntryContext(input: {
  readonly intent?: unknown
  readonly handoff?: unknown
}): HomeownerEntryContext {
  return {
    intent: roofingIntent(input.intent),
    handoff: handoffShareRef(input.handoff),
  }
}

/** Build an internal URL from validated, non-identifying entry context only. */
export function withHomeownerEntryContext(
  pathname: string,
  context: HomeownerEntryContext,
): string {
  const query = new URLSearchParams()
  if (context.intent) query.set('intent', context.intent)
  if (context.handoff) query.set('handoff', context.handoff)
  const encoded = query.toString()
  return encoded ? `${pathname}?${encoded}` : pathname
}

/** An exact file handoff takes the homeowner to that home's private documents page. */
export function homeownerEntryDestination(
  homeRef: string,
  context: HomeownerEntryContext,
): string {
  if (context.handoff) {
    return withHomeownerEntryContext(`/home/${homeRef}/documents`, {
      intent: null,
      handoff: context.handoff,
    })
  }
  if (context.intent) {
    return withHomeownerEntryContext(`/home/${homeRef}/projects`, context)
  }
  return `/home/${homeRef}`
}
