import { useState, useEffect, useRef } from 'react'
import { db } from '../lib/supabase'

export default function NotificationCenter({ company, projects, userId, onNotificationClick, onShowToast }) {
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [userPreferences, setUserPreferences] = useState({}) // { projectId: ['message', 'material_request', ...] }
  const dropdownRef = useRef(null)
  const audioRef = useRef(null)
  const audioContextRef = useRef(null)

  // Load user notification preferences
  useEffect(() => {
    if (!userId) return
    loadUserPreferences()
  }, [userId])

  const loadUserPreferences = async () => {
    try {
      const prefs = await db.getUserNotificationPreferences(userId)
      const prefsMap = {}
      prefs.forEach(pref => {
        prefsMap[pref.project_id] = pref.notification_types || []
      })
      setUserPreferences(prefsMap)
    } catch (error) {
      console.error('Error loading user preferences:', error)
    }
  }

  // Check if user should receive a notification type for a project
  const shouldReceiveNotification = (projectId, notificationType) => {
    // If no preferences set for this project, show all notifications (default behavior)
    if (!userPreferences[projectId]) return true
    // If preferences are set but empty, don't show any
    if (userPreferences[projectId].length === 0) return false
    // Check if the notification type is in the user's preferences
    return userPreferences[projectId].includes(notificationType)
  }

  // Load initial notifications and set up realtime
  useEffect(() => {
    if (!company?.id || !projects || projects.length === 0) return

    loadNotifications()
    const subscription = setupRealtimeSubscription()

    return () => {
      if (subscription) {
        db.unsubscribe(subscription)
      }
    }
  }, [company?.id, projects, userPreferences])

  // Cleanup AudioContext on unmount
  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {})
        audioContextRef.current = null
      }
    }
  }, [])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const loadNotifications = async () => {
    if (!projects || projects.length === 0) return

    const allNotifications = []

    // Load recent messages, material requests, and injury reports
    for (const project of projects) {
      try {
        // Get unread messages from field (if user has message notifications enabled)
        if (shouldReceiveNotification(project.id, 'message')) {
          const messages = await db.getMessages(project.id, 20)
          const fieldMessages = messages.filter(m => m.sender_type === 'field' && !m.is_read)
          fieldMessages.forEach(msg => {
            allNotifications.push({
              id: `msg-${msg.id}`,
              type: 'message',
              title: 'New Message',
              message: msg.message?.slice(0, 50) + (msg.message?.length > 50 ? '...' : ''),
              projectId: project.id,
              projectName: project.name,
              senderName: msg.sender_name,
              createdAt: msg.created_at,
              isRead: msg.is_read,
              data: msg
            })
          })
        }

        // Get pending material requests (if user has material request notifications enabled)
        if (shouldReceiveNotification(project.id, 'material_request')) {
          const requests = await db.getMaterialRequests(project.id, 'pending')
          requests.forEach(req => {
            allNotifications.push({
              id: `req-${req.id}`,
              type: 'material_request',
              title: 'Material Request',
              message: `${req.items?.length || 0} items requested`,
              projectId: project.id,
              projectName: project.name,
              senderName: req.requested_by,
              priority: req.priority,
              createdAt: req.created_at,
              isRead: false,
              data: req
            })
          })
        }
      } catch (error) {
        console.error('Error loading notifications for project:', project.id, error)
      }
    }

    // Load company-wide injury reports (filter by user preferences)
    try {
      const reports = await db.getCompanyInjuryReports(company.id, 'open')
      reports.slice(0, 5).forEach(report => {
        // Only add if user has injury_report notifications enabled for this project
        if (shouldReceiveNotification(report.project_id, 'injury_report')) {
          const project = projects.find(p => p.id === report.project_id)
          allNotifications.push({
            id: `injury-${report.id}`,
            type: 'injury_report',
            title: 'Safety Report',
            message: `${report.injury_type} - ${report.injured_person_name}`,
            projectId: report.project_id,
            projectName: project?.name || 'Unknown Project',
            senderName: report.reported_by_name,
            createdAt: report.created_at,
            isRead: report.status !== 'open',
            data: report
          })
        }
      })
    } catch (error) {
      console.error('Error loading injury reports:', error)
    }

    // Sort by date (newest first)
    allNotifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

    setNotifications(allNotifications.slice(0, 50))
    setUnreadCount(allNotifications.filter(n => !n.isRead).length)
  }

  const setupRealtimeSubscription = () => {
    if (!company?.id || !projects || projects.length === 0) return null

    const projectIds = projects.map(p => p.id)

    const subscription = db.subscribeToCompanyActivity(company.id, projectIds, {
      onMessage: (payload) => {
        if (payload.new?.sender_type === 'field') {
          // Check if user should receive message notifications for this project
          if (!shouldReceiveNotification(payload.new.project_id, 'message')) return

          handleNewNotification({
            id: `msg-${payload.new.id}`,
            type: 'message',
            title: 'New Message',
            message: payload.new.message?.slice(0, 50) + (payload.new.message?.length > 50 ? '...' : ''),
            projectId: payload.new.project_id,
            projectName: projects.find(p => p.id === payload.new.project_id)?.name || 'Project',
            senderName: payload.new.sender_name,
            createdAt: payload.new.created_at,
            isRead: false,
            data: payload.new
          })
        }
      },
      onMaterialRequest: (payload) => {
        // Check if user should receive material request notifications for this project
        if (!shouldReceiveNotification(payload.new.project_id, 'material_request')) return

        handleNewNotification({
          id: `req-${payload.new.id}`,
          type: 'material_request',
          title: 'Material Request',
          message: `${payload.new.items?.length || 0} items requested`,
          projectId: payload.new.project_id,
          projectName: projects.find(p => p.id === payload.new.project_id)?.name || 'Project',
          senderName: payload.new.requested_by,
          priority: payload.new.priority,
          createdAt: payload.new.created_at,
          isRead: false,
          data: payload.new
        })
      },
      onTMTicket: (payload) => {
        if (payload.eventType === 'INSERT') {
          // Check if user should receive T&M ticket notifications for this project
          if (!shouldReceiveNotification(payload.new.project_id, 'tm_ticket')) return

          handleNewNotification({
            id: `tm-${payload.new.id}`,
            type: 'tm_ticket',
            title: 'New T&M Ticket',
            message: `Submitted by ${payload.new.created_by_name || 'Field'}`,
            projectId: payload.new.project_id,
            projectName: projects.find(p => p.id === payload.new.project_id)?.name || 'Project',
            senderName: payload.new.created_by_name,
            createdAt: payload.new.created_at,
            isRead: false,
            data: payload.new
          })
        }
      },
      onInjuryReport: (payload) => {
        // Check if user should receive injury report notifications for this project
        if (!shouldReceiveNotification(payload.new.project_id, 'injury_report')) return

        handleNewNotification({
          id: `injury-${payload.new.id}`,
          type: 'injury_report',
          title: 'Safety Report',
          message: `${payload.new.injury_type} - ${payload.new.injured_person_name}`,
          projectId: payload.new.project_id,
          projectName: projects.find(p => p.id === payload.new.project_id)?.name || 'Project',
          senderName: payload.new.reported_by_name,
          createdAt: payload.new.created_at,
          isRead: false,
          data: payload.new
        })
      }
    })

    if (subscription) {
      setIsConnected(true)
    }

    return subscription
  }

  const handleNewNotification = (notification) => {
    // Add to top of notifications
    setNotifications(prev => [notification, ...prev.slice(0, 49)])
    setUnreadCount(prev => prev + 1)

    // Play notification sound
    playNotificationSound()

    // Show toast
    const icon = getNotificationIcon(notification.type)
    onShowToast?.(`${icon} ${notification.title}: ${notification.message}`, 'info')
  }

  const playNotificationSound = () => {
    try {
      // Reuse or create AudioContext
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
      }

      const audioContext = audioContextRef.current

      // Resume if suspended (browser autoplay policy)
      if (audioContext.state === 'suspended') {
        audioContext.resume()
      }

      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)

      oscillator.frequency.value = 800
      oscillator.type = 'sine'
      gainNode.gain.value = 0.3

      oscillator.start()
      oscillator.stop(audioContext.currentTime + 0.15)

      // Second beep
      setTimeout(() => {
        if (!audioContextRef.current || audioContextRef.current.state === 'closed') return
        const osc2 = audioContextRef.current.createOscillator()
        const gain2 = audioContextRef.current.createGain()
        osc2.connect(gain2)
        gain2.connect(audioContextRef.current.destination)
        osc2.frequency.value = 1000
        osc2.type = 'sine'
        gain2.gain.value = 0.3
        osc2.start()
        osc2.stop(audioContextRef.current.currentTime + 0.15)
      }, 150)
    } catch (e) {
      // Audio not supported or blocked
    }
  }

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'message': return '💬'
      case 'material_request': return '📦'
      case 'injury_report': return '🚨'
      case 'tm_ticket': return '📋'
      default: return '🔔'
    }
  }

  const getNotificationColor = (type) => {
    switch (type) {
      case 'message': return 'blue'
      case 'material_request': return 'orange'
      case 'injury_report': return 'red'
      case 'tm_ticket': return 'green'
      default: return 'gray'
    }
  }

  const handleNotificationClick = (notification) => {
    // Mark as read (remove from unread count)
    setNotifications(prev =>
      prev.map(n => n.id === notification.id ? { ...n, isRead: true } : n)
    )
    setUnreadCount(prev => Math.max(0, prev - 1))

    // Close dropdown
    setIsOpen(false)

    // Trigger callback to navigate to the item
    onNotificationClick?.(notification)
  }

  const markAllAsRead = async () => {
    // Mark messages as read in database
    for (const project of projects) {
      try {
        await db.markMessagesRead(project.id, 'office')
      } catch (e) {
        // Ignore errors
      }
    }

    // Update local state
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })))
    setUnreadCount(0)
  }

  const formatTime = (dateString) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  return (
    <div className="notification-center" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        className={`notification-bell ${unreadCount > 0 ? 'has-notifications' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        title={`${unreadCount} unread notifications`}
      >
        <span className="bell-icon">🔔</span>
        {unreadCount > 0 && (
          <span className="notification-badge">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
        {isConnected && <span className="connection-dot"></span>}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="notification-dropdown">
          <div className="notification-header">
            <h4>Notifications</h4>
            {unreadCount > 0 && (
              <button className="mark-all-read" onClick={markAllAsRead}>
                Mark all read
              </button>
            )}
          </div>

          <div className="notification-list">
            {notifications.length === 0 ? (
              <div className="notification-empty">
                <span className="empty-icon">📭</span>
                <p>No notifications yet</p>
                <small>You'll see updates from the field here</small>
              </div>
            ) : (
              notifications.map(notification => (
                <div
                  key={notification.id}
                  className={`notification-item ${notification.isRead ? 'read' : 'unread'} ${getNotificationColor(notification.type)}`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="notification-icon">
                    {getNotificationIcon(notification.type)}
                  </div>
                  <div className="notification-content">
                    <div className="notification-title">
                      {notification.title}
                      {notification.priority === 'urgent' && (
                        <span className="priority-badge urgent">URGENT</span>
                      )}
                    </div>
                    <div className="notification-message">{notification.message}</div>
                    <div className="notification-meta">
                      <span className="notification-project">{notification.projectName}</span>
                      <span className="notification-time">{formatTime(notification.createdAt)}</span>
                    </div>
                  </div>
                  {!notification.isRead && <div className="unread-dot"></div>}
                </div>
              ))
            )}
          </div>

          {notifications.length > 0 && (
            <div className="notification-footer">
              <button className="view-all-btn" onClick={() => {
                setIsOpen(false)
                onNotificationClick?.({ type: 'view_all' })
              }}>
                View All Activity
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
