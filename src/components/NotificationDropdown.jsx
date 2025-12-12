import { useState, useEffect, useRef } from 'react'
import { db } from '../lib/supabase'

export default function NotificationDropdown({ userId, isOpen, onClose, onNavigate }) {
  const [notifications, setNotifications] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const dropdownRef = useRef(null)

  useEffect(() => {
    if (isOpen && userId) {
      loadNotifications()
    }
  }, [isOpen, userId])

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, onClose])

  const loadNotifications = async () => {
    if (!userId) return

    setIsLoading(true)
    try {
      const data = await db.getNotifications(userId, 20)
      setNotifications(data)
    } catch (error) {
      console.error('Error loading notifications:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleNotificationClick = async (notification) => {
    // Mark as read
    if (!notification.is_read) {
      await db.markNotificationRead(notification.id)
      setNotifications(prev =>
        prev.map(n => n.id === notification.id ? { ...n, is_read: true } : n)
      )
      // Refresh bell count
      if (window.notificationBell?.refreshCount) {
        window.notificationBell.refreshCount()
      }
    }

    // Navigate if link provided
    if (notification.link_to && onNavigate) {
      onNavigate(notification.link_to)
      onClose()
    }
  }

  const handleMarkAllRead = async () => {
    if (!userId) return

    try {
      await db.markAllNotificationsRead(userId)
      setNotifications(prev =>
        prev.map(n => ({ ...n, is_read: true }))
      )
      // Refresh bell count
      if (window.notificationBell?.refreshCount) {
        window.notificationBell.refreshCount()
      }
    } catch (error) {
      console.error('Error marking all as read:', error)
    }
  }

  const handleClearRead = async () => {
    if (!userId) return

    try {
      await db.deleteReadNotifications(userId)
      setNotifications(prev => prev.filter(n => !n.is_read))
    } catch (error) {
      console.error('Error clearing read notifications:', error)
    }
  }

  const formatTimeAgo = (timestamp) => {
    const now = new Date()
    const then = new Date(timestamp)
    const seconds = Math.floor((now - then) / 1000)

    if (seconds < 60) return 'Just now'
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
    return then.toLocaleDateString()
  }

  const getEventIcon = (eventType) => {
    switch (eventType) {
      case 'material_request':
        return '📦'
      case 'tm_submitted':
        return '📋'
      case 'tm_approved':
        return '✅'
      case 'tm_rejected':
        return '❌'
      case 'daily_report':
        return '📊'
      case 'message':
        return '💬'
      case 'material_approved':
        return '✅'
      case 'material_rejected':
        return '❌'
      case 'crew_checkin':
        return '👷'
      default:
        return '🔔'
    }
  }

  if (!isOpen) return null

  return (
    <div className="notification-dropdown" ref={dropdownRef}>
      <div className="notification-header">
        <h3>Notifications</h3>
        <div className="notification-actions">
          {notifications.some(n => !n.is_read) && (
            <button
              className="btn-text-small"
              onClick={handleMarkAllRead}
              title="Mark all as read"
            >
              Mark all read
            </button>
          )}
          {notifications.some(n => n.is_read) && (
            <button
              className="btn-text-small"
              onClick={handleClearRead}
              title="Clear read notifications"
            >
              Clear read
            </button>
          )}
        </div>
      </div>

      <div className="notification-list">
        {isLoading ? (
          <div className="notification-loading">Loading...</div>
        ) : notifications.length === 0 ? (
          <div className="notification-empty">
            <p>No notifications yet</p>
          </div>
        ) : (
          notifications.map(notification => (
            <div
              key={notification.id}
              className={`notification-item ${!notification.is_read ? 'unread' : ''} ${notification.link_to ? 'clickable' : ''}`}
              onClick={() => handleNotificationClick(notification)}
            >
              <div className="notification-icon">
                {getEventIcon(notification.event_type)}
              </div>
              <div className="notification-content">
                <div className="notification-title">{notification.title}</div>
                {notification.message && (
                  <div className="notification-message">{notification.message}</div>
                )}
                <div className="notification-time">{formatTimeAgo(notification.created_at)}</div>
              </div>
              {!notification.is_read && (
                <div className="notification-unread-dot"></div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
