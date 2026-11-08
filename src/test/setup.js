// Test setup file - runs before each test
import '@testing-library/jest-dom'
// jsdom has no IndexedDB; fake-indexeddb/auto installs one globally so
// components that read from IDB (e.g. OfflineIndicator) don't throw.
import 'fake-indexeddb/auto'

// Mock matchMedia (needed for components that use media queries)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {}
  })
})

// Mock scrollTo (jsdom doesn't implement this)
window.scrollTo = () => {}

// Mock IntersectionObserver
class MockIntersectionObserver {
  constructor() {}
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.IntersectionObserver = MockIntersectionObserver

// Suppress console errors during tests (optional - comment out to see errors)
// console.error = () => {}
