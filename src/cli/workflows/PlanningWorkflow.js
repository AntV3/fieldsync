/**
 * PlanningWorkflow - Multi-step planning process
 *
 * Executed by the Engineering Manager to break down
 * feature requests into actionable implementation plans.
 */

import { logger } from '../utils/logger.js'

export class PlanningWorkflow {
  constructor(orchestrator) {
    this.orchestrator = orchestrator
    this.name = 'Planning Workflow'
  }

  /**
   * Execute the planning workflow
   * @param {Object} input - Feature request input
   * @returns {Object} Planning result
   */
  async execute(input) {
    logger.header(this.name)

    const results = {
      steps: [],
      plan: null,
      success: false
    }

    try {
      // Step 1: Analyze the request
      logger.step(this.name, 'Analyzing request', 'running')
      const analysis = await this.analyzeRequest(input)
      results.steps.push({ name: 'analyze', result: analysis })
      logger.step(this.name, 'Analyzing request', 'done')

      // Step 2: Extract requirements
      logger.step(this.name, 'Extracting requirements', 'running')
      const requirements = await this.extractRequirements(analysis)
      results.steps.push({ name: 'requirements', result: requirements })
      logger.step(this.name, 'Extracting requirements', 'done')

      // Step 3: Break down into tasks
      logger.step(this.name, 'Breaking down into tasks', 'running')
      const tasks = await this.breakdownTasks(requirements, analysis)
      results.steps.push({ name: 'breakdown', result: tasks })
      logger.step(this.name, 'Breaking down into tasks', 'done')

      // Step 4: Prioritize tasks
      logger.step(this.name, 'Prioritizing tasks', 'running')
      const prioritized = await this.prioritizeTasks(tasks)
      results.steps.push({ name: 'prioritize', result: prioritized })
      logger.step(this.name, 'Prioritizing tasks', 'done')

      // Step 5: Create final plan
      logger.step(this.name, 'Creating plan', 'running')
      const plan = this.createPlan(input, analysis, requirements, prioritized)
      results.plan = plan
      results.success = true
      logger.step(this.name, 'Creating plan', 'done')

      return results

    } catch (error) {
      logger.error(`Planning failed: ${error.message}`)
      results.error = error.message
      return results
    }
  }

  /**
   * Analyze the feature request
   */
  async analyzeRequest(input) {
    const description = input.description || input

    return {
      description,
      type: this.detectRequestType(description),
      scope: this.detectScope(description),
      complexity: this.estimateComplexity(description),
      keywords: this.extractKeywords(description)
    }
  }

  /**
   * Detect the type of request
   */
  detectRequestType(description) {
    const lower = description.toLowerCase()

    if (lower.includes('fix') || lower.includes('bug')) return 'bugfix'
    if (lower.includes('add') || lower.includes('create') || lower.includes('implement')) return 'feature'
    if (lower.includes('update') || lower.includes('change') || lower.includes('modify')) return 'enhancement'
    if (lower.includes('refactor') || lower.includes('clean')) return 'refactor'
    if (lower.includes('remove') || lower.includes('delete')) return 'removal'

    return 'feature'
  }

  /**
   * Detect the scope of changes
   */
  detectScope(description) {
    const lower = description.toLowerCase()

    if (lower.includes('api') || lower.includes('endpoint') || lower.includes('backend')) return 'api'
    if (lower.includes('ui') || lower.includes('component') || lower.includes('button') || lower.includes('form')) return 'ui'
    if (lower.includes('database') || lower.includes('storage') || lower.includes('data')) return 'data'
    if (lower.includes('auth') || lower.includes('login') || lower.includes('security')) return 'auth'
    if (lower.includes('style') || lower.includes('css') || lower.includes('design')) return 'styling'

    return 'general'
  }

  /**
   * Estimate complexity
   */
  estimateComplexity(description) {
    const lower = description.toLowerCase()

    const highComplexity = ['system', 'architecture', 'integration', 'migration', 'rewrite']
    const lowComplexity = ['typo', 'text', 'color', 'simple', 'minor']

    if (highComplexity.some(word => lower.includes(word))) return 'high'
    if (lowComplexity.some(word => lower.includes(word))) return 'low'

    return 'medium'
  }

