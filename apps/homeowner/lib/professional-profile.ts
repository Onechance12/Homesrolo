/** Service areas are entered one per line; commas belong to the area name. */
export function cleanServiceAreas(value: string): readonly string[] {
  const seen = new Set<string>()
  return value.split(/[\r\n]+/).map(item => item.trim()).filter(item => {
    const key = item.toLocaleLowerCase('en-US')
    if (item.length < 2 || seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, 40)
}
