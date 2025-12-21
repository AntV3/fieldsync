/**
 * TaskQueue - Task management and prioritization
 *
 * Manages the lifecycle of tasks including:
 * - Task creation and tracking
 * - Priority ordering
 * - Status updates
 * - Dependency management
 */

import { logger } from '../utils/logger.js'
import { v4 as uuidv4 } from 'uuid'

export class TaskQueue {
  constructor() {
    // All tasks indexed by ID
    this.tasks = new Map()

    // Priority queues
    this.pending = []
    this.inProgress = []
    this.completed = []
    this.blocked = []
  }

  /**
   * Create a new task
   * @param {Object} taskData
   * @returns {Object} Created task
   */
  createTask(taskData) {
    const task = {
      id: taskData.id || `task-${uuidv4().slice(0, 8)}`,
      title: taskData.title || taskData.description?.slice(0, 50) || 'Untitled Task',
      description: taskData.description || '',
      action: taskData.action || 'unknown',
      status: 'pending',
      priority: taskData.priority || 'medium', // high, medium, low
      assignedTo: taskData.assignedTo || null,
      createdBy: taskData.createdBy || null,
      dependencies: taskData.dependencies || [],
      blockedBy: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      result: null,
      error: null
    }

    this.tasks.set(task.id, task)
    this.pending.push(task.id)

    logger.task(task.id, 'pending', task.title)

    return task
  }

  /**
   * Get a task by ID
   * @param {string} taskId
   * @returns {Object|null}
   */
  getTask(taskId) {
    return this.tasks.get(taskId) || null
  }

  /**
   * Update task status
   * @param {string} taskId
   * @param {string} status
   * @param {Object} data - Additional data
   * @returns {Object|null}
   */
  updateStatus(taskId, status, data = {}) {
    const task = this.tasks.get(taskId)
    if (!task) return null

    const oldStatus = task.status

    // Remove from old queue
    this.removeFromQueue(taskId, oldStatus)

    // Update task
    task.status = status
    task.updatedAt = new Date().toISOString()

    // Handle status-specific updates
    switch (status) {
      case 'in_progress':
        task.startedAt = task.startedAt || new Date().toISOString()
        this.inProgress.push(taskId)
        break

      case 'completed':
        task.completedAt = new Date().toISOString()
        task.result = data.result || null
        this.completed.push(taskId)
        break

      case 'blocked':
        task.blockedBy = data.reason || 'Unknown reason'
        this.blocked.push(taskId)
        break

      case 'pending':
        this.pending.push(taskId)
        break
    }

    logger.task(taskId, status, data.reason)

    return task
  }

  /**
   * Remove task from its current queue
   */
  removeFromQueue(taskId, status) {
    const queues = {
      pending: this.pending,
      in_progress: this.inProgress,
      completed: this.completed,
      blocked: this.blocked
    }

    const queue = queues[status]
    if (queue) {
      const index = queue.indexOf(taskId)
      if (index > -1) {
        queue.splice(index, 1)
      }
    }
  }

  /**
   * Assign a task to an agent
   * @param {string} taskId
   * @param {string} agentId
   * @returns {Object|null}
   */
  assignTask(taskId, agentId) {
    const task = this.tasks.get(taskId)
    if (!task) return null

    task.assignedTo = agentId
    task.updatedAt = new Date().toISOString()

    logger.debug(`Task ${taskId} assigned to ${agentId}`)

    return task
  }

  /**
   * Get next pending task
   * @param {string} agentId - Optional, filter by assigned agent
   * @returns {Object|null}
   */
  getNextTask(agentId = null) {
    // Sort by priority
    const priorityOrder = { high: 0, medium: 1, low: 2 }

    const candidates = this.pending
      .map(id => this.tasks.get(id))
      .filter(task => {
        // Check if assigned to specific agent
        if (agentId && task.assignedTo && task.assignedTo !== agentId) {
          return false
        }

        // Check if dependencies are satisfied
        if (task.dependencies.length > 0) {
          const allCompleted = task.dependencies.every(depId => {
            const dep = this.tasks.get(depId)
            return dep && dep.status === 'completed'
          })
          if (!allCompleted) return false
        }

        return true
      })
      .sort((a, b) => {
        return (priorityOrder[a.priority] || 1) - (priorityOrder[b.priority] || 1)
      })

    return candidates[0] || null
  }

  /**
   * Get all tasks with optional filters
   * @param {Object} filters
   * @returns {Object[]}
   */
  getTasks(filters = {}) {
    let tasks = Array.from(this.tasks.values())

    if (filters.status) {
      tasks = tasks.filter(t => t.status === filters.status)
    }

    if (filters.assignedTo) {
      tasks = tasks.filter(t => t.assignedTo === filters.assignedTo)
    }

    if (filters.createdBy) {
      tasks = tasks.filter(t => t.createdBy === filters.createdBy)
    }

    if (filters.priority) {
      tasks = tasks.filter(t => t.priority === filters.priority)
    }

    return tasks
  }

  /**
   * Get task statistics
   * @returns {Object}
   */
  getStats() {
    return {
      total: this.tasks.size,
      pending: this.pending.length,
      inProgress: this.inProgress.length,
      completed: this.completed.length,
      blocked: this.blocked.length
    }
  }

  /**
   * Add dependency between tasks
   * @param {string} taskId
   * @param {string} dependsOn
   */
  addDependency(taskId, dependsOn) {
    const task = this.tasks.get(taskId)
    if (task && !task.dependencies.includes(dependsOn)) {
      task.dependencies.push(dependsOn)
      task.updatedAt = new Date().toISOString()
    }
  }

  /**
   * Clear all completed tasks
   */
  clearCompleted() {
    for (const taskId of this.completed) {
      this.tasks.delete(taskId)
    }
    this.completed = []
    logger.debug('Cleared completed tasks')
  }

  /**
   * Export tasks to JSON
   * @returns {Object}
   */
  export() {
    return {
      tasks: Array.from(this.tasks.values()),
      stats: this.getStats(),
      exportedAt: new Date().toISOString()
    }
  }

  /**
   * Import tasks from JSON
   * @param {Object} data
   */
  import(data) {
    if (!data.tasks) return

    for (const task of data.tasks) {
      this.tasks.set(task.id, task)

      // Add to appropriate queue
      switch (task.status) {
        case 'pending':
          this.pending.push(task.id)
          break
        case 'in_progress':
          this.inProgress.push(task.id)
          break
        case 'completed':
          this.completed.push(task.id)
          break
        case 'blocked':
          this.blocked.push(task.id)
          break
      }
    }
  }
}

export default TaskQueue
