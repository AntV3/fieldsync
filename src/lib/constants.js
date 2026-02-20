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
// WORKER ROLES (generic fallback defaults)
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
// COMPANY TYPES
// ============================================
export const COMPANY_TYPES = [
  { value: 'subcontractor', label: 'Subcontractor', description: 'Works under a general contractor on projects' },
  { value: 'general_contractor', label: 'General Contractor', description: 'Manages multiple subcontractors and projects' },
  { value: 'owner_builder', label: 'Owner / Self-Perform', description: 'Directly manages all construction work' }
]

// ============================================
// TRADE PROFILES
// Each trade defines its own work types, job types,
// default roles, field terminology, and which
// field modules are relevant.
// ============================================

export const JOB_TYPES = [
  { value: 'standard', label: 'Standard' },
  { value: 'pla', label: 'PLA (Union)' },
  { value: 'prevailing_wage', label: 'Prevailing Wage' },
  { value: 'time_and_material', label: 'Time & Material' },
  { value: 'design_build', label: 'Design-Build' },
  { value: 'lump_sum', label: 'Lump Sum' }
]

export const TRADE_PROFILES = {
  demolition: {
    label: 'Demolition',
    icon: '🏗️',
    fieldSupervisorLabel: 'Foreman',
    workTypes: [
      { value: 'demolition', label: 'Demolition' },
      { value: 'abatement', label: 'Abatement' },
      { value: 'environmental', label: 'Environmental' },
      { value: 'selective_demo', label: 'Selective Demo' }
    ],
    defaultRoles: ['Foreman', 'Operator', 'Laborer', 'Superintendent'],
    materialCategories: [
      { value: 'concrete', label: 'Concrete', icon: '🧱' },
      { value: 'trash', label: 'Trash / Debris', icon: '🗑️' },
      { value: 'metals', label: 'Metals / Scrap', icon: '🔩' },
      { value: 'hazardous_waste', label: 'Hazardous Waste', icon: '☣️' },
      { value: 'dirt', label: 'Dirt / Fill', icon: '⛏️' }
    ],
    modules: ['crew', 'tm', 'disposal', 'daily_report', 'injury', 'docs', 'progress']
  },

  electrical: {
    label: 'Electrical',
    icon: '⚡',
    fieldSupervisorLabel: 'Lead Electrician',
    workTypes: [
      { value: 'rough_in', label: 'Rough-In' },
      { value: 'finish', label: 'Finish / Trim-Out' },
      { value: 'service', label: 'Service / Panel Work' },
      { value: 'low_voltage', label: 'Low Voltage' },
      { value: 'underground', label: 'Underground / Conduit' }
    ],
    defaultRoles: ['Lead Electrician', 'Journeyman', 'Apprentice', 'Foreman'],
    materialCategories: [
      { value: 'conduit_scrap', label: 'Conduit Scrap', icon: '🔧' },
      { value: 'wire_scrap', label: 'Wire Scrap', icon: '🔌' },
      { value: 'packaging', label: 'Packaging / Cardboard', icon: '📦' },
      { value: 'general_trash', label: 'General Trash', icon: '🗑️' }
    ],
    modules: ['crew', 'tm', 'daily_report', 'injury', 'docs', 'progress']
  },

  plumbing: {
    label: 'Plumbing',
    icon: '🔧',
    fieldSupervisorLabel: 'Lead Plumber',
    workTypes: [
      { value: 'rough_in', label: 'Rough-In' },
      { value: 'finish', label: 'Finish / Trim-Out' },
      { value: 'underground', label: 'Underground' },
      { value: 'hydronics', label: 'Hydronics / Radiant' },
      { value: 'service_repair', label: 'Service & Repair' }
    ],
    defaultRoles: ['Lead Plumber', 'Journeyman', 'Apprentice', 'Foreman'],
    materialCategories: [
      { value: 'pipe_scrap', label: 'Pipe Scrap', icon: '🔧' },
      { value: 'packaging', label: 'Packaging', icon: '📦' },
      { value: 'general_trash', label: 'General Trash', icon: '🗑️' }
    ],
    modules: ['crew', 'tm', 'daily_report', 'injury', 'docs', 'progress']
  },

  hvac: {
    label: 'HVAC & Mechanical',
    icon: '🌬️',
    fieldSupervisorLabel: 'Lead Mechanic',
    workTypes: [
      { value: 'ductwork', label: 'Ductwork' },
      { value: 'piping', label: 'Piping / Refrigerant' },
      { value: 'equipment', label: 'Equipment Install' },
      { value: 'controls', label: 'Controls & BAS' },
      { value: 'service', label: 'Service & Maintenance' }
    ],
    defaultRoles: ['Lead Mechanic', 'Sheet Metal Worker', 'Pipefitter', 'Apprentice', 'Foreman'],
    materialCategories: [
      { value: 'sheet_metal_scrap', label: 'Sheet Metal Scrap', icon: '🔩' },
      { value: 'insulation', label: 'Insulation Waste', icon: '🧱' },
      { value: 'packaging', label: 'Packaging / Cardboard', icon: '📦' },
      { value: 'general_trash', label: 'General Trash', icon: '🗑️' }
    ],
    modules: ['crew', 'tm', 'daily_report', 'injury', 'docs', 'progress']
  },

  concrete: {
    label: 'Concrete & Masonry',
    icon: '🧱',
    fieldSupervisorLabel: 'Foreman',
    workTypes: [
      { value: 'foundations', label: 'Foundations / Footings' },
      { value: 'flatwork', label: 'Flatwork / Slabs' },
      { value: 'structural', label: 'Structural / Elevated' },
      { value: 'masonry', label: 'Masonry / Block' },
      { value: 'tilt_up', label: 'Tilt-Up' }
    ],
    defaultRoles: ['Foreman', 'Finisher', 'Carpenter (Form)', 'Laborer', 'Superintendent'],
    materialCategories: [
      { value: 'concrete', label: 'Concrete Waste', icon: '🧱' },
      { value: 'forming_scrap', label: 'Forming Scrap', icon: '🪵' },
      { value: 'rebar_scrap', label: 'Rebar Scrap', icon: '🔩' },
      { value: 'general_trash', label: 'General Trash', icon: '🗑️' }
    ],
    modules: ['crew', 'tm', 'disposal', 'daily_report', 'injury', 'docs', 'progress']
  },

  framing: {
    label: 'Framing & Carpentry',
    icon: '🪵',
    fieldSupervisorLabel: 'Lead Carpenter',
    workTypes: [
      { value: 'rough_framing', label: 'Rough Framing' },
      { value: 'finish_carpentry', label: 'Finish Carpentry' },
      { value: 'casework', label: 'Casework & Millwork' },
      { value: 'doors_windows', label: 'Doors & Windows' },
      { value: 'sheathing', label: 'Sheathing & Decking' }
    ],
    defaultRoles: ['Lead Carpenter', 'Journeyman Carpenter', 'Apprentice', 'Laborer'],
    materialCategories: [
      { value: 'wood_scrap', label: 'Wood Scrap / Cutoffs', icon: '🪵' },
      { value: 'drywall_scrap', label: 'Drywall Scrap', icon: '⬜' },
      { value: 'packaging', label: 'Packaging', icon: '📦' },
      { value: 'general_trash', label: 'General Trash', icon: '🗑️' }
    ],
    modules: ['crew', 'tm', 'daily_report', 'injury', 'docs', 'progress']
  },

  roofing: {
    label: 'Roofing',
    icon: '🏠',
    fieldSupervisorLabel: 'Foreman',
    workTypes: [
      { value: 'tear_off', label: 'Tear-Off / Removal' },
      { value: 'flat_roofing', label: 'Flat / Low-Slope' },
      { value: 'steep_slope', label: 'Steep Slope / Shingles' },
      { value: 'metal_roofing', label: 'Metal Roofing' },
      { value: 'waterproofing', label: 'Waterproofing / Flashing' }
    ],
    defaultRoles: ['Foreman', 'Roofer', 'Laborer', 'Superintendent'],
    materialCategories: [
      { value: 'shingles', label: 'Shingles / Roofing Material', icon: '🏠' },
      { value: 'underlayment', label: 'Underlayment / Felt', icon: '📄' },
      { value: 'metal_scrap', label: 'Metal Scrap / Flashing', icon: '🔩' },
      { value: 'general_trash', label: 'General Trash', icon: '🗑️' }
    ],
    modules: ['crew', 'tm', 'disposal', 'daily_report', 'injury', 'docs', 'progress']
  },

  painting: {
    label: 'Painting & Finishes',
    icon: '🎨',
    fieldSupervisorLabel: 'Lead Painter',
    workTypes: [
      { value: 'interior', label: 'Interior' },
      { value: 'exterior', label: 'Exterior' },
      { value: 'industrial', label: 'Industrial / Protective' },
      { value: 'specialty', label: 'Specialty / Epoxy' }
    ],
    defaultRoles: ['Lead Painter', 'Journeyman Painter', 'Apprentice', 'Laborer'],
    materialCategories: [
      { value: 'paint_waste', label: 'Paint / Solvent Waste', icon: '🎨' },
      { value: 'packaging', label: 'Packaging / Cans', icon: '📦' },
      { value: 'general_trash', label: 'General Trash', icon: '🗑️' }
    ],
    modules: ['crew', 'tm', 'daily_report', 'injury', 'docs', 'progress']
  },

  civil: {
    label: 'Civil & Earthwork',
    icon: '🚜',
    fieldSupervisorLabel: 'Superintendent',
    workTypes: [
      { value: 'grading', label: 'Grading & Excavation' },
      { value: 'utilities', label: 'Underground Utilities' },
      { value: 'paving', label: 'Paving & Asphalt' },
      { value: 'site_work', label: 'Site Work' },
      { value: 'landscaping', label: 'Landscaping' }
    ],
    defaultRoles: ['Superintendent', 'Operator', 'Laborer', 'Foreman'],
    materialCategories: [
      { value: 'dirt', label: 'Dirt / Fill Export', icon: '⛏️' },
      { value: 'concrete', label: 'Concrete / Asphalt', icon: '🧱' },
      { value: 'rock', label: 'Rock / Debris', icon: '🪨' },
      { value: 'general_trash', label: 'General Trash', icon: '🗑️' }
    ],
    modules: ['crew', 'tm', 'disposal', 'daily_report', 'injury', 'docs', 'progress']
  },

  general_contractor: {
    label: 'General Contractor',
    icon: '🏢',
    fieldSupervisorLabel: 'Superintendent',
    workTypes: [
      { value: 'commercial', label: 'Commercial' },
      { value: 'residential', label: 'Residential' },
      { value: 'industrial', label: 'Industrial' },
      { value: 'renovation', label: 'Renovation / TI' },
      { value: 'new_construction', label: 'New Construction' }
    ],
    defaultRoles: ['Superintendent', 'Project Manager', 'Foreman', 'Laborer'],
    materialCategories: [
      { value: 'concrete', label: 'Concrete', icon: '🧱' },
      { value: 'wood_scrap', label: 'Wood Scrap', icon: '🪵' },
      { value: 'metals', label: 'Metals / Scrap', icon: '🔩' },
      { value: 'general_trash', label: 'General Trash', icon: '🗑️' }
    ],
    modules: ['crew', 'tm', 'disposal', 'daily_report', 'injury', 'docs', 'progress']
  },

  custom: {
    label: 'Other / Custom',
    icon: '🔨',
    fieldSupervisorLabel: 'Foreman',
    workTypes: [
      { value: 'general', label: 'General Work' },
      { value: 'specialty', label: 'Specialty Work' }
    ],
    defaultRoles: ['Foreman', 'Journeyman', 'Apprentice', 'Laborer'],
    materialCategories: [
      { value: 'general_trash', label: 'General Trash', icon: '🗑️' },
      { value: 'recyclables', label: 'Recyclables', icon: '♻️' }
    ],
    modules: ['crew', 'tm', 'daily_report', 'injury', 'docs', 'progress']
  }
}

