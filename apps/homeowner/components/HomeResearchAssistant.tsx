'use client'

import { type FormEvent, useId, useMemo, useRef, useState } from 'react'
import { usePort, useSession } from '../lib/port/provider.tsx'
import type {
  HomeResearchFactField,
  HomeResearchResult,
  HomeResearchTurn,
  PortError,
} from '../lib/port/types.ts'

const FIELD_LABELS: Record<HomeResearchFactField, string> = {
  year_built: 'Year built',
  property_type: 'Property type',
  square_footage: 'Square footage',
  lot_size: 'Lot size',
  roof: 'Roof',
  heating: 'Heating',
  cooling: 'Cooling',
  water_heater: 'Water heater',
  permit: 'Permit record',
  tax_record: 'Tax record',
  public_record: 'Public record',
  other: 'Other detail',
}

const ERROR_COPY: Record<PortError, string> = {
  not_found: 'That home record is no longer available.',
  not_signed_in: 'Your session ended. Sign in again before researching this home.',
  forbidden: 'This account cannot research that home.',
  conflict: 'The home changed while this request was running. Try again.',
  invalid: 'That question crosses Homesrolo’s education-only boundary. Ask for general education or public property facts instead.',
  rate_limited: 'You have reached the research limit for now. Give it a few minutes, then try again.',
  unavailable: 'Home research could not connect right now. Nothing was added to the record.',
}

interface ResearchExchange {
  readonly address: string
  readonly question: string
  readonly result: HomeResearchResult
}

function sourceFor(url: string, result: HomeResearchResult) {
  return result.sources.find(source => source.url === url)
}

function SourceLinks({ urls, result }: { urls: readonly string[]; result: HomeResearchResult }) {
  return (
    <ul className="research-sources" aria-label="Sources">
      {urls.map(url => {
        const source = sourceFor(url, result)
        return (
          <li key={url}>
            <a href={url} target="_blank" rel="noopener noreferrer">
              {source?.title ?? new URL(url).hostname}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </li>
        )
      })}
    </ul>
  )
}

