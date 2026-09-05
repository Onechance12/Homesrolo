import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { emptyPropertyFacts, TARRANT_PROPERTY_SOURCE_URL } from '../src/homeowner/property-research.v1.ts'

// Explicit local integration test; never consults a connection URL, an existing
// database, or credentials. CI's normal unit pass does not need PostgreSQL.
// From the repository root:
// HOMESROLO_PROPERTY_DATABASE_TESTS=1 node --experimental-strip-types --test scripts/property-records-postgres.test.ts
const enabled = process.env.HOMESROLO_PROPERTY_DATABASE_TESTS === '1'
const migration = readFileSync(new URL('../supabase/migrations/202609050003_home_property_research.sql', import.meta.url), 'utf8')
const ref = (prefix: string, character: string) => `${prefix}_${character.repeat(43)}`
const principal = ref('hprn', 'p')
const adult = ref('hprn', 'a')
const viewer = ref('hprn', 'v')
const outsider = ref('hprn', 'o')
const home = ref('hhom', 'h')
const otherHome = ref('hhom', 'x')
const command = ref('hcmd', 'c')
const address = { line1: '123 Synthetic Lane', line2: null, city: 'Fort Worth', regionCode: 'TX', postalCode: '76102', countryCode: 'US' }
const facts = { ...emptyPropertyFacts(), squareFeet: 1800, bedrooms: 3, bathrooms: 2.5 }
const quoted = (value: string) => `'${value.replace(/'/g, "''")}'`
const json = (value: unknown) => `${quoted(JSON.stringify(value))}::jsonb`

