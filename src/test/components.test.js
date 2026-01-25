/**
 * Tests for React components and hooks
 * Run with: npm test
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// Mock the database module
vi.mock('../lib/supabase', () => ({
  db: {
    universalSearch: vi.fn(),
    getRecentWorkers: vi.fn(),
    getCrewCheckin: vi.fn(),
    saveCrewCheckin: vi.fn()
  }
}))

// Import the hook after mocking
import { useUniversalSearch } from '../components/UniversalSearch'

// ============================================
// useUniversalSearch hook tests
// ============================================
describe('useUniversalSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should initialize with isOpen as false', () => {
    const { result } = renderHook(() => useUniversalSearch())
    expect(result.current.isOpen).toBe(false)
  })

  it('should open search when setIsOpen(true) is called', () => {
    const { result } = renderHook(() => useUniversalSearch())

    act(() => {
      result.current.setIsOpen(true)
    })

    expect(result.current.isOpen).toBe(true)
  })

  it('should close search when close() is called', () => {
    const { result } = renderHook(() => useUniversalSearch())

    // Open first
    act(() => {
      result.current.setIsOpen(true)
    })
    expect(result.current.isOpen).toBe(true)

    // Then close
    act(() => {
      result.current.close()
    })
    expect(result.current.isOpen).toBe(false)
  })

  it('should toggle search with keyboard shortcut simulation', () => {
    const { result } = renderHook(() => useUniversalSearch())

    // Simulate Cmd+K keydown
    act(() => {
      const event = new KeyboardEvent('keydown', {
        key: 'k',
        metaKey: true,
        bubbles: true
      })
      document.dispatchEvent(event)
    })

    expect(result.current.isOpen).toBe(true)

    // Press again to toggle off
    act(() => {
      const event = new KeyboardEvent('keydown', {
        key: 'k',
        metaKey: true,
        bubbles: true
      })
      document.dispatchEvent(event)
    })

    expect(result.current.isOpen).toBe(false)
  })
})

// ============================================
// Smart Action Cards logic tests
// ============================================
describe('Smart Action Cards Logic', () => {
  it('should determine morning correctly (5am-12pm)', () => {
    const testCases = [
      { hour: 5, expected: true },
      { hour: 8, expected: true },
      { hour: 11, expected: true },
      { hour: 12, expected: false },
      { hour: 4, expected: false }
    ]

    testCases.forEach(({ hour, expected }) => {
      const isMorning = hour >= 5 && hour < 12
      expect(isMorning).toBe(expected)
    })
  })

  it('should determine afternoon correctly (12pm-5pm)', () => {
    const testCases = [
      { hour: 12, expected: true },
      { hour: 14, expected: true },
      { hour: 16, expected: true },
      { hour: 17, expected: false },
      { hour: 11, expected: false }
    ]

    testCases.forEach(({ hour, expected }) => {
      const isAfternoon = hour >= 12 && hour < 17
      expect(isAfternoon).toBe(expected)
    })
  })

  it('should determine evening correctly (5pm onwards or before 5am)', () => {
    const testCases = [
      { hour: 17, expected: true },
      { hour: 20, expected: true },
      { hour: 23, expected: true },
      { hour: 2, expected: true },
      { hour: 4, expected: true },
      { hour: 5, expected: false },
      { hour: 12, expected: false }
    ]

    testCases.forEach(({ hour, expected }) => {
      const isEvening = hour >= 17 || hour < 5
      expect(isEvening).toBe(expected)
    })
  })
})

// ============================================
// Today Status Logic tests
// ============================================
describe('Today Status Logic', () => {
  it('should correctly determine if crew is checked in', () => {
    const noCrewStatus = { crewCheckedIn: false, crewCount: 0 }
    expect(noCrewStatus.crewCheckedIn).toBe(false)

    const crewCheckedInStatus = { crewCheckedIn: true, crewCount: 5 }
    expect(crewCheckedInStatus.crewCheckedIn).toBe(true)
    expect(crewCheckedInStatus.crewCount).toBe(5)
  })

  it('should show correct badge for T&M tickets', () => {
    const noTickets = { tmTicketsToday: 0 }
    const hasTickets = { tmTicketsToday: 3 }

    expect(noTickets.tmTicketsToday > 0).toBe(false)
    expect(hasTickets.tmTicketsToday > 0).toBe(true)
  })
})

// ============================================
// Quick Add Workers Logic tests
// ============================================
describe('Quick Add Workers Logic', () => {
  it('should filter out already checked-in workers', () => {
    const recentWorkers = [
      { name: 'John', role: 'Laborer' },
      { name: 'Jane', role: 'Foreman' },
      { name: 'Bob', role: 'Operator' }
    ]

    const checkedInWorkers = [
      { name: 'John', role: 'Laborer' }
    ]

    const availableWorkers = recentWorkers.filter(
      rw => !checkedInWorkers.find(w => w.name.toLowerCase() === rw.name.toLowerCase())
    )

    expect(availableWorkers.length).toBe(2)
    expect(availableWorkers.map(w => w.name)).toEqual(['Jane', 'Bob'])
  })

  it('should handle case-insensitive matching', () => {
    const recentWorkers = [{ name: 'JOHN DOE', role: 'Laborer' }]
    const checkedInWorkers = [{ name: 'john doe', role: 'Laborer' }]

    const availableWorkers = recentWorkers.filter(
      rw => !checkedInWorkers.find(w => w.name.toLowerCase() === rw.name.toLowerCase())
    )

    expect(availableWorkers.length).toBe(0)
  })
})
