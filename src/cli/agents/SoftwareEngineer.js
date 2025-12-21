/**
 * SoftwareEngineer - Implementation, testing, and debugging agent
 *
 * Capabilities:
 * - implement: Write code based on specifications
 * - test: Run tests and report results
 * - debug: Analyze errors and suggest fixes
 * - refactor: Improve existing code
 * - document: Generate documentation
 */

import { BaseAgent } from './BaseAgent.js'
import { logger } from '../utils/logger.js'
import { readFile, writeFile, listFiles, analyzeJsFile, getProjectRoot, fileExists } from '../utils/fileOps.js'
import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'

const execAsync = promisify(exec)

export class SoftwareEngineer extends BaseAgent {
  constructor(config, messageBus, contextManager) {
    super(config, messageBus, contextManager)

    // Engineer-specific state
    this.currentFile = null
    this.pendingChanges = []
  }

  /**
   * Initialize the engineer
   */
  async initialize() {
    await super.initialize()
    logger.debug('Software Engineer ready', this.id)
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
      case 'implement':
        return await this.implementFeature(description)

      case 'test':
        return await this.runTests(description)

      case 'debug':
        return await this.debugError(description)

      case 'refactor':
        return await this.refactorCode(description)

      case 'document':
        return await this.generateDocumentation(description)

      default:
        throw new Error(`Unknown action: ${action}`)
    }
  }

  /**
   * Implement a feature
   * @param {string} description
   * @returns {Object}
   */
  async implementFeature(description) {
    logger.agent(this.name, 'Analyzing implementation requirements')

    // Parse the implementation request
    const analysis = this.analyzeImplementationRequest(description)

    // Find relevant files
    const relevantFiles = await this.findRelevantFiles(analysis)

    // Generate implementation plan
    const implementationSteps = this.generateImplementationSteps(analysis, relevantFiles)

    // For now, return the analysis and plan
    // In a full implementation, this would generate actual code
    const result = {
      analysis,
      files: relevantFiles.map(f => f.path),
      steps: implementationSteps,
      status: 'planned',
      message: `Implementation plan created for: ${description}`
    }

    // Store in context
    this.contextManager.setAgentMemory(this.id, 'lastImplementation', result)

    return result
  }

  /**
   * Analyze implementation request
   */
  analyzeImplementationRequest(description) {
    const lowerDesc = description.toLowerCase()

    // Determine what kind of implementation
    let type = 'feature'
    if (lowerDesc.includes('component') || lowerDesc.includes('form')) {
      type = 'component'
    } else if (lowerDesc.includes('function') || lowerDesc.includes('utility')) {
      type = 'utility'
    } else if (lowerDesc.includes('api') || lowerDesc.includes('endpoint')) {
      type = 'api'
    } else if (lowerDesc.includes('hook')) {
      type = 'hook'
    } else if (lowerDesc.includes('style') || lowerDesc.includes('css')) {
      type = 'styling'
    }

    // Extract entities
    const entities = []
    const entityPatterns = [
      /(?:create|add|implement)\s+(?:a\s+)?(\w+)/gi,
      /(\w+)\s+(?:component|form|page|modal)/gi
    ]

    for (const pattern of entityPatterns) {
      let match
      while ((match = pattern.exec(description)) !== null) {
        entities.push(match[1])
      }
    }

    return {
      type,
      description,
      entities: [...new Set(entities)],
      requiresNewFile: type === 'component' || type === 'hook'
    }
  }

  /**
   * Find relevant files for implementation
   */
  async findRelevantFiles(analysis) {
    const projectRoot = getProjectRoot()
    const relevantFiles = []

    // Define search directories based on type
    const searchDirs = {
      component: ['src/components'],
      hook: ['src/hooks', 'src/utils'],
      utility: ['src/utils', 'src/lib'],
      api: ['src/services', 'src/api', 'src/lib'],
      styling: ['src/styles', 'src'],
      feature: ['src/components', 'src']
    }

    const dirs = searchDirs[analysis.type] || ['src']

    for (const dir of dirs) {
      const fullPath = path.join(projectRoot, dir)
      try {
        const files = await listFiles(fullPath, {
          extensions: ['.js', '.jsx', '.ts', '.tsx', '.css'],
          recursive: true
        })

        // Score files by relevance
        for (const file of files.slice(0, 10)) { // Limit to 10 files
          const relativePath = path.relative(projectRoot, file)
          const fileName = path.basename(file).toLowerCase()

          let relevance = 0

          // Check if filename matches any entities
          for (const entity of analysis.entities) {
            if (fileName.includes(entity.toLowerCase())) {
              relevance += 10
            }
          }

          // Check directory relevance
          if (relativePath.includes(analysis.type)) {
            relevance += 5
          }

          if (relevance > 0 || relevantFiles.length < 3) {
            relevantFiles.push({
              path: relativePath,
              relevance
            })
          }
        }
      } catch (e) {
        // Directory doesn't exist
      }
    }

    // Sort by relevance
    return relevantFiles.sort((a, b) => b.relevance - a.relevance).slice(0, 5)
  }

  /**
   * Generate implementation steps
   */
  generateImplementationSteps(analysis, relevantFiles) {
    const steps = []

    // Step 1: Review existing code
    if (relevantFiles.length > 0) {
      steps.push({
        step: 1,
        action: 'Review existing code',
        files: relevantFiles.slice(0, 3).map(f => f.path),
        description: 'Understand existing patterns and structure'
      })
    }

    // Step 2: Create/modify files
    if (analysis.requiresNewFile) {
      const fileName = analysis.entities[0] || 'NewComponent'
      const fileExt = analysis.type === 'hook' ? '.js' : '.jsx'
      steps.push({
        step: 2,
        action: 'Create new file',
        file: `src/${analysis.type === 'hook' ? 'hooks' : 'components'}/${fileName}${fileExt}`,
        description: `Create ${analysis.type} file`
      })
    } else {
      steps.push({
        step: 2,
        action: 'Modify existing file',
        files: relevantFiles.slice(0, 2).map(f => f.path),
        description: 'Update existing code to add functionality'
      })
    }

    // Step 3: Implementation
    steps.push({
      step: 3,
      action: 'Write implementation',
      description: `Implement ${analysis.description}`
    })

    // Step 4: Integration
    steps.push({
      step: 4,
      action: 'Integrate with existing code',
      description: 'Connect new code with existing components/systems'
    })

    // Step 5: Testing
    steps.push({
      step: 5,
      action: 'Test implementation',
      description: 'Verify the implementation works correctly'
    })

    return steps
  }

  /**
   * Run tests
   * @param {string} target - File or directory to test
   * @returns {Object}
   */
  async runTests(target) {
    logger.agent(this.name, 'Running tests')

    const projectRoot = getProjectRoot()

    // Determine test command based on project setup
    const packageJson = path.join(projectRoot, 'package.json')
    let testCommand = 'npm test'

    if (fileExists(packageJson)) {
      try {
        const content = await readFile(packageJson)
        const pkg = JSON.parse(content)

        if (pkg.scripts?.test) {
          testCommand = 'npm test'
        } else if (pkg.scripts?.['test:unit']) {
          testCommand = 'npm run test:unit'
        }

        // Check for Vitest
        if (pkg.devDependencies?.vitest || pkg.dependencies?.vitest) {
          testCommand = 'npx vitest run'
        }
      } catch (e) {
        // Use default
      }
    }

    // If specific file provided, add it to command
    if (target && !target.includes(' ')) {
      const fullPath = path.resolve(projectRoot, target)
      if (fileExists(fullPath)) {
        testCommand += ` ${target}`
      }
    }

    try {
      logger.debug(`Running: ${testCommand}`, this.id)

      const { stdout, stderr } = await execAsync(testCommand, {
        cwd: projectRoot,
        timeout: 60000 // 60 second timeout
      })

      // Parse test output
      const passed = !stderr || stdout.includes('passed') || stdout.includes('PASS')

      return {
        passed,
        command: testCommand,
        output: stdout.slice(0, 1000), // Limit output size
        errors: stderr ? stderr.slice(0, 500) : null,
        message: passed ? 'All tests passed' : 'Some tests failed'
      }
    } catch (error) {
      // Test command failed
      return {
        passed: false,
        command: testCommand,
        error: error.message,
        output: error.stdout?.slice(0, 1000),
        stderr: error.stderr?.slice(0, 500),
        message: 'Test execution failed'
      }
    }
  }

  /**
   * Debug an error
   * @param {string} errorMessage
   * @returns {Object}
   */
  async debugError(errorMessage) {
    logger.agent(this.name, 'Analyzing error')

    const analysis = this.analyzeError(errorMessage)

    // Search for related files
    const relatedFiles = await this.findErrorRelatedFiles(analysis)

    // Generate suggestions
    const suggestions = this.generateDebugSuggestions(analysis)

    return {
      error: errorMessage,
      analysis,
      relatedFiles,
      rootCause: analysis.possibleCause,
      suggestions,
      steps: this.generateDebugSteps(analysis)
    }
  }

  /**
   * Analyze an error message
   */
  analyzeError(errorMessage) {
    const analysis = {
      type: 'unknown',
      possibleCause: null,
      location: null,
      variables: []
    }

    const lowerError = errorMessage.toLowerCase()

    // Identify error type
    if (lowerError.includes('undefined') || lowerError.includes('null')) {
      analysis.type = 'null-reference'
      analysis.possibleCause = 'Attempting to access property of undefined or null value'
    } else if (lowerError.includes('is not a function')) {
      analysis.type = 'type-error'
      analysis.possibleCause = 'Calling something that is not a function'
    } else if (lowerError.includes('import') || lowerError.includes('module')) {
      analysis.type = 'import-error'
      analysis.possibleCause = 'Module import or export issue'
    } else if (lowerError.includes('syntax')) {
      analysis.type = 'syntax-error'
      analysis.possibleCause = 'JavaScript syntax error in code'
    } else if (lowerError.includes('network') || lowerError.includes('fetch')) {
      analysis.type = 'network-error'
      analysis.possibleCause = 'Network request failed'
    } else if (lowerError.includes('render') || lowerError.includes('react')) {
      analysis.type = 'react-error'
      analysis.possibleCause = 'React component rendering issue'
    }

    // Extract file location if present
    const fileMatch = errorMessage.match(/(?:at\s+)?([^\s]+\.(?:js|jsx|ts|tsx)):(\d+)(?::(\d+))?/)
    if (fileMatch) {
      analysis.location = {
        file: fileMatch[1],
        line: parseInt(fileMatch[2]),
        column: fileMatch[3] ? parseInt(fileMatch[3]) : null
      }
    }

    // Extract variable names
    const varMatch = errorMessage.match(/['"](\w+)['"]/g)
    if (varMatch) {
      analysis.variables = varMatch.map(v => v.replace(/['"]/g, ''))
    }

    return analysis
  }

  /**
   * Find files related to the error
   */
  async findErrorRelatedFiles(analysis) {
    const files = []

    if (analysis.location?.file) {
      files.push({
        path: analysis.location.file,
        line: analysis.location.line,
        relevance: 'direct'
      })
    }

    // Search for files containing mentioned variables
    if (analysis.variables.length > 0) {
      const projectRoot = getProjectRoot()
      try {
        const srcFiles = await listFiles(path.join(projectRoot, 'src'), {
          recursive: true,
          extensions: ['.js', '.jsx', '.ts', '.tsx']
        })

        for (const variable of analysis.variables.slice(0, 3)) {
          for (const file of srcFiles.slice(0, 20)) {
            const content = await readFile(file)
            if (content && content.includes(variable)) {
              files.push({
                path: path.relative(projectRoot, file),
                variable,
                relevance: 'contains-variable'
              })
              break // Only add once per variable
            }
          }
        }
      } catch (e) {
        // Error searching
      }
    }

    return files.slice(0, 5)
  }

  /**
   * Generate debug suggestions
   */
  generateDebugSuggestions(analysis) {
    const suggestions = []

    switch (analysis.type) {
      case 'null-reference':
        suggestions.push('Add null/undefined checks before accessing properties')
        suggestions.push('Use optional chaining (?.) to safely access nested properties')
        suggestions.push('Check that data is loaded before rendering components')
        break

      case 'type-error':
        suggestions.push('Verify the variable is the expected type')
        suggestions.push('Check import statements are correct')
        suggestions.push('Ensure functions are properly exported')
        break

      case 'import-error':
        suggestions.push('Check the import path is correct')
        suggestions.push('Verify the module exports what you expect')
        suggestions.push('Check for circular dependencies')
        break

      case 'syntax-error':
        suggestions.push('Check for missing brackets, parentheses, or semicolons')
        suggestions.push('Verify JSX is properly closed')
        suggestions.push('Look for typos in keywords')
        break

      case 'network-error':
        suggestions.push('Check API endpoint URL is correct')
        suggestions.push('Verify network connectivity')
        suggestions.push('Check CORS configuration')
        break

      case 'react-error':
        suggestions.push('Check component props are valid')
        suggestions.push('Verify state updates are correct')
        suggestions.push('Look for infinite loops in useEffect')
        break

      default:
        suggestions.push('Add console.log statements to trace the issue')
        suggestions.push('Check the browser developer console for more details')
    }

    return suggestions
  }

  /**
   * Generate debug steps
   */
  generateDebugSteps(analysis) {
    const steps = [
      {
        step: 1,
        action: 'Locate the error',
        description: analysis.location
          ? `Check ${analysis.location.file} at line ${analysis.location.line}`
          : 'Find where the error occurs'
      },
      {
        step: 2,
        action: 'Understand the context',
        description: 'Review the code around the error'
      },
      {
        step: 3,
        action: 'Identify root cause',
        description: analysis.possibleCause || 'Determine why the error occurs'
      },
      {
        step: 4,
        action: 'Apply fix',
        description: 'Implement the necessary code changes'
      },
      {
        step: 5,
        action: 'Verify fix',
        description: 'Test that the error no longer occurs'
      }
    ]

    return steps
  }

  /**
   * Refactor code
   * @param {string} target
   * @returns {Object}
   */
  async refactorCode(target) {
    logger.agent(this.name, 'Analyzing code for refactoring')

    const projectRoot = getProjectRoot()
    const fullPath = path.resolve(projectRoot, target)

    const content = await readFile(fullPath)
    if (!content) {
      return {
        success: false,
        error: `Could not read file: ${target}`
      }
    }

    // Analyze the code
    const analysis = analyzeJsFile(content)
    const issues = this.identifyRefactoringOpportunities(content, analysis)

    return {
      file: target,
      analysis: {
        lines: content.split('\n').length,
        functions: analysis.functions.length,
        components: analysis.components.length
      },
      opportunities: issues,
      recommendations: this.generateRefactoringRecommendations(issues)
    }
  }

  /**
   * Identify refactoring opportunities
   */
  identifyRefactoringOpportunities(content, analysis) {
    const opportunities = []

    // Check for long functions
    const functionMatches = content.match(/(?:function|const)\s+\w+\s*=?\s*(?:async\s*)?\([^)]*\)\s*(?:=>)?\s*{[^}]+}/g) || []
    for (const func of functionMatches) {
      const lines = func.split('\n').length
      if (lines > 30) {
        opportunities.push({
          type: 'long-function',
          description: 'Function is too long, consider breaking it up',
          severity: 'medium'
        })
        break
      }
    }

    // Check for repeated code patterns
    const codeBlocks = content.match(/.{50,100}/g) || []
    const seen = new Map()
    for (const block of codeBlocks) {
      const key = block.trim()
      seen.set(key, (seen.get(key) || 0) + 1)
    }
    for (const [block, count] of seen) {
      if (count > 2) {
        opportunities.push({
          type: 'code-duplication',
          description: 'Repeated code pattern found, consider extracting',
          severity: 'medium'
        })
        break
      }
    }

    // Check for deeply nested code
    if ((content.match(/{\s*{/g) || []).length > 5) {
      opportunities.push({
        type: 'deep-nesting',
        description: 'Deeply nested code, consider flattening',
        severity: 'low'
      })
    }

    // Check for many imports
    if (analysis.imports.length > 15) {
      opportunities.push({
        type: 'many-imports',
        description: 'Many imports, consider splitting the file',
        severity: 'low'
      })
    }

    return opportunities
  }

  /**
   * Generate refactoring recommendations
   */
  generateRefactoringRecommendations(opportunities) {
    const recommendations = []

    const typeRecommendations = {
      'long-function': 'Extract smaller functions with single responsibilities',
      'code-duplication': 'Create a reusable function or component',
      'deep-nesting': 'Use early returns or guard clauses',
      'many-imports': 'Consider splitting into multiple files or creating an index file'
    }

    for (const opp of opportunities) {
      if (typeRecommendations[opp.type]) {
        recommendations.push(typeRecommendations[opp.type])
      }
    }

    return [...new Set(recommendations)]
  }

  /**
   * Generate documentation
   * @param {string} target
   * @returns {Object}
   */
  async generateDocumentation(target) {
    logger.agent(this.name, 'Generating documentation')

    const projectRoot = getProjectRoot()
    const fullPath = path.resolve(projectRoot, target)

    const content = await readFile(fullPath)
    if (!content) {
      return {
        success: false,
        error: `Could not read file: ${target}`
      }
    }

    const analysis = analyzeJsFile(content)

    // Generate documentation structure
    const docs = {
      file: target,
      overview: `Documentation for ${path.basename(target)}`,
      components: analysis.components.map(c => ({
        name: c,
        type: 'React Component',
        description: `${c} component`
      })),
      functions: analysis.functions.map(f => ({
        name: f,
        type: 'Function',
        description: `${f} function`
      })),
      hooks: analysis.hooks.map(h => ({
        name: h,
        type: 'Custom Hook',
        description: `${h} custom hook`
      })),
      exports: analysis.exports,
      imports: analysis.imports.map(i => ({
        names: i.names,
        from: i.source
      }))
    }

    return docs
  }

  /**
   * Handle review feedback
   */
  async onReviewFeedback(message) {
    const { review, taskId } = message.payload

    logger.agent(this.name, `Received review feedback: ${review.approved ? 'Approved' : 'Changes requested'}`)

    if (!review.approved && review.comments) {
      // Store feedback for addressing
      this.contextManager.setAgentMemory(this.id, `feedback-${taskId}`, review.comments)
    }
  }

  /**
   * Execute a workflow step
   */
  async executeWorkflowStep(step, input, previousResults) {
    switch (step.id) {
      case 'understand':
        return { understood: true, input }

      case 'locate':
        const analysis = this.analyzeImplementationRequest(input.description || input)
        return await this.findRelevantFiles(analysis)

      case 'implement':
        return await this.implementFeature(input.description || input)

      case 'verify':
        return { verified: true }

      case 'report':
        if (this.reportsTo) {
          await this.reportCompletion(previousResults)
        }
        return { reported: true }

      default:
        return { completed: true }
    }
  }
}

export default SoftwareEngineer
