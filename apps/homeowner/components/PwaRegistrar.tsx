'use client'

import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

let pendingInstallPrompt: BeforeInstallPromptEvent | null = null

function runningStandalone() {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(display-mode: standalone)').matches
    || ('standalone' in window.navigator
      && (window.navigator as Navigator & { standalone?: boolean }).standalone === true)
}

/** Registers the deliberately narrow service worker and remembers a native install prompt. */
export function PwaRegistrar() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        updateViaCache: 'none',
      })
    }

    const rememberPrompt = (event: Event) => {
      event.preventDefault()
      pendingInstallPrompt = event as BeforeInstallPromptEvent
      window.dispatchEvent(new Event('homesrolo-install-ready'))
    }
    const installed = () => {
      pendingInstallPrompt = null
      window.dispatchEvent(new Event('homesrolo-installed'))
    }
    window.addEventListener('beforeinstallprompt', rememberPrompt)
    window.addEventListener('appinstalled', installed)
    return () => {
      window.removeEventListener('beforeinstallprompt', rememberPrompt)
      window.removeEventListener('appinstalled', installed)
    }
  }, [])

  return null
}

/** Device-level install control; no account or Home Record data is stored locally. */
export function InstallHomesrolo() {
  const [standalone, setStandalone] = useState(false)
  const [installReady, setInstallReady] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const refresh = () => {
      setStandalone(runningStandalone())
      setInstallReady(pendingInstallPrompt !== null)
    }
    refresh()
    window.addEventListener('homesrolo-install-ready', refresh)
    window.addEventListener('homesrolo-installed', refresh)
    return () => {
      window.removeEventListener('homesrolo-install-ready', refresh)
      window.removeEventListener('homesrolo-installed', refresh)
    }
  }, [])

  async function install() {
    const prompt = pendingInstallPrompt
    if (!prompt) return
    await prompt.prompt()
    const choice = await prompt.userChoice
    if (choice.outcome === 'accepted') {
      pendingInstallPrompt = null
      setStandalone(true)
      setInstallReady(false)
    } else {
      setDismissed(true)
    }
  }

  return (
    <section className="panel" aria-labelledby="install-homesrolo">
      <div className="panel__head"><h2 id="install-homesrolo">Homesrolo on this device</h2></div>
      {standalone ? (
        <div className="install-state install-state--installed">
          <span aria-hidden="true">✓</span>
          <div>
            <strong>Installed</strong>
            <p>Homesrolo opens from your Home Screen like an app.</p>
          </div>
        </div>
      ) : (
        <div className="stack" style={{ ['--stack-gap' as never]: '0.7rem' }}>
          <p>Keep Homesrolo beside the other apps you use for your home. Your private records still stay on the secure server—not in an offline browser cache.</p>
          {installReady ? (
            <button className="btn btn--primary" type="button" onClick={() => void install()}>
              Install Homesrolo
            </button>
          ) : (
            <p className="mono">On iPhone: tap Share, then Add to Home Screen. On Android or desktop: use Install app in your browser menu.</p>
          )}
          {dismissed ? <p className="mono" role="status">No problem. You can install it later from this screen.</p> : null}
        </div>
      )}
    </section>
  )
}
