import { createHash, randomBytes } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { HomeownerApiError } from '../../../../src/homeowner/homeowner-api.v1.ts'
import {
  HOMEOWNER_RUNTIME_VERSION,
  homeownerMembershipSchema,
  homeownerPrincipalSchema,
  homeownerProjectSchema,
  homeownerPropertyFactsSchema,
  homeownerSystemSchema,
  privateHomeProfileSchema,
  type AuthorizedHomeownerPrincipal,
  type AuthorizedHomeownerWorkspace,
  type HomeownerCommandPort,
  type HomeownerIdentityPort,
  type HomeownerMembership,
  type HomeownerPrincipal,
  type HomeownerProject,
  type HomeownerRepositoryPort,
  type HomeownerSystem,
  type PrivateHomeProfile,
} from '../../../../src/homeowner/homeowner-runtime.v1.ts'
import type { HomeownerRuntimeConfiguration } from './config.ts'

type JsonRecord = Record<string, unknown>

function record(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HomeownerApiError('unavailable')
  }
  return value as JsonRecord
}

function requiredString(row: JsonRecord, key: string): string {
  const value = row[key]
  if (typeof value !== 'string') throw new HomeownerApiError('unavailable')
  return value
}

function nullableString(row: JsonRecord, key: string): string | null {
  const value = row[key]
  if (value === null) return null
  if (typeof value !== 'string') throw new HomeownerApiError('unavailable')
  return value
}

function requiredNumber(row: JsonRecord, key: string): number {
  const value = row[key]
  if (typeof value !== 'number') throw new HomeownerApiError('unavailable')
  return value
}

function canonicalInstant(row: JsonRecord, key: string): string {
  const value = requiredString(row, key)
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new HomeownerApiError('unavailable')
  return date.toISOString()
}

function approximateYear(row: JsonRecord, valueKey: string, precisionKey: string) {
  const value = row[valueKey]
  const precision = row[precisionKey]
  if (value === null && precision === null) return null
  if (typeof value !== 'number' || (precision !== 'exact' && precision !== 'approximate')) {
    throw new HomeownerApiError('unavailable')
  }
  return { value, precision }
}

function principalFromRow(input: unknown): HomeownerPrincipal {
  const row = record(input)
  return homeownerPrincipalSchema.parse({
    principalRef: requiredString(row, 'principal_ref'),
    status: requiredString(row, 'status'),
    emailVerified: row.email_verified,
    sessionVersion: requiredNumber(row, 'session_version'),
  })
}

function membershipFromRow(input: unknown): HomeownerMembership {
  const row = record(input)
  return homeownerMembershipSchema.parse({
    membershipRef: requiredString(row, 'membership_ref'),
    principalRef: requiredString(row, 'principal_ref'),
    homeRef: requiredString(row, 'home_ref'),
    role: requiredString(row, 'role'),
    basis: requiredString(row, 'basis'),
    state: requiredString(row, 'state'),
    relationshipLabel: requiredString(row, 'relationship_label'),
    revision: requiredNumber(row, 'revision'),
    createdAt: canonicalInstant(row, 'created_at'),
    ...(row.revoked_at === null ? {} : { revokedAt: canonicalInstant(row, 'revoked_at') }),
  })
}

function homeFromRow(input: unknown): PrivateHomeProfile {
  const row = record(input)
  return privateHomeProfileSchema.parse({
    recordVersion: HOMEOWNER_RUNTIME_VERSION,
    homeRef: requiredString(row, 'home_ref'),
    createdByPrincipalRef: requiredString(row, 'created_by_principal_ref'),
    displayLabel: requiredString(row, 'display_label'),
    privateLocationLabel: requiredString(row, 'private_location_label'),
    createdAt: canonicalInstant(row, 'created_at'),
    updatedAt: canonicalInstant(row, 'updated_at'),
  })
}

function propertyFactsFromRow(input: unknown) {
  const row = record(input)
  return homeownerPropertyFactsSchema.parse({
    recordVersion: HOMEOWNER_RUNTIME_VERSION,
    propertyFactsRef: requiredString(row, 'property_facts_ref'),
    homeRef: requiredString(row, 'home_ref'),
    controllerPrincipalRef: requiredString(row, 'controller_principal_ref'),
    homeType: requiredString(row, 'home_type'),
    yearBuilt: approximateYear(row, 'year_built_value', 'year_built_precision'),
    source: requiredString(row, 'source'),
    revision: requiredNumber(row, 'revision'),
    createdAt: canonicalInstant(row, 'created_at'),
    updatedAt: canonicalInstant(row, 'updated_at'),
  })
}

