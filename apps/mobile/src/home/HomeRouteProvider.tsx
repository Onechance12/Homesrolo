import { createContext, type ReactNode, useContext } from 'react'

const HomeRouteContext = createContext<string | null>(null)

export function HomeRouteProvider({ children, homeId }: {
  readonly children: ReactNode
  readonly homeId: string
}) {
  return <HomeRouteContext.Provider value={homeId}>{children}</HomeRouteContext.Provider>
}

export function useHomeId(): string {
  const homeId = useContext(HomeRouteContext)
  if (!homeId) throw new Error('HomeRouteProvider is required')
  return homeId
}
