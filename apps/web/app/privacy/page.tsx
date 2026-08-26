import Link from 'next/link'
import { PageHeader } from '../../components/Prose.tsx'
import { publicPageMetadata } from '../../lib/public-metadata.ts'
import { HOMESROLO_TEXT_NUMBER_DISPLAY } from '../../lib/site.ts'

export const metadata = publicPageMetadata({
  title: 'Privacy',
  description: 'What Homesrolo collects on the public site and in a homeowner account, what stays private, and how photo checkups are handled.',
  canonical: '/privacy/',
})

const LAST_UPDATED = 'August 26, 2026'

export default function PrivacyPage() {
  return (
    <>
      <section className="section section--drafting">
        <div className="shell">
          <PageHeader
            eyebrow="Privacy"
            title="Your home record is not public content."
            lede="Homesrolo separates its public homeowner guides from the signed-in home workspace. Opening a home or project does not publish it, create a public profile, or send it to a contractor."
          />
          <p className="provenance" style={{ marginTop: '1.5rem' }}>Last updated {LAST_UPDATED}</p>
        </div>
      </section>

      <section className="section section--sunken">
        <div className="shell">
          <div className="stack" style={{ '--stack-gap': '2.5rem' } as React.CSSProperties}>
            <section className="prose">
              <h2>The public website</h2>
              <p>Homesrolo.com is a static information site. It does not contain an account form, file upload, advertising tracker, or analytics script. Links that say “Open my home” take you to the separate signed-in homeowner application.</p>
              <p>The Roof Watch area check runs in your browser. Homesrolo.com does not receive or store what you type there. Opening the draft passes the city or ZIP to your device’s messaging app; Homesrolo receives it only if you choose to send the text.</p>
            </section>
            <section className="prose">
              <h2>The homeowner application</h2>
              <p>When you request a sign-in link, Homesrolo uses your email address to authenticate you. Inside the account, you may enter home details, project titles, categories, timing, status, and notes. The application stores the information you choose to enter so it can show the home workspace back to you.</p>
              <p>A session cookie keeps the browser signed in. It is used for authentication, not advertising.</p>
            </section>
            <section className="prose">
              <h2>Photo checkups</h2>
              <p>If photo checkups are available on your account, you may upload JPEG or PNG images with an area, repeatable view name, observation date, and optional note. The service re-encodes the image and removes embedded metadata before saving the full image and thumbnail in private storage.</p>
              <p>Photo checkups are displayed only after the signed-in account is authorized for that exact home. They are not sent to a contractor, Jobrolo, a public page, or an automated image-analysis service. You can delete an individual checkup photo from the account; provider backup, security, or legal retention may differ from active application storage.</p>
            </section>
            <section className="prose">
              <h2>Optional Rolo photo review</h2>
              <p>Ordinary files and photos in the private Library are not sent to an AI service by default. If the feature is available, you can choose one saved Library photo and give permission for Rolo to inspect it for one message. Homesrolo verifies access to that exact home and photo, creates a fresh JPEG copy with embedded metadata removed, and sends only that copy and your message to OpenAI. The original file is not sent, the permission does not apply to other photos or later messages, and photo checkups are excluded from this feature.</p>
              <p>Homesrolo sends the request with Responses storage disabled. That setting is not a promise of zero provider retention; OpenAI&apos;s API data-control and abuse-monitoring rules may still apply. Rolo can describe visible details and uncertainty, but it cannot confirm hidden causes, safety, code compliance, measurements, price, workmanship, insurance coverage, or a complete repair scope from an image. Its review is not saved as a home fact unless you separately review and save a work record.</p>
            </section>
            <section className="prose">
              <h2>Sharing and selling data</h2>
              <p>Homesrolo does not publish the private Home Record, sell its contents, sell a project as a lead, or give a professional access merely because the homeowner created a project. Where a specific professional handoff is available, the homeowner reviews the exact information and selected files before sending it.</p>
              <p>Do not forward a passwordless sign-in link; it is an account credential.</p>
            </section>
            <section className="prose">
              <h2>Access, correction, export, and deletion</h2>
              <p>For a question about accessing, correcting, exporting, or deleting account information, use the privacy contact below. Homesrolo will verify the account before discussing a private record and will explain any active-storage, backup, security, or legal-retention limits that apply to the request.</p>
            </section>
            <section className="prose">
              <h2>When a home is sold</h2>
              <p>A sale does not automatically transfer a Homesrolo account or its private files to a buyer. The seller should not share an account credential. Any home-history handoff must be deliberate and must keep the seller’s private information separate from the property information they choose to provide.</p>
            </section>
            <section className="prose">
              <h2>Questions or corrections</h2>
              <p>Text <strong>{HOMESROLO_TEXT_NUMBER_DISPLAY}</strong> and begin the message with <strong>PRIVACY</strong>. Do not include a password, sign-in link, insurance policy number, or other sensitive document in the first message.</p>
              <p><Link href="/security/">Read how the current account is protected</Link>.</p>
            </section>
          </div>
        </div>
      </section>
    </>
  )
}
