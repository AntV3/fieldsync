/**
 * Native platform bridge for Capacitor
 *
 * Detects whether the app is running inside a native iOS/Android shell
 * or in a regular browser, and provides unified APIs that use native
 * capabilities when available, falling back to web APIs otherwise.
 */
import { Capacitor } from '@capacitor/core'

// ── Platform Detection ──────────────────────────────────────────────

export const isNative = Capacitor.isNativePlatform()
export const platform = Capacitor.getPlatform() // 'ios' | 'android' | 'web'
export const isIOS = platform === 'ios'
export const isAndroid = platform === 'android'

// ── App Lifecycle ───────────────────────────────────────────────────

let appListenersRegistered = false

/**
 * Initialize native app lifecycle listeners.
 * Call once at app startup (main.jsx).
 */
export async function initNativeApp() {
  if (!isNative || appListenersRegistered) return
  appListenersRegistered = true

  const { App } = await import('@capacitor/app')
  const { StatusBar, Style } = await import('@capacitor/status-bar')
  const { SplashScreen } = await import('@capacitor/splash-screen')
  const { Keyboard } = await import('@capacitor/keyboard')

  // Style the status bar
  try {
    await StatusBar.setStyle({ style: Style.Dark })
    if (isAndroid) {
      await StatusBar.setBackgroundColor({ color: '#0f172a' })
    }
  } catch {
    // Status bar not available in all contexts
  }

  // Hide splash once the app is ready
  try {
    await SplashScreen.hide()
  } catch {
    // Splash screen may not be showing
  }

  // Handle hardware back button on Android
  App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back()
    } else {
      App.minimizeApp()
    }
  })

  // Keyboard adjustments for form-heavy field views
  try {
    Keyboard.addListener('keyboardWillShow', () => {
      document.body.classList.add('keyboard-visible')
    })
    Keyboard.addListener('keyboardWillHide', () => {
      document.body.classList.remove('keyboard-visible')
    })
  } catch {
    // Keyboard plugin not available on all platforms
  }
}

// ── Camera ──────────────────────────────────────────────────────────

/**
 * Take a photo using the native camera (or file picker on web).
 * Returns a File-like object or a web path for display.
 */
export async function takePhoto() {
  if (!isNative) return null // Caller should fall back to <input type="file">

  const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera')
  const result = await Camera.getPhoto({
    resultType: CameraResultType.Uri,
    source: CameraSource.Camera,
    quality: 85,
    allowEditing: false,
    width: 1920,
    height: 1920,
  })

  return result.webPath || null
}

/**
 * Pick a photo from the device gallery.
 */
export async function pickPhoto() {
  if (!isNative) return null

  const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera')
  const result = await Camera.getPhoto({
    resultType: CameraResultType.Uri,
    source: CameraSource.Photos,
    quality: 85,
    width: 1920,
    height: 1920,
  })

  return result.webPath || null
}

// ── Geolocation ─────────────────────────────────────────────────────

/**
 * Get current GPS coordinates using native geolocation when available.
 * Falls back to browser Geolocation API on web.
 * @param {number} timeout - Max wait in ms (default 5000)
 * @returns {Promise<{latitude: number, longitude: number, accuracy: number}|null>}
 */
export async function getLocation(timeout = 5000) {
  if (isNative) {
    try {
      const { Geolocation } = await import('@capacitor/geolocation')
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout,
      })
      return {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: Math.round(pos.coords.accuracy),
      }
    } catch {
      return null
    }
  }

  // Web fallback
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: Math.round(position.coords.accuracy),
        })
      },
      () => resolve(null),
      { enableHighAccuracy: true, timeout, maximumAge: 60000 }
    )
  })
}

// ── Push Notifications ──────────────────────────────────────────────

/**
 * Register for push notifications on native platforms.
 * Returns the device token string or null.
 */
export async function registerPushNotifications() {
  if (!isNative) return null

  const { PushNotifications } = await import('@capacitor/push-notifications')

  const permission = await PushNotifications.requestPermissions()
  if (permission.receive !== 'granted') return null

  return new Promise((resolve) => {
    PushNotifications.addListener('registration', (token) => {
      resolve(token.value)
    })
    PushNotifications.addListener('registrationError', () => {
      resolve(null)
    })
    PushNotifications.register()
  })
}

/**
 * Add a listener for incoming push notifications (foreground).
 * @param {Function} callback - Called with notification data
 * @returns {Function} Cleanup function to remove the listener
 */
export async function onPushNotification(callback) {
  if (!isNative) return () => {}

  const { PushNotifications } = await import('@capacitor/push-notifications')
  const listener = await PushNotifications.addListener(
    'pushNotificationReceived',
    callback
  )
  return () => listener.remove()
}

/**
 * Add a listener for push notification taps (background → app open).
 * @param {Function} callback - Called with notification action data
 * @returns {Function} Cleanup function
 */
export async function onPushNotificationTap(callback) {
  if (!isNative) return () => {}

  const { PushNotifications } = await import('@capacitor/push-notifications')
  const listener = await PushNotifications.addListener(
    'pushNotificationActionPerformed',
    callback
  )
  return () => listener.remove()
}

// ── Haptics ─────────────────────────────────────────────────────────

/**
 * Trigger a light haptic tap. No-op on web.
 */
export async function hapticTap() {
  if (!isNative) return
  const { Haptics, ImpactStyle } = await import('@capacitor/haptics')
  await Haptics.impact({ style: ImpactStyle.Light })
}

/**
 * Trigger a success haptic notification. No-op on web.
 */
export async function hapticSuccess() {
  if (!isNative) return
  const { Haptics, NotificationType } = await import('@capacitor/haptics')
  await Haptics.notification({ type: NotificationType.Success })
}

/**
 * Trigger a warning haptic notification. No-op on web.
 */
export async function hapticWarning() {
  if (!isNative) return
  const { Haptics, NotificationType } = await import('@capacitor/haptics')
  await Haptics.notification({ type: NotificationType.Warning })
}

// ── Network ─────────────────────────────────────────────────────────

/**
 * Get the current network status.
 * @returns {Promise<{connected: boolean, connectionType: string}>}
 */
export async function getNetworkStatus() {
  if (!isNative) {
    return { connected: navigator.onLine, connectionType: 'unknown' }
  }
  const { Network } = await import('@capacitor/network')
  return Network.getStatus()
}

/**
 * Listen for network status changes.
 * @param {Function} callback - Called with {connected, connectionType}
 * @returns {Function} Cleanup function
 */
export async function onNetworkChange(callback) {
  if (!isNative) {
    const onlineHandler = () => callback({ connected: true, connectionType: 'unknown' })
    const offlineHandler = () => callback({ connected: false, connectionType: 'none' })
    window.addEventListener('online', onlineHandler)
    window.addEventListener('offline', offlineHandler)
    return () => {
      window.removeEventListener('online', onlineHandler)
      window.removeEventListener('offline', offlineHandler)
    }
  }

  const { Network } = await import('@capacitor/network')
  const listener = await Network.addListener('networkStatusChange', callback)
  return () => listener.remove()
}
