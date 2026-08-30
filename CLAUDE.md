<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

<!-- BEGIN:nextjs-agent-rules -->
 
# Next.js: ALWAYS read docs before coding
 
Before any Next.js work, find and read the relevant doc in `node_modules/next/dist/docs/`. Your training data is outdated — the docs are the source of truth.
 
<!-- END:nextjs-agent-rules -->

# Convex: errori mostrati all'utente

In `convex/`, solleva sempre `ConvexError(messaggio)`, mai `Error`: i messaggi
di un `Error` semplice sono oscurati in «Server Error» nei deployment di
produzione, quindi in prod l'utente non leggerebbe nulla. Solo `data` di un
`ConvexError` arriva al client in dev e in produzione.

Sul client non leggere mai `error.message` — il client Convex lo costruisce
come `[CONVEX M(path)] ... Called by client`, anche per un `ConvexError`. Usa
`messageFromError(error, fallback)` da `@/lib/errors`, che legge `error.data`.
