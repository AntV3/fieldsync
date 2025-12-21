/**
 * ContextManager - Shared context and state between agents
 *
 * Manages:
 * - Current project state
 * - File changes and tracking
 * - Conversation history
 * - Agent memory
 * - Session persistence
 */

import { logger } from '../utils/logger.js'
import { getProjectRoot, readFile, writeFile, fileExists } from '../utils/fileOps.js'
import path from 'path'

export class ContextManager {
  constructor() {
    // Project context
    this.projectRoot = getProjectRoot()
    this.projectName = null
    this.projectConfig = null

    // Session state
    this.sessionId = `session-${Date.now()}`
    this.sessionStart = new Date()

    // File tracking
    this.openFiles = new Map() // path -> content
    this.modifiedFiles = new Set()
    this.createdFiles = new Set()

    // Agent memory
    this.agentMemory = new Map() // agentId -> { ... }

    // Conversation context
    this.conversationHistory = []
    this.currentGoal = null
    this.currentPlan = null

    // Key-value store for arbitrary data
    this.store = new Map()
  }

  /**
   * Initialize context manager
   */
  async initialize() {
    logger.debug('Initializing context manager')

    // Load project config if exists
    const packagePath = path.join(this.projectRoot, 'package.json')
    if (fileExists(packagePath)) {
      try {
        const content = await readFile(packagePath)
        this.projectConfig = JSON.parse(content)
        this.projectName = this.projectConfig.name || 'Unknown Project'
        logger.debug(`Project loaded: ${this.projectName}`)
      } catch (error) {
        logger.warn('Failed to parse package.json')
      }
    }
  }

  /**
   * Get project info
   * @returns {Object}
   */
  getProjectInfo() {
    return {
      name: this.projectName,
      root: this.projectRoot,
      config: this.projectConfig
    }
  }

  /**
   * Set current goal
   * @param {string} goal
   */
  setGoal(goal) {
    this.currentGoal = goal
    this.addToHistory('goal', goal)
    logger.debug(`Goal set: ${goal}`)
  }

  /**
   * Set current plan
   * @param {Object} plan
   */
  setPlan(plan) {
    this.currentPlan = plan
    this.addToHistory('plan', plan)
  }

  /**
   * Get current context for an agent
   * @param {string} agentId
   * @returns {Object}
   */
  getContextFor(agentId) {
    return {
      project: this.getProjectInfo(),
      goal: this.currentGoal,
      plan: this.currentPlan,
      openFiles: Array.from(this.openFiles.keys()),
      modifiedFiles: Array.from(this.modifiedFiles),
      memory: this.getAgentMemory(agentId),
      sessionId: this.sessionId
    }
  }

  /**
   * Track an opened file
   * @param {string} filePath
   * @param {string} content
   */
  trackFile(filePath, content) {
    const relativePath = path.relative(this.projectRoot, filePath)
    this.openFiles.set(relativePath, {
      content,
      openedAt: new Date(),
      originalContent: content
    })
  }

  /**
   * Mark a file as modified
   * @param {string} filePath
   * @param {string} newContent
   */
  markModified(filePath, newContent) {
    const relativePath = path.relative(this.projectRoot, filePath)
    this.modifiedFiles.add(relativePath)

    if (this.openFiles.has(relativePath)) {
      const file = this.openFiles.get(relativePath)
      file.content = newContent
      file.modifiedAt = new Date()
    }
  }

  /**
   * Mark a file as created
   * @param {string} filePath
   */
  markCreated(filePath) {
    const relativePath = path.relative(this.projectRoot, filePath)
    this.createdFiles.add(relativePath)
  }

  /**
   * Get file content from cache
   * @param {string} filePath
   * @returns {string|null}
   */
  getFileContent(filePath) {
    const relativePath = path.relative(this.projectRoot, filePath)
    const file = this.openFiles.get(relativePath)
    return file?.content || null
  }

  /**
   * Get changes made in this session
   * @returns {Object}
   */
  getSessionChanges() {
    return {
      modified: Array.from(this.modifiedFiles),
      created: Array.from(this.createdFiles)
    }
  }