function systemFromRow(input: unknown): HomeownerSystem {
  const row = record(input)
  return homeownerSystemSchema.parse({
    recordVersion: HOMEOWNER_RUNTIME_VERSION,
    systemRef: requiredString(row, 'system_ref'),
    homeRef: requiredString(row, 'home_ref'),
    controllerPrincipalRef: requiredString(row, 'controller_principal_ref'),
    kind: requiredString(row, 'kind'),
    present: requiredString(row, 'present'),
    installedOrReplacedYear: approximateYear(
      row,
      'installed_or_replaced_year_value',
      'installed_or_replaced_year_precision',
    ),
    source: requiredString(row, 'source'),
    revision: requiredNumber(row, 'revision'),
    createdAt: canonicalInstant(row, 'created_at'),
    updatedAt: canonicalInstant(row, 'updated_at'),
  })
}

function projectFromRow(input: unknown): HomeownerProject {
  const row = record(input)
  return homeownerProjectSchema.parse({
    recordVersion: HOMEOWNER_RUNTIME_VERSION,
    projectRef: requiredString(row, 'project_ref'),
    homeRef: requiredString(row, 'home_ref'),
    controllerPrincipalRef: requiredString(row, 'controller_principal_ref'),
    title: requiredString(row, 'title'),
    category: requiredString(row, 'category'),
    status: requiredString(row, 'status'),
    ...(row.occurred_on === null ? {} : { occurredOn: requiredString(row, 'occurred_on') }),
    ...(row.summary === null ? {} : { summary: requiredString(row, 'summary') }),
    createdAt: canonicalInstant(row, 'created_at'),
    updatedAt: canonicalInstant(row, 'updated_at'),
  })
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  const row = value as Record<string, unknown>
  return `{${Object.keys(row).sort().map(key => `${JSON.stringify(key)}:${stableJson(row[key])}`).join(',')}}`
}

function digest(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex')
}

export function hashSessionHandle(handle: string): string {
  return createHash('sha256').update(handle, 'utf8').digest('hex')
}

export function mintOpaqueRef(prefix: string): string {
  return `${prefix}_${randomBytes(32).toString('base64url')}`
}

export function createSupabaseClients(configuration: HomeownerRuntimeConfiguration) {
  const common = {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  } as const
  return {
    auth: createClient(configuration.supabaseUrl, configuration.publishableKey, common),
    service: createClient(configuration.supabaseUrl, configuration.secretKey, common),
  }
}

