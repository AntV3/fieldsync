import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import './styles/index.css' // New modular styles (overrides legacy where needed)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// Register Service Worker for offline support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        // Check for updates periodically (every 5 minutes)
        setInterval(() => {
          registration.update().catch(() => {})
        }, 300000)
      })
      .catch(() => {
        // Service worker registration failed silently
      })
  })
}
