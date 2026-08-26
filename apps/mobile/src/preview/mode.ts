export interface PreviewEnvironment {
  readonly development: boolean
  readonly platform: string
  readonly flag: string | undefined
}

/** Preview fixtures are available only in a development web bundle with an explicit opt-in. */
export function isHomesroloPreviewEnabled(environment: PreviewEnvironment): boolean {
  return environment.development
    && environment.platform === 'web'
    && environment.flag === '1'
}
