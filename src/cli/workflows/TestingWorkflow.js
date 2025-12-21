/**
 * TestingWorkflow - Testing process
 *
 * Executed by the Software Engineer to run tests
 * and verify functionality.
 */

import { logger } from '../utils/logger.js'
import { readFile, listFiles, getProjectRoot, fileExists } from '../utils/fileOps.js'
import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'

const execAsync = promisify(exec)

export class TestingWorkflow {
  constructor(orchestrator) {
    this.orchestrator = orchestrator
    this.name = 'Testing Workflow'
  }

  /**
   * Execute the testing workflow
   * @param {Object} input - Test target
   * @returns {Object} Test results
   */
  async execute(input) {
    logger.header(this.name)

    const results = {
      steps: [],
      testResults: null,
      success: false
    }

    try {
      // Step 1: Identify tests
      logger.step(this.name, 'Identifying tests', 'running')
      const tests = await this.identifyTests(input)
      results.steps.push({ name: 'identify', result: tests })
      logger.step(this.name, 'Identifying tests', 'done')

      // Step 2: Check test environment
      logger.step(this.name, 'Checking environment', 'running')
      const environment = await this.checkEnvironment()
      results.steps.push({ name: 'environment', result: environment })
      logger.step(this.name, 'Checking environment', 'done')

      // Step 3: Run tests
      logger.step(this.name, 'Running tests', 'running')
      const testResults = await this.runTests(tests, environment)
      results.testResults = testResults
      results.steps.push({ name: 'run', result: testResults })
      logger.step(this.name, 'Running tests', 'done')

      // Step 4: Analyze results
      logger.step(this.name, 'Analyzing results', 'running')
      const analysis = this.analyzeResults(testResults)
      results.steps.push({ name: 'analyze', result: analysis })
      results.success = analysis.passed
      logger.step(this.name, 'Analyzing results', 'done')

      return results

    } catch (error) {
      logger.error(`Testing failed: ${error.message}`)
      results.error = error.message
      return results
    }
  }

  /**
   * Identify tests to run
   */
  async identifyTests(input) {
    const projectRoot = getProjectRoot()
    const tests = {
      framework: null,
      testFiles: [],
      command: null,
      target: null
    }

    // Detect test framework
    const packagePath = path.join(projectRoot, 'package.json')
    if (fileExists(packagePath)) {
      try {
        const content = await readFile(packagePath)
        const pkg = JSON.parse(content)

        // Check for test frameworks
        const deps = { ...pkg.dependencies, ...pkg.devDependencies }

        if (deps.vitest) {
          tests.framework = 'vitest'
          tests.command = 'npx vitest run'
        } else if (deps.jest) {
          tests.framework = 'jest'
          tests.command = 'npx jest'
        } else if (deps.mocha) {
          tests.framework = 'mocha'
          tests.command = 'npx mocha'
        } else if (pkg.scripts?.test) {
          tests.framework = 'npm'
          tests.command = 'npm test'
        }
      } catch (e) {
        // Default to npm test
        tests.framework = 'npm'
        tests.command = 'npm test'
      }
    }

    // If specific target provided
    if (input && typeof input === 'string') {
      tests.target = input

      // Check if it's a test file or source file
      if (input.includes('.test.') || input.includes('.spec.') || input.includes('__tests__')) {
        tests.testFiles.push(input)
      } else {
        // Find corresponding test file
        const testFile = await this.findTestFile(input)
        if (testFile) {
          tests.testFiles.push(testFile)
        }
      }
    }

    // Find all test files if no specific target
    if (tests.testFiles.length === 0) {
      const allTests = await this.findAllTestFiles()
      tests.testFiles = allTests.slice(0, 10) // Limit to 10
    }

    return tests
  }

  /**
   * Find test file for a source file
   */
  async findTestFile(sourceFile) {
    const projectRoot = getProjectRoot()
    const baseName = path.basename(sourceFile, path.extname(sourceFile))
    const dirName = path.dirname(sourceFile)

    // Common test file patterns
    const patterns = [
      path.join(dirName, `${baseName}.test.js`),
      path.join(dirName, `${baseName}.test.jsx`),
      path.join(dirName, `${baseName}.spec.js`),
      path.join(dirName, `${baseName}.spec.jsx`),
      path.join(dirName, '__tests__', `${baseName}.test.js`),
      path.join(dirName, '__tests__', `${baseName}.test.jsx`)
    ]

    for (const pattern of patterns) {
      const fullPath = path.join(projectRoot, pattern)
      if (fileExists(fullPath)) {
        return pattern
      }
    }

    return null
  }

