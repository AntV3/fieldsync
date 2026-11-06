/**
 * Signing client — a dedicated supabase-js client for the public
 * /sign/:token page.
 *
 * The signature token is the only credential an outside signer has.
 * Every call the page makes goes through token-gated SECURITY DEFINER
 * RPCs (public_get_signature_request_by_token, public_get_document_for_signing,
 * public_add_signature), and photos are minted as signed URLs by the
 * Storage API whose RLS policy reads the `x-signing-token` request
 * header (signing_token_can_read_photo). This client sends that header
 * on every request. Shape mirrors getFieldClient() in fieldSession.js.
 *
 * One client is cached per token. No auth session is ever persisted,
 * so a logged-in office user opening a link behaves exactly like an
 * outside signer.
 */

import { createClient } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabaseUrl, supabaseAnonKey } from './supabaseClient'

export const SIGNING_TOKEN_HEADER = 'x-signing-token'

let cachedToken = null
let cachedClient = null

/**
 * Get a Supabase client that sends the signing token header.
 * @param {string} token - the signature_requests.signature_token
 * @returns {Object|null} supabase-js client, or null when Supabase is
 *   not configured or no token was given
 */
export const getSigningClient = (token) => {
  if (!isSupabaseConfigured || !token) return null

  if (!cachedClient || cachedToken !== token) {
    cachedClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          [SIGNING_TOKEN_HEADER]: token
        }
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        storageKey: 'fieldsync-signing-auth-token'
      },
      realtime: {
        params: { eventsPerSecond: 0 }
      }
    })
    cachedToken = token
  }

  return cachedClient
}

/** Drop the cached client (tests / token change). */
export const resetSigningClient = () => {
  cachedToken = null
  cachedClient = null
}
