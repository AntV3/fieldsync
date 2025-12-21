/**
 * ReviewWorkflow - Code review process
 *
 * Executed by the Engineering Manager to review
 * code changes for quality and correctness.
 */

import { logger } from '../utils/logger.js'
import { readFile, analyzeJsFile, getProjectRoot } from '../utils/fileOps.js'
import path from 'path'

export class ReviewWorkflow {
  constructor(orchestrator) {
    this.orchestrator = orchestrator
    this.name = 'Review Workflow'
  }

  /**
   * Execute the review workflow
   * @param {Object} input - Files or changes to review
   * @returns {Object} Review result
   */
  async execute(input) {
    logger.header(this.name)

    const results = {
      steps: [],
      review: null,
      success: false
    }

    try {
      // Step 1: Read the changes
      logger.step(this.name, 'Reading changes', 'running')
      const changes = await this.readChanges(input)
      results.steps.push({ name: 'read', result: changes })
      logger.step(this.name, 'Reading changes', 'done')

      // Step 2: Analyze quality
      logger.step(this.name, 'Analyzing quality', 'running')
      const quality = await this.analyzeQuality(changes)
      results.steps.push({ name: 'analyze', result: quality })
      logger.step(this.name, 'Analyzing quality', 'done')

      // Step 3: Check for issues
      logger.step(this.name, 'Checking for issues', 'running')
      const issues = this.checkForIssues(changes, quality)
      results.steps.push({ name: 'check', result: issues })
      logger.step(this.name, 'Checking for issues', 'done')

      // Step 4: Generate feedback
      logger.step(this.name, 'Generating feedback', 'running')
      const feedback = this.generateFeedback(quality, issues)
      results.review = feedback
      results.success = true
      logger.step(this.name, 'Generating feedback', 'done')

      return results

    } catch (error) {
      logger.error(`Review failed: ${error.message}`)
      results.error = error.message
      return results
    }
  }

  /**
   * Read the changes to review
   */
  async readChanges(input) {
    const changes = {
      files: [],
      totalLines: 0
    }

    // Handle different input types
    const files = Array.isArray(input) ? input :
                  typeof input === 'string' ? [input] :
                  input.files || []

    const projectRoot = getProjectRoot()

    for (const file of files) {
      const filePath = typeof file === 'string' ? file : file.path
      const fullPath = path.resolve(projectRoot, filePath)

      try {
        const content = await readFile(fullPath)
        if (content) {
          const lines = content.split('\n')
          changes.files.push({
            path: filePath,
            content,
            lines: lines.length,
            extension: path.extname(filePath)
          })
          changes.totalLines += lines.length
        }
      } catch (e) {
        logger.warn(`Could not read file: ${filePath}`)
      }
    }

    return changes
  }

  /**
   * Analyze code quality
   */
  async analyzeQuality(changes) {
    const quality = {
      overall: 'good',
      scores: {},
      details: []
    }

    for (const file of changes.files) {
      if (['.js', '.jsx', '.ts', '.tsx'].includes(file.extension)) {
        const analysis = analyzeJsFile(file.content)
        const fileQuality = this.scoreFile(file, analysis)

        quality.scores[file.path] = fileQuality.score
        quality.details.push({
          file: file.path,
          ...fileQuality
        })
      }
    }

    // Calculate overall score
    const scores = Object.values(quality.scores)
    if (scores.length > 0) {
      const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length
      quality.overall = avgScore >= 80 ? 'excellent' :
                        avgScore >= 60 ? 'good' :
                        avgScore >= 40 ? 'fair' : 'needs-improvement'
    }

    return quality
  }

