import { useState, useEffect, useRef } from 'react'
import { db, isSupabaseConfigured } from '../lib/supabase'

export default function Messages({ project, viewerType, viewerName, onShowToast, onClose }) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [newMessage, setNewMessage] = useState('')
  const messagesEndRef = useRef(null)

  useEffect(() => {
    loadMessages()
    // Mark messages as read when opening
    db.markMessagesRead(project.id, viewerType)
  }, [project.id])

  useEffect(() => {
    // Scroll to bottom when messages change
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const loadMessages = async () => {
    try {
      const data = await db.getMessages(project.id)
      setMessages(data.reverse()) // Show oldest first
    } catch (err) {
      console.error('Error loading messages:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSend = async () => {
    if (!newMessage.trim()) return

    // Demo mode warning
    if (!isSupabaseConfigured) {
      onShowToast('Demo Mode: Messages won\'t sync to other users', 'info')
      // Still add locally for demo purposes
      const demoMsg = {
        id: Date.now(),
        project_id: project.id,
        message: newMessage.trim(),
        sender_type: viewerType,
        sender_name: viewerName,
        created_at: new Date().toISOString()
      }
      setMessages([...messages, demoMsg])
      setNewMessage('')
      return
    }

    setSending(true)
    try {
      const msg = await db.sendMessage(
        project.id,
        newMessage.trim(),
        viewerType,
        viewerName
      )

      if (msg) {
        setMessages([...messages, msg])
        setNewMessage('')
      } else {
        onShowToast('Message not sent - check connection', 'error')
      }
    } catch (err) {
      console.error('Error sending message:', err)
      onShowToast('Error sending message', 'error')
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

  return (
    <div className="messages-container">
      <div className="messages-header">
        <button className="back-btn-simple" onClick={onClose}>←</button>
        <div>
          <h2>Messages</h2>
          <p className="messages-project">{project.name}</p>
        </div>
      </div>

      <div className="messages-list">
        {loading ? (
          <div className="messages-loading">Loading...</div>
        ) : messages.length === 0 ? (
          <div className="messages-empty">
            <p>No messages yet</p>
            <p className="messages-empty-hint">
              {viewerType === 'field' 
                ? 'Messages from the office will appear here'
                : 'Send a message to the field crew'
              }
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <div 
              key={msg.id} 
              className={`message ${msg.sender_type === viewerType ? 'sent' : 'received'}`}
            >
              <div className="message-bubble">
                <div className="message-sender">
                  {msg.sender_type === 'office' ? '💼' : '👷'} {msg.sender_name}
                </div>
                <div className="message-text">{msg.message}</div>
                {msg.photo_url && (
                  <img src={msg.photo_url} alt="Attached" className="message-photo" />
                )}
                <div className="message-time">{formatTime(msg.created_at)}</div>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="messages-input-container">
        <textarea
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          rows={1}
          disabled={sending}
        />
        <button 
          className="messages-send-btn"
          onClick={handleSend}
          disabled={sending || !newMessage.trim()}
        >
          {sending ? '...' : '→'}
        </button>
      </div>
    </div>
  )
}
