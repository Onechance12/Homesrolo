'use client'

import { useState, type KeyboardEvent } from 'react'
import {
  ROOF_WATCH_PHONE_DISPLAY,
  ROOF_WATCH_SMS_URL,
  roofWatchLocationSmsUrl,
} from '../lib/site.ts'

const LOCATION_CHARACTERS = /^[\p{L}\p{M}0-9 .,'’\-]+$/u

function isTexasOrOklahomaLocation(value: string): boolean {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!LOCATION_CHARACTERS.test(normalized)) return false
  if (/^\d{5}$/.test(normalized)) {
    const prefix = Number(normalized.slice(0, 3))
    const isOklahoma = (prefix >= 730 && prefix <= 731) || (prefix >= 734 && prefix <= 749)
    const isTexas = prefix === 733 || (prefix >= 750 && prefix <= 799) || prefix === 885
    return isOklahoma || isTexas
  }
  return /\b(?:TX|OK|Texas|Oklahoma)\b/i.test(normalized)
}

export function RoofWatchLocationCheck() {
  const [location, setLocation] = useState('')
  const [error, setError] = useState('')

  function openTextDraft() {
    const normalized = location.replace(/\s+/g, ' ').trim()
    if (!isTexasOrOklahomaLocation(normalized)) {
      setError('Enter a Texas or Oklahoma ZIP, or include Texas, Oklahoma, TX, or OK with the city.')
      return
    }
    setError('')
    window.location.assign(roofWatchLocationSmsUrl(normalized))
  }

  function handleLocationKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return
    event.preventDefault()
    openTextDraft()
  }

  return (
    <div className="roof-watch-area-check">
      <div className="roof-watch-area-check__copy">
        <p className="eyebrow">Check your area</p>
        <h3>Where is the home?</h3>
        <p>Enter any Texas or Oklahoma city and state, or just the ZIP. We will confirm current availability for that area before anything is scheduled.</p>
      </div>
      <div className="roof-watch-location-checker">
        <label htmlFor="roof-watch-location">City and state or ZIP</label>
        <div className="roof-watch-location-checker__controls">
          <span className="roof-watch-location-checker__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <circle cx="10.75" cy="10.75" r="6.5" />
              <path d="m15.5 15.5 4.25 4.25" />
            </svg>
          </span>
          <input
            id="roof-watch-location"
            value={location}
            onChange={event => {
              setLocation(event.target.value)
              if (error) setError('')
            }}
            onKeyDown={handleLocationKeyDown}
            placeholder="Tulsa, OK or 74103"
            autoComplete="off"
            enterKeyHint="go"
            maxLength={80}
            aria-describedby={`roof-watch-location-note${error ? ' roof-watch-location-error' : ''}`}
            aria-invalid={error ? true : undefined}
          />
          <button type="button" onClick={openTextDraft}>Open my availability text</button>
        </div>
        {error ? <p id="roof-watch-location-error" className="roof-watch-location-checker__error" role="alert">{error}</p> : null}
        <p id="roof-watch-location-note" className="roof-watch-location-checker__note">
          This does not check or promise coverage. Nothing is submitted on this page. The button opens a ready-to-send text; you decide whether to send it. If needed, <a href={ROOF_WATCH_SMS_URL}>text {ROOF_WATCH_PHONE_DISPLAY}</a> directly.
        </p>
      </div>
    </div>
  )
}
