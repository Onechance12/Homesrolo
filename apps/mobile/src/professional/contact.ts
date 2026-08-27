export function publicPhoneUrl(phone: string): string | null {
  const normalized = phone.trim().replace(/[^+\d]/g, '')
  return /^\+?\d{7,15}$/.test(normalized) ? `tel:${normalized}` : null
}

export function publicEmailUrl(email: string): string | null {
  const normalized = email.trim().toLocaleLowerCase('en-US')
  return normalized.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
    ? `mailto:${encodeURIComponent(normalized)}`
    : null
}
