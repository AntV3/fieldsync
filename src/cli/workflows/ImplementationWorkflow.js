/**
 * ImplementationWorkflow - Code implementation process
 *
 * Executed by the Software Engineer to implement
 * features based on the plan from Engineering Manager.
 */

import { logger } from '../utils/logger.js'
import { readFile, listFiles, getProjectRoot, fileExists } from '../utils/fileOps.js'
import path from 'path'

export class ImplementationWorkflow {
  constructor(orchestrator) {
    this.orchestrator = orchestrator
    this.name = 'Implementation Workflow'
  }

  /**
   * Execute the implementation workflow
   * @param {Object} input - Task or feature to implement
   * @returns {Object} Implementation result
   */
  async execute(input) {
    logger.header(this.name)

    const results = {
      steps: [],
      implementation: null,
      success: false
    }

    try {
      // Step 1: Understand the task
      logger.step(this.name, 'Understanding task', 'running')
      const understanding = await this.understandTask(input)
      results.steps.push({ name: 'understand', result: understanding })
      logger.step(this.name, 'Understanding task', 'done')

      // Step 2: Locate relevant files
      logger.step(this.name, 'Locating files', 'running')
      const files = await this.locateFiles(understanding)
      results.steps.push({ name: 'locate', result: files })
      logger.step(this.name, 'Locating files', 'done')

      // Step 3: Plan implementation
      logger.step(this.name, 'Planning implementation', 'running')
      const plan = await this.planImplementation(understanding, files)
      results.steps.push({ name: 'plan', result: plan })
      logger.step(this.name, 'Planning implementation', 'done')

      // Step 4: Generate implementation details
      logger.step(this.name, 'Generating implementation', 'running')
      const implementation = await this.generateImplementation(plan)
      results.implementation = implementation
      results.steps.push({ name: 'implement', result: implementation })
      logger.step(this.name, 'Generating implementation', 'done')

      // Step 5: Self-verify
      logger.step(this.name, 'Verifying', 'running')
      const verification = this.selfVerify(implementation, understanding)
      results.steps.push({ name: 'verify', result: verification })
      results.success = verification.passed
      logger.step(this.name, 'Verifying', 'done')

      return results

    } catch (error) {
      logger.error(`Implementation failed: ${error.message}`)
      results.error = error.message
      return results
    }
  }

  /**
   * Understand the task requirements
   */
  async understandTask(input) {
    const description = input.description || input.title || input

    return {
      description,
      type: this.determineTaskType(description),
      components: this.identifyComponents(description),
      actions: this.identifyActions(description)
    }
  }

  /**
   * Determine the type of task
   */
  determineTaskType(description) {
    const lower = description.toLowerCase()

    if (lower.includes('component') || lower.includes('form') || lower.includes('button')) return 'component'
    if (lower.includes('function') || lower.includes('utility') || lower.includes('helper')) return 'utility'
    if (lower.includes('hook') || lower.includes('use')) return 'hook'
    if (lower.includes('style') || lower.includes('css')) return 'styling'
    if (lower.includes('api') || lower.includes('fetch') || lower.includes('service')) return 'service'
    if (lower.includes('fix') || lower.includes('bug')) return 'bugfix'

    return 'feature'
  }

  /**
   * Identify components mentioned
   */
  identifyComponents(description) {
    const components = []
    const patterns = [
      /(\w+)\s*component/gi,
      /(\w+)\s*form/gi,
      /(\w+)\s*page/gi,
      /(\w+)\s*modal/gi,
      /(\w+)\s*button/gi
    ]

    for (const pattern of patterns) {
      let match
      while ((match = pattern.exec(description)) !== null) {
        components.push(match[1])
      }
    }

    return [...new Set(components)]
  }

  /**
   * Identify actions to perform
   */
  identifyActions(description) {
    const actions = []
    const lower = description.toLowerCase()

    if (lower.includes('add') || lower.includes('create')) actions.push('create')
    if (lower.includes('update') || lower.includes('modify')) actions.push('update')
    if (lower.includes('delete') || lower.includes('remove')) actions.push('delete')
    if (lower.includes('style') || lower.includes('design')) actions.push('style')
    if (lower.includes('fix')) actions.push('fix')
    if (lower.includes('refactor')) actions.push('refactor')

    return actions.length > 0 ? actions : ['implement']
  }

