#!/usr/bin/env node

/**
 * Field Sync Multi-Agent CLI
 *
 * A scalable, rule-based multi-agent system for software development tasks.
 * Agents: Engineering Manager, Software Engineer
 *
 * Usage:
 *   npm run cli [command] [options]
 */

import { parseWithQuotes, getHelpText, validateArgs } from './utils/parser.js'
import { logger, colors } from './utils/logger.js'
import { Orchestrator } from './orchestrator/Orchestrator.js'

// ASCII art banner
const banner = `
${colors.cyan}╔═══════════════════════════════════════════════════════╗
║     ${colors.bright}Field Sync Multi-Agent CLI${colors.reset}${colors.cyan}                        ║
║     ${colors.gray}Software Development Assistant${colors.reset}${colors.cyan}                     ║
╚═══════════════════════════════════════════════════════╝${colors.reset}
`

/**
 * Main CLI entry point
 */
async function main() {
  const args = process.argv.slice(2)

  // Parse arguments
  const parsed = parseWithQuotes(args)

  // Handle help flag
  if (parsed.flags.help || parsed.flags.h || parsed.command === 'help') {
    console.log(banner)
    console.log(getHelpText())
    process.exit(0)
  }

  // Handle version flag
  if (parsed.flags.version || parsed.flags.V) {
    console.log('Field Sync CLI v1.0.0')
    process.exit(0)
  }

  // Configure logger based on flags
  if (parsed.flags.debug) {
    logger.setLevel('debug')
  } else if (parsed.flags.verbose || parsed.flags.v) {
    logger.setLevel('debug')
  } else if (parsed.flags.quiet || parsed.flags.q) {
    logger.setLevel('warn')
  }

  // Show banner unless quiet mode
  if (!parsed.flags.quiet && !parsed.flags.q) {
    console.log(banner)
  }

  // Validate arguments
  const validation = validateArgs(parsed)
  if (!validation.valid) {
    validation.errors.forEach(err => logger.error(err))
    process.exit(1)
  }

  // Initialize the orchestrator
  const orchestrator = new Orchestrator()
  await orchestrator.initialize()

  try {
    // Route command to appropriate handler
    await handleCommand(orchestrator, parsed)
  } catch (error) {
    logger.error(`Command failed: ${error.message}`)
    if (parsed.flags.debug) {
      console.error(error.stack)
    }
    process.exit(1)
  }
}

/**
 * Handle the parsed command
 */
async function handleCommand(orchestrator, parsed) {
  const { command, subcommand, description, args, flags } = parsed

  switch (command) {
    case 'plan':
      // Create implementation plan
      const planDesc = subcommand ? `${subcommand} ${args.join(' ')}` : description
      await orchestrator.executeTask('engineering-manager', 'plan', planDesc)
      break

    case 'implement':
      // Implement a feature
      const implDesc = subcommand ? `${subcommand} ${args.join(' ')}` : description
      await orchestrator.executeTask('software-engineer', 'implement', implDesc)
      break

    case 'review':
      // Review code
      const reviewTarget = subcommand || description || args[0]
      if (!reviewTarget) {
        logger.error('Review command requires a file path')
        process.exit(1)
      }
      await orchestrator.executeTask('engineering-manager', 'review', reviewTarget)
      break

    case 'test':
      // Run tests
      const testTarget = subcommand || description || args[0]
      await orchestrator.executeTask('software-engineer', 'test', testTarget)
      break

    case 'debug':
      // Debug an error
      const errorMsg = subcommand ? `${subcommand} ${args.join(' ')}` : description
      await orchestrator.executeTask('software-engineer', 'debug', errorMsg)
      break

    case 'manager':
      // Direct command to manager
      if (!subcommand) {
        logger.error('Manager command requires an action (plan, review, architect, prioritize)')
        process.exit(1)
      }
      const managerDesc = description || args.join(' ')
      await orchestrator.executeTask('engineering-manager', subcommand, managerDesc)
      break

    case 'engineer':
      // Direct command to engineer
      if (!subcommand) {
        logger.error('Engineer command requires an action (implement, test, debug, refactor)')
        process.exit(1)
      }
      const engineerDesc = description || args.join(' ')
      await orchestrator.executeTask('software-engineer', subcommand, engineerDesc)
      break

    case 'task':
      // Task management
      await handleTaskCommand(orchestrator, subcommand, args)
      break

    case 'agent':
      // Agent management
      await handleAgentCommand(orchestrator, subcommand, args)
      break

    default:
      logger.error(`Unknown command: ${command}`)
      console.log(getHelpText())
      process.exit(1)
  }
}

/**
 * Handle task subcommands
 */
async function handleTaskCommand(orchestrator, subcommand, args) {
  switch (subcommand) {
    case 'list':
      orchestrator.listTasks()
      break

    case 'show':
      if (!args[0]) {
        logger.error('Task show requires a task ID')
        process.exit(1)
      }
      orchestrator.showTask(args[0])
      break

    case 'complete':
      if (!args[0]) {
        logger.error('Task complete requires a task ID')
        process.exit(1)
      }
      orchestrator.completeTask(args[0])
      break

    case 'block':
      if (!args[0]) {
        logger.error('Task block requires a task ID')
        process.exit(1)
      }
      orchestrator.blockTask(args[0], args.slice(1).join(' ') || 'No reason provided')
      break

    default:
      logger.error(`Unknown task subcommand: ${subcommand}. Use: list, show, complete, block`)
      process.exit(1)
  }
}

/**
 * Handle agent subcommands
 */
async function handleAgentCommand(orchestrator, subcommand, args) {
  switch (subcommand) {
    case 'list':
      orchestrator.listAgents()
      break

    case 'status':
      orchestrator.showAgentStatus()
      break

    default:
      logger.error(`Unknown agent subcommand: ${subcommand}. Use: list, status`)
      process.exit(1)
  }
}

// Run the CLI
main().catch(error => {
  logger.error(`Fatal error: ${error.message}`)
  process.exit(1)
})
