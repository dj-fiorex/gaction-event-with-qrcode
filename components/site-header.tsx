import Link from 'next/link'
import { CalendarDays } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function SiteHeader() {
  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <CalendarDays className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="text-lg font-semibold tracking-tight">Eventi Aziendali</span>
        </Link>
        <Button
          variant="ghost"
          size="sm"
          render={<Link href="/admin">Area riservata</Link>}
        />
      </div>
    </header>
  )
}
