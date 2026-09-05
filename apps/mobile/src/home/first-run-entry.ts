/** The existing homes picker must not strand a new person on the legacy add form. */
export function needsFirstRunOnboarding(input: {
  readonly homeCount: number
  readonly explicitAdd: boolean
  readonly hasProjectContext: boolean
  readonly hasHandoffContext: boolean
}): boolean {
  return input.homeCount === 0 && !input.explicitAdd
    && !input.hasProjectContext && !input.hasHandoffContext
}
