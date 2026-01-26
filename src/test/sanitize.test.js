/**
 * Tests for sanitization and validation utilities
 */
import { describe, it, expect } from 'vitest'
import { sanitize, validate } from '../lib/sanitize'

// ============================================
// Sanitization Tests
// ============================================

describe('sanitize.text', () => {
  it('should remove HTML tags', () => {
    expect(sanitize.text('<script>alert("xss")</script>')).toBe('alert("xss")')
    expect(sanitize.text('<b>bold</b>')).toBe('bold')
    // Note: trim is true by default, so trailing space is removed
    expect(sanitize.text('Hello <img src=x onerror=alert(1)>')).toBe('Hello')
  })

  it('should handle null and undefined', () => {
    expect(sanitize.text(null)).toBe('')
    expect(sanitize.text(undefined)).toBe('')
  })

  it('should convert non-strings to strings', () => {
    expect(sanitize.text(123)).toBe('123')
    expect(sanitize.text(true)).toBe('true')
  })

  it('should remove null bytes', () => {
    expect(sanitize.text('hello\0world')).toBe('helloworld')
  })

  it('should trim whitespace by default', () => {
    expect(sanitize.text('  hello  ')).toBe('hello')
  })

  it('should enforce max length', () => {
    const long = 'a'.repeat(100)
    expect(sanitize.text(long, { maxLength: 10 })).toBe('a'.repeat(10))
  })

  it('should optionally remove newlines', () => {
    expect(sanitize.text('hello\nworld', { allowNewlines: false })).toBe('hello world')
  })
})

describe('sanitize.html', () => {
  it('should escape HTML entities', () => {
    expect(sanitize.html('<script>')).toBe('&lt;script&gt;')
    expect(sanitize.html('"quoted"')).toBe('&quot;quoted&quot;')
    expect(sanitize.html("it's")).toBe("it&#039;s")
    expect(sanitize.html('a & b')).toBe('a &amp; b')
  })

  it('should handle null and undefined', () => {
    expect(sanitize.html(null)).toBe('')
    expect(sanitize.html(undefined)).toBe('')
  })
})

describe('sanitize.url', () => {
  it('should allow http and https URLs', () => {
    expect(sanitize.url('https://example.com')).toBe('https://example.com')
    expect(sanitize.url('http://example.com')).toBe('http://example.com')
  })

  it('should allow relative URLs', () => {
    expect(sanitize.url('/path/to/page')).toBe('/path/to/page')
  })

  it('should block javascript URLs', () => {
    expect(sanitize.url('javascript:alert(1)')).toBe('')
    expect(sanitize.url('JAVASCRIPT:alert(1)')).toBe('')
  })

  it('should block data URLs', () => {
    expect(sanitize.url('data:text/html,<script>alert(1)</script>')).toBe('')
  })

  it('should block other dangerous protocols', () => {
    expect(sanitize.url('vbscript:msgbox(1)')).toBe('')
    expect(sanitize.url('file:///etc/passwd')).toBe('')
  })

  it('should handle null and undefined', () => {
    expect(sanitize.url(null)).toBe('')
    expect(sanitize.url(undefined)).toBe('')
  })
})

describe('sanitize.filename', () => {
  it('should remove path traversal attempts', () => {
    expect(sanitize.filename('../../../etc/passwd')).toBe('etcpasswd')
    expect(sanitize.filename('..\\..\\windows\\system32')).toBe('windowssystem32')
  })

  it('should remove dangerous characters', () => {
    expect(sanitize.filename('file<name>.txt')).toBe('filename.txt')
    expect(sanitize.filename('file:name?.txt')).toBe('filename.txt')
  })

  it('should trim dots and spaces', () => {
    expect(sanitize.filename('...file.txt...')).toBe('file.txt')
    expect(sanitize.filename('  file.txt  ')).toBe('file.txt')
  })

  it('should limit length', () => {
    const long = 'a'.repeat(300) + '.txt'
    expect(sanitize.filename(long).length).toBeLessThanOrEqual(255)
  })
})

describe('sanitize.object', () => {
  it('should sanitize all string values', () => {
    const input = {
      // sanitize.text removes tags but keeps text content inside them
      name: '<script></script>John',
      age: 30,
      nested: {
        value: '<b>test</b>'
      }
    }
    const result = sanitize.object(input)
    expect(result.name).toBe('John')
    expect(result.age).toBe(30)
    expect(result.nested.value).toBe('test')
  })

  it('should handle arrays', () => {
    const input = ['<b>one</b>', '<i>two</i>']
    const result = sanitize.object(input)
    expect(result).toEqual(['one', 'two'])
  })
})

// ============================================
// Validation Tests
// ============================================

describe('validate.email', () => {
  it('should accept valid emails', () => {
    expect(validate.email('test@example.com')).toBe(true)
    expect(validate.email('user.name@domain.co.uk')).toBe(true)
    expect(validate.email('user+tag@example.org')).toBe(true)
  })

  it('should reject invalid emails', () => {
    expect(validate.email('notanemail')).toBe(false)
    expect(validate.email('missing@domain')).toBe(false)
    expect(validate.email('@nodomain.com')).toBe(false)
    expect(validate.email('')).toBe(false)
    expect(validate.email(null)).toBe(false)
  })
})

