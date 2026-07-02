'use client'

import { useParams } from 'next/navigation'
import { EmbedRegistration } from '@/components/embed/embed-registration'

export default function EmbedEventPage() {
  const params = useParams<{ id: string }>()
  return <EmbedRegistration eventId={params.id} />
}
