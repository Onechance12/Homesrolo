import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const migration = readFileSync(path.resolve(
  import.meta.dirname,
  '../../../supabase/migrations/202608260002_homesrolo_professional_invitations.sql',
), 'utf8')
const provider = readFileSync(path.resolve(
  import.meta.dirname,
  '../../../apps/homeowner/lib/server/supabase-provider.ts',
), 'utf8')
const runtime = readFileSync(path.resolve(
  import.meta.dirname,
  '../../../apps/homeowner/lib/server/runtime.ts',
), 'utf8')

const tables = [
  'homesrolo_professional_organizations',
  'homesrolo_professional_memberships',
  'homesrolo_professional_command_receipts',
  'homesrolo_project_invitations',
  'homesrolo_professional_proposal_versions',
] as const

test('professional tables are private and service code receives read-only table access', () => {
  for (const table of tables) {
    assert.match(migration, new RegExp(
      `alter table public\\.${table} enable row level security`, 'i',
    ))
    assert.match(migration, new RegExp(
      `revoke all on table public\\.${table} from public, anon, authenticated, service_role`, 'i',
    ))
    assert.match(migration, new RegExp(
      `grant select on table public\\.${table} to service_role`, 'i',
    ))
  }
  assert.doesNotMatch(
    migration,
    /grant\s+(?:[^;]*\b)?(?:insert|update|delete)\b[^;]*\bon table public\.homesrolo_(?:professional|project_invitations)[^;]*to service_role/i,
  )
  assert.doesNotMatch(migration, /create\s+policy/i)
})

test('professional identity stays separate from Home Record membership', () => {
  assert.match(migration, /create table public\.homesrolo_professional_memberships/i)
  assert.match(migration, /insert into public\.homesrolo_professional_memberships/i)
  assert.doesNotMatch(migration, /insert into public\.homesrolo_homeowner_memberships/i)
  assert.match(migration, /unique \(organization_ref, principal_ref\)/i)
  assert.match(migration, /role text not null check \(role in \('owner', 'admin', 'member'\)\)/i)
  assert.match(migration, /professional-organization-limit/)
  assert.match(migration, /\) >= 3 then raise exception 'professional_organization_limit_reached'/)
})

test('an invitation binds one owned project, matching trade, and an exact evidence allowlist', () => {
  const start = migration.indexOf(
    'create or replace function public.homesrolo_create_project_invitation',
  )
  const end = migration.indexOf(
    'create or replace function public.homesrolo_respond_project_invitation',
    start,
  )
  assert.ok(start >= 0 && end > start)
  const invitation = migration.slice(start, end)
  assert.match(invitation, /role = 'workspace_controller'/)
  assert.match(invitation, /revision = p_membership_revision/)
  assert.match(invitation, /project_ref = p_project_ref/)
  assert.match(invitation, /home_ref = p_home_ref/)
  assert.match(invitation, /controller_principal_ref = p_principal_ref/)
  assert.match(invitation, /v_project\.category = any\(trades\)/)
  assert.match(invitation, /v_expected_trade := case v_project\.category/)
  assert.match(invitation, /when 'new_construction' then 'New construction'/)
  assert.match(invitation, /p_disclosure ->> 'trade' <> v_expected_trade/)
  assert.doesNotMatch(invitation, /v_project\.trade/)
  assert.match(invitation, /jsonb_array_length\(p_disclosure -> 'selectedArtifactRefs'\) > 25/)
  assert.match(invitation, /artifact\.artifact_ref = ref\.value/)
  assert.match(invitation, /artifact\.home_ref = p_home_ref/)
  assert.match(invitation, /artifact\.project_ref = p_project_ref/)
  assert.match(invitation, /artifact\.controller_principal_ref = v_project\.controller_principal_ref/)
  assert.match(invitation, /count\(\*\) <> count\(distinct value\)/)
  assert.match(invitation, /active-invitation-limit/)
  assert.match(invitation, /\) >= 12 then raise exception 'project_invitation_limit_reached'/)
})

