/**
 * CLI argument parser for the multi-agent system
 * Parses command line arguments into structured commands
 */

/**
 * Parse command line arguments
 * @param {string[]} args - Process argv array (typically process.argv.slice(2))
 * @returns {Object} Parsed command object
 */
export function parseArgs(args) {
  const result = {
    command: null,
    subcommand: null,
    args: [],
    flags: {},
    raw: args
  }

  if (!args || args.length === 0) {
    return result
  }

  let i = 0

  // First non-flag argument is the command
  while (i < args.length) {
    const arg = args[i]

    if (arg.startsWith('--')) {
      // Long flag: --flag or --flag=value
      const [key, ...valueParts] = arg.slice(2).split('=')
      const value = valueParts.length > 0 ? valueParts.join('=') : true
      result.flags[key] = value
    } else if (arg.startsWith('-') && arg.length > 1) {
      // Short flag: -f or -f value
      const key = arg.slice(1)
      // Check if next arg is a value (not a flag)
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        result.flags[key] = args[i + 1]
        i++
      } else {
        result.flags[key] = true
      }
    } else if (!result.command) {
      result.command = arg
    } else if (!result.subcommand) {
      result.subcommand = arg
    } else {
      result.args.push(arg)
    }

    i++
  }

  return result
}

/**
 * Parse a quoted string that may contain the full task description
 * Handles: cli plan "Add user authentication with OAuth"
 * @param {string[]} args
 * @returns {Object}
 */
export function parseWithQuotes(args) {
  const result = parseArgs(args)

  // If there are remaining args, join them as a description
  if (result.args.length > 0) {
    result.description = result.args.join(' ')
  } else if (result.subcommand && !isKnownSubcommand(result.command, result.subcommand)) {
    // If subcommand is not a known subcommand, treat it as description
    result.description = [result.subcommand, ...result.args].join(' ')
    result.subcommand = null
  }

  return result
}

/**
 * Check if a subcommand is known for a given command
 */
function isKnownSubcommand(command, subcommand) {
  const knownSubcommands = {
    manager: ['plan', 'review', 'architect', 'prioritize'],
    engineer: ['implement', 'test', 'debug', 'refactor'],
    task: ['list', 'show', 'complete', 'block'],
    agent: ['list', 'status']
  }

  return knownSubcommands[command]?.includes(subcommand)
}

/**
 * Display help text for the CLI
 */
export function getHelpText() {
  return `
Field Sync Multi-Agent CLI

USAGE:
  npm run cli <command> [options]

COMMANDS:
  plan <description>       Create an implementation plan
  implement <description>  Implement a feature or fix
  review <file>           Review code in a file
  test <file>             Run tests for a file
  debug <error>           Debug an error message

  manager <action>         Direct command to Engineering Manager
  engineer <action>        Direct command to Software Engineer

  task list               List all tasks
  task show <id>          Show task details

  agent list              List all agents
  agent status            Show agent statuses

OPTIONS:
  --help, -h              Show this help message
  --verbose, -v           Enable verbose output
  --debug                 Enable debug logging
  --quiet, -q             Minimal output
  --agent <name>          Specify agent to use

EXAMPLES:
  npm run cli plan "Add user authentication"
  npm run cli implement "Create login form"
  npm run cli review src/components/Login.jsx
  npm run cli debug "Cannot read property 'id' of undefined"
  npm run cli manager plan "New dashboard layout"
  npm run cli engineer test src/utils/auth.js
`
}

/**
 * Validate parsed arguments
 * @param {Object} parsed
 * @returns {Object} { valid: boolean, errors: string[] }
 */
export function validateArgs(parsed) {
  const errors = []

  const validCommands = [
    'plan', 'implement', 'review', 'test', 'debug',
    'manager', 'engineer', 'task', 'agent', 'help'
  ]

  if (!parsed.command) {
    errors.push('No command specified. Use --help for usage.')
  } else if (!validCommands.includes(parsed.command)) {
    errors.push(`Unknown command: ${parsed.command}. Use --help for valid commands.`)
  }

  // Command-specific validation
  if (parsed.command === 'review' && !parsed.subcommand && !parsed.description) {
    errors.push('Review command requires a file path')
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

export default { parseArgs, parseWithQuotes, getHelpText, validateArgs }
