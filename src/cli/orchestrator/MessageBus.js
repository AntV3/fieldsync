/**
 * MessageBus - Inter-agent communication system
 *
 * Provides publish/subscribe messaging between agents with:
 * - Message routing
 * - Message history
 * - Broadcast capability
 * - Message filtering
 */

import { logger } from '../utils/logger.js'
import { v4 as uuidv4 } from 'uuid'

export class MessageBus {
  constructor() {
    // Subscribers: agentId -> callback function
    this.subscribers = new Map()

    // Message history for debugging and context
    this.messageHistory = []
    this.maxHistorySize = 100

    // Pending messages (for agents not yet registered)
    this.pendingMessages = new Map()
  }

  /**
   * Subscribe an agent to receive messages
   * @param {string} agentId
   * @param {Function} callback - Async function to handle messages
   */
  subscribe(agentId, callback) {
    this.subscribers.set(agentId, callback)
    logger.debug(`Agent subscribed: ${agentId}`)

    // Deliver any pending messages
    if (this.pendingMessages.has(agentId)) {
      const pending = this.pendingMessages.get(agentId)
      this.pendingMessages.delete(agentId)

      pending.forEach(msg => {
        this.deliverMessage(msg)
      })
    }
  }

  /**
   * Unsubscribe an agent
   * @param {string} agentId
   */
  unsubscribe(agentId) {
    this.subscribers.delete(agentId)
    logger.debug(`Agent unsubscribed: ${agentId}`)
  }

  /**
   * Publish a message
   * @param {Object} message
   */
  async publish(message) {
    // Validate message
    if (!message.id) {
      message.id = uuidv4()
    }
    if (!message.timestamp) {
      message.timestamp = new Date().toISOString()
    }

    // Add to history
    this.addToHistory(message)

    // Log the message
    logger.message(message.from, message.to, message.type, message.payload?.summary)

    // Deliver the message
    await this.deliverMessage(message)
  }

  /**
   * Deliver a message to its recipient
   * @param {Object} message
   */
  async deliverMessage(message) {
    const { to } = message

    // Broadcast message
    if (to === '*') {
      for (const [agentId, callback] of this.subscribers) {
        if (agentId !== message.from) {
          try {
            await callback(message)
          } catch (error) {
            logger.error(`Error delivering to ${agentId}: ${error.message}`)
          }
        }
      }
      return
    }

    // Targeted message
    const callback = this.subscribers.get(to)
    if (callback) {
      try {
        await callback(message)
      } catch (error) {
        logger.error(`Error delivering to ${to}: ${error.message}`)
      }
    } else {
      // Queue for later if recipient not registered
      if (!this.pendingMessages.has(to)) {
        this.pendingMessages.set(to, [])
      }
      this.pendingMessages.get(to).push(message)
      logger.debug(`Message queued for ${to} (not registered)`)
    }
  }

  /**
   * Add message to history
   * @param {Object} message
   */
  addToHistory(message) {
    this.messageHistory.push(message)

    // Trim history if needed
    if (this.messageHistory.length > this.maxHistorySize) {
      this.messageHistory = this.messageHistory.slice(-this.maxHistorySize)
    }
  }

  /**
   * Get message history
   * @param {Object} filters - Optional filters
   * @returns {Object[]}
   */
  getHistory(filters = {}) {
    let messages = [...this.messageHistory]

    if (filters.from) {
      messages = messages.filter(m => m.from === filters.from)
    }

    if (filters.to) {
      messages = messages.filter(m => m.to === filters.to)
    }

    if (filters.type) {
      messages = messages.filter(m => m.type === filters.type)
    }

    if (filters.limit) {
      messages = messages.slice(-filters.limit)
    }

    return messages
  }

  /**
   * Get conversation between two agents
   * @param {string} agent1
   * @param {string} agent2
   * @returns {Object[]}
   */
  getConversation(agent1, agent2) {
    return this.messageHistory.filter(m =>
      (m.from === agent1 && m.to === agent2) ||
      (m.from === agent2 && m.to === agent1)
    )
  }

  /**
   * Get message by ID
   * @param {string} messageId
   * @returns {Object|null}
   */
  getMessage(messageId) {
    return this.messageHistory.find(m => m.id === messageId) || null
  }

  /**
   * Get reply chain for a message
   * @param {string} messageId
   * @returns {Object[]}
   */
  getReplyChain(messageId) {
    const chain = []
    let currentId = messageId

    while (currentId) {
      const message = this.getMessage(currentId)
      if (message) {
        chain.unshift(message)
        currentId = message.replyTo
      } else {
        break
      }
    }

    return chain
  }

  /**
   * Clear message history
   */
  clearHistory() {
    this.messageHistory = []
    logger.debug('Message history cleared')
  }

  /**
   * Get registered agents
   * @returns {string[]}
   */
  getRegisteredAgents() {
    return Array.from(this.subscribers.keys())
  }

  /**
   * Check if an agent is registered
   * @param {string} agentId
   * @returns {boolean}
   */
  isRegistered(agentId) {
    return this.subscribers.has(agentId)
  }

  /**
   * Create a message object
   * @param {string} from
   * @param {string} to
   * @param {string} type
   * @param {Object} payload
   * @returns {Object}
   */
  static createMessage(from, to, type, payload) {
    return {
      id: uuidv4(),
      from,
      to,
      type,
      payload,
      timestamp: new Date().toISOString(),
      replyTo: null
    }
  }
}

export default MessageBus
