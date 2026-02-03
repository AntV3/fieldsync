/**
 * Shared dependencies and helpers for all db domain modules.
 * Every domain module imports from here instead of directly from external modules.
 */

import {
  initOfflineDB,
  getConnectionStatus,
  onConnectionChange,
  cacheProjects,
  getCachedProjects,
  cacheAreas,
  getCachedAreas,
  updateCachedAreaStatus,
  cacheCrewCheckin,
  getCachedCrewCheckin,
  cacheTMTicket,
  getCachedTMTickets,
  generateTempId,
  cacheDailyReport,
  getCachedDailyReport,
  cacheMessage,
  getCachedMessages,
  addPendingAction,
  getPendingActionCount,
  syncPendingActions,
  ACTION_TYPES
} from '../offlineManager'
import { supabase, isSupabaseConfigured } from '../supabaseClient'
import { observe } from '../observability'
import {
  getFieldSession,
  setFieldSession,
  clearFieldSession,
  getFieldClient,
  getClient,
  getSupabaseClient,
  isFieldMode,
  getFieldProjectId,
  getFieldCompanyId
} from '../fieldSession'

// Re-export everything domain modules need
export {
  supabase, isSupabaseConfigured,
  observe,
  getFieldSession, setFieldSession, clearFieldSession,
  getFieldClient, getClient, getSupabaseClient,
  isFieldMode, getFieldProjectId, getFieldCompanyId,
  getConnectionStatus, onConnectionChange,
  cacheProjects, getCachedProjects,
  cacheAreas, getCachedAreas, updateCachedAreaStatus,
  cacheCrewCheckin, getCachedCrewCheckin,
  cacheTMTicket, getCachedTMTickets,
  generateTempId,
  cacheDailyReport, getCachedDailyReport,
  cacheMessage, getCachedMessages,
  addPendingAction, getPendingActionCount, syncPendingActions,
  ACTION_TYPES,
  initOfflineDB
}

// ============================================
// Local storage fallback for demo mode
// ============================================

const STORAGE_KEY = 'fieldsync_data'
const USER_KEY = 'fieldsync_user'

const DEFAULT_LOCAL_DATA = { projects: [], areas: [], users: [], assignments: [] }

export const getLocalData = () => {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    return data ? JSON.parse(data) : DEFAULT_LOCAL_DATA
  } catch {
    localStorage.removeItem(STORAGE_KEY)
    return DEFAULT_LOCAL_DATA
  }
}

export const setLocalData = (data) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export const getLocalUser = () => {
  try {
    const user = localStorage.getItem(USER_KEY)
    return user ? JSON.parse(user) : null
  } catch {
    localStorage.removeItem(USER_KEY)
    return null
  }
}

export const setLocalUser = (user) => {
  if (user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user))
  } else {
    localStorage.removeItem(USER_KEY)
  }
}

// ============================================
// Security Helpers
// ============================================

export const getDeviceId = () => {
  const key = 'fieldsync_device_id'
  let deviceId = localStorage.getItem(key)
  if (!deviceId) {
    deviceId = crypto.randomUUID()
    localStorage.setItem(key, deviceId)
  }
  return deviceId
}

export const withRetry = async (fn, maxRetries = 3, baseDelay = 1000) => {
  let lastError
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (error.code === 'PGRST301' || error.code === '42501' || error.code === '23514') {
        throw error
      }
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, baseDelay * Math.pow(2, i)))
      }
    }
  }
  throw lastError
}

export const validateAmount = (amount) => {
  if (amount === null || amount === undefined) return true
  const num = parseFloat(amount)
  return !isNaN(num) && num >= 0 && num < 10000000
}

export const validateTextLength = (text, maxLength = 10000) => {
  if (!text) return true
  return text.length <= maxLength
}

export const sanitizeText = (text) => {
  if (!text) return text
  return text.replace(/\0/g, '').trim()
}
