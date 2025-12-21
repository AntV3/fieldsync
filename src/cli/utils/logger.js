/**
 * Logger utility for the multi-agent CLI system
 * Provides colored console output and log level filtering
 */

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',

  // Text colors
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',

  // Background colors
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
}

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4
}

class Logger {
  constructor(options = {}) {
    this.level = LOG_LEVELS[options.level] ?? LOG_LEVELS.info
    this.prefix = options.prefix || ''
    this.showTimestamp = options.showTimestamp ?? true
  }

  setLevel(level) {
    this.level = LOG_LEVELS[level] ?? LOG_LEVELS.info
  }

  getTimestamp() {
    if (!this.showTimestamp) return ''
    const now = new Date()
    return `${colors.gray}[${now.toLocaleTimeString()}]${colors.reset} `
  }

  formatPrefix(agentName) {
    if (!agentName) return this.prefix ? `${this.prefix} ` : ''
    return `${colors.cyan}[${agentName}]${colors.reset} `
  }

  debug(message, agentName = null) {
    if (this.level <= LOG_LEVELS.debug) {
      console.log(`${this.getTimestamp()}${this.formatPrefix(agentName)}${colors.gray}${message}${colors.reset}`)
    }
  }

  info(message, agentName = null) {
    if (this.level <= LOG_LEVELS.info) {
      console.log(`${this.getTimestamp()}${this.formatPrefix(agentName)}${message}`)
    }
  }

  success(message, agentName = null) {
    if (this.level <= LOG_LEVELS.info) {
      console.log(`${this.getTimestamp()}${this.formatPrefix(agentName)}${colors.green}✓ ${message}${colors.reset}`)
    }
  }

  warn(message, agentName = null) {
    if (this.level <= LOG_LEVELS.warn) {
      console.log(`${this.getTimestamp()}${this.formatPrefix(agentName)}${colors.yellow}⚠ ${message}${colors.reset}`)
    }
  }

  error(message, agentName = null) {
    if (this.level <= LOG_LEVELS.error) {
      console.error(`${this.getTimestamp()}${this.formatPrefix(agentName)}${colors.red}✗ ${message}${colors.reset}`)
    }
  }

  // Agent-specific logging
  agent(agentName, action, details = '') {
    if (this.level <= LOG_LEVELS.info) {
      const detailStr = details ? ` - ${colors.gray}${details}${colors.reset}` : ''
      console.log(`${this.getTimestamp()}${colors.magenta}[${agentName}]${colors.reset} ${action}${detailStr}`)
    }
  }

  // Message logging between agents
  message(from, to, type, summary = '') {
    if (this.level <= LOG_LEVELS.debug) {
      console.log(`${this.getTimestamp()}${colors.blue}[MSG]${colors.reset} ${from} → ${to} (${type})${summary ? `: ${summary}` : ''}`)
    }
  }

  // Task status updates
  task(taskId, status, description = '') {
    if (this.level <= LOG_LEVELS.info) {
      const statusColors = {
        pending: colors.gray,
        in_progress: colors.yellow,
        review: colors.blue,
        completed: colors.green,
        blocked: colors.red
      }
      const color = statusColors[status] || colors.white
      console.log(`${this.getTimestamp()}${colors.cyan}[TASK]${colors.reset} ${taskId}: ${color}${status}${colors.reset}${description ? ` - ${description}` : ''}`)
    }
  }

  // Workflow step logging
  step(workflowName, stepName, status = 'running') {
    if (this.level <= LOG_LEVELS.info) {
      const icon = status === 'running' ? '▶' : status === 'done' ? '✓' : '•'
      const color = status === 'running' ? colors.yellow : status === 'done' ? colors.green : colors.gray
      console.log(`${this.getTimestamp()}${color}${icon}${colors.reset} ${workflowName}: ${stepName}`)
    }
  }

  // Divider for visual separation
  divider(char = '─', length = 50) {
    if (this.level <= LOG_LEVELS.info) {
      console.log(`${colors.gray}${char.repeat(length)}${colors.reset}`)
    }
  }

  // Header for sections
  header(text) {
    if (this.level <= LOG_LEVELS.info) {
      console.log('')
      console.log(`${colors.bright}${colors.cyan}═══ ${text} ═══${colors.reset}`)
      console.log('')
    }
  }

  // Indented list item
  list(item, indent = 2) {
    if (this.level <= LOG_LEVELS.info) {
      console.log(`${' '.repeat(indent)}${colors.gray}•${colors.reset} ${item}`)
    }
  }
}

// Export singleton instance and class
const logger = new Logger()

export { Logger, logger, colors, LOG_LEVELS }
export default logger
