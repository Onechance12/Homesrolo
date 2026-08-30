const PROJECT_REF = 'hprj_[A-Za-z0-9_-]{43}'
const PROJECT_ROUTE = new RegExp(`/(?:projects|work)/(${PROJECT_REF})(?:/|$)`)

/** Keep Rolo tied to the work record across both legacy and current routes. */
export function projectRefFromPath(pathname: string): string | undefined {
  return pathname.match(PROJECT_ROUTE)?.[1]
}
