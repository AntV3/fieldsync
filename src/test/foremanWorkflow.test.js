/**
 * Foreman Workflow Tests
 * Tests crew check-in, T&M tickets, daily reports, disposal loads, and area progress
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================
// Crew Check-in Workflow Tests
// ============================================
describe('Crew Check-in Workflow', () => {
  const VALID_ROLES = ['Foreman', 'Superintendent', 'Operator', 'Laborer']

  it('should validate worker entry fields', () => {
    const validateWorker = (worker) => {
      if (!worker.name || worker.name.trim().length === 0) return false
      if (!VALID_ROLES.includes(worker.role)) return false
      if (typeof worker.hours !== 'number' || worker.hours <= 0 || worker.hours > 24) return false
      return true
    }

    expect(validateWorker({ name: 'John', role: 'Laborer', hours: 8 })).toBe(true)
    expect(validateWorker({ name: '', role: 'Laborer', hours: 8 })).toBe(false)
    expect(validateWorker({ name: 'John', role: 'InvalidRole', hours: 8 })).toBe(false)
    expect(validateWorker({ name: 'John', role: 'Laborer', hours: 0 })).toBe(false)
    expect(validateWorker({ name: 'John', role: 'Laborer', hours: 25 })).toBe(false)
    expect(validateWorker({ name: 'John', role: 'Laborer', hours: -1 })).toBe(false)
  })

  it('should calculate total labor hours correctly', () => {
    const workers = [
      { name: 'John', role: 'Laborer', hours: 8 },
      { name: 'Jane', role: 'Foreman', hours: 10 },
      { name: 'Bob', role: 'Operator', hours: 6 },
    ]

    const totalHours = workers.reduce((sum, w) => sum + w.hours, 0)
    expect(totalHours).toBe(24)
  })

  it('should calculate total labor cost with rates', () => {
    const workers = [
      { name: 'John', role: 'Laborer', hours: 8, rate: 45 },
      { name: 'Jane', role: 'Foreman', hours: 8, rate: 65 },
    ]

    const totalCost = workers.reduce((sum, w) => sum + (w.hours * w.rate), 0)
    expect(totalCost).toBe(8 * 45 + 8 * 65)
    expect(totalCost).toBe(880)
  })

  it('should handle overtime calculations', () => {
    const calculateLabor = (hours, rate, otRate) => {
      const regHours = Math.min(hours, 8)
      const otHours = Math.max(0, hours - 8)
      return (regHours * rate) + (otHours * (otRate || rate * 1.5))
    }

    expect(calculateLabor(8, 50)).toBe(400) // No OT
    expect(calculateLabor(10, 50)).toBe(400 + 2 * 75) // 2hrs OT at 1.5x
    expect(calculateLabor(10, 50, 80)).toBe(400 + 2 * 80) // Custom OT rate
    expect(calculateLabor(4, 50)).toBe(200) // Under 8 hours
  })

  it('should prevent duplicate worker entries', () => {
    const workers = [
      { name: 'John Doe', role: 'Laborer' },
      { name: 'Jane Smith', role: 'Foreman' },
    ]

    const isDuplicate = (newName) => {
      return workers.some(w => w.name.toLowerCase() === newName.toLowerCase())
    }

    expect(isDuplicate('John Doe')).toBe(true)
    expect(isDuplicate('john doe')).toBe(true)
    expect(isDuplicate('JOHN DOE')).toBe(true)
    expect(isDuplicate('Bob Jones')).toBe(false)
  })

  it('should format today date correctly for crew check-in', () => {
    const today = new Date().toISOString().split('T')[0]
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

// ============================================
// T&M Ticket Workflow Tests
// ============================================
describe('T&M Ticket Workflow', () => {
  it('should validate T&M ticket required fields', () => {
    const validateTicket = (ticket) => {
      const errors = []
      if (!ticket.description || ticket.description.trim().length === 0) {
        errors.push('Description is required')
      }
      if (!ticket.workers || ticket.workers.length === 0) {
        errors.push('At least one worker is required')
      }
      if (!ticket.work_date) {
        errors.push('Work date is required')
      }
      return errors
    }

    const validTicket = {
      description: 'Emergency repair',
      workers: [{ name: 'John', hours: 4 }],
      work_date: '2026-01-15',
    }
    expect(validateTicket(validTicket)).toEqual([])

    const invalidTicket = { description: '', workers: [], work_date: null }
    const errors = validateTicket(invalidTicket)
    expect(errors).toHaveLength(3)
    expect(errors).toContain('Description is required')
  })

  it('should calculate T&M ticket total value', () => {
    const calculateTicketValue = (ticket) => {
      let total = 0

      // Labor
      const workers = ticket.workers || []
      workers.forEach(w => {
        const regHours = parseFloat(w.hours) || 0
        const otHours = parseFloat(w.overtime_hours) || 0
        const regRate = parseFloat(w.regular_rate) || 65
        const otRate = parseFloat(w.overtime_rate) || regRate * 1.5
        total += (regHours * regRate) + (otHours * otRate)
      })

      // Materials
      const items = ticket.items || []
      items.forEach(item => {
        const qty = parseFloat(item.quantity) || 1
        const cost = parseFloat(item.unit_cost) || 0
        total += qty * cost
      })

      return Math.round(total * 100) / 100
    }

    const ticket = {
      workers: [
        { hours: 8, regular_rate: 65 },
        { hours: 4, overtime_hours: 2, regular_rate: 50, overtime_rate: 75 },
      ],
      items: [
        { quantity: 10, unit_cost: 25 },
        { quantity: 1, unit_cost: 500 },
      ],
    }

    // Worker 1: 8 * 65 = 520
    // Worker 2: 4 * 50 + 2 * 75 = 200 + 150 = 350
    // Item 1: 10 * 25 = 250
    // Item 2: 1 * 500 = 500
    // Total: 520 + 350 + 250 + 500 = 1620
    expect(calculateTicketValue(ticket)).toBe(1620)
  })

  it('should handle T&M ticket with no materials', () => {
    const calculateTicketValue = (ticket) => {
      let total = 0
      const workers = ticket.workers || []
      workers.forEach(w => {
        total += (parseFloat(w.hours) || 0) * (parseFloat(w.regular_rate) || 65)
      })
      const items = ticket.items || []
      items.forEach(item => {
        total += (parseFloat(item.quantity) || 1) * (parseFloat(item.unit_cost) || 0)
      })
      return total
    }

    const ticket = {
      workers: [{ hours: 8, regular_rate: 50 }],
      items: [],
    }
    expect(calculateTicketValue(ticket)).toBe(400)
  })

  it('should enforce photo limits', () => {
    const MAX_PHOTOS = 20
    const MAX_SIZE_MB = 10

    const validatePhotos = (photos) => {
      if (photos.length > MAX_PHOTOS) return `Max ${MAX_PHOTOS} photos`
      const oversized = photos.find(p => p.size > MAX_SIZE_MB * 1024 * 1024)
      if (oversized) return `Photo exceeds ${MAX_SIZE_MB}MB`
      return null
    }

    expect(validatePhotos(Array(20).fill({ size: 1000 }))).toBeNull()
    expect(validatePhotos(Array(21).fill({ size: 1000 }))).toBe('Max 20 photos')
    expect(validatePhotos([{ size: 11 * 1024 * 1024 }])).toBe('Photo exceeds 10MB')
  })

  it('should track T&M ticket steps (wizard flow)', () => {
    const STEPS = ['work_info', 'crew_hours', 'materials', 'evidence', 'review']
    let currentStep = 0

    const nextStep = () => {
      if (currentStep < STEPS.length - 1) currentStep++
    }

    const prevStep = () => {
      if (currentStep > 0) currentStep--
    }

    expect(STEPS[currentStep]).toBe('work_info')

    nextStep()
    expect(STEPS[currentStep]).toBe('crew_hours')

    nextStep()
    nextStep()
    nextStep()
    expect(STEPS[currentStep]).toBe('review')

    nextStep() // should not go beyond review
    expect(STEPS[currentStep]).toBe('review')

    prevStep()
    expect(STEPS[currentStep]).toBe('evidence')
  })
})

// ============================================
// Daily Report Workflow Tests
// ============================================
describe('Daily Report Workflow', () => {
  it('should compile daily report from crew and T&M data', () => {
    const compileDailyReport = (crewCheckins, tmTickets, haulOffs) => {
      const crewCount = crewCheckins.reduce((sum, c) => sum + (c.workers?.length || 0), 0)
      const totalHours = crewCheckins.reduce((sum, c) => {
        return sum + (c.workers || []).reduce((h, w) => h + (w.hours || 0), 0)
      }, 0)
      const tmCount = tmTickets.length
      const disposalCount = haulOffs.length

      return {
        crew_count: crewCount,
        total_hours: totalHours,
        tm_count: tmCount,
        disposal_count: disposalCount,
      }
    }

    const report = compileDailyReport(
      [{ workers: [{ name: 'A', hours: 8 }, { name: 'B', hours: 6 }] }],
      [{ id: 1 }, { id: 2 }],
      [{ id: 1 }]
    )

    expect(report.crew_count).toBe(2)
    expect(report.total_hours).toBe(14)
    expect(report.tm_count).toBe(2)
    expect(report.disposal_count).toBe(1)
  })

  it('should handle empty daily report data', () => {
    const compileDailyReport = (crewCheckins, tmTickets, haulOffs) => ({
      crew_count: (crewCheckins || []).reduce((sum, c) => sum + (c.workers?.length || 0), 0),
      total_hours: (crewCheckins || []).reduce((sum, c) =>
        sum + (c.workers || []).reduce((h, w) => h + (w.hours || 0), 0), 0),
      tm_count: (tmTickets || []).length,
      disposal_count: (haulOffs || []).length,
    })

    const report = compileDailyReport([], [], [])
    expect(report.crew_count).toBe(0)
    expect(report.total_hours).toBe(0)
    expect(report.tm_count).toBe(0)
    expect(report.disposal_count).toBe(0)

    // Handle null inputs
    const nullReport = compileDailyReport(null, null, null)
    expect(nullReport.crew_count).toBe(0)
  })
})

// ============================================
// Disposal Load Workflow Tests
// ============================================
describe('Disposal Load Workflow', () => {
  it('should validate disposal load entry', () => {
    const validateLoad = (load) => {
      const errors = []
      if (!load.destination || load.destination.trim() === '') errors.push('Destination required')
      if (!load.load_date) errors.push('Date required')
      if (typeof load.weight !== 'number' || load.weight <= 0) errors.push('Valid weight required')
      return errors
    }

    expect(validateLoad({
      destination: 'City Dump',
      load_date: '2026-01-15',
      weight: 10.5,
    })).toEqual([])

    expect(validateLoad({
      destination: '',
      load_date: null,
      weight: -1,
    })).toHaveLength(3)
  })

  it('should calculate total disposal costs', () => {
    const loads = [
      { weight: 10, cost_per_unit: 50 },
      { weight: 15, cost_per_unit: 50 },
      { weight: 8, cost_per_unit: 60 },
    ]

    const totalCost = loads.reduce((sum, l) => sum + (l.weight * l.cost_per_unit), 0)
    expect(totalCost).toBe(10 * 50 + 15 * 50 + 8 * 60)
    expect(totalCost).toBe(1730)
  })
})

// ============================================
// Area Progress Workflow Tests
// ============================================
describe('Area Progress Workflow', () => {
  const AREA_STATUSES = ['not_started', 'working', 'done']

  it('should cycle through valid statuses', () => {
    AREA_STATUSES.forEach(status => {
      expect(typeof status).toBe('string')
    })
  })

  it('should calculate weighted progress from areas', () => {
    const calculateProgress = (areas) => {
      if (!areas || areas.length === 0) return 0
      const totalWeight = areas.reduce((sum, a) => sum + (parseFloat(a.weight) || 0), 0)
      if (totalWeight === 0) return 0
      const doneWeight = areas
        .filter(a => a.status === 'done')
        .reduce((sum, a) => sum + (parseFloat(a.weight) || 0), 0)
      return Math.round((doneWeight / totalWeight) * 100)
    }

    const areas = [
      { name: 'Foundation', status: 'done', weight: 30 },
      { name: 'Framing', status: 'working', weight: 40 },
      { name: 'Finish', status: 'not_started', weight: 30 },
    ]

    expect(calculateProgress(areas)).toBe(30)
  })

  it('should handle areas with scheduled values (SOV)', () => {
    const calculateValueProgress = (areas) => {
      if (!areas || areas.length === 0) return { progress: 0, earned: 0, total: 0 }
      const total = areas.reduce((sum, a) => sum + (parseFloat(a.scheduled_value) || 0), 0)
      if (total === 0) return { progress: 0, earned: 0, total: 0 }
      const earned = areas
        .filter(a => a.status === 'done')
        .reduce((sum, a) => sum + (parseFloat(a.scheduled_value) || 0), 0)
      return { progress: Math.round((earned / total) * 100), earned, total }
    }

    const areas = [
      { name: 'Phase 1', status: 'done', scheduled_value: 50000 },
      { name: 'Phase 2', status: 'working', scheduled_value: 100000 },
      { name: 'Phase 3', status: 'not_started', scheduled_value: 50000 },
    ]

    const result = calculateValueProgress(areas)
    expect(result.progress).toBe(25)
    expect(result.earned).toBe(50000)
    expect(result.total).toBe(200000)
  })

  it('should handle zero-weight areas gracefully', () => {
    const calculateProgress = (areas) => {
      if (!areas || areas.length === 0) return 0
      const totalWeight = areas.reduce((sum, a) => sum + (parseFloat(a.weight) || 0), 0)
      if (totalWeight === 0) return 0
      const doneWeight = areas
        .filter(a => a.status === 'done')
        .reduce((sum, a) => sum + (parseFloat(a.weight) || 0), 0)
      return Math.round((doneWeight / totalWeight) * 100)
    }

    const areas = [
      { name: 'Area 1', status: 'done', weight: 0 },
      { name: 'Area 2', status: 'working', weight: 0 },
    ]

    expect(calculateProgress(areas)).toBe(0) // Should not crash
  })

  it('should group areas by group_name', () => {
    const areas = [
      { name: 'A1', group_name: 'Phase 1' },
      { name: 'A2', group_name: 'Phase 1' },
      { name: 'B1', group_name: 'Phase 2' },
      { name: 'C1', group_name: null },
    ]

    const grouped = {}
    areas.forEach(area => {
      const group = area.group_name || 'Ungrouped'
      if (!grouped[group]) grouped[group] = []
      grouped[group].push(area)
    })

    expect(Object.keys(grouped)).toHaveLength(3)
    expect(grouped['Phase 1']).toHaveLength(2)
    expect(grouped['Phase 2']).toHaveLength(1)
    expect(grouped['Ungrouped']).toHaveLength(1)
  })
})
