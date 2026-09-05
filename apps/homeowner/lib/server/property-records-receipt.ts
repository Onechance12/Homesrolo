import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import {
  propertyLookupSchema, propertyReceiptSchema, samePropertyAddress,
  type PropertyAddress, type PropertyLookup,
} from '../../../../src/homeowner/property-research.v1.ts'

const payloadSchema = z.object({
  version: z.literal('property-record-receipt.v1'),
  subject: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  lookup: propertyLookupSchema,
}).strict()

/**
 * Attests source integrity only, never ownership/access. The signed draft stays
 * in memory until explicit Create. No expiration: an uncertain create retry
 * must not lose provenance; the original retrieval date remains visible.
 * Existing server HMAC root is domain-separated (as for household bindings).
 */
export class PropertyRecordsReceipt {
  readonly #key: Buffer
  constructor(rootSecret: string) {
    if (rootSecret.length < 32) throw new Error('invalid_property_receipt_configuration')
    this.#key = createHmac('sha256', rootSecret)
      .update('homesrolo-property-record-receipt-v1').digest()
  }
  #mac(value: string): string {
    return createHmac('sha256', this.#key).update(value).digest('base64url')
  }
  sign(principalRef: string, source: PropertyLookup): string {
    const lookup = propertyLookupSchema.parse(source)
    if (lookup.status !== 'matched') throw new Error('invalid_property_receipt')
    const payload = Buffer.from(JSON.stringify(payloadSchema.parse({
      version: 'property-record-receipt.v1',
      subject: this.#mac(`subject\0${principalRef}`), lookup,
    }))).toString('base64url')
    return propertyReceiptSchema.parse(`${payload}.${this.#mac(`payload\0${payload}`)}`)
  }
  verify(receipt: string, principalRef: string, address: PropertyAddress): PropertyLookup | null {
    if (!propertyReceiptSchema.safeParse(receipt).success) return null
    const [payload, signature] = receipt.split('.')
    if (!payload || !signature) return null
    const expected = this.#mac(`payload\0${payload}`)
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null
    try {
      const parsed = payloadSchema.safeParse(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')))
      if (!parsed.success || parsed.data.subject !== this.#mac(`subject\0${principalRef}`)
        || parsed.data.lookup.status !== 'matched'
        || !samePropertyAddress(address, parsed.data.lookup.address)) return null
      return parsed.data.lookup
    } catch { return null }
  }
}
