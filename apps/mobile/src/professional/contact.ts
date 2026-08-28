export function publicPhoneUrl(phone: string): string | null {
  const normalized = phone.trim().replace(/[^+\d]/g, '')
  return /^\+?\d{7,15}$/.test(normalized) ? `tel:${normalized}` : null
}

export const PROFESSIONAL_PORTAL_URL = 'https://app.homesrolo.com/pro'

export function professionalInvitationNotice(): string {
  return [
    'Your company has a private Homesrolo invitation.',
    `Sign in to review it securely: ${PROFESSIONAL_PORTAL_URL}`,
    'This message does not include the home, address, work details, or files.',
  ].join('\n\n')
}

export function professionalSignupRequest(): string {
  return [
    'I use Homesrolo to organize work for my home.',
    `Please create your company profile at ${PROFESSIONAL_PORTAL_URL} so I can invite you to specific work and choose exactly what you can see.`,
    'This signup link does not share my home or create a project invitation.',
  ].join('\n\n')
}

export function professionalInvitationTextUrl(phone: string): string | null {
  const phoneUrl = publicPhoneUrl(phone)
  if (!phoneUrl) return null
  return `sms:${phoneUrl.slice('tel:'.length)}?&body=${encodeURIComponent(professionalInvitationNotice())}`
}

export function publicEmailUrl(email: string): string | null {
  const normalized = email.trim().toLocaleLowerCase('en-US')
  return normalized.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
    ? `mailto:${encodeURIComponent(normalized)}`
    : null
}
