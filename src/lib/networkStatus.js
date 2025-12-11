/**
 * Network Status Detection and Management
 * Monitors online/offline status and triggers sync operations
 */

import { useState, useEffect } from 'react'

// Network status state
let isOnlineState = navigator.onLine
const listeners = new Set()

/**
 * Subscribe to network status changes
 */
export function subscribeToNetworkStatus(callback) {
  listeners.add(callback)

  return () => {
    listeners.delete(callback)
  }
}

/**
 * Notify all listeners of status change
 */
function notifyListeners(online) {
  listeners.forEach(callback => {
    try {
      callback(online)
    } catch (error) {
      console.error('Network status listener error:', error)
    }
  })
}

/**
 * Handle online event
 */
function handleOnline() {
  console.log('🟢 Network: ONLINE')
  isOnlineState = true
  notifyListeners(true)
}

/**
 * Handle offline event
 */
function handleOffline() {
  console.log('🔴 Network: OFFLINE')
  isOnlineState = false
  notifyListeners(false)
}

/**
 * Initialize network status monitoring
 */
export function initNetworkMonitoring() {
  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)

  // Check initial status
  isOnlineState = navigator.onLine
  console.log(`📡 Network status initialized: ${isOnlineState ? 'ONLINE' : 'OFFLINE'}`)

  return () => {
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
  }
}

/**
 * Get current network status
 */
export function isOnline() {
  return isOnlineState
}

/**
 * React hook for network status
 */
export function useNetworkStatus() {
  const [online, setOnline] = useState(isOnlineState)

  useEffect(() => {
    // Set initial state
    setOnline(isOnlineState)

    // Subscribe to changes
    const unsubscribe = subscribeToNetworkStatus((isOnline) => {
      setOnline(isOnline)
    })

    return unsubscribe
  }, [])

  return online
}

/**
 * Check if actually online by pinging Supabase
 */
export async function checkOnlineStatus(supabaseUrl) {
  if (!navigator.onLine) {
    return false
  }

  try {
    // Try to fetch Supabase health endpoint
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000) // 5s timeout

    const response = await fetch(`${supabaseUrl}/rest/v1/`, {
      method: 'HEAD',
      signal: controller.signal,
    })

    clearTimeout(timeoutId)
    return response.ok || response.status === 401 // 401 means server is reachable
  } catch (error) {
    console.warn('Online check failed:', error.message)
    return false
  }
}

/**
 * Wait for network to become available
 */
export function waitForNetwork(timeout = 60000) {
  return new Promise((resolve, reject) => {
    if (isOnlineState) {
      resolve(true)
      return
    }

    const timeoutId = setTimeout(() => {
      unsubscribe()
      reject(new Error('Network timeout'))
    }, timeout)

    const unsubscribe = subscribeToNetworkStatus((online) => {
      if (online) {
        clearTimeout(timeoutId)
        unsubscribe()
        resolve(true)
      }
    })
  })
}

/**
 * Retry an operation when network becomes available
 */
export async function retryWhenOnline(operation, maxWait = 60000) {
  if (isOnlineState) {
    return operation()
  }

  console.log('⏳ Waiting for network to retry operation...')

  try {
    await waitForNetwork(maxWait)
    return operation()
  } catch (error) {
    throw new Error('Operation failed: Network unavailable')
  }
}

/**
 * Network quality indicator
 */
export async function getNetworkQuality() {
  if (!navigator.onLine) {
    return 'offline'
  }

  // Try to measure connection quality with a ping
  const startTime = Date.now()

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 3000)

    await fetch('https://www.google.com/favicon.ico', {
      method: 'HEAD',
      mode: 'no-cors',
      signal: controller.signal,
    })

    clearTimeout(timeoutId)
    const latency = Date.now() - startTime

    if (latency < 200) return 'excellent'
    if (latency < 500) return 'good'
    if (latency < 1000) return 'fair'
    return 'poor'
  } catch (error) {
    return 'poor'
  }
}
