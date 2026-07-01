import { redirect } from 'next/navigation'
import { LoginForm } from '@/components/admin/login-form'
import { isAuthenticated } from '@/lib/auth'

export default async function AdminLoginPage() {
  if (await isAuthenticated()) {
    redirect('/admin')
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <LoginForm />
    </main>
  )
}
