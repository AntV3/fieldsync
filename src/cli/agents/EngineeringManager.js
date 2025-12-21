/**
 * EngineeringManager - Planning, architecture, and code review agent
 *
 * Capabilities:
 * - plan: Create implementation plans from requirements
 * - review: Review code changes and provide feedback
 * - architect: Make architecture decisions
 * - prioritize: Prioritize tasks and assign to engineers
 * - requirements: Break down features into requirements
 */

import { BaseAgent } from './BaseAgent.js'
import { logger } from '../utils/logger.js'
import { readFile, listFiles, analyzeJsFile, getProjectRoot } from '../utils/fileOps.js'
import path from 'path'

export class EngineeringManager extends BaseAgent {
  constructor(config, messageBus, contextManager) {
    super(config, messageBus, contextManager)

    // Manager-specific state
    this.delegatedTasks = new Map()
    this.reviewQueue = []
  }

  /**
   * Initialize the manager
   */
  async initialize() {
    await super.initialize()
    logger.debug('Engineering Manager ready', this.id)
  }

  /**
   * Perform an action
   * @param {string} action
   * @param {string} description
   * @param {Object} task
   * @returns {Object}
   */
  async performAction(action, description, task) {
    switch (action) {
      case 'plan':
        return await this.createPlan(description)

      case 'review':
        return await this.reviewCode(description)

      case 'architect':
        return await this.designArchitecture(description)

      case 'prioritize':
        return await this.prioritizeTasks(description)

      case 'requirements':
        return await this.extractRequirements(description)

      default:
        throw new Error(`Unknown action: ${action}`)
    }
  }

  /**
   * Create an implementation plan
   * @param {string} featureDescription
   * @returns {Object}
   */
  async createPlan(featureDescription) {
    logger.agent(this.name, 'Creating implementation plan')

    // Analyze the feature request
    const analysis = this.analyzeFeatureRequest(featureDescription)

    // Identify affected areas
    const affectedAreas = await this.identifyAffectedAreas(analysis)

    // Break down into tasks
    const tasks = this.breakdownIntoTasks(analysis, affectedAreas)

    // Create the plan
    const plan = {
      feature: featureDescription,
      analysis: {
        type: analysis.type,
        scope: analysis.scope,
        complexity: analysis.complexity
      },
      affectedAreas,
      tasks,
      estimatedSteps: tasks.length,
      recommendations: this.generateRecommendations(analysis)
    }

    // Store in context
    this.contextManager.setPlan(plan)

    return { plan: tasks, summary: `Created plan with ${tasks.length} tasks` }
  }

  /**
   * Analyze a feature request
   */
  analyzeFeatureRequest(description) {
    const lowerDesc = description.toLowerCase()

    // Determine type
    let type = 'feature'
    if (lowerDesc.includes('fix') || lowerDesc.includes('bug')) {
      type = 'bugfix'
    } else if (lowerDesc.includes('refactor')) {
      type = 'refactor'
    } else if (lowerDesc.includes('test')) {
      type = 'testing'
    } else if (lowerDesc.includes('update') || lowerDesc.includes('change')) {
      type = 'enhancement'
    }

    // Determine scope
    let scope = 'component'
    if (lowerDesc.includes('system') || lowerDesc.includes('architecture')) {
      scope = 'system'
    } else if (lowerDesc.includes('api') || lowerDesc.includes('endpoint')) {
      scope = 'api'
    } else if (lowerDesc.includes('ui') || lowerDesc.includes('interface') || lowerDesc.includes('form')) {
      scope = 'ui'
    } else if (lowerDesc.includes('database') || lowerDesc.includes('storage')) {
      scope = 'data'
    }

    // Estimate complexity
    const complexityIndicators = ['complex', 'multiple', 'system', 'integration', 'authentication', 'security']
    const hasComplexity = complexityIndicators.some(ind => lowerDesc.includes(ind))
    const complexity = hasComplexity ? 'high' : 'medium'

    // Extract key entities
    const entities = this.extractEntities(description)

    return { type, scope, complexity, entities, description }
  }

