/**
 * Form Validation Utilities
 * Shared validation functions for forms across the application
 */

// Validation rules
export const rules = {
  required: (value, fieldName = 'This field') => {
    if (value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) {
      return `${fieldName} is required`
    }
    return null
  },

  minLength: (min, fieldName = 'This field') => (value) => {
    if (value && value.length < min) {
      return `${fieldName} must be at least ${min} characters`
    }
    return null
  },

  maxLength: (max, fieldName = 'This field') => (value) => {
    if (value && value.length > max) {
      return `${fieldName} must be no more than ${max} characters`
    }
    return null
  },

  min: (minVal, fieldName = 'Value') => (value) => {
    const num = parseFloat(value)
    if (!isNaN(num) && num < minVal) {
      return `${fieldName} must be at least ${minVal}`
    }
    return null
  },

  max: (maxVal, fieldName = 'Value') => (value) => {
    const num = parseFloat(value)
    if (!isNaN(num) && num > maxVal) {
      return `${fieldName} must be no more than ${maxVal}`
    }
    return null
  },

  positiveNumber: (fieldName = 'Value') => (value) => {
    const num = parseFloat(value)
    if (value !== '' && value !== null && value !== undefined) {
      if (isNaN(num) || num < 0) {
        return `${fieldName} must be a positive number`
      }
    }
    return null
  },

  email: (value) => {
    if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return 'Please enter a valid email address'
    }
    return null
  },

  phone: (value) => {
    if (value && !/^[\d\s\-()+]+$/.test(value)) {
      return 'Please enter a valid phone number'
    }
    return null
  },

  time: (value) => {
    if (value && !/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(value)) {
      return 'Please enter a valid time (HH:MM)'
    }
    return null
  },

  date: (value) => {
    if (value) {
      const date = new Date(value)
      if (isNaN(date.getTime())) {
        return 'Please enter a valid date'
      }
    }
    return null
  },

  futureDate: (value, fieldName = 'Date') => {
    if (value) {
      const date = new Date(value)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      if (date < today) {
        return `${fieldName} cannot be in the past`
      }
    }
    return null
  },

  pastDate: (value, fieldName = 'Date') => {
    if (value) {
      const date = new Date(value)
      const today = new Date()
      today.setHours(23, 59, 59, 999)
      if (date > today) {
        return `${fieldName} cannot be in the future`
      }
    }
    return null
  }
}

/**
 * Validate a single field against multiple rules
 * @param {any} value - The value to validate
 * @param {Array<Function>} validators - Array of validation functions
 * @returns {string|null} - Error message or null if valid
 */
export const validateField = (value, validators) => {
  for (const validator of validators) {
    const error = typeof validator === 'function' ? validator(value) : null
    if (error) return error
  }
  return null
}

/**
 * Validate an entire form object
 * @param {Object} data - Form data object
 * @param {Object} schema - Validation schema { fieldName: [validators] }
 * @returns {Object} - { isValid: boolean, errors: { fieldName: errorMessage } }
 */
export const validateForm = (data, schema) => {
  const errors = {}
  let isValid = true

  for (const [field, validators] of Object.entries(schema)) {
    const error = validateField(data[field], validators)
    if (error) {
      errors[field] = error
      isValid = false
    }
  }

  return { isValid, errors }
}

/**
 * Validate worker entry for T&M forms
 * @param {Object} worker - Worker object { name, hours, overtimeHours, timeStarted, timeEnded }
 * @returns {Object} - { isValid: boolean, errors: { fieldName: errorMessage } }
 */
export const validateWorker = (worker) => {
  const errors = {}

  if (!worker.name || !worker.name.trim()) {
    errors.name = 'Worker name is required'
  }

  const hours = parseFloat(worker.hours)
  if (worker.hours !== '' && (isNaN(hours) || hours < 0)) {
    errors.hours = 'Hours must be a positive number'
  }
  if (hours > 24) {
    errors.hours = 'Hours cannot exceed 24'
  }

  const otHours = parseFloat(worker.overtimeHours || 0)
  if (worker.overtimeHours && (isNaN(otHours) || otHours < 0)) {
    errors.overtimeHours = 'OT hours must be a positive number'
  }
  if (otHours > 24) {
    errors.overtimeHours = 'OT hours cannot exceed 24'
  }

  if (worker.timeStarted && !rules.time(worker.timeStarted)) {
    // Time format is valid
  } else if (worker.timeStarted) {
    errors.timeStarted = 'Invalid time format'
  }

  if (worker.timeEnded && !rules.time(worker.timeEnded)) {
    // Time format is valid
  } else if (worker.timeEnded) {
    errors.timeEnded = 'Invalid time format'
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  }
}

/**
 * Validate material/equipment item
 * @param {Object} item - Item object { name, quantity, unit }
 * @returns {Object} - { isValid: boolean, errors: { fieldName: errorMessage } }
 */
export const validateItem = (item) => {
  const errors = {}

  if (!item.name && !item.customName && !item.materialId) {
    errors.name = 'Item name or selection is required'
  }

  const qty = parseFloat(item.quantity)
  if (isNaN(qty) || qty <= 0) {
    errors.quantity = 'Quantity must be greater than 0'
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  }
}

/**
 * Create a validation hook for real-time validation
 * Usage: const { errors, validate, clearError } = useValidation(schema)
 */
export const createFieldValidator = (schema) => {
  return (fieldName, value) => {
    const validators = schema[fieldName]
    if (!validators) return null
    return validateField(value, validators)
  }
}

export default {
  rules,
  validateField,
  validateForm,
  validateWorker,
  validateItem,
  createFieldValidator
}
