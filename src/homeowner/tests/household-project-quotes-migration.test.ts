import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const migration = readFileSync(path.resolve(
  import.meta.dirname,
  '../../../supabase/migrations/202609010003_household_proposal_access.sql',
), 'utf8')

function functionBody(name: string, nextMarker: string) {
  const start = migration.indexOf(`create or replace function public.${name}`)
  const end = migration.indexOf(nextMarker, start)
  assert.ok(start >= 0 && end > start)
  return migration.slice(start, end)
}

test('proposal evidence keeps exact project scope without coupling it to the uploader', () => {
  const constraintStart = migration.indexOf(
    'alter table public.homesrolo_homeowner_artifacts',
  )
  const constraintEnd = migration.indexOf(
    'create or replace function public.homesrolo_create_homeowner_project_quote',
  )
  assert.ok(constraintStart >= 0 && constraintEnd > constraintStart)
  const constraints = migration.slice(constraintStart, constraintEnd)

  assert.match(
    constraints,
    /add constraint homesrolo_artifacts_ref_home_project_unique\s+unique \(artifact_ref, home_ref, project_ref\)/,
  )
  assert.match(
    constraints,
    /drop constraint homesrolo_homeowner_project_q_artifact_ref_home_ref_projec_fkey/,
  )
  assert.match(
    constraints,
    /add constraint homesrolo_project_quotes_artifact_scope_fkey\s+foreign key \(artifact_ref, home_ref, project_ref\)[\s\S]+references public\.homesrolo_homeowner_artifacts\(\s*artifact_ref, home_ref, project_ref\s*\)/,
  )
  assert.doesNotMatch(
    constraints,
    /foreign key \(artifact_ref, home_ref, project_ref, controller_principal_ref\)/,
  )
  assert.doesNotMatch(
    constraints,
    /drop constraint homesrolo_homeowner_project_q_project_ref_home_ref_control_fkey/,
  )
})

test('a current Home admin can create a proposal on an active member-created project', () => {
  const createQuote = functionBody(
    'homesrolo_create_homeowner_project_quote',
    'create or replace function public.homesrolo_save_homeowner_project_quote',
  )
  const projectAuthorization = createQuote.slice(
    createQuote.indexOf('select * into v_project'),
    createQuote.indexOf('if p_artifact_ref is not null'),
  )
  const artifactAuthorization = createQuote.slice(
    createQuote.indexOf('if p_artifact_ref is not null'),
    createQuote.indexOf('insert into public.homesrolo_homeowner_project_quotes'),
  )

  assert.match(createQuote, /revision = p_membership_revision/)
  assert.match(createQuote, /state = 'active'/)
  assert.match(createQuote, /role = 'workspace_controller'/)
  assert.match(createQuote, /role = 'workspace_controller'[\s\S]{0,80}for share;/)
  const createPrincipalCheck = createQuote.indexOf(
    'from public.homesrolo_homeowner_principals',
  )
  const createMembershipCheck = createQuote.indexOf(
    'from public.homesrolo_homeowner_memberships',
  )
  assert.ok(createPrincipalCheck >= 0 && createPrincipalCheck < createMembershipCheck)
  assert.match(createQuote.slice(createPrincipalCheck, createMembershipCheck),
    /status = 'active'[\s\S]*email_verified = true[\s\S]*for share;/)
  assert.ok(
    createMembershipCheck < createQuote.indexOf('select * into v_receipt'),
    'quote creation must recheck current authority before receipt replay',
  )
  assert.match(projectAuthorization, /project_ref = p_project_ref/)
  assert.match(projectAuthorization, /home_ref = p_home_ref/)
  assert.match(projectAuthorization, /archived_at is null/)
  assert.match(projectAuthorization, /archived_at is null[\s\S]{0,40}for share;/)
  assert.doesNotMatch(projectAuthorization, /controller_principal_ref = p_principal_ref/)

  assert.match(artifactAuthorization, /artifact_ref = p_artifact_ref/)
  assert.match(artifactAuthorization, /home_ref = p_home_ref/)
  assert.match(artifactAuthorization, /project_ref = p_project_ref/)
  assert.match(artifactAuthorization, /kind = 'document'/)
  assert.match(artifactAuthorization, /media_type = 'application\/pdf'/)
  assert.match(artifactAuthorization, /state = 'available'/)
  assert.doesNotMatch(artifactAuthorization, /controller_principal_ref/)

  assert.match(
    createQuote,
    /p_quote_ref, p_home_ref, p_project_ref, v_project\.controller_principal_ref/,
  )
  assert.match(createQuote, /action = 'quote\.create'/)
  assert.match(createQuote, /v_receipt\.command_digest <> p_command_digest/)
  assert.match(
    createQuote,
    /p_principal_ref, p_command_ref, 'quote\.create', p_command_digest/,
  )
})