  /**
   * Extract entities from description
   */
  extractEntities(description) {
    const entities = []

    // Common patterns
    const patterns = [
      /(?:add|create|implement|build)\s+(?:a\s+)?(\w+)/gi,
      /(\w+)\s+(?:component|form|page|modal|button)/gi,
      /(?:for|to)\s+(?:the\s+)?(\w+)/gi
    ]

    for (const pattern of patterns) {
      let match
      while ((match = pattern.exec(description)) !== null) {
        const entity = match[1].toLowerCase()
        if (!['a', 'the', 'an', 'to', 'for'].includes(entity)) {
          entities.push(entity)
        }
      }
    }

    return [...new Set(entities)]
  }

  /**
   * Identify affected areas in the codebase
   */
  async identifyAffectedAreas(analysis) {
    const areas = []
    const projectRoot = getProjectRoot()

    // Check for relevant directories based on scope
    const scopeDirectories = {
      ui: ['src/components', 'src/pages', 'src/views'],
      api: ['src/api', 'src/services', 'src/lib'],
      data: ['src/models', 'src/store', 'src/context'],
      system: ['src/config', 'src/utils', 'src/lib']
    }

    const dirsToCheck = scopeDirectories[analysis.scope] || ['src/components']

    for (const dir of dirsToCheck) {
      const fullPath = path.join(projectRoot, dir)
      try {
        const files = await listFiles(fullPath, { extensions: ['.js', '.jsx', '.ts', '.tsx'] })
        if (files.length > 0) {
          areas.push({
            directory: dir,
            fileCount: files.length,
            relevance: 'high'
          })
        }
      } catch (e) {
        // Directory doesn't exist
      }
    }

    // Search for entity-related files
    for (const entity of analysis.entities) {
      try {
        const files = await listFiles(path.join(projectRoot, 'src'), {
          recursive: true,
          extensions: ['.js', '.jsx', '.ts', '.tsx']
        })

        const matches = files.filter(f =>
          f.toLowerCase().includes(entity.toLowerCase())
        )

        for (const match of matches) {
          areas.push({
            file: path.relative(projectRoot, match),
            entity,
            relevance: 'direct'
          })
        }
      } catch (e) {
        // Error searching
      }
    }

    return areas
  }

  /**
   * Break down analysis into tasks
   */
  breakdownIntoTasks(analysis, affectedAreas) {
    const tasks = []

    // Add analysis/planning task
    tasks.push({
      id: 1,
      title: `Analyze requirements for ${analysis.description.slice(0, 30)}...`,
      description: 'Review existing code and understand the current implementation',
      priority: 'high',
      type: 'analysis'
    })

    // Add implementation tasks based on type
    switch (analysis.type) {
      case 'feature':
        tasks.push({
          id: 2,
          title: 'Create component structure',
          description: 'Set up the basic component files and structure',
          priority: 'high',
          type: 'implementation'
        })
        tasks.push({
          id: 3,
          title: 'Implement core functionality',
          description: 'Write the main logic and behavior',
          priority: 'high',
          type: 'implementation'
        })
        tasks.push({
          id: 4,
          title: 'Add styling and UI polish',
          description: 'Style the components and ensure good UX',
          priority: 'medium',
          type: 'implementation'
        })
        break

      case 'bugfix':
        tasks.push({
          id: 2,
          title: 'Reproduce and diagnose issue',
          description: 'Understand the root cause of the bug',
          priority: 'high',
          type: 'debugging'
        })
        tasks.push({
          id: 3,
          title: 'Implement fix',
          description: 'Apply the necessary code changes',
          priority: 'high',
          type: 'implementation'
        })
        break

      case 'refactor':
        tasks.push({
          id: 2,
          title: 'Identify refactoring scope',
          description: 'Map out all code that needs to change',
          priority: 'high',
          type: 'analysis'
        })
        tasks.push({
          id: 3,
          title: 'Apply refactoring changes',
          description: 'Implement the refactored code',
          priority: 'high',
          type: 'implementation'
        })
        break

      default:
        tasks.push({
          id: 2,
          title: 'Implement changes',
          description: 'Make the required modifications',
          priority: 'high',
          type: 'implementation'
        })
    }

    // Add testing task
    tasks.push({
      id: tasks.length + 1,
      title: 'Test implementation',
      description: 'Verify the changes work correctly',
      priority: 'medium',
      type: 'testing'
    })

    // Add review task
    tasks.push({
      id: tasks.length + 1,
      title: 'Code review',
      description: 'Review code quality and patterns',
      priority: 'medium',
      type: 'review'
    })

    return tasks
  }

