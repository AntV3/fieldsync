import { useState, useEffect } from 'react'
import { db } from '../lib/supabase'

export default function ProjectMessages({ project, currentUser, onRefresh }) {
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    loadMessages()
  }, [project.id])

  async function loadMessages() {
    try {
      // TODO: Implement getProjectMessages in supabase.js
      // For now, show a placeholder
      setMessages([
        {
          id: '1',
          sender_name: 'Tony (Office)',
          sender_type: 'office',
          message: 'Inspector coming tomorrow at 10am. Make sure floor 2 is ready for walkthrough.',
          created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() // 2 hours ago
        },
        {
          id: '2',
          sender_name: 'Field',
          sender_type: 'field',
          message: 'Got it. Will have it ready.',
          created_at: new Date(Date.now() - 1.5 * 60 * 60 * 1000).toISOString() // 1.5 hours ago
        },
        {
          id: '3',
          sender_name: 'Field',
          sender_type: 'field',
          message: 'Running low on poly. Submitted material request.',
          created_at: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString() // 6 hours ago
        },
        {
          id: '4',
          sender_name: 'Sarah (Office)',
          sender_type: 'office',
          message: 'Ordered. Will be delivered tomorrow AM.',
          created_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString() // 5 hours ago
        }
      ])
    } catch (error) {
      console.error('Error loading messages:', error)
    }
  }

  async function handleSendMessage(e) {
    e.preventDefault()

    if (!newMessage.trim()) return

    setSending(true)
    try {
      // TODO: Implement createProjectMessage in supabase.js
      const message = {
        project_id: project.id,
        sender_name: currentUser?.name || currentUser?.email || 'Office',
        sender_type: 'office',
        message: newMessage.trim(),
        created_at: new Date().toISOString()
      }

      // For now, just add to local state
      setMessages(prev => [message, ...prev])
      setNewMessage('')

      // await db.createProjectMessage(message)
      // loadMessages()
    } catch (error) {
      console.error('Error sending message:', error)
      alert('Failed to send message')
    } finally {
      setSending(false)
    }
  }

  // Sort messages by date (newest first)
  const sortedMessages = [...messages].sort((a, b) =>
    new Date(b.created_at) - new Date(a.created_at)
  )

  // Group messages by date
  const groupedMessages = {}
  sortedMessages.forEach(msg => {
    const date = new Date(msg.created_at).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    })
    if (!groupedMessages[date]) {
      groupedMessages[date] = []
    }
    groupedMessages[date].push(msg)
  })

  return (
    <div className="project-messages">
      {/* Header */}
      <div className="messages-header">
        <h3>Project Messages</h3>
        <p className="messages-subtitle">
          Communication between office and field for {project.name}
        </p>
      </div>

      {/* Message Input */}
      <form className="message-input-form" onSubmit={handleSendMessage}>
        <div className="message-input-container">
          <textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message to the field team..."
            rows="3"
            className="message-input"
            disabled={sending}
          />
        </div>
        <button
          type="submit"
          className="btn-primary btn-send"
          disabled={!newMessage.trim() || sending}
        >
          {sending ? 'Sending...' : 'Send'}
        </button>
      </form>

      {/* Messages List */}
      <div className="messages-list">
        {Object.keys(groupedMessages).length === 0 ? (
          <div className="empty-state">
            <p>No messages yet</p>
            <p className="empty-state-hint">
              Send a message to start communicating with the field team
            </p>
          </div>
        ) : (
          Object.entries(groupedMessages).map(([date, msgs]) => (
            <div key={date} className="message-date-group">
              <div className="message-date-divider">
                <span>{date}</span>
              </div>

              {msgs.map(msg => (
                <div
                  key={msg.id}
                  className={`message-item ${msg.sender_type}`}
                >
                  <div className="message-header">
                    <span className="message-sender">
                      {msg.sender_type === 'office' ? '💼' : '👷'} {msg.sender_name}
                    </span>
                    <span className="message-time">
                      {new Date(msg.created_at).toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                  <div className="message-content">
                    {msg.message}
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {/* Info Banner */}
      <div className="info-banner">
        <p>
          ℹ️ Messages are visible to all office users and field personnel with access to this project.
        </p>
      </div>
    </div>
  )
}
