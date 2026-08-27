/** Async Rolo work may update UI or release the shared send guard only while
 * it still belongs to the mounted, current conversation generation. */
export function roloRequestCanCommit(
  requestVersion: number,
  currentVersion: number,
  mounted: boolean,
): boolean {
  return mounted && requestVersion === currentVersion
}
