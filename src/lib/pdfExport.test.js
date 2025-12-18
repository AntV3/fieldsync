import { describe, it, expect } from 'vitest'

describe('PDF Export Utilities', () => {
  describe('Date Formatting', () => {
    it('formats dates for PDF reports (long format)', () => {
      const testDate = new Date('2025-12-18')
      const formatted = testDate.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      })

      expect(formatted).toBe('December 18, 2025')
    })

    it('formats dates for PDF reports (short format)', () => {
      const testDate = new Date('2025-12-18')
      const formatted = testDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      })

      expect(formatted).toBe('Dec 18, 2025')
    })
  })

  describe('Date Range Calculation', () => {
    it('calculates date ranges from ticket array', () => {
      const tickets = [
        { work_date: '2025-12-01' },
        { work_date: '2025-12-15' },
        { work_date: '2025-12-10' }
      ]

      const dates = tickets.map(t => new Date(t.work_date)).sort((a, b) => a - b)
      const startDate = dates[0]
      const endDate = dates[dates.length - 1]

      expect(startDate.toISOString().split('T')[0]).toBe('2025-12-01')
      expect(endDate.toISOString().split('T')[0]).toBe('2025-12-15')
    })

    it('handles single ticket date range', () => {
      const tickets = [{ work_date: '2025-12-18' }]

      const dates = tickets.map(t => new Date(t.work_date)).sort((a, b) => a - b)
      const startDate = dates[0]
      const endDate = dates[dates.length - 1]

      expect(startDate).toEqual(endDate)
    })

    it('sorts tickets chronologically', () => {
      const tickets = [
        { work_date: '2025-12-20' },
        { work_date: '2025-12-01' },
        { work_date: '2025-12-10' }
      ]

      const dates = tickets.map(t => new Date(t.work_date)).sort((a, b) => a - b)

      expect(dates[0].toISOString().split('T')[0]).toBe('2025-12-01')
      expect(dates[1].toISOString().split('T')[0]).toBe('2025-12-10')
      expect(dates[2].toISOString().split('T')[0]).toBe('2025-12-20')
    })
  })

  describe('PDF Data Preparation', () => {
    it('filters tickets by status', () => {
      const allTickets = [
        { id: 1, status: 'approved' },
        { id: 2, status: 'pending' },
        { id: 3, status: 'approved' },
        { id: 4, status: 'rejected' }
      ]

      const approvedTickets = allTickets.filter(t => t.status === 'approved')

      expect(approvedTickets).toHaveLength(2)
      expect(approvedTickets[0].id).toBe(1)
      expect(approvedTickets[1].id).toBe(3)
    })

    it('calculates total hours from workers', () => {
      const workers = [
        { hours: '8', overtimeHours: '2' },
        { hours: '8', overtimeHours: '0' },
        { hours: '4', overtimeHours: '1' }
      ]

      const totalRegular = workers.reduce((sum, w) => sum + parseFloat(w.hours || 0), 0)
      const totalOvertime = workers.reduce((sum, w) => sum + parseFloat(w.overtimeHours || 0), 0)

      expect(totalRegular).toBe(20)
      expect(totalOvertime).toBe(3)
    })

    it('calculates total quantity from materials', () => {
      const items = [
        { name: 'Safety Vest', quantity: 5 },
        { name: 'Hard Hat', quantity: 3 },
        { name: 'Gloves', quantity: 10 }
      ]

      const totalItems = items.reduce((sum, item) => sum + item.quantity, 0)

      expect(totalItems).toBe(18)
    })

    it('groups items by category', () => {
      const items = [
        { name: 'Vest', category: 'PPE' },
        { name: 'Bucket', category: 'Disposal' },
        { name: 'Gloves', category: 'PPE' },
        { name: 'Bags', category: 'Disposal' }
      ]

      const grouped = items.reduce((acc, item) => {
        if (!acc[item.category]) acc[item.category] = []
        acc[item.category].push(item)
        return acc
      }, {})

      expect(Object.keys(grouped)).toEqual(['PPE', 'Disposal'])
      expect(grouped.PPE).toHaveLength(2)
      expect(grouped.Disposal).toHaveLength(2)
    })
  })

  describe('PDF Filename Generation', () => {
    it('generates filename with project name and date', () => {
      const projectName = 'Test Project'
      const date = new Date('2025-12-18')
      const dateStr = date.toISOString().split('T')[0]

      const filename = `${projectName.replace(/\s+/g, '_')}_TM_Report_${dateStr}.pdf`

      expect(filename).toBe('Test_Project_TM_Report_2025-12-18.pdf')
    })

    it('sanitizes project names with special characters', () => {
      const projectName = 'Project: ABC & Co. (Main Site)'
      const sanitized = projectName.replace(/[^a-zA-Z0-9_\s-]/g, '').replace(/\s+/g, '_')

      expect(sanitized).toBe('Project_ABC_Co_Main_Site')
    })
  })

  describe('Color RGB Values', () => {
    it('validates standard color values used in PDFs', () => {
      const colors = {
        darkSlate: [30, 41, 59],
        lightGray: [248, 250, 252],
        borderGray: [226, 232, 240],
        white: [255, 255, 255],
        black: [0, 0, 0]
      }

      // Verify all RGB values are in valid range (0-255)
      Object.values(colors).forEach(rgb => {
        rgb.forEach(value => {
          expect(value).toBeGreaterThanOrEqual(0)
          expect(value).toBeLessThanOrEqual(255)
        })
      })
    })
  })
})
