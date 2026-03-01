/**
 * Supabase Client Initialization
 *
 * This file is separate to avoid circular dependencies between
 * supabase.js and observability.js
 */

import { createClient } from '@supabase/supabase-js'

// For demo purposes, we'll use a mock mode that falls back to localStorage
// In production, you would set these environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

// Check if Supabase is configured
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

// Guard: demo/localStorage mode should only run in development
if (!isSupabaseConfigured && import.meta.env.PROD) {
  console.error('[FieldSync] WARNING: Supabase is not configured in production. Data will be stored in localStorage only. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables.')
}

// Create client only if configured
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

// Export URL and key for creating additional clients (field sessions)
export { supabaseUrl, supabaseAnonKey }
