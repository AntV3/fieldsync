import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import './styles/index.css' // New modular styles (overrides legacy where needed)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)

// Register Service Worker for offline support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        // Check for updates periodically (every 5 minutes)
        setInterval(() => {
          registration.update().catch(err => console.debug('[SW] Update check failed:', err.message))
        }, 300000)
      })
      .catch(err => {
        console.debug('[SW] Registration failed:', err.message)
      })
  })

  // Listen for service worker messages
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'SW_UPDATED') {
      // New service worker activated - reload to get fresh assets
      console.log('[App] Service worker updated, reloading for fresh assets...')
      window.location.reload()
    }
    if (event.data?.type === 'ASSET_NOT_FOUND') {
      // Asset not found (likely stale chunk reference) - reload page
      console.warn('[App] Asset not found:', event.data.url, '- reloading...')
      // Clear service worker cache and reload
      if ('caches' in window) {
        caches.keys().then((names) => {
          names.forEach((name) => caches.delete(name))
        }).finally(() => {
          window.location.reload()
        })
      } else {
        window.location.reload()
      }
    }
  })
}