  /**
   * Find all test files in project
   */
  async findAllTestFiles() {
    const projectRoot = getProjectRoot()
    const testFiles = []

    try {
      const allFiles = await listFiles(path.join(projectRoot, 'src'), {
        recursive: true,
        extensions: ['.js', '.jsx', '.ts', '.tsx']
      })

      for (const file of allFiles) {
        const relativePath = path.relative(projectRoot, file)
        if (relativePath.includes('.test.') ||
            relativePath.includes('.spec.') ||
            relativePath.includes('__tests__')) {
          testFiles.push(relativePath)
        }
      }
    } catch (e) {
      // No test files found
    }

    return testFiles
  }

  /**
   * Check test environment
   */
  async checkEnvironment() {
    const environment = {
      ready: true,
      issues: [],
      node: null,
      npm: null
    }

    const projectRoot = getProjectRoot()

    // Check Node.js version
    try {
      const { stdout } = await execAsync('node --version')
      environment.node = stdout.trim()
    } catch (e) {
      environment.issues.push('Node.js not found')
      environment.ready = false
    }

    // Check npm version
    try {
      const { stdout } = await execAsync('npm --version')
      environment.npm = stdout.trim()
    } catch (e) {
      environment.issues.push('npm not found')
      environment.ready = false
    }

    // Check if node_modules exists
    if (!fileExists(path.join(projectRoot, 'node_modules'))) {
      environment.issues.push('node_modules not found - run npm install')
      environment.ready = false
    }

    return environment
  }

  /**
   * Run the tests
   */
  async runTests(tests, environment) {
    if (!environment.ready) {
      return {
        executed: false,
        error: 'Environment not ready: ' + environment.issues.join(', ')
      }
    }

    if (!tests.command) {
      return {
        executed: false,
        error: 'No test command available'
      }
    }

    const projectRoot = getProjectRoot()
    let command = tests.command

    // Add target if specified
    if (tests.target && tests.testFiles.length > 0) {
      command += ` ${tests.testFiles[0]}`
    }

    try {
      logger.debug(`Running: ${command}`)

      const { stdout, stderr } = await execAsync(command, {
        cwd: projectRoot,
        timeout: 120000, // 2 minute timeout
        maxBuffer: 1024 * 1024 // 1MB buffer
      })

      return {
        executed: true,
        command,
        stdout: stdout.slice(0, 5000), // Limit output size
        stderr: stderr ? stderr.slice(0, 1000) : null,
        exitCode: 0
      }
    } catch (error) {
      return {
        executed: true,
        command,
        stdout: error.stdout?.slice(0, 5000),
        stderr: error.stderr?.slice(0, 1000),
        exitCode: error.code || 1,
        error: error.message
      }
    }
  }

  /**
   * Analyze test results
   */
  analyzeResults(testResults) {
    const analysis = {
      passed: false,
      summary: '',
      stats: null
    }

    if (!testResults.executed) {
      analysis.summary = `Tests could not run: ${testResults.error}`
      return analysis
    }

    const output = (testResults.stdout || '') + (testResults.stderr || '')

    // Check for pass indicators
    const passIndicators = ['passed', 'passing', 'PASS', 'success', '0 failing', '✓']
    const failIndicators = ['failed', 'failing', 'FAIL', 'error', 'Error', '✗']

    const hasPass = passIndicators.some(ind => output.includes(ind))
    const hasFail = failIndicators.some(ind => output.includes(ind))

    analysis.passed = testResults.exitCode === 0 || (hasPass && !hasFail)

    // Try to parse test stats
    const statsMatch = output.match(/(\d+)\s*(?:tests?|specs?)\s*(?:passed|passing)/i)
    const failMatch = output.match(/(\d+)\s*(?:tests?|specs?)\s*(?:failed|failing)/i)

    if (statsMatch || failMatch) {
      analysis.stats = {
        passed: statsMatch ? parseInt(statsMatch[1]) : 0,
        failed: failMatch ? parseInt(failMatch[1]) : 0
      }
    }

    // Generate summary
    if (analysis.passed) {
      analysis.summary = analysis.stats
        ? `All tests passed (${analysis.stats.passed} tests)`
        : 'All tests passed'
    } else {
      analysis.summary = analysis.stats
        ? `${analysis.stats.failed} test(s) failed`
        : 'Tests failed - check output for details'
    }

    return analysis
  }
}

export default TestingWorkflow
