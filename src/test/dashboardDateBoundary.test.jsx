/**
 * report_date on daily_reports and incident_date on injury_reports are DATE
 * columns and arrive as 'YYYY-MM-DD' strings. `new Date('YYYY-MM-DD')` is
 * parsed as UTC midnight, which drops below the hook's local-clock cutoff
 * for the exact-boundary day in LA/PDT ("reports this week" counts 6/7,
 * "days since last incident" is off-by-one at the day boundary).
 *
 * This test feeds reports dated exactly 7 / 30 days ago (in the local
 * calendar). With the broken code both filters return 0 (UTC midnight is
 * before the unfloored local cutoff in any timezone whose offset is not
 * exactly a multiple of 24h — i.e. everywhere other than UTC when the
 * current wall-clock second is not midnight); with the fix (parseLocalDate
 * + floor the cutoff to local midnight) each returns 1.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const summaryRows = []
const dailyRows = []
const injuryRows = []

vi.mock('../lib/supabase', () => {
  const emptyList = () => Promise.resolve([])
  const nothing = () => Promise.resolve(null)
  const db = new Proxy({}, {
    get: (_t, prop) => {
      if (typeof prop === 'string' && prop.startsWith('subscribe')) return undefined
      if (prop === 'unsubscribe') return () => {}
      if (prop === 'getProjectDashboardSummary') return () => Promise.resolve(summaryRows)
      if (prop === 'getDailyReports') return () => Promise.resolve(dailyRows)
      if (prop === 'getInjuryReports') return () => Promise.resolve(injuryRows)
      if (prop === 'getChangeOrderTotals' || prop === 'calculateManDayCosts' || prop === 'getCORStats') return nothing
      return emptyList
    }
  })
  return {
    db,
    equipmentOps: { getProjectEquipment: emptyList, calculateProjectEquipmentCost: () => 0 },
    supabase: {},
    isSupabaseConfigured: false
  }
})

import useDashboardData from '../hooks/useDashboardData'
import { getLocalDateString } from '../lib/utils'

const project = {
  id: 'p-dates',
  company_id: 'c1',
  name: 'Suncoast',
  contract_value: 100000,
  status: 'active'
}

describe('useDashboardData date-boundary filters', () => {
  beforeEach(() => {
    summaryRows.length = 0
    dailyRows.length = 0
    injuryRows.length = 0
  })

  it('counts a daily report whose report_date is exactly 7 local days ago', async () => {
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const reportDate = getLocalDateString(sevenDaysAgo)

    summaryRows.push({ ...project })
    dailyRows.push({ id: 'd1', project_id: project.id, report_date: reportDate })

    const { result } = renderHook(() => useDashboardData({ company: { id: 'c1' }, onShowToast: () => {} }))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { await result.current.handleSelectProject(result.current.projectsData[0]) })
    await waitFor(() => expect(result.current.projectData?._detailsLoaded).toBe(true))

    expect(result.current.projectData.recentDailyReports).toBe(1)
  })

  it('counts an injury whose incident_date is exactly 30 local days ago', async () => {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const incidentDate = getLocalDateString(thirtyDaysAgo)

    summaryRows.push({ ...project })
    injuryRows.push({
      id: 'i1',
      project_id: project.id,
      incident_date: incidentDate,
      created_at: new Date().toISOString()
    })

    const { result } = renderHook(() => useDashboardData({ company: { id: 'c1' }, onShowToast: () => {} }))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { await result.current.handleSelectProject(result.current.projectsData[0]) })
    await waitFor(() => expect(result.current.projectData?._detailsLoaded).toBe(true))

    expect(result.current.projectData.recentInjuryCount).toBe(1)
  })
})