test('saving stays inside one active project and cannot mutate professional proposals', () => {
  const saveQuote = functionBody(
    'homesrolo_save_homeowner_project_quote',
    'revoke all on function public.homesrolo_create_homeowner_project_quote',
  )
  const projectAuthorization = saveQuote.slice(
    saveQuote.indexOf('select * into v_project'),
    saveQuote.indexOf('if p_artifact_ref is not null'),
  )
  const artifactAuthorization = saveQuote.slice(
    saveQuote.indexOf('if p_artifact_ref is not null'),
    saveQuote.indexOf('select * into v_quote'),
  )
  const quoteAuthorizationStart = saveQuote.indexOf('select * into v_quote')
  const quoteAuthorization = saveQuote.slice(
    quoteAuthorizationStart,
    saveQuote.indexOf('if not found then raise exception', quoteAuthorizationStart),
  )
  const quoteUpdateStart = saveQuote.indexOf(
    'update public.homesrolo_homeowner_project_quotes',
  )
  const quoteUpdate = saveQuote.slice(
    quoteUpdateStart,
    saveQuote.indexOf('returning * into v_quote', quoteUpdateStart),
  )

  assert.match(projectAuthorization, /project_ref = p_project_ref/)
  assert.match(projectAuthorization, /home_ref = p_home_ref/)
  assert.match(projectAuthorization, /archived_at is null/)
  assert.match(projectAuthorization, /archived_at is null[\s\S]{0,40}for share;/)
  assert.match(saveQuote, /role = 'workspace_controller'[\s\S]{0,80}for share;/)
  const savePrincipalCheck = saveQuote.indexOf(
    'from public.homesrolo_homeowner_principals',
  )
  const saveMembershipCheck = saveQuote.indexOf(
    'from public.homesrolo_homeowner_memberships',
  )
  assert.ok(savePrincipalCheck >= 0 && savePrincipalCheck < saveMembershipCheck)
  assert.match(saveQuote.slice(savePrincipalCheck, saveMembershipCheck),
    /status = 'active'[\s\S]*email_verified = true[\s\S]*for share;/)
  assert.ok(
    saveMembershipCheck < saveQuote.indexOf('select * into v_receipt'),
    'quote save must recheck current authority before receipt replay',
  )
  assert.doesNotMatch(projectAuthorization, /controller_principal_ref = p_principal_ref/)
  assert.match(artifactAuthorization, /artifact_ref = p_artifact_ref/)
  assert.match(artifactAuthorization, /home_ref = p_home_ref/)
  assert.match(artifactAuthorization, /project_ref = p_project_ref/)
  assert.doesNotMatch(artifactAuthorization, /controller_principal_ref/)

  for (const exactScope of [
    /quote_ref = p_quote_ref/,
    /home_ref = p_home_ref/,
    /project_ref = p_project_ref/,
    /controller_principal_ref = v_project\.controller_principal_ref/,
    /source = 'homeowner_entry'/,
  ]) {
    assert.match(quoteAuthorization, exactScope)
    assert.match(quoteUpdate, exactScope)
  }
  assert.match(saveQuote, /v_quote\.revision <> p_expected_revision/)
  assert.match(saveQuote, /action = 'quote\.save'/)
  assert.match(saveQuote, /v_receipt\.command_digest <> p_command_digest/)
})
