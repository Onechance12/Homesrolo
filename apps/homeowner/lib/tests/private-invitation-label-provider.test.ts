import assert from 'node:assert/strict'
import test from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { SupabaseHomeownerProvider } from '../server/supabase-provider.ts'

const ref = (prefix: string, character: string) => `${prefix}_${character.repeat(43)}`
const principal = ref('hprn', 'p')
const home = ref('hhom', 'h')
const project = ref('hprj', 'j')
const now = '2026-09-05T12:00:00.000Z'
const row = {
  invitation_ref: ref('hinv', 'i'),
  home_ref: home,
  project_ref: project,
  project_controller_principal_ref: principal,
  invited_by_principal_ref: principal,
  professional_organization_ref: ref('horg', 'o'),
  professional_display_label: 'Retained Synthetic Roofer',
  status: 'pending',
  message: null,
  disclosure: {
    title: 'Synthetic roof work', workKind: 'project', category: 'roofing', trade: 'Roofing',
    status: 'planned', summary: '', selectedArtifactRefs: [],
  },
  disclosure_digest: 'a'.repeat(64),
  expires_at: '2026-09-12T12:00:00.000Z',
  revision: 1,
  created_at: now,
  responded_at: null,
  revoked_at: null,
}

test('private invitation lists retain their stored label without a public profile lookup', async () => {
  const filters: [string, unknown][] = []
  const query = {
    select() { return query },
    eq(key: string, value: unknown) { filters.push([key, value]); return query },
    async order() { return { data: [row], error: null } },
  }
  const provider = new SupabaseHomeownerProvider({
    from(table: string) {
      assert.equal(table, 'homesrolo_project_invitations', 'no public directory query is needed')
      return query
    },
    async rpc(name: string, input: Record<string, unknown>) {
      if (name === 'homesrolo_expire_project_invitations') return { data: 0, error: null }
      assert.equal(name, 'homesrolo_list_authorized_professional_invitations')
      assert.equal(input.p_principal_ref, principal)
      return { data: [row], error: null }
    },
  } as unknown as SupabaseClient, () => now)
  const grant = {
    authorized: true as const, principalRef: principal, homeRef: home,
    membershipRef: ref('hmbr', 'm'), membershipRevision: 1,
    action: 'workspace.read' as const, recheckedAt: now,
  }
  const homeowner = await provider.listHomeownerInvitations({ grant, projectRef: project })
  const professional = await provider.listProfessionalInvitations(principal)
  assert.equal(homeowner[0]?.professionalDisplayLabel, row.professional_display_label)
  assert.equal(professional[0]?.professionalDisplayLabel, row.professional_display_label)
  assert.deepEqual(filters, [['home_ref', home], ['project_ref', project]])
})

test('the application remains compatible before the label migration and with old command receipts', async () => {
  const { professional_display_label: _label, ...legacy } = row
  const provider = new SupabaseHomeownerProvider({
    async rpc(name: string) {
      return { data: name === 'homesrolo_expire_project_invitations' ? 0 : [legacy], error: null }
    },
  } as unknown as SupabaseClient, () => now)
  const invitations = await provider.listProfessionalInvitations(principal)
  assert.equal(invitations[0]?.professionalDisplayLabel, undefined)
  assert.equal(invitations[0]?.invitationRef, row.invitation_ref)
})