  /**
   * Set agent memory
   * @param {string} agentId
   * @param {string} key
   * @param {*} value
   */
  setAgentMemory(agentId, key, value) {
    if (!this.agentMemory.has(agentId)) {
      this.agentMemory.set(agentId, new Map())
    }
    this.agentMemory.get(agentId).set(key, value)
  }

  /**
   * Get agent memory
   * @param {string} agentId
   * @param {string} key - Optional specific key
   * @returns {*}
   */
  getAgentMemory(agentId, key = null) {
    const memory = this.agentMemory.get(agentId)
    if (!memory) return key ? null : {}

    if (key) {
      return memory.get(key)
    }

    return Object.fromEntries(memory)
  }

  /**
   * Add to conversation history
   * @param {string} type
   * @param {*} content
   * @param {string} agent
   */
  addToHistory(type, content, agent = null) {
    this.conversationHistory.push({
      type,
      content,
      agent,
      timestamp: new Date().toISOString()
    })
  }

  /**
   * Get conversation history
   * @param {number} limit
   * @returns {Object[]}
   */
  getHistory(limit = 50) {
    return this.conversationHistory.slice(-limit)
  }

  /**
   * Set a value in the store
   * @param {string} key
   * @param {*} value
   */
  set(key, value) {
    this.store.set(key, value)
  }

  /**
   * Get a value from the store
   * @param {string} key
   * @param {*} defaultValue
   * @returns {*}
   */
  get(key, defaultValue = null) {
    return this.store.has(key) ? this.store.get(key) : defaultValue
  }

  /**
   * Check if a key exists
   * @param {string} key
   * @returns {boolean}
   */
  has(key) {
    return this.store.has(key)
  }

  /**
   * Delete a key from store
   * @param {string} key
   */
  delete(key) {
    this.store.delete(key)
  }

  /**
   * Get session duration
   * @returns {number} Duration in milliseconds
   */
  getSessionDuration() {
    return Date.now() - this.sessionStart.getTime()
  }

  /**
   * Export context to JSON
   * @returns {Object}
   */
  export() {
    return {
      sessionId: this.sessionId,
      sessionStart: this.sessionStart.toISOString(),
      project: this.getProjectInfo(),
      goal: this.currentGoal,
      plan: this.currentPlan,
      changes: this.getSessionChanges(),
      history: this.conversationHistory,
      agentMemory: Object.fromEntries(
        Array.from(this.agentMemory.entries()).map(([id, mem]) => [
          id,
          Object.fromEntries(mem)
        ])
      ),
      store: Object.fromEntries(this.store)
    }
  }

  /**
   * Save context to file
   * @param {string} filePath
   */
  async save(filePath = null) {
    const savePath = filePath || path.join(this.projectRoot, '.fieldsync-context.json')
    const data = JSON.stringify(this.export(), null, 2)
    await writeFile(savePath, data)
    logger.debug(`Context saved to ${savePath}`)
  }

  /**
   * Load context from file
   * @param {string} filePath
   */
  async load(filePath = null) {
    const loadPath = filePath || path.join(this.projectRoot, '.fieldsync-context.json')

    if (!fileExists(loadPath)) {
      logger.debug('No saved context found')
      return
    }

    try {
      const content = await readFile(loadPath)
      const data = JSON.parse(content)

      this.currentGoal = data.goal
      this.currentPlan = data.plan
      this.conversationHistory = data.history || []

      if (data.store) {
        this.store = new Map(Object.entries(data.store))
      }

      if (data.agentMemory) {
        for (const [agentId, memory] of Object.entries(data.agentMemory)) {
          this.agentMemory.set(agentId, new Map(Object.entries(memory)))
        }
      }

      logger.debug('Context loaded from file')
    } catch (error) {
      logger.warn(`Failed to load context: ${error.message}`)
    }
  }

  /**
   * Reset the context
   */
  reset() {
    this.openFiles.clear()
    this.modifiedFiles.clear()
    this.createdFiles.clear()
    this.agentMemory.clear()
    this.conversationHistory = []
    this.currentGoal = null
    this.currentPlan = null
    this.store.clear()

    logger.debug('Context reset')
  }
}

export default ContextManager
