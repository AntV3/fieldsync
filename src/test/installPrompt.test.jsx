import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import InstallPrompt from '../components/InstallPrompt'
import { isIosSafari, isStandalone } from '../lib/pwaInstall'

const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/123.0 Mobile/15E148 Safari/604.1',
  ipadOS: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Mobile Safari/537.36',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
}

function setUserAgent(ua, maxTouchPoints = 0) {
  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true })
  Object.defineProperty(window.navigator, 'maxTouchPoints', { value: maxTouchPoints, configurable: true })
}

describe('isIosSafari', () => {
  it('detects iPhone Safari', () => {
    expect(isIosSafari({ userAgent: UA.iphoneSafari, maxTouchPoints: 5 })).toBe(true)
  })

  it('detects iPadOS pretending to be a Mac via touch points', () => {
    expect(isIosSafari({ userAgent: UA.ipadOS, maxTouchPoints: 5 })).toBe(true)
  })

  it('does not flag a real desktop Mac', () => {
    expect(isIosSafari({ userAgent: UA.macSafari, maxTouchPoints: 0 })).toBe(false)
  })

  it('does not flag Chrome on iOS (Share-sheet steps differ)', () => {
    expect(isIosSafari({ userAgent: UA.iphoneChrome, maxTouchPoints: 5 })).toBe(false)
  })

  it('does not flag Android', () => {
    expect(isIosSafari({ userAgent: UA.androidChrome, maxTouchPoints: 5 })).toBe(false)
  })
})

describe('isStandalone', () => {
  it('is true when display-mode is standalone', () => {
    expect(isStandalone({ matchMedia: () => ({ matches: true }), navigator: {} })).toBe(true)
  })

  it('is true when iOS navigator.standalone is set', () => {
    expect(isStandalone({ matchMedia: () => ({ matches: false }), navigator: { standalone: true } })).toBe(true)
  })

  it('is false in a normal browser tab', () => {
    expect(isStandalone({ matchMedia: () => ({ matches: false }), navigator: {} })).toBe(false)
  })
})

describe('<InstallPrompt />', () => {
  const originalUA = window.navigator.userAgent

  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    setUserAgent(originalUA, 0)
    vi.restoreAllMocks()
  })

  it('shows Share → Add to Home Screen instructions on iPhone Safari', () => {
    setUserAgent(UA.iphoneSafari, 5)
    render(<InstallPrompt />)
    expect(screen.getByText('Install FieldSync')).toBeInTheDocument()
    expect(screen.getByText('Add to Home Screen')).toBeInTheDocument()
    // No native Install button on iOS — there is nothing to call
    expect(screen.queryByRole('button', { name: 'Install' })).not.toBeInTheDocument()
  })

  it('renders nothing on Android until beforeinstallprompt fires', () => {
    setUserAgent(UA.androidChrome, 5)
    const { container } = render(<InstallPrompt />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the native Install button after beforeinstallprompt fires', () => {
    setUserAgent(UA.androidChrome, 5)
    render(<InstallPrompt />)
    const evt = new Event('beforeinstallprompt')
    evt.prompt = vi.fn()
    evt.userChoice = Promise.resolve({ outcome: 'dismissed' })
    fireEvent(window, evt)
    expect(screen.getByRole('button', { name: 'Install' })).toBeInTheDocument()
  })

  it('does not show on iPhone if dismissed within the last 7 days', () => {
    setUserAgent(UA.iphoneSafari, 5)
    localStorage.setItem('pwa-install-dismissed', Date.now().toString())
    const { container } = render(<InstallPrompt />)
    expect(container).toBeEmptyDOMElement()
  })

  it('dismiss hides the iOS banner and records the dismissal', () => {
    setUserAgent(UA.iphoneSafari, 5)
    const { container } = render(<InstallPrompt />)
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(container).toBeEmptyDOMElement()
    expect(localStorage.getItem('pwa-install-dismissed')).not.toBeNull()
  })
})
