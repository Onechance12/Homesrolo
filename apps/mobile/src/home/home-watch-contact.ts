export const HOME_WATCH_TEXT_NUMBER_E164 = '+18178862418'
export const HOME_WATCH_TEXT_NUMBER_DISPLAY = '(817) 886-2418'

function cleanLocation(location: string): string {
  return location
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

export function managedExteriorHomeWatchMessage(location = ''): string {
  const clean = cleanLocation(location)
  const availability = clean ? ` for ${clean}` : ' for my city and ZIP'
  return `HOME WATCH - Please check managed exterior Home Watch availability${availability}. I am interested in a documented exterior check covering the roof (Roof Watch), gutters, siding, windows and exterior drainage.`
}

export function managedExteriorHomeWatchSmsUrl(location = ''): string {
  return `sms:${HOME_WATCH_TEXT_NUMBER_E164}?&body=${encodeURIComponent(managedExteriorHomeWatchMessage(location))}`
}
