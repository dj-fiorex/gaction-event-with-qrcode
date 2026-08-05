(function () {
  'use strict'

  var RESIZE_MESSAGE = 'gaction:embed-height'
  var PROCESSED_ATTR = 'data-gaction-embed-processed'
  var HEALTH_CHECK_MS = 5000

  // `document.currentScript` è null per gli script `async`/`defer`: in tal caso
  // si individua il tag di incorporamento non ancora elaborato tramite l'attributo
  // `data-event-id`. Così ogni snippet viene montato una sola volta.
  function resolveScript() {
    var current = document.currentScript
    if (current && current.getAttribute('data-event-id')) return current
    var candidates = document.querySelectorAll('script[data-event-id]:not([' + PROCESSED_ATTR + '])')
    return candidates.length > 0 ? candidates[candidates.length - 1] : null
  }

  var script = resolveScript()
  if (!script) return
  script.setAttribute(PROCESSED_ATTR, 'true')

  var eventId = script.getAttribute('data-event-id')
  if (!eventId) {
    console.error('[gaction-embed] Attributo data-event-id mancante sullo script di incorporamento.')
    return
  }

  // Base URL: esplicita (data-base-url) o derivata dall'origine dello script.
  var baseUrl = script.getAttribute('data-base-url')
  if (!baseUrl) {
    try {
      baseUrl = new URL(script.src).origin
    } catch (err) {
      console.error('[gaction-embed] Impossibile determinare la base URL.', err)
      return
    }
  }
  baseUrl = baseUrl.replace(/\/+$/, '')

  var iframe = document.createElement('iframe')
  iframe.src = baseUrl + '/embed/eventi/' + encodeURIComponent(eventId)
  iframe.setAttribute('title', 'Registrazione evento')
  iframe.setAttribute('loading', 'lazy')
  iframe.style.width = '100%'
  iframe.style.border = '0'
  iframe.style.display = 'block'
  iframe.style.height = script.getAttribute('data-initial-height') || '520px'
  iframe.style.colorScheme = 'normal'

  // Aggiunge il nodo in fondo a `<body>`, attendendo la fine del parsing quando
  // serve: con uno script `async` il `<body>` può non esistere ancora, e «in
  // fondo al body» equivarrebbe a «in fondo a quanto analizzato finora», cioè a
  // una posizione non deterministica.
  function appendToBody(node) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        document.body.appendChild(node)
      })
      return
    }
    document.body.appendChild(node)
  }

  // Inserisce l'iframe subito dopo lo script (o in un contenitore indicato).
  //
  // I costruttori di siti (Wix, Squarespace…) servono lo snippet come frammento
  // «nudo», privo di `<html>`/`<body>`: il parser colloca allora lo `<script>`
  // in `<head>`, dove un iframe non riceve alcun box di layout (0×0) e con
  // `loading="lazy"` non viene mai nemmeno richiesto — il widget resta vuoto, in
  // silenzio. Fuori dal `<body>` non esiste un «qui» accanto a cui inserire: si
  // ripiega quindi in fondo al documento.
  var targetSelector = script.getAttribute('data-target')
  var mount = targetSelector ? document.querySelector(targetSelector) : null
  if (mount) {
    mount.appendChild(iframe)
  } else if (document.body && document.body.contains(script)) {
    script.parentNode.insertBefore(iframe, script.nextSibling)
  } else {
    appendToBody(iframe)
  }

  var alive = false

  window.addEventListener('message', function (event) {
    if (event.source !== iframe.contentWindow) return
    var data = event.data
    if (!data || data.type !== RESIZE_MESSAGE || data.eventId !== eventId) return
    alive = true
    var height = Number(data.height)
    if (Number.isFinite(height) && height > 0) {
      iframe.style.height = Math.ceil(height) + 'px'
    }
  })

  // Un iframe bloccato dalla CSP emette comunque `load`: l'unica prova di vita
  // affidabile è il primo messaggio di altezza, che la pagina incorporata invia
  // già durante il caricamento, senza attendere i dati dell'Evento. Se non
  // arriva, quasi sempre l'origine di questa pagina non è fra le Origini
  // Autorizzate dell'Evento e `frame-ancestors` ha rifiutato il rendering.
  //
  // L'errore compare nella console del documento che ospita lo snippet: nei
  // costruttori di siti è un iframe annidato, quindi va selezionato il contesto
  // corrispondente nei devtools (in Wix: `htmlComp-iframe`).
  setTimeout(function () {
    if (alive) return
    console.error(
      "[gaction-embed] Nessuna risposta dall'iframe entro " +
        HEALTH_CHECK_MS +
        "ms per l'evento " +
        eventId +
        '. Verifica che questa origine sia fra le origini autorizzate: ' +
        window.location.origin
    )
  }, HEALTH_CHECK_MS)
})()
