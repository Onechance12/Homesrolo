import { handleHomeProperty } from '../../../../../../lib/server/property-records-http.ts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
type Context = { params: Promise<{ homeRef: string }> }
export async function GET(request: Request, context: Context) {
  return handleHomeProperty(request, (await context.params).homeRef)
}
export async function POST(request: Request, context: Context) {
  return handleHomeProperty(request, (await context.params).homeRef)
}
