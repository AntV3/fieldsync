import { useState, useCallback } from 'react'

export function useNotifications() {
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  )

  const requestPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return 'denied'
    const result = await Notification.requestPermission()
    setPermission(result)
    return result
  }, [])

  const sendNotification = useCallback((title, options = {}) => {
    if (permission !== 'granted') return null
    try {
      return new Notification(title, {
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-96.png',
        ...options
      })
    } catch (_e) {
      // Fallback for environments where Notification constructor fails
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'SHOW_NOTIFICATION',
          title,
          options: { icon: '/icons/icon-192.png', badge: '/icons/icon-96.png', ...options }
        })
      }
      return null
    }
  }, [permission])

  return { permission, requestPermission, sendNotification, isSupported: typeof Notification !== 'undefined' }
}
