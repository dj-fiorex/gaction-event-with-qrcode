'use client'

import { useForm } from 'react-hook-form'
import { useMutation, useAction } from 'convex/react'
import { toast } from 'sonner'
import { Loader2, Trash2, UserPlus } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { staffAccountSchema, type StaffAccountInput } from '@/lib/schemas'
import { typedZodResolver } from '@/lib/zod-resolver'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface Account {
  id: Id<'users'>
  name: string | null
  email: string | null
  role: 'admin' | 'staff'
}

interface AccountManagerProps {
  accounts: Account[]
  currentUserId: Id<'users'>
}

export function AccountManager({ accounts, currentUserId }: AccountManagerProps) {
  const createStaffAccount = useAction(api.accounts.createStaffAccount)
  const setRole = useMutation(api.accounts.setRole)
  const removeAccount = useMutation(api.accounts.remove)

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<StaffAccountInput>({
    resolver: typedZodResolver(staffAccountSchema),
    defaultValues: { name: '', email: '', password: '', role: 'staff' },
  })

  const roleValue = watch('role')

  const onSubmit = handleSubmit(async (values) => {
    try {
      await createStaffAccount(values)
      toast.success(`Account ${values.email} creato`)
      reset()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Creazione non riuscita')
    }
  })

  async function handleRoleChange(userId: Id<'users'>, role: 'admin' | 'staff') {
    try {
      await setRole({ userId, role })
      toast.success('Ruolo aggiornato')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Aggiornamento non riuscito')
    }
  }

  async function handleRemove(userId: Id<'users'>, email: string | null) {
    if (!window.confirm(`Eliminare l'account ${email ?? ''}?`)) return
    try {
      await removeAccount({ userId })
      toast.success('Account eliminato')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Eliminazione non riuscita')
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Nuovo account</CardTitle>
          <CardDescription>
            Crea un account per un amministratore o un assistente. La password iniziale è
            comunicata manualmente all&apos;operatore.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Nome</Label>
              <Input id="name" {...register('name')} aria-invalid={Boolean(errors.name)} />
              {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="off"
                {...register('email')}
                aria-invalid={Boolean(errors.email)}
              />
              {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password iniziale</Label>
              <Input
                id="password"
                type="text"
                autoComplete="off"
                {...register('password')}
                aria-invalid={Boolean(errors.password)}
              />
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password.message}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="role">Ruolo</Label>
              <Select
                value={roleValue}
                onValueChange={(value) => setValue('role', value as 'admin' | 'staff')}
              >
                <SelectTrigger id="role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="staff">Assistente</SelectItem>
                  <SelectItem value="admin">Amministratore</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <UserPlus className="h-4 w-4" aria-hidden="true" />
                )}
                Crea account
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account esistenti</CardTitle>
          <CardDescription>{accounts.length} account totali.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Ruolo</TableHead>
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((account) => {
                const isSelf = account.id === currentUserId
                return (
                  <TableRow key={account.id}>
                    <TableCell className="font-medium">
                      {account.name ?? '—'}
                      {isSelf && (
                        <Badge variant="outline" className="ml-2">
                          Tu
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{account.email ?? '—'}</TableCell>
                    <TableCell>
                      <Select
                        value={account.role}
                        onValueChange={(value) =>
                          handleRoleChange(account.id, value as 'admin' | 'staff')
                        }
                        disabled={isSelf}
                      >
                        <SelectTrigger className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="staff">Assistente</SelectItem>
                          <SelectItem value="admin">Amministratore</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={isSelf}
                        onClick={() => handleRemove(account.id, account.email)}
                        aria-label={`Elimina ${account.email ?? 'account'}`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
