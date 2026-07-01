import { redirect } from 'next/navigation'
import { LoginForm } from '@/components/admin/login-form'
import { getRole } from '@/lib/auth'

export default async function AdminLoginPage() {
  const role = await getRole()
  if (role === 'admin') {
    redirect('/admin')
  }
  if (role === 'staff') {
    redirect('/staff')
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <LoginForm />
    </main>
  )
}
