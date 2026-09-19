/**
 * Sage 300 CSV formula-injection guard.
 *
 * toSageCSV writes files that accountants open in Excel/Sage. Cells whose
 * value starts with `=`, `+`, `-`, `@`, tab, or CR are executed as
 * formulas — so a project name like =cmd|'/c calc'!A1 runs on the
 * accountant's machine. Every value must be prefixed with a leading
 * single-quote when it starts with one of those characters.
 */

import { describe, expect, it } from 'vitest'
import { toSageCSV } from '../lib/services/sageExportService'

describe('toSageCSV formula-injection guard', () => {
  it('prefixes = with a leading single-quote so Excel treats the cell as text', () => {
    const csv = toSageCSV([{ name: `=cmd|'/c calc'!A1`, amount: '1000' }])
    // Expect the cell to be quoted AND start with a single-quote escape
    expect(csv).toContain(`"'=cmd|'/c calc'!A1"`)
    // The leading = must NOT survive without the ' prefix
    expect(csv).not.toMatch(/^"=cmd/m)
  })

  it('prefixes leading +, -, @, tab, CR', () => {
    const csv = toSageCSV([
      { plus: '+1234', minus: '-1234', at: '@SUM(A1:A9)', tab: '\tfoo', cr: '\rbar' },
    ])
    expect(csv).toContain(`"'+1234"`)
    expect(csv).toContain(`"'-1234"`)
    expect(csv).toContain(`"'@SUM(A1:A9)"`)
    expect(csv).toContain(`"'\tfoo"`)
    expect(csv).toContain(`"'\rbar"`)
  })

  it('leaves safe values (including inner quotes) untouched apart from RFC-4180 quote doubling', () => {
    const csv = toSageCSV([{ name: 'Acme "Big" Corp', total: '$1,000' }])
    expect(csv).toContain(`"Acme ""Big"" Corp"`)
    expect(csv).toContain(`"$1,000"`)
    // No stray leading quote
    expect(csv).not.toMatch(/"'Acme/)
  })
})
