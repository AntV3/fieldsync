/**
 * Field Session Management
 *
 * Field workers authenticate via PIN and receive a session token.
 * This token must be included in all subsequent requests.
 */

import { createClient } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured, supabaseUrl, supabaseAnonKey } from './supabaseClient'

const FIELD_SESSION_KEY = 'fieldsync_field_session'

// Store field session data in memory
let fieldSessionData = null

/**
 * Get stored field session from memory or sessionStorage
 * @returns {Object|null} Session data with token, projectId, companyId
 */
export const getFieldSession = () => {
  if (fieldSessionData) return fieldSessionData

  try {
    const stored = sessionStorage.getItem(FIELD_SESSION_KEY)
    if (stored) {
      fieldSessionData = JSON.parse(stored)
      return fieldSessionData
    }
  } catch (e) {
    // Ignore parse errors
  }
  return null
}

/**
 * Save field session to memory and sessionStorage
 * @param {Object|null} session - Session data to save
 */
export const setFieldSession = (session) => {
  fieldSessionData = session
  if (session) {
    sessionStorage.setItem(FIELD_SESSION_KEY, JSON.stringify(session))
  } else {
    sessionStorage.removeItem(FIELD_SESSION_KEY)
  }
}

/**
 * Clear field session (logout)
 * Invalidates session on server and clears local storage
 */
export const clearFieldSession = async () => {
  const session = getFieldSession()
  if (session?.token && isSupabaseConfigured) {
    // Invalidate on server
    try {
      await supabase.rpc('invalidate_field_session', { p_session_token: session.token })
    } catch (e) {
      // Ignore errors during logout
    }
  }
  setFieldSession(null)
}

// Cached field client with session header
let fieldClient = null

/**
 * Get Supabase client with field session header
 * Creates client lazily and caches it
 * @returns {Object} Supabase client
 */
export const getFieldClient = () => {
  const session = getFieldSession()
  if (!session?.token || !isSupabaseConfigured) return supabase

  // Create client with session header if not already created or token changed
  if (!fieldClient || fieldClient._sessionToken !== session.token) {
    fieldClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          'x-field-session': session.token
        }
      }
    })
    fieldClient._sessionToken = session.token
  }

  return fieldClient
}

/**
 * Get the appropriate Supabase client for the current context
 * Returns field client if in field mode, otherwise regular client
 * @returns {Object} Supabase client
 */
export const getSupabaseClient = () => {
  const session = getFieldSession()
  return session?.token ? getFieldClient() : supabase
}

/**
 * Internal function to get client for db methods
 * Returns null if Supabase is not configured (demo mode)
 * @returns {Object|null} Supabase client
 */
export const getClient = () => {
  if (!isSupabaseConfigured) return null
  const session = getFieldSession()
  return session?.token ? getFieldClient() : supabase
}

/**
 * Check if currently in field mode with valid session
 * @returns {boolean}
 */
export const isFieldMode = () => {
  const session = getFieldSession()
  return Boolean(session?.token && session?.projectId)
}

/**
 * Get current field project ID
 * @returns {string|null}
 */
export const getFieldProjectId = () => {
  const session = getFieldSession()
  return session?.projectId || null
}

/**
 * Get current field company ID
 * @returns {string|null}
 */
export const getFieldCompanyId = () => {
  const session = getFieldSession()
  return session?.companyId || null
}

export default {
  getFieldSession,
  setFieldSession,
  clearFieldSession,
  getFieldClient,
  getSupabaseClient,
  getClient,
  isFieldMode,
  getFieldProjectId,
  getFieldCompanyId
}
