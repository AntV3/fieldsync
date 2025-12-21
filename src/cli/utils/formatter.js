/**
 * Output formatter for the multi-agent CLI system
 * Formats data for console display
 */

import { colors } from './logger.js'

/**
 * Format a task for display
 * @param {Object} task
 * @returns {string}
 */
export function formatTask(task) {
  const statusColors = {
    pending: colors.gray,
    in_progress: colors.yellow,
    review: colors.blue,
    completed: colors.green,
    blocked: colors.red
  }

  const statusIcons = {
    pending: '○',
    in_progress: '◐',
    review: '◑',
    completed: '●',
    blocked: '✗'
  }

  const color = statusColors[task.status] || colors.white
  const icon = statusIcons[task.status] || '•'

  let output = `${color}${icon}${colors.reset} `
  output += `${colors.bright}${task.id}${colors.reset}: ${task.title}\n`
  output += `  Status: ${color}${task.status}${colors.reset}`

  if (task.assignedTo) {
    output += ` | Assigned: ${colors.cyan}${task.assignedTo}${colors.reset}`
  }

  if (task.priority) {
    const priorityColor = task.priority === 'high' ? colors.red :
                          task.priority === 'medium' ? colors.yellow : colors.gray
    output += ` | Priority: ${priorityColor}${task.priority}${colors.reset}`
  }

  return output
}

/**
 * Format a list of tasks
 * @param {Object[]} tasks
 * @returns {string}
 */
export function formatTaskList(tasks) {
  if (!tasks || tasks.length === 0) {
    return `${colors.gray}No tasks found${colors.reset}`
  }

  return tasks.map(formatTask).join('\n\n')
}

/**
 * Format agent info for display
 * @param {Object} agent
 * @returns {string}
 */
export function formatAgent(agent) {
  let output = `${colors.bright}${colors.cyan}${agent.name}${colors.reset}\n`
  output += `  ID: ${agent.id}\n`
  output += `  Role: ${agent.role}\n`
  output += `  Capabilities: ${agent.capabilities.join(', ')}\n`

  if (agent.status) {
    const statusColor = agent.status === 'idle' ? colors.green : colors.yellow
    output += `  Status: ${statusColor}${agent.status}${colors.reset}`
  }

  return output
}

/**
 * Format a message between agents
 * @param {Object} message
 * @returns {string}
 */
export function formatMessage(message) {
  const typeColors = {
    'task-assignment': colors.blue,
    'status-update': colors.cyan,
    'review-request': colors.yellow,
    'review-feedback': colors.magenta,
    'completion': colors.green,
    'error': colors.red
  }

  const color = typeColors[message.type] || colors.white
  const time = new Date(message.timestamp).toLocaleTimeString()

  let output = `${colors.gray}[${time}]${colors.reset} `
  output += `${colors.cyan}${message.from}${colors.reset} → `
  output += `${colors.magenta}${message.to}${colors.reset}\n`
  output += `  Type: ${color}${message.type}${colors.reset}\n`

  if (message.payload?.summary) {
    output += `  Summary: ${message.payload.summary}`
  }

  return output
}

/**
 * Format a plan with tasks
 * @param {Object} plan
 * @returns {string}
 */
export function formatPlan(plan) {
  let output = `\n${colors.bright}${colors.cyan}═══ Implementation Plan ═══${colors.reset}\n\n`
  output += `${colors.bright}Feature:${colors.reset} ${plan.feature}\n\n`

  if (plan.requirements && plan.requirements.length > 0) {
    output += `${colors.bright}Requirements:${colors.reset}\n`
    plan.requirements.forEach((req, i) => {
      output += `  ${i + 1}. ${req}\n`
    })
    output += '\n'
  }

  if (plan.tasks && plan.tasks.length > 0) {
    output += `${colors.bright}Tasks:${colors.reset}\n`
    plan.tasks.forEach((task, i) => {
      const priority = task.priority ? ` ${colors.yellow}[${task.priority}]${colors.reset}` : ''
      output += `  ${i + 1}. ${task.title}${priority}\n`
      if (task.description) {
        output += `     ${colors.gray}${task.description}${colors.reset}\n`
      }
    })
  }

  return output
}