  /**
   * Score a file's quality
   */
  scoreFile(file, analysis) {
    let score = 100
    const issues = []

    // Check file length
    if (file.lines > 500) {
      score -= 10
      issues.push('File is very long (>500 lines)')
    } else if (file.lines > 300) {
      score -= 5
      issues.push('File is long (>300 lines)')
    }

    // Check component count
    if (analysis.components.length > 5) {
      score -= 10
      issues.push('Too many components in one file')
    }

    // Check function count
    if (analysis.functions.length > 15) {
      score -= 10
      issues.push('Too many functions in one file')
    }

    // Check for console.log
    if (file.content.includes('console.log')) {
      score -= 5
      issues.push('Contains console.log statements')
    }

    // Check for TODO/FIXME
    if (file.content.includes('TODO') || file.content.includes('FIXME')) {
      score -= 3
      issues.push('Contains TODO/FIXME comments')
    }

    // Check for proper imports
    if (analysis.imports.length > 20) {
      score -= 5
      issues.push('Too many imports')
    }

    // Bonus for good practices
    if (file.content.includes('PropTypes') || file.content.includes('TypeScript')) {
      score += 5
    }

    return {
      score: Math.max(0, Math.min(100, score)),
      issues,
      analysis: {
        components: analysis.components.length,
        functions: analysis.functions.length,
        imports: analysis.imports.length
      }
    }
  }

  /**
   * Check for specific issues
   */
  checkForIssues(changes, quality) {
    const issues = {
      errors: [],
      warnings: [],
      suggestions: []
    }

    for (const file of changes.files) {
      const lines = file.content.split('\n')

      lines.forEach((line, index) => {
        const lineNum = index + 1

        // Check for security issues
        if (/password\s*=\s*['"][^'"]+['"]/i.test(line)) {
          issues.errors.push({
            file: file.path,
            line: lineNum,
            message: 'Possible hardcoded password'
          })
        }

        if (/api[_-]?key\s*=\s*['"][^'"]+['"]/i.test(line)) {
          issues.errors.push({
            file: file.path,
            line: lineNum,
            message: 'Possible hardcoded API key'
          })
        }

        // Check for console.log
        if (line.includes('console.log') && !line.trim().startsWith('//')) {
          issues.warnings.push({
            file: file.path,
            line: lineNum,
            message: 'console.log should be removed before production'
          })
        }

        // Check for debugger
        if (line.includes('debugger')) {
          issues.warnings.push({
            file: file.path,
            line: lineNum,
            message: 'debugger statement found'
          })
        }

        // Check for very long lines
        if (line.length > 120) {
          issues.suggestions.push({
            file: file.path,
            line: lineNum,
            message: 'Line exceeds 120 characters'
          })
        }
      })

      // Check for empty catch blocks
      if (/catch\s*\([^)]*\)\s*{\s*}/g.test(file.content)) {
        issues.warnings.push({
          file: file.path,
          message: 'Empty catch block found'
        })
      }
    }

    return issues
  }

  /**
   * Generate review feedback
   */
  generateFeedback(quality, issues) {
    const feedback = {
      approved: issues.errors.length === 0,
      quality: quality.overall,
      summary: '',
      comments: [],
      suggestions: []
    }

    // Generate summary
    if (issues.errors.length === 0 && issues.warnings.length === 0) {
      feedback.summary = 'Code looks good! No major issues found.'
    } else if (issues.errors.length > 0) {
      feedback.summary = `Found ${issues.errors.length} error(s) that need to be fixed.`
    } else {
      feedback.summary = `Code is acceptable with ${issues.warnings.length} warning(s) to consider.`
    }

    // Add error comments
    for (const error of issues.errors) {
      feedback.comments.push({
        severity: 'error',
        file: error.file,
        line: error.line,
        message: error.message
      })
    }

    // Add warning comments
    for (const warning of issues.warnings) {
      feedback.comments.push({
        severity: 'warning',
        file: warning.file,
        line: warning.line,
        message: warning.message
      })
    }

    // Add suggestions
    for (const detail of quality.details) {
      for (const issue of detail.issues) {
        feedback.suggestions.push(`${detail.file}: ${issue}`)
      }
    }

    // Add general suggestions
    for (const suggestion of issues.suggestions.slice(0, 5)) {
      feedback.suggestions.push(`${suggestion.file}:${suggestion.line} - ${suggestion.message}`)
    }

    return feedback
  }
}

export default ReviewWorkflow
