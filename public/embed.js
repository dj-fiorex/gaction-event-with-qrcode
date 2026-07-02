(function () {
  'use strict'

  var RESIZE_MESSAGE = 'gaction:embed-height'
  var PROCESSED_ATTR = 'data-gaction-embed-processed'

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

  // Inserisce l'iframe subito dopo lo script (o in un contenitore indicato).
  var targetSelector = script.getAttribute('data-target')
  var mount = targetSelector ? document.querySelector(targetSelector) : null
  if (mount) {
    mount.appendChild(iframe)
  } else if (script.parentNode) {
    script.parentNode.insertBefore(iframe, script.nextSibling)
  } else {
    document.body.appendChild(iframe)
  }

  window.addEventListener('message', function (event) {
    if (event.source !== iframe.contentWindow) return
    var data = event.data
    if (!data || data.type !== RESIZE_MESSAGE || data.eventId !== eventId) return
    var height = Number(data.height)
    if (Number.isFinite(height) && height > 0) {
      iframe.style.height = Math.ceil(height) + 'px'
    }
  })
})()
