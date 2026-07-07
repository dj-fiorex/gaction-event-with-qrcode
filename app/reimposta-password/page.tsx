import { PasswordResetCard } from '@/components/auth/password-reset-card'

type SearchParams = Promise<{
  code?: string | string[]
  email?: string | string[]
}>

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export default async function PasswordResetPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const params = await searchParams

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <PasswordResetCard
        initialCode={first(params.code) ?? null}
        initialEmail={first(params.email) ?? null}
      />
    </main>
  )
}