/**
 * Format code review feedback
 * @param {Object} review
 * @returns {string}
 */
export function formatReview(review) {
  let output = `\n${colors.bright}${colors.cyan}═══ Code Review ═══${colors.reset}\n\n`
  output += `${colors.bright}File:${colors.reset} ${review.file}\n`

  const statusColor = review.approved ? colors.green : colors.yellow
  const statusIcon = review.approved ? '✓' : '○'
  output += `${colors.bright}Status:${colors.reset} ${statusColor}${statusIcon} ${review.approved ? 'Approved' : 'Changes Requested'}${colors.reset}\n\n`

  if (review.comments && review.comments.length > 0) {
    output += `${colors.bright}Comments:${colors.reset}\n`
    review.comments.forEach((comment, i) => {
      const severity = comment.severity || 'info'
      const severityColor = severity === 'error' ? colors.red :
                           severity === 'warning' ? colors.yellow : colors.gray
      output += `  ${severityColor}${i + 1}.${colors.reset} `
      if (comment.line) {
        output += `${colors.gray}Line ${comment.line}:${colors.reset} `
      }
      output += `${comment.message}\n`
    })
  }

  if (review.suggestions && review.suggestions.length > 0) {
    output += `\n${colors.bright}Suggestions:${colors.reset}\n`
    review.suggestions.forEach((sug, i) => {
      output += `  ${colors.cyan}•${colors.reset} ${sug}\n`
    })
  }

  return output
}

/**
 * Format a table of data
 * @param {string[]} headers
 * @param {string[][]} rows
 * @returns {string}
 */
export function formatTable(headers, rows) {
  // Calculate column widths
  const widths = headers.map((h, i) => {
    const maxRow = Math.max(...rows.map(r => (r[i] || '').length))
    return Math.max(h.length, maxRow)
  })

  // Create header row
  let output = headers.map((h, i) => h.padEnd(widths[i])).join(' │ ')
  output += '\n'
  output += widths.map(w => '─'.repeat(w)).join('─┼─')
  output += '\n'

  // Create data rows
  rows.forEach(row => {
    output += row.map((cell, i) => (cell || '').padEnd(widths[i])).join(' │ ')
    output += '\n'
  })

  return output
}

/**
 * Format a progress bar
 * @param {number} current
 * @param {number} total
 * @param {number} width
 * @returns {string}
 */
export function formatProgress(current, total, width = 30) {
  const percent = Math.round((current / total) * 100)
  const filled = Math.round((current / total) * width)
  const empty = width - filled

  const bar = `${colors.green}${'█'.repeat(filled)}${colors.gray}${'░'.repeat(empty)}${colors.reset}`
  return `${bar} ${percent}% (${current}/${total})`
}

/**
 * Format duration in human readable form
 * @param {number} ms - Duration in milliseconds
 * @returns {string}
 */
export function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`
  return `${Math.floor(ms / 3600000)}h ${Math.round((ms % 3600000) / 60000)}m`
}

/**
 * Wrap text to a specific width
 * @param {string} text
 * @param {number} width
 * @returns {string}
 */
export function wrapText(text, width = 80) {
  const words = text.split(' ')
  const lines = []
  let currentLine = ''

  words.forEach(word => {
    if (currentLine.length + word.length + 1 <= width) {
      currentLine += (currentLine ? ' ' : '') + word
    } else {
      if (currentLine) lines.push(currentLine)
      currentLine = word
    }
  })

  if (currentLine) lines.push(currentLine)
  return lines.join('\n')
}

export default {
  formatTask,
  formatTaskList,
  formatAgent,
  formatMessage,
  formatPlan,
  formatReview,
  formatTable,
  formatProgress,
  formatDuration,
  wrapText
}
