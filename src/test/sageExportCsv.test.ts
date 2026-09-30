import { describe, it, expect } from 'vitest'
import { toSageCSV } from '../lib/services/sageExportService'

describe('toSageCSV formula-injection guard', () => {
  it('prefixes a single quote to cells starting with =, +, -, @, tab or CR', () => {
    const rows = [
      { description: '=SUM(A1:A9)', amount: 100 },
      { description: '+CMD|"/c calc"', amount: 200 },
      { description: '-2+3', amount: 300 },
      { description: '@SUM(1)', amount: 400 },
      { description: '\t=1+1', amount: 500 },
      { description: '\r=1+1', amount: 600 }
    ]
    const csv = toSageCSV(rows)
    const dataLines = csv.split('\n').slice(1)
    expect(dataLines[0]).toContain(`"'=SUM(A1:A9)"`)
    expect(dataLines[1]).toContain(`"'+CMD|""/c calc"""`)
    expect(dataLines[2]).toContain(`"'-2+3"`)
    expect(dataLines[3]).toContain(`"'@SUM(1)"`)
    expect(dataLines[4]).toContain(`"'\t=1+1"`)
    expect(dataLines[5]).toContain(`"'\r=1+1"`)
  })

  it('leaves normal strings and numbers untouched', () => {
    const rows = [
      { description: 'Framing labor', amount: 1234.56 },
      { description: 'CO #12: change scope', amount: 500 }
    ]
    const csv = toSageCSV(rows)
    expect(csv).toContain('"Framing labor"')
    expect(csv).toContain('"CO #12: change scope"')
    expect(csv).toContain('"1234.56"')
    // No leading single-quote inserted for benign values.
    expect(csv).not.toContain(`"'Framing`)
    expect(csv).not.toContain(`"'CO`)
  })

  it('emits empty-quoted cell for null/undefined', () => {
    const rows = [
      { a: null as unknown as string, b: undefined as unknown as string, c: 'ok' }
    ]
    const csv = toSageCSV(rows)
    const [, dataLine] = csv.split('\n')
    expect(dataLine).toBe('"","","ok"')
  })
})
