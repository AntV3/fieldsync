/**
 * Application Constants
 * Centralized configuration values to avoid hardcoding
 */

// ============================================
// PAGINATION
// ============================================
export const PAGINATION = {
  TICKETS_PER_PAGE: 25,
  CORS_PER_PAGE: 25,
  REPORTS_PER_PAGE: 20,
  DEFAULT_PREVIEW_LIMIT: 5
}

// ============================================
// TIME PRESETS
// ============================================
export const TIME_PRESETS = {
  FULL_DAY: {
    timeStarted: '07:00',
    timeEnded: '15:30',
    hours: 8,
    overtimeHours: 0
  },
  TEN_HOUR: {
    timeStarted: '06:00',
    timeEnded: '16:30',
    hours: 8,
    overtimeHours: 2
  },
  HALF_DAY: {
    timeStarted: '07:00',
    timeEnded: '11:30',
    hours: 4,
    overtimeHours: 0
  }
}

// ============================================
// RETRY CONFIGURATION
// ============================================
export const RETRY_CONFIG = {
  MAX_RETRIES: 3,
  BASE_DELAY_MS: 1000,
  MAX_DELAY_MS: 10000
}

// ============================================
// CACHE CONFIGURATION
// ============================================
export const CACHE_CONFIG = {
  OFFLINE_DB_NAME: 'fieldsync-offline',
  OFFLINE_DB_VERSION: 2,
  SESSION_KEY: 'fieldsync_field_session',
  DEVICE_ID_KEY: 'fieldsync_device_id',
  SELECTED_COMPANY_KEY: 'selectedCompanyId'
}

// ============================================
// STATUS CONFIGURATIONS
// ============================================
export const COR_STATUS = {
  DRAFT: 'draft',
  PENDING_APPROVAL: 'pending_approval',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  BILLED: 'billed',
  CLOSED: 'closed'
}

export const COR_STATUS_DISPLAY = {
  draft: { label: 'Draft', color: [107, 114, 128], bgColor: [243, 244, 246] },
  pending_approval: { label: 'Pending Approval', color: [217, 119, 6], bgColor: [254, 243, 199] },
  approved: { label: 'Approved', color: [5, 150, 105], bgColor: [209, 250, 229] },
  rejected: { label: 'Rejected', color: [220, 38, 38], bgColor: [254, 226, 226] },
  billed: { label: 'Billed', color: [37, 99, 235], bgColor: [219, 234, 254] },
  closed: { label: 'Closed', color: [75, 85, 99], bgColor: [229, 231, 235] }
}

export const TICKET_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  BILLED: 'billed',
  REJECTED: 'rejected'
}

// ============================================
// WORKER ROLES
// ============================================
export const WORKER_ROLES = {
  FOREMAN: 'Foreman',
  SUPERINTENDENT: 'Superintendent',
  OPERATOR: 'Operator',
  LABORER: 'Laborer'
}

export const DEFAULT_LABOR_RATES = {
  Foreman: 85,
  Superintendent: 95,
  Operator: 75,
  Laborer: 55
}

// ============================================
// FILE UPLOAD LIMITS
// ============================================
export const UPLOAD_LIMITS = {
  MAX_IMAGE_SIZE_MB: 10,
  MAX_IMAGE_SIZE_BYTES: 10 * 1024 * 1024,
  MAX_IMAGES_PER_TICKET: 20,
  IMAGE_COMPRESSION_QUALITY: 0.8,
  IMAGE_MAX_WIDTH: 1920,
  IMAGE_MAX_HEIGHT: 1080
}

// ============================================
// PDF EXPORT CONFIGURATION
// ============================================
export const PDF_CONFIG = {
  IMAGE_LOAD_TIMEOUT_MS: 5000,
  PAGE_MARGIN: 20,
  HEADER_HEIGHT: 40,
  FOOTER_HEIGHT: 20,
  DEFAULT_FONT_SIZE: 10
}

// ============================================
// VALIDATION LIMITS
// ============================================
export const VALIDATION = {
  MAX_AMOUNT: 10000000, // $10 million
  MAX_TEXT_LENGTH: 10000,
  MIN_PASSWORD_LENGTH: 8,
  MAX_TITLE_LENGTH: 200,
  MAX_DESCRIPTION_LENGTH: 5000
}

// ============================================
// UI CONFIGURATION
// ============================================
export const UI_CONFIG = {
  TOAST_DURATION_MS: 5000,
  DEBOUNCE_DELAY_MS: 300,
  ANIMATION_DURATION_MS: 200,
  RECENT_DAYS_FILTER: 7
}

// ============================================
// DEFAULT COLORS
// ============================================
export const COLORS = {
  PRIMARY: '#3b82f6',
  PRIMARY_RGB: [59, 130, 246],
  SUCCESS: '#10b981',
  WARNING: '#f59e0b',
  DANGER: '#ef4444',
  DARK_SLATE: [30, 41, 59]
}
