/**
 * Date and Time Utilities
 * Shared functions for date/time formatting across the application
 */

/**
 * Format time string (HH:MM or HH:MM:SS) to 12-hour format (e.g., "9:00am")
 * @param {string} timeStr - Time string in 24-hour format
 * @returns {string} Formatted time string
 */
export const formatTime = (timeStr) => {
  if (!timeStr) return ''
  const [hours, minutes] = timeStr.split(':')
  const h = parseInt(hours)
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 || 12
  return `${h12}:${minutes}${ampm}`
}

/**
 * Format a time period from a worker's start/end times
 * @param {Object} worker - Worker object with time_started and time_ended
 * @returns {string} Formatted time period or '-'
 */
export const formatTimePeriod = (worker) => {
  if (worker?.time_started && worker?.time_ended) {
    return `${formatTime(worker.time_started)} - ${formatTime(worker.time_ended)}`
  }
  return '-'
}

/**
 * Format date to locale string
 * @param {string|Date} date - Date to format
 * @param {Object} options - Intl.DateTimeFormat options
 * @returns {string} Formatted date string
 */
export const formatDateLocale = (date, options = {}) => {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...options
  })
}

/**
 * Format date to short format (MM/DD/YY)
 * @param {string|Date} date - Date to format
 * @returns {string} Formatted date string
 */
export const formatDateShort = (date) => {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: '2-digit'
  })
}

/**
 * Get month key for grouping (YYYY-MM format)
 * @param {string|Date} date - Date to get month key from
 * @returns {string} Month key in YYYY-MM format
 */
export const getMonthKey = (date) => {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Get month label for display (e.g., "January 2024")
 * @param {string|Date} date - Date to get month label from
 * @returns {string} Month label
 */
export const getMonthLabel = (date) => {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

/**
 * Check if a date is within the last N days
 * @param {string|Date} date - Date to check
 * @param {number} days - Number of days
 * @returns {boolean}
 */
export const isWithinDays = (date, days) => {
  if (!date) return false
  const d = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  return diff <= days * 24 * 60 * 60 * 1000
}

/**
 * Check if a date is within the current month
 * @param {string|Date} date - Date to check
 * @returns {boolean}
 */
export const isCurrentMonth = (date) => {
  if (!date) return false
  const d = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
}

/**
 * Calculate hours between two time strings
 * @param {string} startTime - Start time (HH:MM)
 * @param {string} endTime - End time (HH:MM)
 * @returns {number} Hours between times (can be negative if end is before start)
 */
export const calculateHoursBetween = (startTime, endTime) => {
  if (!startTime || !endTime) return 0
  
  const [startHours, startMinutes] = startTime.split(':').map(Number)
  const [endHours, endMinutes] = endTime.split(':').map(Number)
  
  const startTotal = startHours + startMinutes / 60
  const endTotal = endHours + endMinutes / 60
  
  return endTotal - startTotal
}

/**
 * Format duration in hours to human readable string
 * @param {number} hours - Number of hours
 * @returns {string} Formatted duration (e.g., "8h 30m")
 */
export const formatDuration = (hours) => {
  if (!hours || hours <= 0) return '0h'
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}
