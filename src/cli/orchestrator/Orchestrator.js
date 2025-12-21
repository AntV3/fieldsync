/**
 * Orchestrator - Coordinates multi-agent collaboration
 *
 * Responsible for:
 * - Agent registration and lifecycle
 * - Task routing and delegation
 * - Workflow execution
 * - Error handling and recovery
 */

import { logger } from '../utils/logger.js'
import { formatAgent, formatTaskList } from '../utils/formatter.js'
import { MessageBus } from './MessageBus.js'
import { TaskQueue } from './TaskQueue.js'
import { ContextManager } from '../context/ContextManager.js'
import { EngineeringManager } from '../agents/EngineeringManager.js'
import { SoftwareEngineer } from '../agents/SoftwareEngineer.js'

// Import agent configurations
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export class Orchestrator {
  constructor() {
    // Core components
    this.messageBus = new MessageBus()
    this.taskQueue = new TaskQueue()
    this.contextManager = new ContextManager()

    // Registered agents
    this.agents = new Map()

    // Agent configurations
    this.agentConfigs = null

    // Workflow definitions
    this.workflows = null
  }

  /**
   * Initialize the orchestrator and all agents
   */
  async initialize() {
    logger.debug('Initializing orchestrator')

    // Load configurations
    await this.loadConfigurations()

    // Initialize context manager
    await this.contextManager.initialize()

    // Register agents
    await this.registerAgents()

    logger.success('Orchestrator initialized')
  }

  /**
   * Load agent and workflow configurations
   */
  async loadConfigurations() {
    try {
      const configPath = join(__dirname, '../config/agents.json')
      const workflowPath = join(__dirname, '../config/workflows.json')

      this.agentConfigs = JSON.parse(readFileSync(configPath, 'utf-8'))
      this.workflows = JSON.parse(readFileSync(workflowPath, 'utf-8'))

      logger.debug('Configurations loaded')
    } catch (error) {
      logger.error(`Failed to load configurations: ${error.message}`)
      throw error
    }
  }

  /**
   * Register all agents
   */
  async registerAgents() {
    const agentClasses = {
      'engineering-manager': EngineeringManager,
      'software-engineer': SoftwareEngineer
    }

    for (const [agentId, config] of Object.entries(this.agentConfigs.agents)) {
      const AgentClass = agentClasses[agentId]

      if (!AgentClass) {
        logger.warn(`No class found for agent: ${agentId}`)
        continue
      }

      const agent = new AgentClass(
        config,
        this.messageBus,
        this.contextManager
      )

      await agent.initialize()
      this.agents.set(agentId, agent)

      logger.debug(`Registered agent: ${agentId}`)
    }
  }

  /**
   * Get an agent by ID
   * @param {string} agentId
   * @returns {Object|null}
   */
  getAgent(agentId) {
    return this.agents.get(agentId) || null
  }

  /**
   * Execute a task with a specific agent
   * @param {string} agentId
   * @param {string} action
   * @param {string} description
   */
  async executeTask(agentId, action, description) {
    const agent = this.getAgent(agentId)

    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`)
    }

    if (!agent.hasCapability(action)) {
      throw new Error(`Agent ${agentId} does not have capability: ${action}`)
    }

    // Set the goal in context
    this.contextManager.setGoal(`${action}: ${description}`)

    // Create task in queue
    const task = this.taskQueue.createTask({
      action,
      description,
      assignedTo: agentId,
      createdBy: 'orchestrator'
    })

    // Execute the task
    logger.header(`${agent.name}: ${action}`)

    try {
      const result = await agent.executeTask(action, description)

      // Update task status
      this.taskQueue.updateStatus(task.id, 'completed', { result })

      // Display result
      if (result) {
        this.displayResult(action, result)
      }

      return result
    } catch (error) {
      this.taskQueue.updateStatus(task.id, 'blocked', { reason: error.message })
      throw error
    }
  }

  /**
   * Display task result based on action type
   */
  displayResult(action, result) {
    switch (action) {
      case 'plan':
        if (result.plan) {
          logger.info('\nImplementation Plan:')
          logger.divider()
          result.plan.forEach((step, i) => {
            logger.list(`${step.title}`, 0)
            if (step.description) {
              logger.list(step.description, 4)
            }
          })
        }
        break

      case 'review':
        if (result.approved !== undefined) {
          const status = result.approved ? 'Approved' : 'Changes Requested'
          logger.info(`\nReview Result: ${status}`)
          if (result.comments) {
            result.comments.forEach(c => logger.list(c))
          }
        }
        break

      case 'implement':
        if (result.files) {
          logger.info('\nFiles to modify:')
          result.files.forEach(f => logger.list(f))
        }
        break

      case 'test':
        if (result.passed !== undefined) {
          const status = result.passed ? 'All tests passed' : 'Some tests failed'
          logger.info(`\nTest Result: ${status}`)
        }
        break

      case 'debug':
        if (result.rootCause) {
          logger.info(`\nRoot Cause: ${result.rootCause}`)
        }
        if (result.suggestion) {
          logger.info(`Suggestion: ${result.suggestion}`)
        }
        break

      default:
        if (typeof result === 'object') {
          logger.info('\nResult:')
          logger.info(JSON.stringify(result, null, 2))
        }
    }
  }

  /**
   * Run a workflow
   * @param {string} workflowId
   * @param {Object} input
   */
  async runWorkflow(workflowId, input) {
    const workflow = this.workflows.workflows[workflowId]

    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`)
    }

    logger.header(`Workflow: ${workflow.name}`)

    const agent = this.getAgent(workflow.agent)
    if (!agent) {
      throw new Error(`Agent not found for workflow: ${workflow.agent}`)
    }

    const results = []

    for (const step of workflow.steps) {
      logger.step(workflow.name, step.name, 'running')

      try {
        // Execute step action
        const result = await agent.executeWorkflowStep(step, input, results)
        results.push({ step: step.id, result })

        logger.step(workflow.name, step.name, 'done')
      } catch (error) {
        logger.error(`Step failed: ${step.name} - ${error.message}`)
        throw error
      }
    }

    return results
  }

  /**
   * List all tasks
   */
  listTasks() {
    const tasks = this.taskQueue.getTasks()
    const stats = this.taskQueue.getStats()

    logger.header('Task List')
    logger.info(`Total: ${stats.total} | Pending: ${stats.pending} | In Progress: ${stats.inProgress} | Completed: ${stats.completed}`)
    logger.divider()

    if (tasks.length === 0) {
      logger.info('No tasks found')
      return
    }

    console.log(formatTaskList(tasks))
  }

  /**
   * Show a specific task
   */
  showTask(taskId) {
    const task = this.taskQueue.getTask(taskId)

    if (!task) {
      logger.error(`Task not found: ${taskId}`)
      return
    }

    logger.header(`Task: ${taskId}`)
    logger.info(`Title: ${task.title}`)
    logger.info(`Status: ${task.status}`)
    logger.info(`Assigned To: ${task.assignedTo || 'Unassigned'}`)
    logger.info(`Priority: ${task.priority}`)
    logger.info(`Created: ${task.createdAt}`)

    if (task.description) {
      logger.divider()
      logger.info(`Description:\n${task.description}`)
    }

    if (task.result) {
      logger.divider()
      logger.info('Result:')
      console.log(JSON.stringify(task.result, null, 2))
    }
  }

  /**
   * Complete a task
   */
  completeTask(taskId) {
    const task = this.taskQueue.updateStatus(taskId, 'completed')

    if (task) {
      logger.success(`Task ${taskId} marked as completed`)
    } else {
      logger.error(`Task not found: ${taskId}`)
    }
  }

  /**
   * Block a task
   */
  blockTask(taskId, reason) {
    const task = this.taskQueue.updateStatus(taskId, 'blocked', { reason })

    if (task) {
      logger.warn(`Task ${taskId} blocked: ${reason}`)
    } else {
      logger.error(`Task not found: ${taskId}`)
    }
  }

  /**
   * List all registered agents
   */
  listAgents() {
    logger.header('Registered Agents')

    for (const [id, agent] of this.agents) {
      console.log(formatAgent({
        id,
        name: agent.name,
        role: agent.role,
        capabilities: agent.capabilities,
        status: agent.status
      }))
      logger.divider()
    }
  }

  /**
   * Show agent statuses
   */
  showAgentStatus() {
    logger.header('Agent Status')

    for (const [id, agent] of this.agents) {
      const status = agent.getStatus()
      const statusColor = status.status === 'idle' ? '\x1b[32m' : '\x1b[33m'
      logger.info(`${agent.name}: ${statusColor}${status.status}\x1b[0m`)

      if (status.currentTask) {
        logger.list(`Current task: ${status.currentTask}`, 2)
      }
      logger.list(`Tasks completed: ${status.tasksCompleted}`, 2)
    }
  }

  /**
   * Get orchestrator status
   */
  getStatus() {
    return {
      agents: Array.from(this.agents.keys()),
      tasks: this.taskQueue.getStats(),
      messages: this.messageBus.getHistory({ limit: 10 }),
      session: {
        id: this.contextManager.sessionId,
        duration: this.contextManager.getSessionDuration(),
        goal: this.contextManager.currentGoal
      }
    }
  }

  /**
   * Shutdown orchestrator
   */
  async shutdown() {
    logger.debug('Shutting down orchestrator')

    // Save context if needed
    // await this.contextManager.save()

    // Clear all subscribers
    for (const agentId of this.agents.keys()) {
      this.messageBus.unsubscribe(agentId)
    }

    this.agents.clear()
    logger.debug('Orchestrator shutdown complete')
  }
}

export default Orchestrator
