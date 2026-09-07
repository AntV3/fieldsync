import { describe, it, expect } from 'vitest'
import { buildG703Lines } from '../lib/aiaBillingExport'
import { exportSageProjectSetupCSV } from '../lib/sageExport'

// Daily health check regressions covered here:
//   1. AIA G703 uses areas.scheduled_value (dollars) with a weight-derived
//      fallback that respects the project contract value — never
//      areas.weight (a percentage) as if it were dollars.
//   2. Sage Job Setup CSV mirrors the same math, so 25% weight on a
//      $400,000 job renders as $100,000, not $25.00.
//   3. The phantom `sov_value` column is no longer read.

// ---- helpers --------------------------------------------------------

// Capture the CSV content that downloadFile hands to Blob → createObjectURL.
// We intercept the global Blob constructor for the duration of the call so
// we can read `parts` synchronously — Blob.text() is a promise that would
// otherwise race the download-anchor click that fires immediately after.
async function captureSageCSV(project, areas, financial = {}) {
  const OriginalBlob = globalThis.Blob
  let captured = ''
  class CapturingBlob extends OriginalBlob {
    constructor(parts, opts) {
      super(parts, opts)
      captured = (parts || []).map(p => typeof p === 'string' ? p : '').join('')
    }
  }
  globalThis.Blob = CapturingBlob
  const originalCreate = URL.createObjectURL
  URL.createObjectURL = () => 'blob:mock'
  try {
    exportSageProjectSetupCSV(project, areas, financial)
  } catch {
    // downloadFile may throw when JSDOM cannot append/click the anchor;
    // the CSV was already captured by the Blob constructor above.
  } finally {
    globalThis.Blob = OriginalBlob
    URL.createObjectURL = originalCreate
  }
  return captured
}

// ---- G703 -----------------------------------------------------------

describe('buildG703Lines area SOV column', () => {
  it('reads areas.scheduled_value (dollars), not areas.weight (%)', () => {
    const project = { contract_value: 400000 }
    const areas = [
      { id: 'a', name: 'Site prep', scheduled_value: 100000, weight: 25, status: 'not_started' },
      { id: 'b', name: 'Framing', scheduled_value: 300000, weight: 75, status: 'not_started' }
    ]
    const lines = buildG703Lines(project, areas)

    expect(lines).toHaveLength(2)
    // The prior `sov_value || weight` code would have used 25 and 75.
    expect(lines[0].scheduled_value).toBe(100000)
    expect(lines[1].scheduled_value).toBe(300000)
  })

  it('falls back to contract * weight/totalWeight when scheduled_value is missing', () => {
    const project = { contract_value: 400000 }
    const areas = [
      { id: 'a', name: 'Site prep', weight: 25, status: 'not_started' },
      { id: 'b', name: 'Framing', weight: 75, status: 'not_started' }
    ]
    const lines = buildG703Lines(project, areas)

    // 25 / (25 + 75) = 25% of 400k = 100k. The buggy path returned 25.
    expect(lines[0].scheduled_value).toBe(100000)
    expect(lines[1].scheduled_value).toBe(300000)
  })

  it('does not read the phantom sov_value column', () => {
    // If the code still fell back to sov_value, we would see 999 here.
    const project = { contract_value: 400000 }
    const areas = [
      { id: 'a', name: 'Site prep', sov_value: 999, scheduled_value: 100000, weight: 25, status: 'not_started' }
    ]
    const lines = buildG703Lines(project, areas)
    expect(lines[0].scheduled_value).toBe(100000)
  })
})

// ---- Sage Job Setup CSV --------------------------------------------

describe('exportSageProjectSetupCSV SOV rows', () => {
  it('lists dollar-scaled SOV values when only weight (%) is provided', async () => {
    const project = { name: 'Job A', contract_value: 400000 }
    const areas = [
      { id: 'a', name: 'Site prep', weight: 25 },
      { id: 'b', name: 'Framing', weight: 75 }
    ]
    const csv = await captureSageCSV(project, areas)
    // We should see 100000.00 and 300000.00, never 25.00 or 75.00.
    expect(csv).toContain('SOV - Site prep')
    expect(csv).toContain('100000.00')
    expect(csv).toContain('300000.00')
    expect(csv).not.toMatch(/SOV - Site prep,25\.00/)
    expect(csv).not.toMatch(/SOV - Framing,75\.00/)
  })

  it('prefers explicit scheduled_value over weight-derived fallback', async () => {
    const project = { name: 'Job B', contract_value: 400000 }
    const areas = [
      { id: 'a', name: 'Site prep', scheduled_value: 123456.78, weight: 25 }
    ]
    const csv = await captureSageCSV(project, areas)
    expect(csv).toContain('123456.78')
  })
})
