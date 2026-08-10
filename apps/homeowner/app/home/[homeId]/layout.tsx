'use client'

import { use } from 'react'
import { AppShell } from '../../../components/AppShell.tsx'

export default function HomeScopedLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ homeId: string }>
}) {
  const { homeId } = use(params)
  return <AppShell homeId={homeId}>{children}</AppShell>
}
