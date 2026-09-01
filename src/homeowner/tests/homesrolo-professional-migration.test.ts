import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const migration = readFileSync(path.resolve(
  import.meta.dirname,
  '../../../supabase/migrations/202608260002_homesrolo_professional_invitations.sql',
), 'utf8')
const rolloutGuardMigration = readFileSync(path.resolve(
  import.meta.dirname,
  '../../../supabase/migrations/202609010000_safe_household_rollout_guards.sql',
), 'utf8')
const householdAccessMigration = readFileSync(path.resolve(
  import.meta.dirname,
  '../../../supabase/migrations/202609010001_household_professional_access.sql',
), 'utf8')
const provider = readFileSync(path.resolve(
  import.meta.dirname,
  '../../../apps/homeowner/lib/server/supabase-provider.ts',
), 'utf8')
const runtime = readFileSync(path.resolve(
  import.meta.dirname,
  '../../../apps/homeowner/lib/server/runtime.ts',
), 'utf8')

function correctedFunctionBody(functionName: string): string {
  const source = functionName === 'homesrolo_list_authorized_professional_invitations'
    ? rolloutGuardMigration
    : householdAccessMigration
  const start = source.indexOf(
    `create or replace function public.${functionName}`,
  )
  const next = source.indexOf(
    'create or replace function public.',
    start + 1,
  )
  assert.ok(start >= 0, `${functionName} must be replaced by the household correction`)
  return source.slice(start, next < 0 ? undefined : next)
}

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
  const start = householdAccessMigration.indexOf(
    'create or replace function public.homesrolo_create_project_invitation',
  )
  const end = householdAccessMigration.indexOf(
    'revoke all on function public.homesrolo_create_project_invitation',
    start,
  )
  assert.ok(start >= 0 && end > start)
  const invitation = householdAccessMigration.slice(start, end)
  assert.match(invitation, /role = 'workspace_controller'/)
  assert.match(invitation, /revision = p_membership_revision/)
  assert.match(invitation, /role = 'workspace_controller'[\s\S]{0,80}for share;[\s\S]{0,80}if not found then raise exception 'membership_not_authorized'/)
  assert.match(invitation, /project_ref = p_project_ref/)
  assert.match(invitation, /home_ref = p_home_ref/)
  assert.match(invitation, /archived_at is null[\s\S]{0,40}for share;/)
  assert.doesNotMatch(invitation, /controller_principal_ref = p_principal_ref/)
  assert.match(invitation, /v_project\.category = any\(trades\)/)
  assert.match(invitation, /publication_state = 'published'[\s\S]{0,100}for share;/)
  assert.match(invitation, /v_expected_trade := case v_project\.category/)
  assert.match(invitation, /when 'new_construction' then 'New construction'/)
  assert.match(invitation, /p_disclosure ->> 'trade' <> v_expected_trade/)
  assert.doesNotMatch(invitation, /v_project\.trade/)
  assert.match(invitation, /jsonb_array_length\(p_disclosure -> 'selectedArtifactRefs'\) > 25/)
  assert.match(invitation, /artifact\.artifact_ref = ref\.value/)
  assert.match(invitation, /artifact\.home_ref = p_home_ref/)
  assert.match(invitation, /artifact\.project_ref = p_project_ref/)
  assert.doesNotMatch(invitation, /artifact\.controller_principal_ref/)
  assert.match(invitation, /count\(\*\) <> count\(distinct value\)/)
  assert.match(invitation, /active-invitation-limit/)
  assert.match(invitation, /\) >= 12 then raise exception 'project_invitation_limit_reached'/)
})

