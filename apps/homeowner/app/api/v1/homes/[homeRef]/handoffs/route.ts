import { handleHomeRecordHandoffHttp } from '../../../../../../lib/server/home-record-handoff-http.ts'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(
  request: Request,
  context: { params: Promise<{ homeRef: string }> },
) {
  const { homeRef } = await context.params
  return handleHomeRecordHandoffHttp(request, homeRef, { kind: 'list' })
}