  /**
   * Extract keywords from description
   */
  extractKeywords(description) {
    const words = description.toLowerCase().split(/\s+/)
    const stopWords = ['a', 'an', 'the', 'to', 'for', 'and', 'or', 'but', 'in', 'on', 'at', 'with']

    return words
      .filter(word => word.length > 2 && !stopWords.includes(word))
      .slice(0, 10)
  }

  /**
   * Extract requirements from analysis
   */
  async extractRequirements(analysis) {
    const requirements = {
      functional: [],
      technical: [],
      constraints: []
    }

    // Functional requirements based on type
    switch (analysis.type) {
      case 'feature':
        requirements.functional.push(`Implement ${analysis.description}`)
        requirements.functional.push('Ensure feature is accessible to intended users')
        break
      case 'bugfix':
        requirements.functional.push('Identify root cause of the issue')
        requirements.functional.push('Implement fix without side effects')
        requirements.functional.push('Add test to prevent regression')
        break
      case 'enhancement':
        requirements.functional.push('Maintain backward compatibility')
        requirements.functional.push('Improve existing functionality')
        break
    }

    // Technical requirements based on scope
    switch (analysis.scope) {
      case 'ui':
        requirements.technical.push('Follow existing UI patterns')
        requirements.technical.push('Ensure responsive design')
        requirements.technical.push('Maintain accessibility standards')
        break
      case 'api':
        requirements.technical.push('Follow RESTful conventions')
        requirements.technical.push('Handle errors appropriately')
        requirements.technical.push('Document API changes')
        break
      case 'data':
        requirements.technical.push('Ensure data integrity')
        requirements.technical.push('Consider migration needs')
        break
    }

    // General constraints
    requirements.constraints.push('No breaking changes to existing functionality')
    requirements.constraints.push('Follow existing code style')

    return requirements
  }

  /**
   * Break down requirements into tasks
   */
  async breakdownTasks(requirements, analysis) {
    const tasks = []
    let taskId = 1

    // Research task
    tasks.push({
      id: taskId++,
      title: 'Research and understand existing code',
      type: 'research',
      priority: 'high',
      assignee: 'software-engineer'
    })

    // Implementation tasks from functional requirements
    for (const req of requirements.functional) {
      tasks.push({
        id: taskId++,
        title: req,
        type: 'implementation',
        priority: analysis.complexity === 'high' ? 'high' : 'medium',
        assignee: 'software-engineer'
      })
    }

    // Technical tasks
    if (analysis.scope === 'ui') {
      tasks.push({
        id: taskId++,
        title: 'Add styling and ensure responsive design',
        type: 'styling',
        priority: 'medium',
        assignee: 'software-engineer'
      })
    }

    // Testing task
    tasks.push({
      id: taskId++,
      title: 'Test implementation thoroughly',
      type: 'testing',
      priority: 'high',
      assignee: 'software-engineer'
    })

    // Review task
    tasks.push({
      id: taskId++,
      title: 'Code review',
      type: 'review',
      priority: 'medium',
      assignee: 'engineering-manager'
    })

    return tasks
  }

  /**
   * Prioritize tasks
   */
  async prioritizeTasks(tasks) {
    // Sort by priority and type
    const priorityOrder = { high: 0, medium: 1, low: 2 }
    const typeOrder = { research: 0, implementation: 1, styling: 2, testing: 3, review: 4 }

    return tasks.sort((a, b) => {
      const priorityDiff = (priorityOrder[a.priority] || 1) - (priorityOrder[b.priority] || 1)
      if (priorityDiff !== 0) return priorityDiff

      return (typeOrder[a.type] || 5) - (typeOrder[b.type] || 5)
    })
  }

  /**
   * Create the final plan
   */
  createPlan(input, analysis, requirements, tasks) {
    return {
      feature: input.description || input,
      createdAt: new Date().toISOString(),
      analysis: {
        type: analysis.type,
        scope: analysis.scope,
        complexity: analysis.complexity
      },
      requirements,
      tasks,
      totalTasks: tasks.length,
      estimatedEffort: this.estimateEffort(analysis.complexity, tasks.length)
    }
  }

  /**
   * Estimate effort based on complexity and task count
   */
  estimateEffort(complexity, taskCount) {
    const baseEffort = {
      low: 'small',
      medium: 'medium',
      high: 'large'
    }

    return baseEffort[complexity] || 'medium'
  }
}

export default PlanningWorkflow
