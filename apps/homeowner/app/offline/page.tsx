import Link from 'next/link'
import { HouseMark } from '../../components/icons.tsx'

export default function OfflinePage() {
  return (
    <div className="gate">
      <span className="gate__brand"><HouseMark /> <span>homesrolo</span></span>
      <main id="main" tabIndex={-1} className="gate__main">
        <section className="gate__card" aria-labelledby="offline-title">
          <p className="mono">Connection paused</p>
          <h1 id="offline-title">Your Home Record is safe.</h1>
          <div className="stack" style={{ ['--stack-gap' as never]: '0.8rem', marginTop: '1rem' }}>
            <p>Homesrolo is offline right now. Reconnect before opening private home details, photos, or documents.</p>
            <p className="mono">Private records are never placed in the offline browser cache.</p>
            <Link className="btn btn--primary" href="/">Try again</Link>
          </div>
        </section>
      </main>
    </div>
  )
}
