import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

// Explicit local integration test: node --test scripts/invitation-reliability-postgres.test.mjs
// Requires initdb/pg_ctl/psql on PATH. Always creates its own cluster with only a
// unique Unix socket; never consults a connection URL, existing server, or credentials.
const root = path.resolve(import.meta.dirname, '..')
const readMigration = name => readFileSync(path.join(root, 'supabase/migrations', name), 'utf8')
const household = readMigration('202608300001_homeowner_household.sql')
const professional = readMigration('202608260002_homesrolo_professional_invitations.sql')
const guard = readMigration('202609010000_safe_household_rollout_guards.sql')
const ref = (prefix, character) => `${prefix}_${character.repeat(43)}`
const home = ref('hhom', 'h')
const otherHome = ref('hhom', 'x')
const principal = ref('hprn', 'p')
const outsider = ref('hprn', 'x')
const member = ref('hmbr', 'm')
const org = ref('horg', 'o')
const project = ref('hprj', 'j')
const invite = ref('hinv', 'i')
const now = '2026-09-05T12:00:00.000Z'

function between(source, start, end) {
  const from = source.indexOf(start)
  const to = source.indexOf(end, from + start.length)
  assert.ok(from >= 0 && to > from, `missing migration fragment: ${start}`)
  return source.slice(from, to)
}

