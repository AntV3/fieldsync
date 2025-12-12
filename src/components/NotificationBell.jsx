import { useState, useEffect } from 'react'
import { db } from '../lib/supabase'

export default function NotificationBell({ userId, onOpenNotifications }) {
  const [unreadCount, setUnreadCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!userId) {
      setUnreadCount(0)
      setIsLoading(false)
      return
    }

    loadUnreadCount()

    // Subscribe to new notifications in real-time
    const subscription = db.subscribeToNotifications(userId, (newNotification) => {
      // Increment count when new notification arrives
      setUnreadCount(prev => prev + 1)
    })

    // Cleanup subscription on unmount
    return () => {
      if (subscription) {
        subscription.unsubscribe()
      }
    }
  }, [userId])

  const loadUnreadCount = async () => {
    if (!userId) return

    try {
      const count = await db.getUnreadNotificationCount(userId)
      setUnreadCount(count)
    } catch (error) {
      console.error('Error loading unread count:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Public method to refresh count (called when notifications are read)
  const refreshCount = () => {
    loadUnreadCount()
  }

  // Expose refresh method to parent
  useEffect(() => {
    if (window.notificationBell) {
      window.notificationBell.refreshCount = refreshCount
    }
  }, [])

  return (
    <button
      className="notification-bell"
      onClick={onOpenNotifications}
      title="Notifications"
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      {!isLoading && unreadCount > 0 && (
        <span className="notification-badge">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  )
}
