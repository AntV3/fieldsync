/**
 * BaseAgent - Abstract base class for all agents
 *
 * Provides the foundational structure for agent behavior including:
 * - Message handling (receive/send)
 * - Task execution
 * - Status tracking
 * - Capability management
 */

import { logger } from '../utils/logger.js'
import { v4 as uuidv4 } from 'uuid'

export class BaseAgent {
  /**
   * Create a new agent
   * @param {Object} config - Agent configuration from agents.json
   * @param {Object} messageBus - MessageBus instance for communication
   * @param {Object} contextManager - ContextManager for shared state
   */
  constructor(config, messageBus, contextManager) {
    this.id = config.id
    this.name = config.name
    this.role = config.role
    this.capabilities = config.capabilities || []
    this.canDelegateTo = config.canDelegateTo || []
    this.reportsTo = config.reportsTo || null
    this.workflows = config.workflows || []
    this.prompts = config.prompts || {}

    this.messageBus = messageBus
    this.contextManager = contextManager

    // Agent state
    this.status = 'idle' // idle, working, waiting
    this.currentTask = null
    this.taskHistory = []

    // Register message handler
    if (this.messageBus) {
      this.messageBus.subscribe(this.id, this.handleMessage.bind(this))
    }
  }

  /**
   * Initialize the agent (can be overridden)
   */
  async initialize() {
    logger.debug(`Initializing agent: ${this.name}`, this.id)
    // Override in subclasses for custom initialization
  }

  /**
   * Check if agent has a capability
   * @param {string} capability
   * @returns {boolean}
   */
  hasCapability(capability) {
    return this.capabilities.includes(capability)
  }

  /**
   * Get agent status
   * @returns {Object}
   */
  getStatus() {
    return {
      id: this.id,
      name: this.name,
      status: this.status,
      currentTask: this.currentTask ? this.currentTask.id : null,
      tasksCompleted: this.taskHistory.length
    }
  }

  /**
   * Get agent capabilities
   * @returns {string[]}
   */
  getCapabilities() {
    return [...this.capabilities]
  }

  /**
   * Handle incoming message
   * @param {Object} message
   */
  async handleMessage(message) {
    logger.message(message.from, this.id, message.type)

    switch (message.type) {
      case 'task-assignment':
        await this.onTaskAssignment(message)
        break

      case 'review-request':
        await this.onReviewRequest(message)
        break

      case 'review-feedback':
        await this.onReviewFeedback(message)
        break

      case 'question':
        await this.onQuestion(message)
        break

      case 'status-update':
        await this.onStatusUpdate(message)
        break

      case 'completion':
        await this.onCompletion(message)
        break

      case 'error':
        await this.onError(message)
        break

      default:
        logger.warn(`Unknown message type: ${message.type}`, this.id)
    }
  }

  /**
   * Send a message to another agent
   * @param {string} to - Target agent ID
   * @param {string} type - Message type
   * @param {Object} payload - Message payload
   */
  async sendMessage(to, type, payload) {
    const message = {
      id: uuidv4(),
      from: this.id,
      to,
      type,
      payload,
      timestamp: new Date().toISOString(),
      replyTo: null
    }

    await this.messageBus.publish(message)
    return message.id
  }

  /**
   * Reply to a message
   * @param {Object} originalMessage
   * @param {string} type
   * @param {Object} payload
   */
  async replyTo(originalMessage, type, payload) {
    const message = {
      id: uuidv4(),
      from: this.id,
      to: originalMessage.from,
      type,
      payload,
      timestamp: new Date().toISOString(),
      replyTo: originalMessage.id
    }

    await this.messageBus.publish(message)
    return message.id
  }

  /**
   * Execute a task
   * @param {string} action - The action to perform (e.g., 'plan', 'implement')
   * @param {string} description - Task description
   * @returns {Object} Task result
   */
  async executeTask(action, description) {
    if (!this.hasCapability(action)) {
      throw new Error(`Agent ${this.id} does not have capability: ${action}`)
    }

    const task = {
      id: `task-${uuidv4().slice(0, 8)}`,
      action,
      description,
      status: 'in_progress',
      startTime: Date.now(),
      agent: this.id
    }

    this.currentTask = task
    this.status = 'working'

    logger.task(task.id, 'in_progress', `${action}: ${description.slice(0, 50)}...`)

    try {
      // Execute the action (to be implemented by subclasses)
      const result = await this.performAction(action, description, task)

      task.status = 'completed'
      task.endTime = Date.now()
      task.result = result

      this.taskHistory.push(task)
      this.currentTask = null
      this.status = 'idle'

      logger.task(task.id, 'completed')

      return result
    } catch (error) {
      task.status = 'failed'
      task.error = error.message

      this.currentTask = null
      this.status = 'idle'

      logger.task(task.id, 'blocked', error.message)
      throw error
    }
  }

  /**
   * Perform the action (to be implemented by subclasses)
   * @param {string} action
   * @param {string} description
   * @param {Object} task
   * @returns {Object}
   */
  async performAction(action, description, task) {
    throw new Error(`performAction must be implemented by subclass`)
  }

  /**
   * Delegate task to another agent
   * @param {string} agentId
   * @param {string} action
   * @param {string} description
   */
  async delegateTo(agentId, action, description) {
    if (!this.canDelegateTo.includes(agentId)) {
      throw new Error(`Agent ${this.id} cannot delegate to ${agentId}`)
    }

    const taskId = `task-${uuidv4().slice(0, 8)}`

    await this.sendMessage(agentId, 'task-assignment', {
      taskId,
      action,
      description,
      delegatedBy: this.id
    })

    return taskId
  }

  /**
   * Request review from another agent
   * @param {string} agentId
   * @param {Object} content - Content to review
   */
  async requestReview(agentId, content) {
    await this.sendMessage(agentId, 'review-request', {
      content,
      taskId: this.currentTask?.id
    })
  }

  /**
   * Report completion to reporting agent
   * @param {Object} result
   */
  async reportCompletion(result) {
    if (this.reportsTo) {
      await this.sendMessage(this.reportsTo, 'completion', {
        taskId: this.currentTask?.id,
        result
      })
    }
  }

  // Message handlers (can be overridden by subclasses)

  async onTaskAssignment(message) {
    const { action, description } = message.payload
    logger.agent(this.name, `Received task: ${action}`)

    try {
      const result = await this.executeTask(action, description)
      await this.replyTo(message, 'completion', { result })
    } catch (error) {
      await this.replyTo(message, 'error', { error: error.message })
    }
  }

  async onReviewRequest(message) {
    logger.agent(this.name, 'Received review request')
    // Override in subclass
  }

  async onReviewFeedback(message) {
    logger.agent(this.name, 'Received review feedback')
    // Override in subclass
  }

  async onQuestion(message) {
    logger.agent(this.name, `Question: ${message.payload?.question}`)
    // Override in subclass
  }

  async onStatusUpdate(message) {
    logger.agent(this.name, `Status update from ${message.from}`)
    // Override in subclass
  }

  async onCompletion(message) {
    logger.agent(this.name, `Task completed by ${message.from}`)
    // Override in subclass
  }

  async onError(message) {
    logger.error(`Error from ${message.from}: ${message.payload?.error}`, this.id)
    // Override in subclass
  }

  /**
   * Get prompt for an action
   * @param {string} action
   * @returns {string}
   */
  getPrompt(action) {
    return this.prompts[action] || `Perform ${action}`
  }
}

export default BaseAgent
