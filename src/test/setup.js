// Test setup file - runs before each test
import '@testing-library/jest-dom'

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

// jsdom doesn't ship IndexedDB. Give components that read from the offline
// store (OfflineIndicator, offlineManager) a request that fails cleanly
// instead of throwing ReferenceError, so their .catch paths run in tests.
if (typeof indexedDB === 'undefined') {
  const failingRequest = () => {
    const request = {
      result: null,
      error: new Error('IndexedDB unavailable in test environment'),
      onerror: null,
      onsuccess: null,
      onupgradeneeded: null,
    }
    queueMicrotask(() => {
      if (typeof request.onerror === 'function') request.onerror({ target: request })
    })
    return request
  }
  globalThis.indexedDB = {
    open: failingRequest,
    deleteDatabase: failingRequest,
    cmp: () => 0,
    databases: async () => [],
  }
}

// Suppress console errors during tests (optional - comment out to see errors)
// console.error = () => {}
