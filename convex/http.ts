import { httpRouter } from 'convex/server'
import { httpAction } from './_generated/server'
import { internal } from './_generated/api'
import { auth } from './auth'

const http = httpRouter()

auth.addHttpRoutes(http)

/**
 * Configurazione di incorporamento di un Evento, consumata dal proxy Next.js
 * per impostare la CSP `frame-ancestors`. Sola lettura, nessun dato sensibile.
 */
http.route({
  path: '/embedConfig',
  method: 'GET',
  handler: httpAction(async (ctx, request) => {
    const eventId = new URL(request.url).searchParams.get('eventId') ?? ''
    const config = await ctx.runQuery(internal.events.getEmbedConfig, { eventId })
    return new Response(JSON.stringify(config), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'access-control-allow-origin': '*',
        'cache-control': 'public, max-age=30',
      },
    })
  }),
})

export default http
