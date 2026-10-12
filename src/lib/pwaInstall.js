/**
 * PWA install helpers.
 *
 * iOS Safari never fires `beforeinstallprompt`, so the only way to get the
 * app onto an iPhone home screen is a manual Share → Add to Home Screen.
 * These helpers let the install banner detect that case and show
 * instructions instead of silently showing nothing.
 */

export function isIosSafari(nav = navigator) {
  const ua = nav.userAgent || ''
  // iPadOS 13+ reports as Macintosh but has touch points
  const isIosDevice = /iPhone|iPad|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && nav.maxTouchPoints > 1)
  if (!isIosDevice) return false
  // Chrome/Firefox/Edge on iOS can't install PWAs either, but the
  // Share-sheet instructions are Safari-specific, so don't show them there.
  const isOtherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)
  return !isOtherBrowser
}

export function isStandalone(win = window) {
  return win.matchMedia?.('(display-mode: standalone)')?.matches === true ||
    win.navigator?.standalone === true
}