  /**
   * Generate recommendations
   */
  generateRecommendations(analysis) {
    const recommendations = []

    if (analysis.complexity === 'high') {
      recommendations.push('Consider breaking this into smaller PRs')
      recommendations.push('Add comprehensive tests for edge cases')
    }

    if (analysis.scope === 'system') {
      recommendations.push('Review for backward compatibility')
      recommendations.push('Update documentation after changes')
    }

    if (analysis.type === 'feature') {
      recommendations.push('Follow existing patterns in the codebase')
    }

    return recommendations
  }

  /**
   * Review code
   * @param {string} filePath
   * @returns {Object}
   */
  async reviewCode(filePath) {
    logger.agent(this.name, `Reviewing: ${filePath}`)

    const projectRoot = getProjectRoot()
    const fullPath = path.resolve(projectRoot, filePath)

    const content = await readFile(fullPath)
    if (!content) {
      return {
        approved: false,
        error: `Could not read file: ${filePath}`,
        comments: []
      }
    }

    const comments = []
    const lines = content.split('\n')

    // Analyze the file
    const analysis = analyzeJsFile(content)

    // Check for common issues
    this.checkForIssues(content, lines, comments)

    // Generate feedback
    const approved = comments.filter(c => c.severity === 'error').length === 0
    const suggestions = this.generateSuggestions(analysis, content)

    return {
      file: filePath,
      approved,
      comments,
      suggestions,
      stats: {
        lines: lines.length,
        functions: analysis.functions.length,
        components: analysis.components.length,
        imports: analysis.imports.length
      }
    }
  }

  /**
   * Check for common code issues
   */
  checkForIssues(content, lines, comments) {
    // Check for console.log statements
    lines.forEach((line, i) => {
      if (line.includes('console.log') && !line.trim().startsWith('//')) {
        comments.push({
          line: i + 1,
          message: 'Remove console.log before production',
          severity: 'warning'
        })
      }

      // Check for TODO comments
      if (line.includes('TODO') || line.includes('FIXME')) {
        comments.push({
          line: i + 1,
          message: 'Unresolved TODO/FIXME comment',
          severity: 'info'
        })
      }

      // Check for very long lines
      if (line.length > 120) {
        comments.push({
          line: i + 1,
          message: 'Line exceeds 120 characters',
          severity: 'info'
        })
      }
    })

    // Check for empty catch blocks
    const emptyCatch = /catch\s*\([^)]*\)\s*{\s*}/g
    if (emptyCatch.test(content)) {
      comments.push({
        message: 'Empty catch block found - handle or log errors',
        severity: 'warning'
      })
    }

    // Check for hardcoded strings that might be credentials
    const sensitivePatterns = [
      /password\s*=\s*['"][^'"]+['"]/gi,
      /api[_-]?key\s*=\s*['"][^'"]+['"]/gi,
      /secret\s*=\s*['"][^'"]+['"]/gi
    ]

