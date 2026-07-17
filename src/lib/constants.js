/**
 * Application Constants
 * Centralized configuration values to avoid hardcoding
 */

// ============================================
// WORKER ROLES
// ============================================
export const WORKER_ROLES = {
  FOREMAN: 'Foreman',
  SUPERINTENDENT: 'Superintendent',
  OPERATOR: 'Operator',
  LABORER: 'Laborer'
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
// FINANCIAL HEALTH THRESHOLDS
// ============================================
// Shared cost-ratio bands so every card/badge grades budget health the
// same way: costs ≤ 60% of earned value is healthy, ≤ 80% is a warning,
// above that is over budget.
export const HEALTHY_COST_RATIO = 0.6
export const WARNING_COST_RATIO = 0.8

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

// ============================================
// DOCUMENT MANAGEMENT
// ============================================
export const DOCUMENT_CATEGORIES = [
  { id: 'plans', label: 'Plans & Drawings', icon: 'Map' },
  { id: 'specs', label: 'Specifications', icon: 'FileText' },
  { id: 'permits', label: 'Permits & Approvals', icon: 'Shield' },
  { id: 'contracts', label: 'Contracts', icon: 'FileSignature' },
  { id: 'submittals', label: 'Submittals', icon: 'Send' },
  { id: 'rfis', label: 'RFIs', icon: 'HelpCircle' },
  { id: 'photos', label: 'Site Photos', icon: 'Camera' },
  { id: 'reports', label: 'Reports', icon: 'ClipboardList' },
  { id: 'safety', label: 'Safety Documents', icon: 'AlertTriangle' },
  { id: 'general', label: 'General', icon: 'Folder' }
]

export const ALLOWED_FILE_TYPES = {
  // Documents
  'application/pdf': { ext: 'pdf', maxSize: 25 * 1024 * 1024, label: 'PDF' },
  'application/msword': { ext: 'doc', maxSize: 15 * 1024 * 1024, label: 'Word' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { ext: 'docx', maxSize: 15 * 1024 * 1024, label: 'Word' },

  // Spreadsheets
  'application/vnd.ms-excel': { ext: 'xls', maxSize: 15 * 1024 * 1024, label: 'Excel' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { ext: 'xlsx', maxSize: 15 * 1024 * 1024, label: 'Excel' },

  // Images
  'image/jpeg': { ext: 'jpg', maxSize: 10 * 1024 * 1024, label: 'Image' },
  'image/png': { ext: 'png', maxSize: 10 * 1024 * 1024, label: 'Image' }
}

export const DOCUMENT_VISIBILITY_LABELS = {
  all: { label: 'Everyone', description: 'Visible to all team members including field users' },
  office_only: { label: 'Office Only', description: 'Only visible to office staff and admins' },
  admin_only: { label: 'Admins Only', description: 'Only visible to company administrators' }
}

// Categories that require admin approval before becoming visible
export const APPROVAL_REQUIRED_CATEGORIES = ['contracts']

export const DOCUMENTS_PER_PAGE = 25
