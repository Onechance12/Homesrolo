import { handleHomeRecordHandoffHttp } from '../../../../../../../../lib/server/home-record-handoff-http.ts'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(
  request: Request,
  context: { params: Promise<{ homeRef: string; shareId: string }> },
) {
  const { homeRef, shareId } = await context.params
  return handleHomeRecordHandoffHttp(request, homeRef, { kind: 'accept', shareId })
}
