import { zodResolver } from '@hookform/resolvers/zod'
import type { FieldValues, Resolver } from 'react-hook-form'
import type { z } from 'zod'

/**
 * Wrapper type-safe attorno a zodResolver.
 *
 * Le versioni correnti di @hookform/resolvers tipizzano l'overload Zod 4
 * contro una minor di zod/core diversa da quella installata, generando un
 * falso positivo TS sul literal di versione. Il comportamento a runtime è
 * corretto: qui esponiamo un resolver tipizzato sull'output dello schema.
 */
export function typedZodResolver<TSchema extends z.ZodType>(
  schema: TSchema,
): Resolver<z.infer<TSchema> & FieldValues> {
  return zodResolver(schema as never) as Resolver<z.infer<TSchema> & FieldValues>
}
