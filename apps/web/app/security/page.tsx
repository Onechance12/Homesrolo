import Link from 'next/link'
import { PageHeader } from '../../components/Prose.tsx'
import { publicPageMetadata } from '../../lib/public-metadata.ts'
import { HOMESROLO_TEXT_NUMBER_DISPLAY } from '../../lib/site.ts'

export const metadata = publicPageMetadata({
  title: 'Security',
  description: 'How Homesrolo separates public pages from private home records and protects signed-in home and photo-checkup access.',
  canonical: '/security/',
})

const CONTROLS = [
  {
    title: 'Passwordless sign-in',
    body: 'Homesrolo emails a short-lived six-digit code that you type into the same app. The web app receives an opaque Secure, HttpOnly session cookie—not your email-provider login or a token exposed to page code.',
  },
  {
    title: 'Exact-home authorization',
    body: 'Private reads and writes check the signed-in account against the exact home requested. A home, project, or photo identifier by itself is not permission.',
  },
  {
    title: 'Private photo delivery',
    body: 'Checkup photos are served through authenticated same-home routes. Storage locations and provider credentials are not returned to the browser.',
  },
  {
    title: 'Narrow file boundary',
    body: 'Private home files accept bounded PDF, JPEG, and PNG uploads. Seasonal checkups use their own image-only path, enforce count and size limits, and re-encode images before private storage.',
  },
] as const

export default function SecurityPage() {
  return (
    <>
      <section className="section section--drafting">
        <div className="shell">
          <PageHeader
            eyebrow="Security"
            title="The public site and the home record stay separate."
            lede="Homesrolo uses a static public website for guides and a separate authenticated application for homeowner data. The current controls are designed around the exact account, exact home, and narrow action being requested."
          />
        </div>
      </section>

      <section className="section section--sunken">
        <div className="shell">
          <div className="grid grid--2">
            {CONTROLS.map(control => (
              <article className="card" key={control.title}>
                <h2 className="card__title">{control.title}</h2>
                <p>{control.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <div className="grid grid--2" style={{ gap: '3rem', alignItems: 'start' }}>
            <div className="prose">
              <h2>Protect your sign-in code</h2>
              <p>Treat an emailed sign-in code like a password. Do not forward it, paste it into a support message, or share a signed-in device with someone who should not see the home record. Sign out when using a shared browser.</p>
              <p>If a code arrives that you did not request, do not use it.</p>
            </div>
            <div className="note">
              <strong>Report a security concern.</strong> Text <strong>{HOMESROLO_TEXT_NUMBER_DISPLAY}</strong> and begin with <strong>SECURITY</strong>. Describe the issue without sending a password, sign-in code, private photo, policy number, or full address in the first message.
            </div>
          </div>
          <p style={{ marginTop: '2.5rem' }}><Link className="btn btn--quiet" href="/privacy/">Read the privacy explanation</Link></p>
        </div>
      </section>
    </>
  )
}
