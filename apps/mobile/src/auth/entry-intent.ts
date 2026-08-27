export const PUBLIC_ROOFING_INTENTS = [
  'repair',
  'replacement',
  'inspection',
  'storm_damage',
  'not_sure',
] as const

export type PublicRoofingIntent = typeof PUBLIC_ROOFING_INTENTS[number]

const PROMPTS: Readonly<Record<PublicRoofingIntent, string>> = Object.freeze({
  repair: 'I need help with a roof repair. Help me describe what I see and decide the safest next step.',
  replacement: 'I am considering replacing my roof. Help me organize what I know and what contractors should explain.',
  inspection: 'I want to do a Roof Watch checkup. Help me record what I can safely observe and what deserves a professional look.',
  storm_damage: 'My roof may have storm damage. Help me document what I can safely see and organize questions for a qualified roofer. Do not make insurance decisions.',
  not_sure: 'I need help with my roof, but I am not sure whether it needs maintenance, repair, inspection, or replacement.',
})

/** Public links may choose a starting conversation, never a home or authority. */
export function publicRoofingIntent(value: unknown): PublicRoofingIntent | null {
  return typeof value === 'string' && (PUBLIC_ROOFING_INTENTS as readonly string[]).includes(value)
    ? value as PublicRoofingIntent
    : null
}

export function publicRoofingPrompt(intent: PublicRoofingIntent): string {
  return PROMPTS[intent]
}