  /**
   * Locate relevant files
   */
  async locateFiles(understanding) {
    const projectRoot = getProjectRoot()
    const files = {
      toModify: [],
      toCreate: [],
      toReference: []
    }

    // Determine directories to search
    const searchDirs = {
      component: ['src/components'],
      utility: ['src/utils', 'src/lib'],
      hook: ['src/hooks'],
      styling: ['src/styles', 'src'],
      service: ['src/services', 'src/lib'],
      feature: ['src/components', 'src'],
      bugfix: ['src']
    }

    const dirs = searchDirs[understanding.type] || ['src']

    // Search for related files
    for (const dir of dirs) {
      const fullDir = path.join(projectRoot, dir)
      try {
        const foundFiles = await listFiles(fullDir, {
          extensions: ['.js', '.jsx', '.ts', '.tsx'],
          recursive: true
        })

        // Score files by relevance
        for (const file of foundFiles.slice(0, 20)) {
          const relativePath = path.relative(projectRoot, file)
          const fileName = path.basename(file).toLowerCase()
          let score = 0

          // Check component matches
          for (const comp of understanding.components) {
            if (fileName.includes(comp.toLowerCase())) {
              score += 10
            }
          }

          // Check description keywords
          const keywords = understanding.description.toLowerCase().split(/\s+/)
          for (const keyword of keywords) {
            if (keyword.length > 3 && fileName.includes(keyword)) {
              score += 5
            }
          }

          if (score > 0) {
            files.toModify.push({ path: relativePath, score })
          } else if (files.toReference.length < 5) {
            files.toReference.push({ path: relativePath, score: 0 })
          }
        }
      } catch (e) {
        // Directory doesn't exist
      }
    }

    // Sort by score
    files.toModify.sort((a, b) => b.score - a.score)
    files.toModify = files.toModify.slice(0, 5)

    // Determine if new files needed
    if (understanding.actions.includes('create') && files.toModify.length === 0) {
      const componentName = understanding.components[0] || 'NewComponent'
      const ext = understanding.type === 'hook' ? '.js' : '.jsx'
      const dir = understanding.type === 'hook' ? 'hooks' : 'components'

      files.toCreate.push({
        path: `src/${dir}/${componentName}${ext}`,
        type: understanding.type
      })
    }

    return files
  }

  /**
   * Plan the implementation
   */
  async planImplementation(understanding, files) {
    const steps = []

    // Step 1: Review existing code
    if (files.toModify.length > 0 || files.toReference.length > 0) {
      steps.push({
        order: 1,
        action: 'review',
        description: 'Review existing code patterns',
        files: [...files.toModify, ...files.toReference].map(f => f.path).slice(0, 3)
      })
    }

    // Step 2: Create new files if needed
    if (files.toCreate.length > 0) {
      steps.push({
        order: 2,
        action: 'create',
        description: 'Create new files',
        files: files.toCreate.map(f => f.path)
      })
    }

    // Step 3: Modify existing files
    if (files.toModify.length > 0) {
      steps.push({
        order: 3,
        action: 'modify',
        description: 'Modify existing files',
        files: files.toModify.map(f => f.path)
      })
    }

    // Step 4: Add styling if needed
    if (understanding.actions.includes('style') || understanding.type === 'component') {
      steps.push({
        order: 4,
        action: 'style',
        description: 'Add or update styles',
        files: ['src/index.css']
      })
    }

    // Step 5: Integration
    steps.push({
      order: 5,
      action: 'integrate',
      description: 'Integrate with existing code'
    })

    return {
      understanding,
      steps,
      files
    }
  }

  /**
   * Generate implementation details
   */
  async generateImplementation(plan) {
    const implementation = {
      files: [],
      changes: [],
      newCode: []
    }

    // Generate for each step
    for (const step of plan.steps) {
      switch (step.action) {
        case 'create':
          for (const filePath of step.files || []) {
            const template = this.generateTemplate(plan.understanding.type, filePath)
            implementation.newCode.push({
              file: filePath,
              content: template,
              action: 'create'
            })
          }
          break

        case 'modify':
          for (const filePath of step.files || []) {
            implementation.changes.push({
              file: filePath,
              action: 'modify',
              description: `Update ${filePath} for ${plan.understanding.description}`
            })
          }
          break

        case 'style':
          implementation.changes.push({
            file: 'src/index.css',
            action: 'modify',
            description: 'Add styles for new components'
          })
          break
      }
    }

    implementation.summary = `Implementation plan for: ${plan.understanding.description}`
    implementation.fileCount = implementation.newCode.length + implementation.changes.length

    return implementation
  }

  /**
   * Generate a file template
   */
  generateTemplate(type, filePath) {
    const name = path.basename(filePath, path.extname(filePath))

    switch (type) {
      case 'component':
        return `import React from 'react'

export function ${name}({ /* props */ }) {
  return (
    <div className="${name.toLowerCase()}">
      {/* ${name} content */}
    </div>
  )
}

export default ${name}
`

      case 'hook':
        return `import { useState, useEffect } from 'react'

export function ${name}() {
  const [state, setState] = useState(null)

  useEffect(() => {
    // Effect logic here
  }, [])

  return state
}

export default ${name}
`

      case 'utility':
        return `/**
 * ${name} utility functions
 */

export function ${name}() {
  // Implementation here
}

export default { ${name} }
`

      case 'service':
        return `/**
 * ${name} service
 */

export async function fetch${name}() {
  // API call here
}

export default { fetch${name} }
`

      default:
        return `// ${name}\n\nexport default {}\n`
    }
  }

  /**
   * Self-verify the implementation
   */
  selfVerify(implementation, understanding) {
    const checks = []
    let passed = true

    // Check that we have files to work with
    if (implementation.fileCount === 0) {
      checks.push({ check: 'Has files to modify', passed: false })
      passed = false
    } else {
      checks.push({ check: 'Has files to modify', passed: true })
    }

    // Check that the implementation addresses the task
    if (understanding.actions.includes('create') && implementation.newCode.length === 0) {
      checks.push({ check: 'Creates required files', passed: false })
      passed = false
    } else {
      checks.push({ check: 'Implementation addresses task', passed: true })
    }

    return {
      passed,
      checks,
      message: passed ? 'Implementation plan verified' : 'Some checks failed'
    }
  }
}

export default ImplementationWorkflow
