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

// Suppress console errors during tests (optional - comment out to see errors)
// console.error = () => {}