// Helper: get a trade profile (falls back to 'custom' if unknown)
export const getTradeProfile = (trade) =>
  TRADE_PROFILES[trade] || TRADE_PROFILES.custom

// Helper: get a trade's field supervisor label
export const getFieldSupervisorLabel = (trade) =>
  getTradeProfile(trade).fieldSupervisorLabel

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

export const DOCUMENT_VISIBILITY = {
  ALL: 'all',
  OFFICE_ONLY: 'office_only',
  ADMIN_ONLY: 'admin_only'
}

export const DOCUMENT_VISIBILITY_LABELS = {
  all: { label: 'Everyone', description: 'Visible to all team members including field users' },
  office_only: { label: 'Office Only', description: 'Only visible to office staff and admins' },
  admin_only: { label: 'Admins Only', description: 'Only visible to company administrators' }
}

export const DOCUMENT_APPROVAL_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected'
}

// Categories that require admin approval before becoming visible
export const APPROVAL_REQUIRED_CATEGORIES = ['contracts']

export const DOCUMENTS_PER_PAGE = 25

// Storage limit per project (in bytes) - 250 MB
// Keeps costs minimal during pre-revenue phase
// Increase this once subscription billing is active
export const PROJECT_STORAGE_LIMIT_BYTES = 250 * 1024 * 1024 // 250 MB
