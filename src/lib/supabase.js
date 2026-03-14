/**
 * supabase.js — Barrel module that composes the db facade from domain modules.
 *
 * All existing imports (`import { db, auth } from './lib/supabase'`) continue
 * to work exactly as before. The implementation is now split across:
 *
 *   db/projectOps.js   — Projects, Areas, Subscriptions, Assignments
 *   db/laborOps.js     — Materials, Equipment, Labor rates
 *   db/tmOps.js        — T&M Tickets, Photos
 *   db/companyOps.js   — Company, Memberships, Punch list
 *   db/fieldOps.js     — Crew, Daily Reports, Messaging, Material Requests, Injuries, Disposal
 *   db/financialOps.js — COR/Exports, Sharing, Notifications
 *   db/documentOps.js  — Documents, Folders
 *   db/client.js       — Shared deps (supabase client, offline cache, helpers)
 */

import {
  getConnectionStatus,
  onConnectionChange,
  getPendingActionCount,
  syncPendingActions
} from './offlineManager'
import { supabase, isSupabaseConfigured } from './supabaseClient'
import {
  clearFieldSession,
  getSupabaseClient,
  isFieldMode,
  getFieldProjectId,
  getFieldCompanyId
} from './fieldSession'
import { getLocalData, setLocalData, getLocalUser, setLocalUser } from './localStorageHelpers'
import { corOps } from './corOps'
import { equipmentOps } from './equipmentOps'
import { drawRequestOps } from './drawRequestOps'

// Domain modules
import { projectOps } from './db/projectOps'
import { laborOps } from './db/laborOps'
import { tmOps } from './db/tmOps'
import { companyOps } from './db/companyOps'
import { fieldOps } from './db/fieldOps'
import { financialOps } from './db/financialOps'
import { documentOps } from './db/documentOps'
import { tradeOps } from './db/tradeOps'

// Initialize offline database (guard for SSR/test environments)
if (typeof window !== 'undefined') {
  import('./offlineManager').then(m => m.initOfflineDB().catch(err =>
    console.error('Failed to init offline DB:', err)
  ))
}

// Re-export for other modules
export { supabase, isSupabaseConfigured }
export { clearFieldSession, getSupabaseClient, isFieldMode, getFieldProjectId, getFieldCompanyId }
export { equipmentOps, drawRequestOps }

// ============================================
// Authentication
// ============================================

export const auth = {
  async signUp(email, password, fullName, role) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name: fullName, role }
        }
      })
      if (error) throw error
      return data
    } else {
      const localData = getLocalData()
      const user = {
        id: crypto.randomUUID(),
        email,
        name: fullName,
        role,
        created_at: new Date().toISOString()
      }
      localData.users.push(user)
      setLocalData(localData)
      setLocalUser(user)
      return { user }
    }
  },

  async signIn(email, password) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      return data
    } else {
      if (import.meta.env.DEV) {
        console.warn('[auth] Demo mode: password validation is skipped. Do not use demo mode in production.')
      }
      const localData = getLocalData()
      const user = localData.users.find(u => u.email === email)
      if (!user) throw new Error('User not found')
      setLocalUser(user)
      return { user }
    }
  },

  async signOut() {
    if (isSupabaseConfigured) {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
    } else {
      setLocalUser(null)
    }
  },

  async getUser() {
    if (isSupabaseConfigured) {
      const { data: { user } } = await supabase.auth.getUser()
      return user
    } else {
      return getLocalUser()
    }
  },

  async getProfile() {
    if (isSupabaseConfigured) {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return null

      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single()

      if (error) {
        return {
          id: user.id,
          email: user.email,
          name: user.user_metadata?.name || '',
          role: user.user_metadata?.role || 'foreman'
        }
      }
      return data
    } else {
      return getLocalUser()
    }
  },

  async updateRole(userId, newRole) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('users')
        .update({ role: newRole })
        .eq('id', userId)
        .select()
        .single()
      if (error) throw error
      return data
    } else {
      const localData = getLocalData()
      const user = localData.users.find(u => u.id === userId)
      if (user) {
        user.role = newRole
        setLocalData(localData)
        if (getLocalUser()?.id === userId) {
          setLocalUser(user)
        }
      }
      return user
    }
  },

  onAuthStateChange(callback) {
    if (isSupabaseConfigured) {
      return supabase.auth.onAuthStateChange(callback)
    } else {
      const user = getLocalUser()
      callback(user ? 'SIGNED_IN' : 'SIGNED_OUT', { user })
      return { data: { subscription: { unsubscribe: () => {} } } }
    }
  }
}

// ============================================
// Database operations — composed from domain modules
// ============================================

export const db = {
  ...projectOps,
  ...laborOps,
  ...tmOps,
  ...companyOps,
  ...fieldOps,
  ...financialOps,
  ...documentOps,
  ...corOps,
  ...tradeOps,
}

// ============================================
// Offline Support Exports
// ============================================

export {
  getConnectionStatus,
  onConnectionChange,
  getPendingActionCount,
  syncPendingActions
}

// Sync pending actions when coming back online
onConnectionChange(async (online) => {
  if (online && isSupabaseConfigured) {
    try {
      await syncPendingActions(db)
    } catch (err) {
      console.error('Error syncing pending actions:', err)
    }
  }
})
