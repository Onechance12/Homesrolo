'use client'

import { use } from 'react'
import { usePort, usePortMode } from '../../../../lib/port/provider.tsx'
import { usePortCall } from '../../../../lib/port/hooks.ts'
import { EmptyState, ErrorState, Skeleton } from '../../../../components/states.tsx'
import { IconDocs } from '../../../../components/icons.tsx'
import type { DocumentKind } from '../../../../lib/port/types.ts'

const KIND_LABEL: Record<DocumentKind, string> = {
  contract: 'Contract',
  invoice: 'Invoice',
  warranty: 'Warranty',
  photo_set: 'Photo set',
  permit: 'Permit',
  manual: 'Manual',
}

/** Documents: every paper filed on this home, project-linked or not. */
export default function DocumentsPage({ params }: { params: Promise<{ homeId: string }> }) {
  const { homeId } = use(params)
  const port = usePort()
  const mode = usePortMode()
  const { state, retry } = usePortCall(() => port.listDocuments(homeId), value => value.length === 0)

  return (
    <div className="stack" style={{ ['--stack-gap' as never]: '1.1rem' }}>
      <div className="pagehead">
        <h1>Documents</h1>
        <p>Filed on the home, whether or not a project owns them.</p>
      </div>

      <div className="notice">
        {mode === 'synthetic' ? (
          <><strong>Demo documents.</strong> These entries are synthetic and disappear on refresh.</>
        ) : (
          <><strong>Uploads are not available yet.</strong> Your private home file is live, but no document can be added from this page yet.</>
        )}
      </div>

      {state.status === 'loading' && <div className="panel"><Skeleton lines={5} label="Loading documents" /></div>}
      {state.status === 'error' && <ErrorState retry={retry} error={state.status === 'error' ? state.error : undefined} />}
      {state.status === 'empty' && (
        <EmptyState
          title="Nothing filed yet"
          body="Contracts, invoices, permits, manuals — every paper this home accumulates would live here, attached to the home rather than to an inbox."
        />
      )}
      {state.status === 'ready' && (
        <ul className="rows panel panel--flush" style={{ display: 'block' }}>
          {state.value.map(doc => (
            <li key={doc.documentRef}>
              <span className="row">
                <span className="row__glyph"><IconDocs /></span>
                <span className="row__body">
                  <span className="row__title">{doc.title}</span>
                  <span className="row__sub">
                    {KIND_LABEL[doc.kind]} · {doc.pages} pages
                    {doc.projectRef ? ' · from a project' : ' · home-level'}
                  </span>
                </span>
                <span className="row__end"><span className="mono">{doc.addedOn}</span></span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
