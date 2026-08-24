import { redirect } from 'next/navigation'

/** Compatibility for old warranty links; saved files remain under Home record. */
export default async function WarrantiesCompatibilityPage({
  params,
}: {
  params: Promise<{ homeId: string }>
}) {
  const { homeId } = await params
  redirect(`/home/${homeId}/documents`)
}