test('proposal writes require an accepted live invitation and active organization membership', () => {
  for (const functionName of [
    'homesrolo_submit_professional_proposal',
    'homesrolo_revise_professional_proposal',
  ]) {
    const body = correctedFunctionBody(functionName)
    assert.match(body, /v_invitation\.status <> 'accepted'/)
    assert.match(body, /v_invitation\.expires_at <= p_requested_at/)
    assert.match(body, /membership\.principal_ref = p_principal_ref/)
    assert.match(body, /membership\.state = 'active'/)
    assert.match(body, /principal\.status = 'active'/)
    assert.match(body, /principal\.email_verified = true/)
    assert.match(body, /organization\.publication_state <> 'suspended'/)
  }
  assert.match(migration, /unique index homesrolo_project_quotes_one_per_invitation_idx/i)
  assert.match(migration, /unique index homesrolo_project_quotes_one_selected_idx/i)
  assert.match(migration, /v_quote\.homeowner_decision = p_decision[\s\S]*proposal_decision_unchanged/i)
  assert.match(migration, /homesrolo_professional_proposal_versions_immutable[\s\S]*before update or delete/i)
  assert.match(migration, /unique \(quote_ref, revision\)/i)
  assert.match(migration, /unique \(quote_ref, content_digest\)/i)
})

test('household professional administration holds controller authority through commit', () => {
  for (const functionName of [
    'homesrolo_create_project_invitation',
    'homesrolo_revoke_project_invitation',
    'homesrolo_decide_professional_proposal',
  ]) {
    const start = householdAccessMigration.indexOf(
      `create or replace function public.${functionName}`,
    )
    const next = householdAccessMigration.indexOf(
      'create or replace function public.',
      start + 1,
    )
    const body = householdAccessMigration.slice(start, next < 0 ? undefined : next)
    assert.ok(start >= 0, `${functionName} must be replaced by the household correction`)
    assert.match(body, /revision = p_membership_revision/)
    assert.match(body, /state = 'active'/)
    assert.match(body, /role = 'workspace_controller'/)
    assert.match(body, /for share;[\s\S]{0,80}if not found then raise exception 'membership_not_authorized'/)
    const principalCheck = body.indexOf('from public.homesrolo_homeowner_principals')
    const membershipCheck = body.indexOf('from public.homesrolo_homeowner_memberships')
    const receiptRead = body.indexOf('select * into v_receipt')
    assert.ok(principalCheck >= 0 && principalCheck < membershipCheck)
    assert.match(body.slice(principalCheck, membershipCheck),
      /status = 'active'[\s\S]*email_verified = true[\s\S]*for share;/)
    assert.ok(
      membershipCheck < receiptRead,
      `${functionName} must recheck authority before receipt replay`,
    )
  }
})

