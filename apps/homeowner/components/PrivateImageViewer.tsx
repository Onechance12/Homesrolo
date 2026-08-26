'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

export interface PrivateImageItem {
  readonly id: string
  readonly title: string
  readonly alt: string
  readonly thumbnailSrc: string
  readonly fullSrc: string
  readonly meta: string
  readonly sourceLabel: string
  readonly downloadHref?: string
}

/** One authenticated in-app viewer for generic photos and Home Watch views. */
export function PrivateImageViewer({
  items,
  emptyMessage = 'No photos match this view.',
}: {
  readonly items: readonly PrivateImageItem[]
  readonly emptyMessage?: string
}) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const launchRef = useRef<HTMLButtonElement | null>(null)
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLElement | null>(null)
  const active = useMemo(() => items.find(item => item.id === activeId) ?? null, [activeId, items])

  useEffect(() => {
    if (!active) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const timer = window.setTimeout(() => closeRef.current?.focus(), 20)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setActiveId(null)
        return
      }
      if (event.key !== 'Tab') return
      const focusable = [...(panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [])]
      if (focusable.length === 0) {
        event.preventDefault()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && (document.activeElement === first || !panelRef.current?.contains(document.activeElement))) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && (document.activeElement === last || !panelRef.current?.contains(document.activeElement))) {
        event.preventDefault()
        first?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
      requestAnimationFrame(() => launchRef.current?.focus())
    }
  }, [active])

  if (items.length === 0) return <p className="artifact-collection__empty">{emptyMessage}</p>

  return (
    <>
      <div className="private-photo-grid" aria-label="Private home photos">
        {items.map(item => (
          <button
            key={item.id}
            type="button"
            className="private-photo-card"
            onClick={event => {
              launchRef.current = event.currentTarget
              setActiveId(item.id)
            }}
            aria-label={`Open ${item.title}`}
          >
            {/* Exact-home authenticated image routes cannot use the public optimizer. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.thumbnailSrc} alt={item.alt} loading="lazy" />
            <span className="private-photo-card__overlay">
              <small>{item.sourceLabel}</small>
              <strong>{item.title}</strong>
            </span>
          </button>
        ))}
      </div>

      {active ? (
        <div className="private-viewer" role="dialog" aria-modal="true" aria-label={active.title}>
          <button className="private-viewer__backdrop" type="button" onClick={() => setActiveId(null)} aria-label="Close photo" />
          <section ref={panelRef} className="private-viewer__panel">
            <header>
              <div>
                <span>{active.sourceLabel}</span>
                <strong>{active.title}</strong>
                <small>{active.meta}</small>
              </div>
              <button ref={closeRef} type="button" onClick={() => setActiveId(null)} aria-label="Close photo viewer">×</button>
            </header>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={active.fullSrc} alt={active.alt} />
            {active.downloadHref ? <a className="btn btn--quiet" href={active.downloadHref}>Download original</a> : null}
          </section>
        </div>
      ) : null}
    </>
  )
}