test('proposal writes require an accepted live invitation and active organization membership', () => {
  for (const functionName of [
    'homesrolo_submit_professional_proposal',
    'homesrolo_revise_professional_proposal',
  ]) {
    const start = migration.indexOf(`create or replace function public.${functionName}`)
    const next = migration.indexOf('create or replace function public.', start + 1)
    const body = migration.slice(start, next < 0 ? undefined : next)
    assert.ok(start >= 0)
    assert.match(body, /invitation\.status = 'accepted'/)
    assert.match(body, /invitation\.expires_at > p_requested_at/)
    assert.match(body, /membership\.principal_ref = p_principal_ref/)
    assert.match(body, /membership\.state = 'active'/)
    assert.match(body, /principal\.status = 'active'/)
    assert.match(body, /principal\.email_verified = true/)
  }
  assert.match(migration, /unique index homesrolo_project_quotes_one_per_invitation_idx/i)
  assert.match(migration, /unique index homesrolo_project_quotes_one_selected_idx/i)
  assert.match(migration, /v_quote\.homeowner_decision = p_decision[\s\S]*proposal_decision_unchanged/i)
  assert.match(migration, /homesrolo_professional_proposal_versions_immutable[\s\S]*before update or delete/i)
  assert.match(migration, /unique \(quote_ref, revision\)/i)
  assert.match(migration, /unique \(quote_ref, content_digest\)/i)
})

test('all browser-inaccessible mutations are command-digest and service-role fenced', () => {
  for (const action of [
    'organization.create', 'profile.save', 'invitation.respond',
    'proposal.submit', 'proposal.revise', 'professional.invite',
    'professional.invitation.revoke', 'proposal.decide',
  ]) assert.ok(migration.includes(`'${action}'`), action)
  assert.match(migration, /command_digest_mismatch/i)
  assert.match(migration, /pg_advisory_xact_lock/i)
  assert.doesNotMatch(migration, /grant execute[^;]*to (?:public|anon|authenticated)/i)
  assert.ok((migration.match(/from public, anon, authenticated;/g) ?? []).length >= 8)
  assert.ok((migration.match(/to service_role;/g) ?? []).length >= 8)
})

test('proposal reload and selected evidence use exact existing private tables', () => {
  const proposalRead = provider.slice(
    provider.indexOf('async readProposalForInvitation'),
    provider.indexOf('async readInvitationArtifact'),
  )
  assert.match(proposalRead, /\.from\('homesrolo_homeowner_project_quotes'\)/)
  assert.doesNotMatch(proposalRead, /\.from\('homesrolo_project_quotes'\)/)

  const artifactRead = provider.slice(
    provider.indexOf('async readInvitationArtifact'),
    provider.indexOf('async #expireProjectInvitations'),
  )
  assert.match(artifactRead, /invitation\.status !== 'accepted'/)
  assert.match(artifactRead, /selectedArtifactRefs\.includes\(input\.artifactRef\)/)
  assert.match(artifactRead, /\.eq\('home_ref', invitation\.homeRef\)/)
  assert.match(artifactRead, /\.eq\('project_ref', invitation\.projectRef\)/)
  assert.match(artifactRead, /\.eq\('controller_principal_ref', invitation\.controllerPrincipalRef\)/)
  assert.ok((artifactRead.match(/listProfessionalInvitations\(input\.principalRef\)/g) ?? []).length >= 2,
    'membership and invitation state are rechecked after the object read')
})

test('the professional runtime cannot turn on without the existing proposal lane', () => {
  assert.match(runtime,
    /invitations: configuration\?\.projectQuotesEnabled === true[\s\S]*configuration\?\.professionalInvitationsEnabled === true/)
  assert.match(runtime,
    /if \(!provider \|\| configuration\?\.projectQuotesEnabled !== true[\s\S]*configuration\?\.professionalInvitationsEnabled !== true\) return null/)
})