export function HomeResearchAssistant({
  homeRef,
  suggestedAddress,
}: {
  homeRef: string
  suggestedAddress: string
}) {
  const port = usePort()
  const session = useSession()
  const addressId = useId()
  const messageId = useId()
  const consentId = useId()
  const [address, setAddress] = useState(
    /^\s*\d{1,8}\s+\p{L}/u.test(suggestedAddress) ? suggestedAddress : '',
  )
  const [message, setMessage] = useState('What reliable public facts can you find about this home?')
  const [consent, setConsent] = useState(false)
  const [exchanges, setExchanges] = useState<readonly ResearchExchange[]>([])
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null)
  const [error, setError] = useState<PortError | null>(null)
  const messageRef = useRef<HTMLTextAreaElement>(null)

  const history = useMemo<readonly HomeResearchTurn[]>(() => {
    const last = exchanges.at(-1)
    if (!last || last.address.trim().toLocaleLowerCase() !== address.trim().toLocaleLowerCase()) return []
    return [
      { role: 'user', text: last.question.slice(0, 600) },
      { role: 'assistant', text: last.result.answer.slice(0, 600) },
    ]
  }, [address, exchanges])

  if (session.state.kind === 'loading') {
    return null
  }

  if (session.state.kind !== 'signed_in' || !session.state.capabilities.homeResearch) {
    return null
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextAddress = address.trim()
    const nextQuestion = message.trim()
    if (!nextAddress || !nextQuestion || !consent || pendingQuestion) return
    setError(null)
    setPendingQuestion(nextQuestion)
    const result = await port.researchHome(homeRef, {
      address: nextAddress,
      message: nextQuestion,
      consentToResearchThisAddressOnline: true,
      history,
    })
    setPendingQuestion(null)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setExchanges(current => [
      ...current,
      { address: nextAddress, question: nextQuestion, result: result.value },
    ].slice(-3))
    setMessage('')
    setConsent(false)
  }

  const lastResult = exchanges.at(-1)?.result

  return (
    <section className="panel research-panel" aria-labelledby="home-research-title">
      <div className="research-panel__head">
        <div>
          <p className="mono">Public-source home research</p>
          <h2 id="home-research-title">Ask Homesrolo about this home.</h2>
        </div>
        <span className="pill pill--progress">AI + public sources</span>
      </div>
      <p className="research-panel__intro">
        Start with an address and a real question. Homesrolo searches public records and other public pages,
        cites what it used, and separates evidence from guesses.
      </p>

      {exchanges.length > 0 ? (
        <ol
          className="research-thread"
          aria-label="Home research conversation"
          role="log"
          aria-live="polite"
          aria-relevant="additions"
          aria-busy={pendingQuestion !== null}
        >
          {exchanges.map(exchange => (
            <li key={exchange.result.requestRef}>
              <div className="research-bubble research-bubble--homeowner">
                <span className="mono">You asked</span>
                <p>{exchange.question}</p>
              </div>
              <div className="research-bubble research-bubble--assistant">
                <span className="mono">Homesrolo research</span>
                <p>{exchange.result.answer}</p>
                <SourceLinks urls={exchange.result.answerSourceUrls} result={exchange.result} />

                {exchange.result.proposedFacts.length > 0 ? (
                  <div className="research-facts">
                    <h3>Draft facts to check</h3>
                    <p>These are not in your home record. Compare them with your own documents first.</p>
                    <dl>
                      {exchange.result.proposedFacts.map((fact, index) => (
                        <div key={`${fact.field}-${fact.value}-${index}`}>
                          <dt>
                            {FIELD_LABELS[fact.field]}
                            <span className={`research-confidence research-confidence--${fact.confidence}`}>
                              {fact.confidence} confidence
                            </span>
                          </dt>
                          <dd>{fact.value}</dd>
                          <SourceLinks urls={fact.sourceUrls} result={exchange.result} />
                        </div>
                      ))}
                    </dl>
                  </div>
                ) : null}

                {exchange.result.limitations.length > 0 ? (
                  <details className="research-limitations">
                    <summary>What this search could not confirm</summary>
                    <ul>{exchange.result.limitations.map(item => <li key={item}>{item}</li>)}</ul>
                  </details>
                ) : null}
                <p className="form-note">{exchange.result.disclosure}</p>
              </div>
            </li>
          ))}
        </ol>
      ) : null}

      {pendingQuestion ? (
        <div className="research-pending" role="status" aria-live="polite">
          <span className="research-pending__dot" aria-hidden="true" />
          Searching public sources and checking the citations…
        </div>
      ) : null}

      {error ? <p className="form-error" role="alert">{ERROR_COPY[error]}</p> : null}

      {lastResult?.followUpQuestions.length ? (
        <div className="research-prompts" aria-label="Suggested follow-up questions">
          <span className="mono">Useful follow-ups</span>
          <div>
            {lastResult.followUpQuestions.map(question => (
              <button
                key={question}
                type="button"
                onClick={() => {
                  setMessage(question)
                  setConsent(false)
                  requestAnimationFrame(() => messageRef.current?.focus())
                }}
              >
                {question}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <form className="research-form" onSubmit={submit}>
        <div className="field">
          <label htmlFor={addressId}>Street address to research</label>
          <input
            id={addressId}
            name="address"
            autoComplete="street-address"
            inputMode="text"
            maxLength={200}
            value={address}
            onChange={event => {
              setAddress(event.target.value)
              setConsent(false)
            }}
            placeholder="123 Main Street, Fort Worth, TX 76102"
            disabled={pendingQuestion !== null}
            required
          />
          <span className="field__hint">Sent only when you press Research this home.</span>
        </div>
        <div className="field">
          <label htmlFor={messageId}>What do you want to know?</label>
          <textarea
            ref={messageRef}
            id={messageId}
            name="message"
            maxLength={800}
            value={message}
            onChange={event => {
              setMessage(event.target.value)
              setConsent(false)
            }}
            placeholder="Try: Find reliable permit and system-age records for this address."
            disabled={pendingQuestion !== null}
            required
          />
        </div>
        <label className="research-consent" htmlFor={consentId}>
          <input
            id={consentId}
            type="checkbox"
            checked={consent}
            onChange={event => setConsent(event.target.checked)}
            disabled={pendingQuestion !== null}
            required
          />
          <span>
            I agree to send this street address, my question, and recent chat turns to OpenAI for this
            research request. Homesrolo will not add the answer to my home record. The request uses
            <code> store: false</code>, so the generated response is not retained for later API retrieval.
            Separate OpenAI abuse-monitoring logs are generally kept up to 30 days and may be retained longer
            when legally required or needed to protect the service.
          </span>
        </label>
        <div className="notice research-boundary">
          <p>Homesrolo is not an insurance company, not a public insurance adjuster, and not a law firm.</p>
          <p>Homesrolo explains how things work. It does not advise you on your own claim, policy, or settlement.</p>
          <p>For advice about your claim, talk to a licensed public insurance adjuster or an attorney.</p>
        </div>
        <div className="research-form__actions">
          <button
            className="btn btn--primary"
            type="submit"
            disabled={!consent || !address.trim() || !message.trim() || pendingQuestion !== null}
          >
            {pendingQuestion ? 'Researching…' : 'Research this home'}
          </button>
          <span className="form-note">Public information can be wrong or stale. You decide what belongs in the record.</span>
        </div>
      </form>
    </section>
  )
}