test('forward migrations retain manageable household access and private company identity', { timeout: 60_000 }, () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'homesrolo-invitation-pg-'))
  const data = path.join(directory, 'data')
  const env = {
    PATH: process.env.PATH,
    LC_ALL: 'C',
    PGPASSFILE: path.join(directory, 'no-credentials'),
  }
  let started = false
  function run(binary, args, input) {
    const result = spawnSync(binary, args, { env, input, encoding: 'utf8', timeout: 30_000 })
    assert.equal(result.status, 0, `${binary} failed: ${result.error?.message ?? ''}\n${result.stderr}`)
    return result.stdout.trim()
  }
  const sql = statement => run('psql', [
    '-X', '-w', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', directory,
    '-p', '55438', '-U', 'postgres', '-d', 'postgres',
  ], statement)
  try {
    run('initdb', ['-D', data, '--auth=trust', '--no-locale', '--encoding=UTF8', '-U', 'postgres'])
    run('pg_ctl', ['-D', data, '-l', path.join(directory, 'postgres.log'), '-w', 'start',
      '-o', `-F -k ${directory} -h '' -p 55438`])
    started = true
    sql(`
      create role anon; create role authenticated; create role service_role;
      create table homesrolo_homeowner_principals (
        principal_ref text primary key, status text, email_verified boolean
      );
      create table homesrolo_private_homes (home_ref text primary key);
      create table homesrolo_homeowner_projects (
        project_ref text, home_ref text, controller_principal_ref text,
        unique(project_ref, home_ref, controller_principal_ref)
      );
      create table homesrolo_homeowner_memberships (
        membership_ref text, principal_ref text, home_ref text, display_label text,
        role text, state text, revision integer, created_at timestamptz, revoked_at timestamptz
      );
      ${between(household, 'create table public.homesrolo_household_invitations', 'create unique index')}
      ${between(household, 'create or replace function public.homesrolo_household_instant', '-- Any active exact-home member')}
      ${between(professional, 'create table public.homesrolo_professional_organizations', 'create index homesrolo_professional_organizations_published_idx')}
      ${between(professional, 'create table public.homesrolo_professional_memberships', 'create unique index homesrolo_professional_one_active_owner_idx')}
      ${between(professional, 'create table public.homesrolo_project_invitations', 'create unique index homesrolo_project_invitations_one_active_org_idx')}
      ${between(guard, 'create or replace function public.homesrolo_list_authorized_professional_invitations', 'commit;')}
      alter table homesrolo_project_invitations enable row level security;
      revoke all on homesrolo_project_invitations from public, anon, authenticated, service_role;
      grant select on homesrolo_project_invitations to service_role;
      insert into homesrolo_homeowner_principals values ('${principal}', 'active', true), ('${outsider}', 'active', true);
      insert into homesrolo_private_homes values ('${home}'), ('${otherHome}');
      insert into homesrolo_homeowner_projects values ('${project}', '${home}', '${principal}');
      insert into homesrolo_homeowner_memberships values
        ('${member}', '${principal}', '${home}', 'Synthetic viewer', 'viewer', 'active', 1, '${now}', null);
      insert into homesrolo_professional_organizations (
        organization_ref, slug, display_name, trades, service_areas, publication_state, created_at, updated_at
      ) values ('${org}', 'synthetic-roofer', 'Original Synthetic Roofer', array['roofing'], array['Test area'], 'published', '${now}', '${now}');
      insert into homesrolo_professional_memberships (
        membership_ref, organization_ref, principal_ref, role, state, created_at
      ) values ('${ref('hpmr', 'p')}', '${org}', '${principal}', 'owner', 'active', '${now}');
      insert into homesrolo_project_invitations (
        invitation_ref, home_ref, project_ref, project_controller_principal_ref,
        invited_by_principal_ref, professional_organization_ref, command_ref, command_digest,
        disclosure, disclosure_digest, expires_at, created_at
      ) values ('${invite}', '${home}', '${project}', '${principal}', '${principal}', '${org}',
        '${ref('hcmd', 'c')}', repeat('a', 64), '{}'::jsonb, repeat('b', 64), '2026-09-12', '${now}');
    `)
    sql(readMigration('202609050001_household_pending_invitation_visibility.sql'))
    sql(readMigration('202609050002_private_invitation_company_labels.sql'))

    sql(`
      insert into homesrolo_household_invitations (
        invitation_ref, home_ref, invited_by_principal_ref, invitee_email_hash,
        invitee_display_label, desired_role, command_ref, command_digest, status,
        expires_at, created_at, revoked_at
      ) select 'hhiv_' || lpad(i::text,43,'0'), '${home}', '${principal}', lpad(i::text,64,'0'),
        'Synthetic guest', 'member', 'hcmd_' || lpad(i::text,43,'0'), repeat('a',64),
        case when i = 0 then 'pending' else 'revoked' end,
        '2026-09-12'::timestamptz, '2026-09-04'::timestamptz + i * interval '1 minute',
        case when i = 0 then null else '${now}'::timestamptz end
      from generate_series(0,30) i;
      insert into homesrolo_household_invitations (
        invitation_ref, home_ref, invited_by_principal_ref, invitee_email_hash,
        invitee_display_label, desired_role, command_ref, command_digest, status, expires_at, created_at
      ) values ('${ref('hhiv', 'x')}', '${otherHome}', '${principal}', repeat('c',64),
        'Other home', 'member', '${ref('hcmd', 'x')}', repeat('c',64), 'pending', '2026-09-12', '${now}');
    `)
    const rosterQuery = `select homesrolo_list_household('${principal}','${home}','${member}',1,'${now}');`
    let roster = JSON.parse(sql(rosterQuery))
    assert.equal(roster.invitations.length, 25)
    assert.equal(roster.invitations[0].invitationRef, `hhiv_${'0'.repeat(43)}`,
      'the older pending invitation survives 30 newer revoked invitations')
    assert.equal(roster.invitations.filter(row => row.status === 'revoked').length, 24)
    assert.ok(roster.invitations.every(row => row.homeRef === home))
    assert.equal(roster.members[0].isCurrentPrincipal, true)
    assert.throws(() => sql(rosterQuery.replace(principal, outsider)), /household_membership_not_authorized/)
    assert.throws(() => sql(rosterQuery.replace("',1,", "',2,")), /household_membership_not_authorized/)
    sql(`insert into homesrolo_household_invitations (
      invitation_ref, home_ref, invited_by_principal_ref, invitee_email_hash,
      invitee_display_label, desired_role, command_ref, command_digest, status, expires_at, created_at
    ) select 'hhiv_' || lpad(i::text,43,'0'), '${home}', '${principal}', lpad(i::text,64,'0'),
      'Synthetic guest', 'member', 'hcmd_' || lpad(i::text,43,'0'), repeat('a',64),
      'pending', '2026-09-12'::timestamptz, '${now}'::timestamptz
    from generate_series(31,53) i;`)
    roster = JSON.parse(sql(rosterQuery))
    assert.equal(roster.invitations.filter(row => row.status === 'pending').length, 24)
    assert.equal(roster.invitations.length, 48, 'all 24 live invitations coexist with 24 history rows')
    sql(`update homesrolo_household_invitations set expires_at='${now}' where invitation_ref='hhiv_${'0'.repeat(43)}';`)
    roster = JSON.parse(sql(rosterQuery))
    assert.equal(roster.invitations.filter(row => row.status === 'pending').length, 23,
      'expiry is projected honestly; expired rows consume history, not live capacity')

    assert.equal(sql(`select professional_display_label from homesrolo_project_invitations where invitation_ref='${invite}';`), 'Original Synthetic Roofer')
    sql(`update homesrolo_professional_organizations set display_name='Renamed Synthetic Roofer', publication_state='draft', trades=array['hvac'] where organization_ref='${org}';`)
    assert.equal(sql(`select count(*) from homesrolo_professional_organizations where publication_state='published' and 'roofing'=any(trades);`), '0')
    const list = `select coalesce(jsonb_agg(row), '[]'::jsonb) from homesrolo_list_authorized_professional_invitations('${principal}','${now}') row;`
    assert.equal(JSON.parse(sql(list))[0].professional_display_label, 'Original Synthetic Roofer',
      'unpublishing, renaming, and changing trades cannot erase private invitation identity')
    assert.deepEqual(JSON.parse(sql(list.replace(principal, outsider))), [])
    assert.throws(() => sql(`update homesrolo_project_invitations set professional_display_label='Spoofed label' where invitation_ref='${invite}';`), /invitation_company_identity_immutable/)
    assert.throws(() => sql(`update homesrolo_project_invitations set professional_organization_ref='${ref('horg', 'x')}' where invitation_ref='${invite}';`), /invitation_company_identity_immutable/)
    sql(`insert into homesrolo_project_invitations (
      invitation_ref, home_ref, project_ref, project_controller_principal_ref, invited_by_principal_ref,
      professional_organization_ref, professional_display_label, command_ref, command_digest,
      disclosure, disclosure_digest, expires_at, created_at
    ) values ('${ref('hinv', 'n')}', '${home}', '${project}', '${principal}', '${principal}', '${org}',
      'Caller-spoofed label', '${ref('hcmd', 'n')}', repeat('d',64), '{}'::jsonb, repeat('e',64), '2026-09-12', '${now}');`)
    assert.equal(sql(`select professional_display_label from homesrolo_project_invitations where invitation_ref='${ref('hinv','n')}';`), 'Renamed Synthetic Roofer',
      'new invitation labels are read from the exact organization, never the caller')
    sql(`update homesrolo_project_invitations set status='revoked', revoked_at='${now}' where invitation_ref='${invite}';`)
    assert.deepEqual(JSON.parse(sql(list)).map(row => row.invitation_ref), [ref('hinv', 'n')],
      'labels do not widen revoked invitation access')
    for (const role of ['anon', 'authenticated']) {
      assert.equal(sql(`select has_table_privilege('${role}','homesrolo_project_invitations','SELECT');`), 'f')
      assert.equal(sql(`select has_function_privilege('${role}','homesrolo_list_household(text,text,text,integer,timestamptz)','EXECUTE');`), 'f')
    }
    assert.equal(sql("select has_table_privilege('service_role','homesrolo_project_invitations','UPDATE');"), 'f')
    assert.equal(sql("select has_function_privilege('service_role','homesrolo_capture_invitation_company_label()','EXECUTE');"), 'f')
  } finally {
    if (started) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop'])
    // Only the freshly minted fixture directory is removed.
    rmSync(directory, { recursive: true, force: true })
  }
})
