/**
 * FieldSync Service Worker
 * Handles asset caching for offline functionality
 */

const CACHE_NAME = 'fieldsync-v8'
const ASSETS_TO_CACHE = [
  '/',
  '/index.html'
]

// Install - cache core assets and skip waiting to activate immediately
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...')
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching core assets')
        return cache.addAll(ASSETS_TO_CACHE)
      })
      .then(() => self.skipWaiting())
  )
})

// Activate - clean up ALL old caches and claim clients immediately
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...')
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => {
              console.log('[SW] Deleting old cache:', name)
              return caches.delete(name)
            })
        )
      })
      .then(() => self.clients.claim())
      .then(() => {
        // Notify all clients to reload for fresh assets
        self.clients.matchAll().then((clients) => {
          clients.forEach((client) => {
            client.postMessage({ type: 'SW_UPDATED' })
          })
        })
      })
  )
})

// Fetch - network first, fallback to cache for assets
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-GET requests
  if (request.method !== 'GET') return

  // Skip Supabase API requests - let them fail naturally for offline handling
  if (url.hostname.includes('supabase')) return

  // Skip Chrome extension requests
  if (url.protocol === 'chrome-extension:') return

  // For navigation requests (HTML), use network-first
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Clone and cache the response
          const responseClone = response.clone()
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone)
          })
          return response
        })
        .catch(() => {
          // Offline - return cached HTML
          return caches.match('/index.html')
        })
    )
    return
  }

  // For hashed assets in /assets/ - use NETWORK-FIRST
  // These files have unique hashes, so if the hash changes, we MUST get the new file
  // Cache-first would break when filenames change after deployment
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // If network succeeds, cache and return
          if (response.ok) {
            const responseClone = response.clone()
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone)
            })
            return response
          }
          // If 404, the asset doesn't exist - might be stale reference
          // Try cache as last resort, but likely needs page reload
          if (response.status === 404) {
            console.warn('[SW] Asset not found (404), checking cache:', url.pathname)
            return caches.match(request).then((cached) => {
              if (cached) return cached
              // No cache either - notify client to reload
              self.clients.matchAll().then((clients) => {
                clients.forEach((client) => {
                  client.postMessage({ type: 'ASSET_NOT_FOUND', url: url.pathname })
                })
              })
              return response
            })
          }
          return response
        })
        .catch(() => {
          // Network failed - return cached version for offline support
          return caches.match(request)
        })
    )
    return
  }

  // For other static assets (not in /assets/), use cache-first with network update
  if (
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.woff2')
  ) {
    event.respondWith(
      caches.match(request)
        .then((cachedResponse) => {
          if (cachedResponse) {
            // Return cached version, but also update cache in background
            fetch(request)
              .then((response) => {
                if (response.ok) {
                  caches.open(CACHE_NAME).then((cache) => {
                    cache.put(request, response)
                  })
                }
              })
              .catch(() => {}) // Ignore network errors for background update
            return cachedResponse
          }

          // Not in cache - fetch and cache
          return fetch(request)
            .then((response) => {
              if (response.ok) {
                const responseClone = response.clone()
                caches.open(CACHE_NAME).then((cache) => {
                  cache.put(request, responseClone)
                })
              }
              return response
            })
        })
    )
    return
  }

  // For fonts (Google Fonts), cache with network fallback
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.match(request)
        .then((cachedResponse) => {
          return cachedResponse || fetch(request)
            .then((response) => {
              const responseClone = response.clone()
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, responseClone)
              })
              return response
            })
        })
    )
    return
  }
})

// Handle messages from the app
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting()
  }
})
