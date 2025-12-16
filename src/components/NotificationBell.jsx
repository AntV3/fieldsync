import { useState, useEffect } from 'react'
import { db } from '../lib/supabase'

export default function NotificationBell({ user, onShowToast }) {
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [showDropdown, setShowDropdown] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user?.id) {
      loadNotifications()
      // Poll for new notifications every 30 seconds
      const interval = setInterval(loadNotifications, 30000)
      return () => clearInterval(interval)
    }
  }, [user?.id])

  const loadNotifications = async () => {
    if (!user?.id) return

    try {
      const data = await db.getUnreadNotifications(user.id, 10)
      setNotifications(data)
      setUnreadCount(data.length)
    } catch (error) {
      console.error('Error loading notifications:', error)
    } finally {
      setLoading(false)
    }
  }

  const markAsRead = async (notificationId) => {
    try {
      await db.markNotificationRead(notificationId)
      setNotifications(notifications.filter(n => n.id !== notificationId))
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch (error) {
      console.error('Error marking notification as read:', error)
      onShowToast?.('Error marking notification as read', 'error')
    }
  }

  const markAllAsRead = async () => {
    try {
      await db.markAllNotificationsRead(user.id)
      setNotifications([])
      setUnreadCount(0)
      onShowToast?.('All notifications marked as read', 'success')
    } catch (error) {
      console.error('Error marking all as read:', error)
      onShowToast?.('Error marking notifications as read', 'error')
    }
  }

  const formatTimeAgo = (dateStr) => {
    const date = new Date(dateStr)
    const now = new Date()
    const seconds = Math.floor((now - date) / 1000)

    if (seconds < 60) return 'just now'
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  }

  return (
    <div className="notification-bell-container">
      <button
        className="notification-bell-button"
        onClick={() => setShowDropdown(!showDropdown)}
        title="Notifications"
      >
        🔔
        {unreadCount > 0 && (
          <span className="notification-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>

      {showDropdown && (
        <>
          <div className="notification-dropdown-overlay" onClick={() => setShowDropdown(false)} />
          <div className="notification-dropdown">
            <div className="notification-dropdown-header">
              <h3>Notifications</h3>
              {unreadCount > 0 && (
                <button
                  className="notification-mark-all-read"
                  onClick={markAllAsRead}
                >
                  Mark all read
                </button>
              )}
            </div>

            <div className="notification-list">
              {loading ? (
                <div className="notification-loading">
                  <div className="spinner"></div>
                  <p>Loading...</p>
                </div>
              ) : notifications.length === 0 ? (
                <div className="notification-empty">
                  <p>🎉 All caught up!</p>
                  <span>No new notifications</span>
                </div>
              ) : (
                notifications.map(notification => (
                  <div key={notification.id} className="notification-item">
                    <div className="notification-content">
                      <div className="notification-title">{notification.title}</div>
                      <div className="notification-message">{notification.message}</div>
                      <div className="notification-time">{formatTimeAgo(notification.created_at)}</div>
                    </div>
                    <button
                      className="notification-dismiss"
                      onClick={() => markAsRead(notification.id)}
                      title="Mark as read"
                    >
                      ✓
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
