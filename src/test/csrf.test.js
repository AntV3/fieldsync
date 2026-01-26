/**
 * Tests for CSRF protection utility
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { csrf } from '../lib/csrf'

describe('csrf.getToken', () => {
  beforeEach(() => {
    // Clear token before each test
    csrf.clearToken()
  })

  it('should generate a valid token', () => {
    const token = csrf.getToken()
    expect(token).toBeDefined()
    expect(typeof token).toBe('string')
    expect(token.length).toBe(64) // 32 bytes = 64 hex chars
  })

  it('should return the same token on subsequent calls', () => {
    const token1 = csrf.getToken()
    const token2 = csrf.getToken()
    expect(token1).toBe(token2)
  })

  it('should generate a new token after rotation', () => {
    const token1 = csrf.getToken()
    const token2 = csrf.rotateToken()
    expect(token1).not.toBe(token2)
  })
})

describe('csrf.validateToken', () => {
  it('should validate correct tokens', () => {
    const token = csrf.getToken()
    expect(csrf.validateToken(token)).toBe(true)
  })

  it('should reject invalid tokens', () => {
    expect(csrf.validateToken(null)).toBe(false)
    expect(csrf.validateToken(undefined)).toBe(false)
    expect(csrf.validateToken('')).toBe(false)
    expect(csrf.validateToken('short')).toBe(false)
    expect(csrf.validateToken('invalid-characters-here!')).toBe(false)
    expect(csrf.validateToken(123)).toBe(false)
  })

  it('should validate hex format', () => {
    // Valid 64-char hex
    expect(csrf.validateToken('a'.repeat(64))).toBe(true)
    expect(csrf.validateToken('0123456789abcdef'.repeat(4))).toBe(true)

    // Invalid - contains non-hex
    expect(csrf.validateToken('g'.repeat(64))).toBe(false)
  })
})

describe('csrf.getHeaders', () => {
  it('should return headers object with CSRF token', () => {
    const headers = csrf.getHeaders()
    expect(headers).toBeDefined()
    expect(headers['X-CSRF-Token']).toBeDefined()
    expect(typeof headers['X-CSRF-Token']).toBe('string')
  })

  it('should use the HEADER_NAME constant', () => {
    const headers = csrf.getHeaders()
    expect(headers[csrf.HEADER_NAME]).toBeDefined()
  })
})

describe('csrf.addToFormData', () => {
  it('should add CSRF token to FormData', () => {
    const formData = new FormData()
    formData.append('name', 'test')

    csrf.addToFormData(formData)

    expect(formData.get('_csrf')).toBe(csrf.getToken())
  })

  it('should throw for non-FormData input', () => {
    expect(() => csrf.addToFormData({})).toThrow('Expected FormData instance')
    expect(() => csrf.addToFormData(null)).toThrow()
  })
})

describe('csrf.addToBody', () => {
  it('should add CSRF token to object body', () => {
    const body = { name: 'test', value: 123 }
    const result = csrf.addToBody(body)

    expect(result._csrf).toBe(csrf.getToken())
    expect(result.name).toBe('test')
    expect(result.value).toBe(123)
  })

  it('should not mutate original object', () => {
    const body = { name: 'test' }
    const result = csrf.addToBody(body)

    expect(body._csrf).toBeUndefined()
    expect(result._csrf).toBeDefined()
  })

  it('should throw for non-object input', () => {
    expect(() => csrf.addToBody(null)).toThrow('Expected object body')
    expect(() => csrf.addToBody('string')).toThrow()
  })
})

describe('csrf.createSecureFetch', () => {
  it('should create a fetch wrapper', () => {
    const secureFetch = csrf.createSecureFetch()
    expect(typeof secureFetch).toBe('function')
  })

  it('should add CSRF headers to requests', async () => {
    let capturedHeaders = null

    const mockFetch = (url, options) => {
      capturedHeaders = options.headers
      return Promise.resolve({ ok: true })
    }

    const secureFetch = csrf.createSecureFetch(mockFetch)
    await secureFetch('/api/test', { method: 'POST' })

    expect(capturedHeaders[csrf.HEADER_NAME]).toBe(csrf.getToken())
  })

  it('should preserve existing headers', async () => {
    let capturedHeaders = null

    const mockFetch = (url, options) => {
      capturedHeaders = options.headers
      return Promise.resolve({ ok: true })
    }

    const secureFetch = csrf.createSecureFetch(mockFetch)
    await secureFetch('/api/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })

    expect(capturedHeaders['Content-Type']).toBe('application/json')
    expect(capturedHeaders[csrf.HEADER_NAME]).toBeDefined()
  })
})

describe('csrf.clearToken', () => {
  it('should clear the stored token', () => {
    const token1 = csrf.getToken()
    csrf.clearToken()
    const token2 = csrf.getToken()

    // New token should be generated
    expect(token2).not.toBe(token1)
  })
})
