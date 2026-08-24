import { redirect } from 'next/navigation'

/** Compatibility for old care links while the primary product stays on working records. */
export default async function TimelineCompatibilityPage({
  params,
}: {
  params: Promise<{ homeId: string }>
}) {
  const { homeId } = await params
  redirect(`/home/${homeId}`)
}
