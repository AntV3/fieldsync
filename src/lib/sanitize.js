/**
 * FieldSync Input Sanitization & Validation
 *
 * Prevents XSS, injection attacks, and validates user input.
 * Use these functions at system boundaries (form inputs, API responses).
 *
 * Usage:
 *   import { sanitize, validate } from './sanitize'
 *
 *   // Sanitize user input before storing
 *   const safeName = sanitize.text(userInput)
 *   const safeHtml = sanitize.html(richText)
 *
 *   // Validate input format
 *   if (!validate.email(email)) { ... }
 */

// ============================================
// Text Sanitization
// ============================================

/**
 * Sanitize plain text - removes HTML tags and dangerous characters
 */
function sanitizeText(input, options = {}) {
  if (input === null || input === undefined) return ''
  if (typeof input !== 'string') return String(input)

  const { maxLength = 10000, trim = true, allowNewlines = true } = options

  let result = input
    // Remove HTML tags
    .replace(/<[^>]*>/g, '')
    // Remove null bytes
    .replace(/\0/g, '')
    // Normalize unicode
    .normalize('NFC')

  // Optionally remove newlines
  if (!allowNewlines) {
    result = result.replace(/[\r\n]+/g, ' ')
  }

  // Trim whitespace
  if (trim) {
    result = result.trim()
  }

  // Enforce max length
  if (result.length > maxLength) {
    result = result.substring(0, maxLength)
  }

  return result
}

/**
 * Sanitize HTML content - escapes dangerous tags but preserves safe formatting
 * Use for rich text fields that will be rendered as HTML
 */
function sanitizeHtml(input, options = {}) {
  if (input === null || input === undefined) return ''
  if (typeof input !== 'string') return String(input)

  const { maxLength = 50000 } = options

  // Escape HTML entities
  let result = input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    // Remove null bytes
    .replace(/\0/g, '')

  // Enforce max length
  if (result.length > maxLength) {
    result = result.substring(0, maxLength)
  }

  return result
}

/**
 * Sanitize for use in URLs
 */
function sanitizeUrl(input) {
  if (input === null || input === undefined) return ''
  if (typeof input !== 'string') return ''

  // Only allow http, https, and relative URLs
  const trimmed = input.trim()

  // Check for javascript:, data:, vbscript: etc.
  const dangerousProtocols = /^(javascript|data|vbscript|file):/i
  if (dangerousProtocols.test(trimmed)) {
    return ''
  }

  // Must start with http://, https://, or /
  if (!/^(https?:\/\/|\/)/i.test(trimmed)) {
    return ''
  }

  return trimmed
}

/**
 * Sanitize filename - removes path traversal attempts and dangerous characters
 */
