/**
 * User Context Manager for Audit Trails
 * Tracks current user information for creating audit fields
 */

import { setUserContext, getUserContext, clearUserContext } from './offlineStorage'

/**
 * Initialize user context for audit trails
 * Call this when user logs in or app starts
 */
export async function initializeUserContext(user) {
  if (!user) {
    console.warn('Cannot initialize user context: no user provided')
    return null
  }

  const userContext = {
    userId: user.id,
    userName: user.name || user.full_name || user.email || 'Unknown User',
    userEmail: user.email || '',
    role: user.role || 'field',
  }

  await setUserContext(
    userContext.userId,
    userContext.userName,
    userContext.userEmail,
    userContext.role
  )

  console.log('✅ User context initialized for audit trails:', userContext.userName)

  return userContext
}

/**
 * Get current user context
 */
export async function getCurrentUserContext() {
  return getUserContext()
}

/**
 * Clear user context (on logout)
 */
export async function clearCurrentUserContext() {
  await clearUserContext()
  console.log('✅ User context cleared')
}

/**
 * Update user context (if user details change)
 */
export async function updateUserContext(updates) {
  const current = await getUserContext()

  if (!current) {
    console.warn('No user context to update')
    return null
  }

  const updated = {
    ...current,
    ...updates,
  }

  await setUserContext(
    updated.userId,
    updated.userName,
    updated.userEmail,
    updated.role
  )

  return updated
}

/**
 * Format audit trail for display
 */
export function formatAuditTrail(record) {
  if (!record) return null

  const parts = []

  if (record.created_by_name && record.created_at) {
    const date = new Date(record.created_at)
    parts.push(`Created by ${record.created_by_name} on ${formatDate(date)}`)
  }

  if (record.updated_by_name && record.updated_at && record.updated_at !== record.created_at) {
    const date = new Date(record.updated_at)
    parts.push(`Updated by ${record.updated_by_name} on ${formatDate(date)}`)
  }

  return parts.join(' • ')
}

/**
 * Format date for display
 */
function formatDate(date) {
  const now = new Date()
  const diffMs = now - date
  const diffMins = Math.floor(diffMs / 60000)

  // Less than 1 minute
  if (diffMins < 1) return 'just now'

  // Less than 1 hour
  if (diffMins < 60) {
    return diffMins === 1 ? '1 minute ago' : `${diffMins} minutes ago`
  }

  // Less than 24 hours
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) {
    return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`
  }

  // Less than 7 days
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) {
    return diffDays === 1 ? '1 day ago' : `${diffDays} days ago`
  }

  // Full date
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Get audit summary for a record
 */
export function getAuditSummary(record) {
  if (!record) return null

  return {
    createdBy: record.created_by_name || 'Unknown',
    createdAt: record.created_at ? new Date(record.created_at) : null,
    updatedBy: record.updated_by_name || null,
    updatedAt: record.updated_at ? new Date(record.updated_at) : null,
    formatted: formatAuditTrail(record),
  }
}

/**
 * Validate user context is set before operations
 */
export async function requireUserContext() {
  const context = await getUserContext()

  if (!context) {
    throw new Error('User context required for this operation. Please log in.')
  }

  return context
}
