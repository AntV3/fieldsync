import { useState, useEffect, useRef } from 'react'
import { Briefcase, HardHat, MessageSquare } from 'lucide-react'
import { db } from '../lib/supabase'

export default function ProjectMessages({ project, company, userName, onShowToast }) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [newMessage, setNewMessage] = useState('')
  const [unreadCount, setUnreadCount] = useState(0)
  const [isExpanded, setIsExpanded] = useState(false)
  const messagesEndRef = useRef(null)

  useEffect(() => {
    loadMessages()

    // Subscribe to new messages
    const subscription = db.subscribeToMessages?.(project.id, async (payload) => {
      if (payload.new) {
        const msg = { ...payload.new }
        if (msg.photo_url) {
          msg.photo_url = await db.resolvePhotoUrl(msg.photo_url)
        }
        setMessages(prev => [...prev, msg])
        if (msg.sender_type === 'field') {
          setUnreadCount(prev => prev + 1)
        }
      }
    })

    return () => {
      if (subscription) db.unsubscribe?.(subscription)
    }
  }, [project.id])

  useEffect(() => {
    if (isExpanded) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      // Mark messages as read when expanded
      db.markMessagesRead?.(project.id, 'office')
      setUnreadCount(0)
    }
  }, [messages, isExpanded, project.id])

  const loadMessages = async () => {
    try {
      const data = await db.getMessages(project.id, 50)
      let sortedMessages = (data || []).sort((a, b) =>
        new Date(a.created_at) - new Date(b.created_at)
      )
      // Resolve message photo attachments to signed URLs (bucket is private)
      const rawUrls = sortedMessages.map(m => m.photo_url)
      if (rawUrls.some(Boolean)) {
        const signed = await db.resolvePhotoUrls(rawUrls)
        sortedMessages = sortedMessages.map((m, i) => ({ ...m, photo_url: signed[i] }))
      }
      setMessages(sortedMessages)

      // Count unread from field
      const unread = sortedMessages.filter(m => m.sender_type === 'field' && !m.is_read).length
      setUnreadCount(unread)
    } catch (error) {
      console.error('Error loading messages:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSend = async () => {
    if (!newMessage.trim()) return

    setSending(true)
    try {
      const msg = await db.sendMessage(
        project.id,
        newMessage.trim(),
        'office',
        userName || 'Office'
      )
      setMessages(prev => [...prev, msg])
      setNewMessage('')
    } catch (err) {
      console.error('Error sending message:', err)
      onShowToast?.('Error sending message', 'error')
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const formatTime = (timestamp) => {
    const date = new Date(timestamp)
    const now = new Date()
    const isToday = date.toDateString() === now.toDateString()

    if (isToday) {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  }

  // Get last few messages for preview
  const recentMessages = messages.slice(-3)

  if (loading) {
    return (
      <div className="project-messages card">
        <div className="project-messages-header">
          <h3>Messages</h3>
        </div>
        <div className="loading">Loading messages...</div>
      </div>
    )
  }

  return (
    <div className={`project-messages card ${isExpanded ? 'expanded' : ''}`}>
      <div
        className="project-messages-header"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="messages-title-row">
          <h3>Messages</h3>
          {unreadCount > 0 && (
            <span className="messages-unread-badge">{unreadCount} new</span>
          )}
        </div>
        <button className="messages-toggle-btn">
          {isExpanded ? '▼ Collapse' : '▶ Expand'}
        </button>
      </div>

      {/* Preview when collapsed */}
      {!isExpanded && messages.length > 0 && (
        <div className="messages-preview">
          {recentMessages.map(msg => (
            <div key={msg.id} className={`preview-message ${msg.sender_type}`}>
              <span className="preview-sender">
                {msg.sender_type === 'office' ? <Briefcase size={12} className="inline-icon" /> : <HardHat size={12} className="inline-icon" />} {msg.sender_name}:
              </span>
              <span className="preview-text">
                {msg.message?.slice(0, 50)}{msg.message?.length > 50 ? '...' : ''}
              </span>
            </div>
          ))}
          {messages.length === 0 && (
            <p className="no-messages-hint">No messages yet. Click to start chatting.</p>
          )}
        </div>
      )}

      {/* Full chat when expanded */}
      {isExpanded && (
        <div className="messages-full">
          <div className="messages-list-container">
            {messages.length === 0 ? (
              <div className="messages-empty">
                <span className="empty-icon"><MessageSquare size={32} /></span>
                <p>No messages yet</p>
                <small>Send a message to the field crew</small>
              </div>
            ) : (
              messages.map(msg => (
                <div
                  key={msg.id}
                  className={`message-bubble ${msg.sender_type === 'office' ? 'sent' : 'received'}`}
                >
                  <div className="message-sender">
                    {msg.sender_type === 'office' ? <Briefcase size={14} className="inline-icon" /> : <HardHat size={14} className="inline-icon" />} {msg.sender_name}
                  </div>
                  <div className="message-text">{msg.message}</div>
                  {msg.photo_url && (
                    <img src={msg.photo_url} alt="Attached" className="message-photo" />
                  )}
                  <div className="message-time">{formatTime(msg.created_at)}</div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="messages-input-row">
            <textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              rows={1}
              disabled={sending}
            />
            <button
              className="btn btn-primary send-btn"
              onClick={handleSend}
              disabled={sending || !newMessage.trim()}
            >
              {sending ? '...' : 'Send'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