test('property RPCs enforce private immutable snapshots and atomic shared quotas in real PostgreSQL', {
  skip: !enabled, timeout: 60_000,
}, async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'homesrolo-property-pg-'))
  const data = path.join(directory, 'data')
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, NODE_ENV: 'test', LC_ALL: 'C', PGPASSFILE: path.join(directory, 'no-credentials') }
  const args = ['-X', '-w', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', directory, '-p', '55439', '-U', 'postgres', '-d', 'postgres']
  let started = false
  function run(binary: string, binaryArgs: string[], input?: string) {
    const result = spawnSync(binary, binaryArgs, { env, input, encoding: 'utf8', timeout: 30_000 })
    assert.equal(result.status, 0, `${binary} failed: ${result.error?.message ?? ''}\n${result.stderr}`)
    return result.stdout.trim()
  }
  const sql = (statement: string) => run('psql', args, statement)
  function rejects(statement: string, expected: RegExp) {
    const result = spawnSync('psql', args, { env, input: statement, encoding: 'utf8', timeout: 10_000 })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, expected)
  }
  function parallelSql(statement: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn('psql', args, { env, stdio: ['pipe', 'pipe', 'pipe'] })
      let output = ''; let errors = ''
      child.stdout.setEncoding('utf8').on('data', (chunk: string) => { output += chunk })
      child.stderr.setEncoding('utf8').on('data', (chunk: string) => { errors += chunk })
      child.on('error', reject)
      child.on('close', status => status === 0 ? resolve(output.trim()) : reject(new Error(errors)))
      child.stdin.end(statement)
    })
  }
  try {
    run('initdb', ['-D', data, '--auth=trust', '--no-locale', '--encoding=UTF8', '-U', 'postgres'])
    run('pg_ctl', ['-D', data, '-l', path.join(directory, 'postgres.log'), '-w', 'start', '-o', `-F -k ${directory} -h '' -p 55439`])
    started = true
    sql(`
      create role anon; create role authenticated; create role service_role;
      create table public.homesrolo_homeowner_principals (principal_ref text primary key, status text, email_verified boolean);
      create table public.homesrolo_private_homes (
        home_ref text primary key, address_line_1 text, address_line_2 text, address_city text,
        address_region_code text, address_postal_code text, address_country_code text
      );
      create table public.homesrolo_homeowner_memberships (
        membership_ref text primary key, principal_ref text, home_ref text, role text, state text, revision integer,
        unique(principal_ref, home_ref)
      );
      insert into public.homesrolo_homeowner_principals values
        ('${principal}', 'active', true), ('${adult}', 'active', true), ('${viewer}', 'active', true), ('${outsider}', 'active', true);
      insert into public.homesrolo_private_homes values
        ('${home}', '123 Synthetic Lane', null, 'Fort Worth', 'TX', '76102', 'US'),
        ('${otherHome}', '123 Synthetic Lane', null, 'Fort Worth', 'TX', '76102', 'US');
      insert into public.homesrolo_homeowner_memberships values
        ('${ref('hmbr', 'p')}', '${principal}', '${home}', 'workspace_controller', 'active', 1),
        ('${ref('hmbr', 'a')}', '${adult}', '${home}', 'member', 'active', 1),
        ('${ref('hmbr', 'v')}', '${viewer}', '${home}', 'viewer', 'active', 1),
        ('${ref('hmbr', 'x')}', '${principal}', '${otherHome}', 'workspace_controller', 'active', 1);
    `)
    sql(migration)
    const now = new Date(Date.now() - 1000).toISOString()
    const lookup = {
      version: 'property-lookup.v1', status: 'matched', address, matchedAddress: '123 SYNTHETIC LN FORT WORTH TX',
      county: { name: 'Tarrant County', fips: '48439' }, retrievedAt: now,
      source: { id: 'tarrant_county', title: 'Tarrant County appraisal parcels', url: TARRANT_PROPERTY_SOURCE_URL, parcelId: '1234567', recordDate: null },
      facts: { ...facts, squareFeet: 1700 }, notes: ['Public records may lag later work.'],
    }
    function save(overrides: {
      actor?: string; target?: string; commandRef?: string; digest?: string;
      reviewedAddress?: unknown; reviewedFacts?: unknown; originalLookup?: unknown; time?: string;
    } = {}) {
      return `set role service_role; select public.homesrolo_save_property_snapshot(
        '${overrides.actor ?? principal}', '${overrides.target ?? home}', '${overrides.commandRef ?? command}',
        '${overrides.digest ?? 'a'.repeat(64)}', ${json(overrides.reviewedAddress ?? address)},
        ${json(overrides.reviewedFacts ?? facts)}, ${json('originalLookup' in overrides ? overrides.originalLookup : lookup)}, '${overrides.time ?? now}');`
    }
    const read = (actor = principal, target = home) => `set role service_role; select public.homesrolo_read_property_snapshot('${actor}', '${target}');`

    // No browser or service-role direct table access; only explicitly granted RPCs.
    for (const role of ['anon', 'authenticated', 'service_role']) {
      rejects(`set role ${role}; select * from public.homesrolo_home_property_snapshots;`, /permission denied/)
    }
    for (const role of ['anon', 'authenticated']) {
      rejects(`set role ${role}; select public.homesrolo_consume_property_lookup('${principal}');`, /permission denied/)
    }
    assert.equal(sql(read()), '')
    for (const actor of [adult, viewer, outsider]) rejects(save({ actor }), /property_not_authorized/)
    rejects(save({ reviewedAddress: { ...address, line2: 'Unit 2' }, originalLookup: null }), /property_address_mismatch/)
    rejects(save({ reviewedFacts: { ...facts, bedrooms: 3.5 } }), /property_invalid_snapshot/)
    rejects(save({ reviewedFacts: { ...facts, bathrooms: 2.1 } }), /property_invalid_snapshot/)
    rejects(save({ originalLookup: { ...lookup, address: { ...address, line1: '456 Different Street' } } }), /property_invalid_snapshot/)
    rejects(save({ originalLookup: { ...lookup, source: { ...lookup.source, url: 'https://evil.example/parcel' } } }), /property_invalid_snapshot/)
    rejects(save({ originalLookup: { ...lookup, retrievedAt: '2026-99-99T12:00:00.000Z' } }), /property_invalid_snapshot/)
    assert.equal(sql('select count(*) from public.homesrolo_home_property_snapshots;'), '0')
    assert.equal(sql('select count(*) from public.homesrolo_home_property_receipts;'), '0')
    const saved = JSON.parse(sql(save()))
    assert.equal(saved.facts.squareFeet, 1800)
    assert.equal(saved.lookup.facts.squareFeet, 1700, 'original source is not overwritten by a homeowner correction')
    assert.equal(saved.reviewedAt, now)
    assert.deepEqual(JSON.parse(sql(read(adult))), saved)
    for (const actor of [viewer, outsider]) rejects(read(actor), /property_not_authorized/)
    assert.deepEqual(JSON.parse(sql(save({ time: new Date().toISOString() }))), saved)
    rejects(save({ digest: 'b'.repeat(64) }), /property_command_conflict/)
    rejects(save({ reviewedFacts: { ...facts, squareFeet: 1900 } }), /property_command_conflict/)
    rejects(save({ target: otherHome }), /property_command_conflict/)
    rejects(save({ commandRef: ref('hcmd', 'd') }), /property_snapshot_exists/)
    assert.equal(sql('select count(*) from public.homesrolo_home_property_receipts;'), '1')

    // If receipt insertion fails after snapshot insertion, the entire RPC
    // transaction rolls back. A retry may then save exactly once.
    sql(`create function public.synthetic_property_receipt_failure() returns trigger language plpgsql as $$
      begin raise exception 'synthetic_receipt_failure'; end; $$;
      create trigger synthetic_property_receipt_failure before insert on public.homesrolo_home_property_receipts
      for each row execute function public.synthetic_property_receipt_failure();`)
    rejects(save({ target: otherHome, commandRef: ref('hcmd', 'e'), originalLookup: null }), /synthetic_receipt_failure/)
    assert.equal(sql(`select count(*) from public.homesrolo_home_property_snapshots where home_ref = '${otherHome}';`), '0')
    sql('drop trigger synthetic_property_receipt_failure on public.homesrolo_home_property_receipts; drop function public.synthetic_property_receipt_failure();')

    // A later address edit and revoked membership both block receipt replay.
    sql(`update public.homesrolo_private_homes set address_line_1 = '456 Different Street' where home_ref = '${home}';`)
    rejects(save(), /property_address_mismatch/)
    const historical = JSON.parse(sql(read()))
    assert.deepEqual(historical.address, address, 'the original snapshot keeps its original address for the UI mismatch warning')
    assert.deepEqual(historical.facts, saved.facts, 'immutable historical facts are not relabeled or overwritten by an address edit')
    assert.equal(sql('select count(*) from public.homesrolo_home_property_snapshots;'), '1', 'the original snapshot remains immutable')
    sql(`update public.homesrolo_private_homes set address_line_1 = '123 Synthetic Lane' where home_ref = '${home}';
      update public.homesrolo_homeowner_memberships set state = 'revoked', revision = 2 where principal_ref = '${principal}' and home_ref = '${home}';`)
    rejects(save(), /property_not_authorized/)
    rejects(read(), /property_not_authorized/)
    sql(`update public.homesrolo_homeowner_memberships set state = 'active', revision = 3 where principal_ref = '${principal}' and home_ref = '${home}';
      update public.homesrolo_homeowner_principals set email_verified = false where principal_ref = '${principal}';`)
    rejects(save(), /property_not_authorized/)
    rejects(read(), /property_not_authorized/)
    rejects(`set role service_role; select public.homesrolo_consume_property_lookup('${principal}');`, /property_not_authorized/)
    sql(`update public.homesrolo_homeowner_principals set email_verified = true where principal_ref = '${principal}';`)

    // Concurrent independent clients must share a single principal allowance.
    const concurrent = await Promise.all(Array.from({ length: 16 }, () => parallelSql(
      `set role service_role; select public.homesrolo_consume_property_lookup('${principal}');`,
    )))
    assert.equal(concurrent.filter(value => value === 't').length, 8)
    assert.equal(concurrent.filter(value => value === 'f').length, 8)
    assert.equal(sql("select used_count from public.homesrolo_property_lookup_limits where scope_key = 'global';"), '8')
    assert.equal(sql('select count(*) from public.homesrolo_home_property_snapshots;'), '1', 'lookup never creates a home snapshot')
    assert.equal(sql('select count(*) from public.homesrolo_private_homes;'), '2', 'lookup never creates a home')
    sql("update public.homesrolo_property_lookup_limits set window_started_at = clock_timestamp() - interval '11 minutes';")
    assert.equal(sql(`set role service_role; select public.homesrolo_consume_property_lookup('${principal}');`), 't')
    assert.equal(sql("select used_count from public.homesrolo_property_lookup_limits where scope_key = 'global';"), '1')
    sql("update public.homesrolo_property_lookup_limits set used_count = 999 where scope_key = 'global';")
    const globalRace = await Promise.all([adult, outsider].map(actor => parallelSql(
      `set role service_role; select public.homesrolo_consume_property_lookup('${actor}');`,
    )))
    assert.deepEqual(globalRace.sort(), ['f', 't'])
    assert.equal(sql("select used_count from public.homesrolo_property_lookup_limits where scope_key = 'global';"), '1000')

    // Snapshot/receipt deletion follows the exact home cascade only.
    sql(`delete from public.homesrolo_private_homes where home_ref = '${home}';`)
    assert.equal(sql('select count(*) from public.homesrolo_home_property_snapshots;'), '0')
    assert.equal(sql('select count(*) from public.homesrolo_home_property_receipts;'), '0')
  } finally {
    if (started) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop'])
    // Only the exact disposable cluster created by this test is removed.
    rmSync(directory, { recursive: true, force: true })
  }
})
