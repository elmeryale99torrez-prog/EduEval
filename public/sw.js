const VERSION = 'edueval-shell-v8'

self.addEventListener('install', (event) => {
  self.skipWaiting()
  const base = self.registration.scope
  const shell = [
    base,
    `${base}index.html`,
    `${base}manifest.webmanifest`,
    `${base}icon-192.png`,
    `${base}icon-512.png`,
    `${base}icon-maskable-512.png`,
    `${base}apple-touch-icon.png`,
    `${base}icon.svg`,
    `${base}icon-maskable.svg`,
  ]
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(shell)),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))),
    ).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (
    url.origin !== self.location.origin ||
    url.pathname.includes('/rest/') ||
    url.pathname.includes('/auth/') ||
    url.pathname.includes('/functions/')
  ) {
    return
  }

  // Si es un icono o manifiesto, priorizar red para reflejar cambios inmediatos
  if (url.pathname.endsWith('.png') || url.pathname.endsWith('.svg') || url.pathname.endsWith('.webmanifest')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            void caches.open(VERSION).then((cache) => cache.put(request, copy))
          }
          return response
        })
        .catch(() => caches.match(request)),
    )
    return
  }

  if (request.mode === 'navigate') {
    const base = self.registration.scope
    const indexUrl = `${base}index.html`
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          void caches.open(VERSION).then((cache) => cache.put(indexUrl, copy))
          return response
        })
        .catch(() => caches.match(indexUrl)),
    )
    return
  }

  event.respondWith(
    caches.match(request).then((cached) => cached ?? fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone()
        void caches.open(VERSION).then((cache) => cache.put(request, copy))
      }
      return response
    })),
  )
})