function sanitizeFilename(input) {
  if (input === null || input === undefined) return ''
  if (typeof input !== 'string') return ''

  return input
    // Remove path separators
    .replace(/[/\\]/g, '')
    // Remove null bytes
    .replace(/\0/g, '')
    // Remove other dangerous characters
    .replace(/[<>:"|?*]/g, '')
    // Trim dots and spaces from start/end
    .replace(/^[\s.]+|[\s.]+$/g, '')
    // Limit length
    .substring(0, 255)
}

/**
 * Sanitize SQL-like input (for display, not for queries - use parameterized queries!)
 */
function sanitizeSqlDisplay(input) {
  if (input === null || input === undefined) return ''
  if (typeof input !== 'string') return String(input)

  return input
    .replace(/'/g, "''")
    .replace(/;/g, '')
    .replace(/--/g, '')
    .replace(/\/\*/g, '')
    .replace(/\*\//g, '')
}

// ============================================
// Input Validation
// ============================================

/**
 * Validate email format
 */
function validateEmail(email) {
  if (!email || typeof email !== 'string') return false
  // RFC 5322 simplified
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email.trim()) && email.length <= 254
}

/**
 * Validate phone number (loose validation for international formats)
 */
function validatePhone(phone) {
  if (!phone || typeof phone !== 'string') return false
  // Allow digits, spaces, dashes, parentheses, plus sign
  const phoneRegex = /^[\d\s\-()+ ]{7,20}$/
  return phoneRegex.test(phone.trim())
}

/**
 * Validate UUID format
 */
function validateUUID(uuid) {
  if (!uuid || typeof uuid !== 'string') return false
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  return uuidRegex.test(uuid.trim())
}

/**
 * Validate date string (ISO format)
 */
function validateDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return false
  const date = new Date(dateStr)
  return !isNaN(date.getTime())
}

/**
 * Validate time format (HH:MM or HH:MM:SS)
 */
function validateTime(time) {
  if (!time || typeof time !== 'string') return false
  const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/
  return timeRegex.test(time.trim())
}

/**
 * Validate positive number
 */
function validatePositiveNumber(value) {
  const num = parseFloat(value)
  return !isNaN(num) && num >= 0
}

/**
 * Validate integer
 */
function validateInteger(value) {
  const num = parseInt(value, 10)
  return !isNaN(num) && num.toString() === String(value).trim()
}

/**
 * Validate currency amount (positive, max 2 decimal places)
 */
function validateCurrency(value) {
  if (value === null || value === undefined || value === '') return false
  const num = parseFloat(value)
  if (isNaN(num) || num < 0) return false
  // Check for max 2 decimal places
  const str = String(value)
  const decimalIndex = str.indexOf('.')
  if (decimalIndex !== -1 && str.length - decimalIndex > 3) return false
  return true
}

/**
 * Validate PIN code (4-6 digits)
 */
function validatePIN(pin) {
  if (!pin || typeof pin !== 'string') return false
  const pinRegex = /^\d{4,6}$/
  return pinRegex.test(pin.trim())
}

/**
 * Validate company code format
 */
function validateCompanyCode(code) {
  if (!code || typeof code !== 'string') return false
  // Alphanumeric, 3-20 characters
  const codeRegex = /^[a-zA-Z0-9]{3,20}$/
  return codeRegex.test(code.trim())
}

/**
 * Validate string length
 */
function validateLength(str, min = 0, max = Infinity) {
  if (str === null || str === undefined) return min === 0
  if (typeof str !== 'string') return false
  const len = str.trim().length
  return len >= min && len <= max
}

/**
 * Check for potential XSS patterns
 */
function containsXSS(input) {
  if (!input || typeof input !== 'string') return false
  const xssPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i,  // onclick=, onerror=, etc.
    /<iframe/i,
    /<object/i,
    /<embed/i,
    /<form/i,
    /data:/i,
    /vbscript:/i,
    /expression\s*\(/i
  ]
  return xssPatterns.some(pattern => pattern.test(input))
}

/**
 * Check for potential SQL injection patterns
 */
function containsSQLInjection(input) {
  if (!input || typeof input !== 'string') return false
  const sqlPatterns = [
    /'\s*or\s+'?1'?\s*=\s*'?1/i,
    /'\s*;\s*drop\s+table/i,
    /'\s*;\s*delete\s+from/i,
    /union\s+select/i,
    /'\s*--/,
    /\/\*.*\*\//
  ]
  return sqlPatterns.some(pattern => pattern.test(input))
}

// ============================================
// Object Sanitization
// ============================================

/**
 * Sanitize all string values in an object
 */
function sanitizeObject(obj, options = {}) {
  if (obj === null || obj === undefined) return obj
  if (typeof obj !== 'object') return sanitizeText(obj, options)
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, options))
  }

  const DANGEROUS_KEYS = ['__proto__', 'constructor', 'prototype']
  const result = {}
  for (const [key, value] of Object.entries(obj)) {
    // Prevent prototype pollution
    if (DANGEROUS_KEYS.includes(key)) continue
    if (typeof value === 'string') {
      result[key] = sanitizeText(value, options)
    } else if (typeof value === 'object' && value !== null) {
      result[key] = sanitizeObject(value, options)
    } else {
      result[key] = value
    }
  }
  return result
}

// ============================================
// Exports
// ============================================

export const sanitize = {
  text: sanitizeText,
  html: sanitizeHtml,
  url: sanitizeUrl,
  filename: sanitizeFilename,
  sqlDisplay: sanitizeSqlDisplay,
  object: sanitizeObject
}

export const validate = {
  email: validateEmail,
  phone: validatePhone,
  uuid: validateUUID,
  date: validateDate,
  time: validateTime,
  positiveNumber: validatePositiveNumber,
  integer: validateInteger,
  currency: validateCurrency,
  pin: validatePIN,
  companyCode: validateCompanyCode,
  length: validateLength,
  containsXSS,
  containsSQLInjection
}

export default { sanitize, validate }