test('professional command replay holds current authority rows through commit', () => {
  const createOrganization = correctedFunctionBody(
    'homesrolo_create_professional_organization',
  )
  const createReceipt = createOrganization.indexOf('select * into v_receipt')
  assert.ok(createReceipt > 0)
  assert.match(createOrganization.slice(0, createReceipt),
    /homesrolo_homeowner_principals[\s\S]*status = 'active'[\s\S]*email_verified = true[\s\S]*for share;/)

  const saveProfile = correctedFunctionBody('homesrolo_save_professional_profile')
  const saveReceipt = saveProfile.indexOf('select * into v_receipt')
  assert.ok(saveReceipt > 0)
  const saveAuthority = saveProfile.slice(0, saveReceipt)
  assert.match(saveAuthority,
    /homesrolo_homeowner_principals[\s\S]*for share;/)
  assert.match(saveAuthority,
    /homesrolo_professional_memberships[\s\S]*role in \('owner', 'admin'\)[\s\S]*for share;/)
  assert.match(saveAuthority,
    /homesrolo_professional_organizations[\s\S]*for update;/)
  assert.match(saveAuthority, /publication_state = 'suspended'/)

  for (const functionName of [
    'homesrolo_respond_project_invitation',
    'homesrolo_submit_professional_proposal',
  ]) {
    const body = correctedFunctionBody(functionName)
    const receipt = body.indexOf('select * into v_receipt')
    assert.ok(receipt > 0)
    const authority = body.slice(0, receipt)
    assert.match(authority, /join public\.homesrolo_professional_organizations organization/)
    assert.match(authority, /organization\.publication_state <> 'suspended'/)
    assert.match(authority, /join public\.homesrolo_professional_memberships membership/)
    assert.match(authority, /join public\.homesrolo_homeowner_principals principal/)
    assert.match(authority, /for update of invitation/)
    assert.match(authority, /for share of organization, membership, principal;/)
  }

  const reviseProposal = correctedFunctionBody('homesrolo_revise_professional_proposal')
  const reviseReceipt = reviseProposal.indexOf('select * into v_receipt')
  assert.ok(reviseReceipt > 0)
  const reviseAuthority = reviseProposal.slice(0, reviseReceipt)
  assert.match(reviseAuthority, /organization\.publication_state <> 'suspended'/)
  assert.match(reviseAuthority, /for update of quote/)
  assert.match(reviseAuthority,
    /for share of invitation, organization, membership, principal;/)
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
  const professionalList = provider.slice(
    provider.indexOf('async listProfessionalInvitations'),
    provider.indexOf('async readProposalForInvitation'),
  )
  assert.match(
    professionalList,
    /\.rpc\(\s*'homesrolo_list_authorized_professional_invitations'/,
  )
  assert.doesNotMatch(professionalList, /\.from\('homesrolo_project_invitations'\)/)

  const authorizedList = correctedFunctionBody(
    'homesrolo_list_authorized_professional_invitations',
  )
  assert.match(authorizedList, /principal\.status = 'active'/)
  assert.match(authorizedList, /principal\.email_verified = true/)
  assert.match(authorizedList, /membership\.state = 'active'/)
  assert.match(authorizedList, /organization\.publication_state <> 'suspended'/)
  assert.match(authorizedList, /invitation\.status in \('pending', 'accepted'\)/)
  assert.match(authorizedList, /invitation\.expires_at > p_now/)
  assert.match(authorizedList, /from public, anon, authenticated;/)
  assert.match(authorizedList, /to service_role;/)

  const proposalRead = provider.slice(
    provider.indexOf('async readProposalForInvitation'),
    provider.indexOf('async readInvitationArtifact'),
  )
  assert.match(proposalRead, /\.from\('homesrolo_homeowner_project_quotes'\)/)
  assert.doesNotMatch(proposalRead, /\.from\('homesrolo_project_quotes'\)/)
  assert.ok((proposalRead.match(/listProfessionalInvitations\(input\.principalRef\)/g) ?? []).length >= 2,
    'proposal reads recheck current principal, membership, organization, and invitation access')
  assert.match(proposalRead, /current\.revision !== invitation\.revision/)
  assert.match(proposalRead, /current\.status !== invitation\.status/)

  const artifactRead = provider.slice(
    provider.indexOf('async readInvitationArtifact'),
    provider.indexOf('async #expireProjectInvitations'),
  )
  assert.match(artifactRead, /invitation\.status !== 'accepted'/)
  assert.match(artifactRead, /selectedArtifactRefs\.includes\(input\.artifactRef\)/)
  assert.match(artifactRead, /\.eq\('home_ref', invitation\.homeRef\)/)
  assert.match(artifactRead, /\.eq\('project_ref', invitation\.projectRef\)/)
  assert.doesNotMatch(artifactRead, /controller_principal_ref/)
  assert.ok((artifactRead.match(/\.from\('homesrolo_homeowner_artifacts'\)/g) ?? []).length >= 2,
    'the exact artifact scope is rechecked after the object read')
  assert.match(artifactRead, /currentArtifact\.revision !== artifact\.revision/)
  assert.match(artifactRead, /currentArtifact\.payloadSha256 !== artifact\.payloadSha256/)
  assert.ok((artifactRead.match(/listProfessionalInvitations\(input\.principalRef\)/g) ?? []).length >= 2,
    'membership and invitation state are rechecked after the object read')
})

test('the professional runtime cannot turn on without the existing proposal lane', () => {
  assert.match(runtime,
    /invitations: configuration\?\.projectQuotesEnabled === true[\s\S]*configuration\?\.professionalInvitationsEnabled === true/)
  assert.match(runtime,
    /if \(!provider \|\| configuration\?\.projectQuotesEnabled !== true[\s\S]*configuration\?\.professionalInvitationsEnabled !== true\) return null/)
})