/** One server-only adapter implements identity, exact-home reads, and commands. */
export class SupabaseHomeownerProvider implements
  HomeownerIdentityPort, HomeownerRepositoryPort, HomeownerCommandPort {
  readonly #client: SupabaseClient
  readonly #now: () => string

  constructor(client: SupabaseClient, now: () => string = () => new Date().toISOString()) {
    this.#client = client
    this.#now = now
  }

  async resolvePrincipal(sessionHandle: string): Promise<HomeownerPrincipal | null> {
    const { data, error } = await this.#client.rpc('homesrolo_resolve_homeowner_principal', {
      p_session_hash: hashSessionHandle(sessionHandle),
      p_now: this.#now(),
    })
    if (error) throw new HomeownerApiError('unavailable')
    if (data === null) return null
    try { return principalFromRow(data) } catch { return null }
  }

  async listMemberships(authorization: AuthorizedHomeownerPrincipal) {
    const { data, error } = await this.#client
      .from('homesrolo_homeowner_memberships')
      .select('*')
      .eq('principal_ref', authorization.principalRef)
      .eq('state', 'active')
      .order('created_at', { ascending: true })
    if (error || !Array.isArray(data)) throw new HomeownerApiError('unavailable')
    return data.map(membershipFromRow)
  }

  async readMembership(principalRef: string, homeRef: string) {
    const { data, error } = await this.#client
      .from('homesrolo_homeowner_memberships')
      .select('*')
      .eq('principal_ref', principalRef)
      .eq('home_ref', homeRef)
      .maybeSingle()
    if (error) throw new HomeownerApiError('unavailable')
    return data === null ? null : membershipFromRow(data)
  }

  async readHome(grant: AuthorizedHomeownerWorkspace) {
    const { data, error } = await this.#client
      .from('homesrolo_private_homes')
      .select('*')
      .eq('home_ref', grant.homeRef)
      .maybeSingle()
    if (error) throw new HomeownerApiError('unavailable')
    return data === null ? null : homeFromRow(data)
  }

  async readPropertyFacts(grant: AuthorizedHomeownerWorkspace) {
    const { data, error } = await this.#client
      .from('homesrolo_homeowner_property_facts')
      .select('*')
      .eq('home_ref', grant.homeRef)
      .maybeSingle()
    if (error) throw new HomeownerApiError('unavailable')
    return data === null ? null : propertyFactsFromRow(data)
  }

  async listSystems(grant: AuthorizedHomeownerWorkspace) {
    const { data, error } = await this.#client
      .from('homesrolo_homeowner_systems')
      .select('*')
      .eq('home_ref', grant.homeRef)
      .order('kind', { ascending: true })
    if (error || !Array.isArray(data)) throw new HomeownerApiError('unavailable')
    return data.map(systemFromRow)
  }

  async listProjects(grant: AuthorizedHomeownerWorkspace) {
    const { data, error } = await this.#client
      .from('homesrolo_homeowner_projects')
      .select('*')
      .eq('home_ref', grant.homeRef)
      .order('updated_at', { ascending: false })
    if (error || !Array.isArray(data)) throw new HomeownerApiError('unavailable')
    return data.map(projectFromRow)
  }
  async listArtifactMetadata() { return [] }
  async listWarranties() { return [] }
  async listMaintenance() { return [] }

  async createPrivateHomeWorkspace(input: Parameters<HomeownerCommandPort['createPrivateHomeWorkspace']>[0]) {
    const homeRef = mintOpaqueRef('hhom')
    const membershipRef = mintOpaqueRef('hmbr')
    const { data, error } = await this.#client.rpc('homesrolo_create_private_home_workspace', {
      p_principal_ref: input.authorization.principalRef,
      p_command_ref: input.command.commandRef,
      p_command_digest: digest(input.command),
      p_home_ref: homeRef,
      p_membership_ref: membershipRef,
      p_display_label: input.command.displayLabel,
      p_private_location_label: input.command.privateLocationLabel,
      p_requested_at: input.command.requestedAt,
    })
    if (error) throw new HomeownerApiError('unavailable')
    const result = record(data)
    return { home: homeFromRow(result.home), membership: membershipFromRow(result.membership) }
  }

  async createProject(input: Parameters<HomeownerCommandPort['createProject']>[0]) {
    const projectRef = mintOpaqueRef('hprj')
    const { data, error } = await this.#client.rpc('homesrolo_create_homeowner_roofing_project', {
      p_principal_ref: input.grant.principalRef,
      p_home_ref: input.grant.homeRef,
      p_membership_ref: input.grant.membershipRef,
      p_membership_revision: input.grant.membershipRevision,
      p_command_ref: input.command.commandRef,
      p_command_digest: digest(input.command),
      p_project_ref: projectRef,
      p_title: input.command.title,
      p_summary: input.command.summary ?? '',
      p_requested_at: input.command.requestedAt,
    })
    if (error) throw new HomeownerApiError('unavailable')
    return projectFromRow(data)
  }

  async recordInitialIntake(input: Parameters<HomeownerCommandPort['recordInitialIntake']>[0]) {
    const propertyFactsRef = mintOpaqueRef('hfac')
    const systems = input.command.systems.map(system => ({
      ...system,
      systemRef: mintOpaqueRef('hsys'),
    }))
    const { data, error } = await this.#client.rpc('homesrolo_record_initial_intake', {
      p_principal_ref: input.grant.principalRef,
      p_home_ref: input.grant.homeRef,
      p_membership_ref: input.grant.membershipRef,
      p_membership_revision: input.grant.membershipRevision,
      p_command_ref: input.command.commandRef,
      p_command_digest: digest(input.command),
      p_property_facts_ref: propertyFactsRef,
      p_home_type: input.command.homeType,
      p_year_built_value: input.command.yearBuilt?.value ?? null,
      p_year_built_precision: input.command.yearBuilt?.precision ?? null,
      p_systems: systems.map(system => ({
        system_ref: system.systemRef,
        kind: system.kind,
        present: system.present,
        installed_or_replaced_year_value: system.installedOrReplacedYear?.value ?? null,
        installed_or_replaced_year_precision: system.installedOrReplacedYear?.precision ?? null,
      })),
      p_requested_at: input.command.requestedAt,
    })
    if (error) throw new HomeownerApiError('unavailable')
    const result = record(data)
    if (!Array.isArray(result.systems)) throw new HomeownerApiError('unavailable')
    return {
      propertyFacts: propertyFactsFromRow(result.property_facts),
      systems: result.systems.map(systemFromRow),
    }
  }
}

export function databaseValueForTesting(value: unknown) {
  return {
    principalFromRow,
    membershipFromRow,
    homeFromRow,
    propertyFactsFromRow,
    systemFromRow,
    stableJson: stableJson(value),
    nullableString,
  }
}