    for (const pattern of sensitivePatterns) {
      if (pattern.test(content)) {
        comments.push({
          message: 'Potential hardcoded credential detected',
          severity: 'error'
        })
      }
    }
  }

  /**
   * Generate code suggestions
   */
  generateSuggestions(analysis, content) {
    const suggestions = []

    // Check component count
    if (analysis.components.length > 3) {
      suggestions.push('Consider splitting into smaller component files')
    }

    // Check import organization
    if (analysis.imports.length > 10) {
      suggestions.push('Consider grouping and organizing imports')
    }

    // Check for async/await consistency
    if (content.includes('.then(') && content.includes('async')) {
      suggestions.push('Mix of .then() and async/await - consider consistency')
    }

    return suggestions
  }

  /**
   * Design architecture
   * @param {string} description
   * @returns {Object}
   */
  async designArchitecture(description) {
    logger.agent(this.name, 'Designing architecture')

    const analysis = this.analyzeFeatureRequest(description)

    const architecture = {
      description,
      patterns: this.recommendPatterns(analysis),
      structure: this.recommendStructure(analysis),
      considerations: this.getArchitectureConsiderations(analysis)
    }

    return architecture
  }

  /**
   * Recommend design patterns
   */
  recommendPatterns(analysis) {
    const patterns = []

    if (analysis.scope === 'ui') {
      patterns.push({
        name: 'Component Composition',
        reason: 'Enables reusable UI building blocks'
      })
      patterns.push({
        name: 'Container/Presenter',
        reason: 'Separates logic from presentation'
      })
    }

    if (analysis.scope === 'api') {
      patterns.push({
        name: 'Service Layer',
        reason: 'Abstracts API communication'
      })
    }

    if (analysis.scope === 'data') {
      patterns.push({
        name: 'Repository Pattern',
        reason: 'Centralizes data access logic'
      })
    }

    return patterns
  }

  /**
   * Recommend file structure
   */
  recommendStructure(analysis) {
    return {
      recommended: true,
      directories: [
        { path: 'components/', purpose: 'Reusable UI components' },
        { path: 'hooks/', purpose: 'Custom React hooks' },
        { path: 'utils/', purpose: 'Helper functions' },
        { path: 'services/', purpose: 'API and business logic' }
      ]
    }
  }

  /**
   * Get architecture considerations
   */
  getArchitectureConsiderations(analysis) {
    return [
      'Maintain consistent coding style',
      'Follow existing project patterns',
      'Consider future scalability',
      'Ensure proper error handling'
    ]
  }

  /**
   * Prioritize tasks
   * @param {string} description
   * @returns {Object}
   */
  async prioritizeTasks(description) {
    logger.agent(this.name, 'Prioritizing tasks')

    // This would typically analyze existing tasks
    // For now, return a structured response
    return {
      message: 'Tasks prioritized based on dependencies and impact',
      criteria: [
        'Dependencies - tasks blocking others are higher priority',
        'Impact - user-facing changes prioritized',
        'Complexity - simpler tasks may unblock others'
      ]
    }
  }

  /**
   * Extract requirements
   * @param {string} description
   * @returns {Object}
   */
  async extractRequirements(description) {
    logger.agent(this.name, 'Extracting requirements')

    const analysis = this.analyzeFeatureRequest(description)

    const requirements = {
      functional: [],
      nonFunctional: [],
      constraints: []
    }

    // Generate functional requirements
    requirements.functional.push(`Implement ${analysis.description}`)
    if (analysis.scope === 'ui') {
      requirements.functional.push('Ensure responsive design')
      requirements.functional.push('Follow accessibility guidelines')
    }

    // Non-functional requirements
    requirements.nonFunctional.push('Maintain existing code quality standards')
    requirements.nonFunctional.push('No breaking changes to existing functionality')

    // Constraints
    requirements.constraints.push('Must work with existing tech stack')

    return requirements
  }

  /**
   * Handle review request from other agents
   */
  async onReviewRequest(message) {
    const { content, taskId } = message.payload

    logger.agent(this.name, 'Processing review request')

    // Perform review
    const review = await this.reviewCode(content)

    // Send feedback
    await this.replyTo(message, 'review-feedback', {
      taskId,
      review
    })
  }

  /**
   * Handle completion notification from engineer
   */
  async onCompletion(message) {
    const { taskId, result } = message.payload

    logger.agent(this.name, `Task ${taskId} completed by ${message.from}`)

    // Could trigger review or next steps
    this.delegatedTasks.delete(taskId)
  }

  /**
   * Execute a workflow step
   */
  async executeWorkflowStep(step, input, previousResults) {
    switch (step.id) {
      case 'analyze':
        return this.analyzeFeatureRequest(input.description || input)

      case 'requirements':
        return await this.extractRequirements(input.description || input)

      case 'breakdown':
        const analysis = previousResults.find(r => r.step === 'analyze')?.result
        return this.breakdownIntoTasks(analysis || {}, [])

      case 'prioritize':
        return { prioritized: true }

      case 'assign':
        return { assigned: true, to: 'software-engineer' }

      default:
        return { completed: true }
    }
  }
}

export default EngineeringManager