describe('validate.phone', () => {
  it('should accept valid phone numbers', () => {
    expect(validate.phone('123-456-7890')).toBe(true)
    expect(validate.phone('(555) 123-4567')).toBe(true)
    expect(validate.phone('+1 555 123 4567')).toBe(true)
  })

  it('should reject invalid phone numbers', () => {
    expect(validate.phone('123')).toBe(false)
    expect(validate.phone('abc-def-ghij')).toBe(false)
    expect(validate.phone('')).toBe(false)
  })
})

describe('validate.uuid', () => {
  it('should accept valid UUIDs', () => {
    expect(validate.uuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
    expect(validate.uuid('6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(true)
  })

  it('should reject invalid UUIDs', () => {
    expect(validate.uuid('not-a-uuid')).toBe(false)
    expect(validate.uuid('550e8400-e29b-41d4-a716')).toBe(false)
    expect(validate.uuid('')).toBe(false)
  })
})

describe('validate.date', () => {
  it('should accept valid dates', () => {
    expect(validate.date('2024-01-15')).toBe(true)
    expect(validate.date('2024-01-15T10:30:00Z')).toBe(true)
    expect(validate.date('January 15, 2024')).toBe(true)
  })

  it('should reject invalid dates', () => {
    expect(validate.date('not-a-date')).toBe(false)
    expect(validate.date('')).toBe(false)
    expect(validate.date(null)).toBe(false)
  })
})

describe('validate.time', () => {
  it('should accept valid times', () => {
    expect(validate.time('09:30')).toBe(true)
    expect(validate.time('14:00')).toBe(true)
    expect(validate.time('23:59:59')).toBe(true)
  })

  it('should reject invalid times', () => {
    expect(validate.time('25:00')).toBe(false)
    expect(validate.time('9:5')).toBe(false)
    expect(validate.time('invalid')).toBe(false)
  })
})

describe('validate.positiveNumber', () => {
  it('should accept positive numbers', () => {
    expect(validate.positiveNumber(0)).toBe(true)
    expect(validate.positiveNumber(100)).toBe(true)
    expect(validate.positiveNumber('50.5')).toBe(true)
  })

  it('should reject negative numbers', () => {
    expect(validate.positiveNumber(-1)).toBe(false)
    expect(validate.positiveNumber('-10')).toBe(false)
  })

  it('should reject non-numbers', () => {
    expect(validate.positiveNumber('abc')).toBe(false)
    expect(validate.positiveNumber(NaN)).toBe(false)
  })
})

describe('validate.currency', () => {
  it('should accept valid currency amounts', () => {
    expect(validate.currency('100.00')).toBe(true)
    expect(validate.currency('0.99')).toBe(true)
    expect(validate.currency(50)).toBe(true)
  })

  it('should reject invalid currency amounts', () => {
    expect(validate.currency(-10)).toBe(false)
    expect(validate.currency('100.999')).toBe(false) // More than 2 decimal places
    expect(validate.currency('')).toBe(false)
  })
})

describe('validate.pin', () => {
  it('should accept valid PINs', () => {
    expect(validate.pin('1234')).toBe(true)
    expect(validate.pin('123456')).toBe(true)
  })

  it('should reject invalid PINs', () => {
    expect(validate.pin('123')).toBe(false) // Too short
    expect(validate.pin('1234567')).toBe(false) // Too long
    expect(validate.pin('abcd')).toBe(false) // Not digits
  })
})

describe('validate.companyCode', () => {
  it('should accept valid company codes', () => {
    expect(validate.companyCode('ABC123')).toBe(true)
    expect(validate.companyCode('COMPANY')).toBe(true)
  })

  it('should reject invalid company codes', () => {
    expect(validate.companyCode('AB')).toBe(false) // Too short
    expect(validate.companyCode('ABC-123')).toBe(false) // Special chars
    expect(validate.companyCode('')).toBe(false)
  })
})

describe('validate.length', () => {
  it('should validate string length', () => {
    expect(validate.length('hello', 1, 10)).toBe(true)
    expect(validate.length('hi', 3, 10)).toBe(false) // Too short
    expect(validate.length('hello world!', 1, 5)).toBe(false) // Too long
  })
})

describe('validate.containsXSS', () => {
  it('should detect XSS patterns', () => {
    expect(validate.containsXSS('<script>alert(1)</script>')).toBe(true)
    expect(validate.containsXSS('onclick=alert(1)')).toBe(true)
    expect(validate.containsXSS('javascript:void(0)')).toBe(true)
    expect(validate.containsXSS('<iframe src="evil.com">')).toBe(true)
  })

  it('should not flag safe content', () => {
    expect(validate.containsXSS('Hello world')).toBe(false)
    expect(validate.containsXSS('script is a word')).toBe(false)
  })
})

describe('validate.containsSQLInjection', () => {
  it('should detect SQL injection patterns', () => {
    expect(validate.containsSQLInjection("' OR '1'='1")).toBe(true)
    expect(validate.containsSQLInjection("'; DROP TABLE users;--")).toBe(true)
    expect(validate.containsSQLInjection('UNION SELECT * FROM users')).toBe(true)
  })

  it('should not flag safe content', () => {
    expect(validate.containsSQLInjection('Hello world')).toBe(false)
    expect(validate.containsSQLInjection("It's a nice day")).toBe(false)
  })
})
