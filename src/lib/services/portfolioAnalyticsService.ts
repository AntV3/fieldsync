/**
 * Portfolio Analytics Service
 * Aggregates metrics across all company projects for portfolio-level views.
 * Uses existing Supabase client and RLS — user only sees their company's data.
 *
 * Column-name reference (matches the migrations, not the older typings):
 * - `areas.status` — 'not_started' | 'working' | 'done' (there is no is_complete column)
 * - `change_orders.cor_total` — total in CENTS; divide by 100 for dollars.
 *   Statuses: 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'billed' | 'closed'
 * - `t_and_m_tickets.change_order_value` — dollar value for CE/PCO tickets
 *   (there is no total_value column)
 * - `crew_checkins.workers` — JSONB array; count = workers.length
 *   `crew_checkins.check_in_date` — the date column (not checkin_date)
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase as maybeSupabase, isSupabaseConfigured } from '../supabaseClient'
import { observe } from '../observability'
import type { AreaRow, ChangeOrderRow, CrewCheckinRow, ProjectRow, TMTicketRow } from '../types/database'

// Every exported function guards on isSupabaseConfigured before touching the
// client, so the null case (demo mode) never reaches a query.
const supabase = maybeSupabase as SupabaseClient

// Helpers to normalize the raw DB shapes into the numbers this file consumes.
// Kept small and local so the fix is self-contained.
const isAreaDone = (a: Pick<AreaRow, 'status'>): boolean => a.status === 'done'
const workerCount = (c: Pick<CrewCheckinRow, 'workers'>): number => (c.workers?.length ?? 0)
const corDollars = (c: Pick<ChangeOrderRow, 'cor_total'>): number => ((c.cor_total ?? 0) / 100)
const tmDollars = (t: Pick<TMTicketRow, 'change_order_value'>): number => {
  const raw = t.change_order_value
  if (raw == null) return 0
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw))
  return Number.isFinite(n) ? n : 0
}

// ============================================
// Result types
// ============================================

export interface PortfolioFinancialSummary {
  totalContractValue: number
  totalEarned: number
  totalCORApproved: number
  totalTMValue: number
  totalCrewManDays: number
  totalRevenue: number
  totalCosts: number
  totalProfit: number
  margin: number
  projectCount: number
}

export interface ProjectFinancialComparisonEntry {
  name: string
  fullName: string
  budget: number
  earned: number
  progress: number
}

export interface MonthlyRevenueEntry {
  month: string
  label: string
  earned: number
  costs: number
  corValue: number
  revenue: number
}

export interface PortfolioLaborSummary {
  totalCrewToday: number
  avgCrewLast7Days: number
  avgCrewLast30Days: number
  totalManDays: number
  utilization: number
}

export interface CrewDistributionEntry {
  name: string
  fullName: string
  today: number
  avg7Days: number
  avg30Days: number
}

export interface LaborCostByProjectEntry {
  name: string
  fullName: string
  laborCost: number
}

export interface PortfolioProgressSummary {
  avgCompletion: number
  onTrack: number
  behind: number
  ahead: number
  totalProjects: number
  projectsWithScheduleData: number
}

export interface ScheduleVarianceEntry {
  name: string
  fullName: string
  actual: number
  expected: number | null
  variance: number | null
  hasScheduleData: boolean
}

export interface AreaCompletionRateEntry {
  name: string
  fullName: string
  totalAreas: number
  completedAreas: number
  /** Areas completed per week */
  velocity: number
  completionRate: number
}

export interface CORSummary {
  total: number
  approved: number
  pending: number
  rejected: number
  approvedValue: number
  pendingValue: number
  rejectedValue: number
  totalValue: number
  approvalRate: number
  avgProcessingDays: number
}

export interface CORByProjectEntry {
  name: string
  fullName: string
  approved: number
  pending: number
  rejected: number
}

export interface CORTrendEntry {
  month: string
  label: string
  count: number
  value: number
}

export type HealthColor = 'green' | 'yellow' | 'red'

export interface RiskMatrixEntry {
  name: string
  fullName: string
  contractValue: number
  progress: number
  expected: number | null
  budgetHealth: HealthColor
  scheduleHealth: HealthColor
  /** 2-6 scale (sum of budget + schedule health) */
  healthScore: number
  costRatio: number
  scheduleVariance: number | null
  hasScheduleData: boolean
}

/** Log errors via observability */
function logError(operation: string, companyId: string | undefined, error: Error): void {
  observe.error('database', { message: error.message, operation, company_id: companyId })
}

// ============================================
// Financial rollups
// ============================================

export async function getPortfolioFinancialSummary(companyId: string): Promise<PortfolioFinancialSummary> {
  if (!isSupabaseConfigured || !companyId) return defaultFinancialSummary()
  try {
  const { data: projects, error } = await supabase
    .from('projects')
    .select('id, name, contract_value, status, created_at')
    .eq('company_id', companyId)
    .eq('status', 'active')

  if (error) throw error
  if (!projects?.length) return defaultFinancialSummary()

  const projectIds = (projects as ProjectRow[]).map(p => p.id)

  // Fetch areas, change orders, T&M tickets, and crew checkins in parallel
  const [areasRes, corsRes, ticketsRes, checkinsRes] = await Promise.all([
    supabase.from('areas').select('project_id, weight, status').in('project_id', projectIds),
    supabase.from('change_orders').select('project_id, cor_total, status').in('project_id', projectIds),
    supabase.from('t_and_m_tickets').select('project_id, change_order_value, status').in('project_id', projectIds),
    supabase.from('crew_checkins').select('project_id, workers, check_in_date').in('project_id', projectIds),
  ])

  let totalContractValue = 0
  let totalEarned = 0
  let totalCORApproved = 0
  let totalTMValue = 0
  let totalCrewManDays = 0

  // Compute earned per project from area weights
  const areasByProject = groupBy((areasRes.data || []) as AreaRow[], 'project_id')
  const corsByProject = groupBy((corsRes.data || []) as ChangeOrderRow[], 'project_id')
  const ticketsByProject = groupBy((ticketsRes.data || []) as TMTicketRow[], 'project_id')
  const checkinsByProject = groupBy((checkinsRes.data || []) as CrewCheckinRow[], 'project_id')

  for (const project of projects as ProjectRow[]) {
    const cv = project.contract_value || 0
    totalContractValue += cv

    // Earned = contract_value * weighted completion
    const areas = areasByProject[project.id] || []
    const progress = calculateWeightedProgress(areas)
    totalEarned += cv * (progress / 100)

    // Approved COR values (cor_total is in cents)
    const cors = corsByProject[project.id] || []
    for (const cor of cors) {
      if (cor.status === 'approved') totalCORApproved += corDollars(cor)
    }

    // T&M ticket values (change_order_value already in dollars)
    const tickets = ticketsByProject[project.id] || []
    for (const t of tickets) {
      totalTMValue += tmDollars(t)
    }

    // Crew man-days (each checkin's workers array = workers on site that day)
    const checkins = checkinsByProject[project.id] || []
    for (const c of checkins) {
      totalCrewManDays += workerCount(c)
    }
  }

  const totalCosts = totalTMValue // T&M tickets as tracked costs
  const totalRevenue = totalEarned + totalCORApproved
  const totalProfit = totalRevenue - totalCosts
  const margin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0

  return {
    totalContractValue,
    totalEarned,
    totalCORApproved,
    totalTMValue,
    totalCrewManDays,
    totalRevenue,
    totalCosts,
    totalProfit,
    margin: Math.round(margin * 10) / 10,
    projectCount: projects.length,
  }
  } catch (err) { logError('getPortfolioFinancialSummary', companyId, err as Error); return defaultFinancialSummary() }
}

export async function getProjectFinancialComparison(companyId: string): Promise<ProjectFinancialComparisonEntry[]> {
  if (!isSupabaseConfigured || !companyId) return []
  try {
  const { data: projects, error } = await supabase
    .from('projects')
    .select('id, name, contract_value')
    .eq('company_id', companyId)
    .eq('status', 'active')

  if (error) throw error
  if (!projects?.length) return []

  const projectIds = (projects as ProjectRow[]).map(p => p.id)
  const [areasRes, corsRes] = await Promise.all([
    supabase.from('areas').select('project_id, weight, status').in('project_id', projectIds),
    supabase.from('change_orders').select('project_id, cor_total, status').in('project_id', projectIds),
  ])

  const areasByProject = groupBy((areasRes.data || []) as AreaRow[], 'project_id')
  const corsByProject = groupBy((corsRes.data || []) as ChangeOrderRow[], 'project_id')

  return (projects as ProjectRow[]).map(p => {
    const areas = areasByProject[p.id] || []
    const progress = calculateWeightedProgress(areas)
    const earned = (p.contract_value || 0) * (progress / 100)
    const cors = (corsByProject[p.id] || [])
      .filter(c => c.status === 'approved')
      .reduce((sum, c) => sum + corDollars(c), 0)

    return {
      name: truncateName(p.name),
      fullName: p.name,
      budget: p.contract_value || 0,
      earned: earned + cors,
      progress,
    }
  }).sort((a, b) => b.budget - a.budget)
  } catch (err) { logError('getProjectFinancialComparison', companyId, err as Error); return [] }
}

export async function getMonthlyRevenueTimeline(companyId: string, months = 12): Promise<MonthlyRevenueEntry[]> {
  if (!isSupabaseConfigured || !companyId) return []
  try {
  const startDate = new Date()
  startDate.setMonth(startDate.getMonth() - months)

  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, contract_value, created_at')
    .eq('company_id', companyId)
    .eq('status', 'active')

  if (!projects?.length) return []

  const projectIds = (projects as ProjectRow[]).map(p => p.id)

  // Fetch actual financial data: approved CORs and T&M tickets with timestamps
  const [corsRes, ticketsRes, areasRes] = await Promise.all([
    supabase.from('change_orders')
      .select('project_id, cor_total, status, updated_at')
      .in('project_id', projectIds)
      .eq('status', 'approved'),
    supabase.from('t_and_m_tickets')
      .select('project_id, change_order_value, created_at')
      .in('project_id', projectIds),
    supabase.from('areas')
      .select('project_id, weight, status, updated_at')
      .in('project_id', projectIds)
      .eq('status', 'done'),
  ])

  // Build monthly buckets
  const monthlyMap: Record<string, MonthlyRevenueEntry> = {}
  const now = new Date()
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    monthlyMap[key] = {
      month: key,
      label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      earned: 0,
      costs: 0,
      corValue: 0,
      revenue: 0,
    }
  }

  // Build per-project total weight for earned value calculation
  const allAreas = (areasRes.data || []) as AreaRow[]
  // We need all areas (complete + incomplete) for weight totals
  // But we only fetched complete ones — recalculate from projects
  const totalWeightByProject: Record<string, number> = {}
  // Fetch all areas for weight totals (including incomplete)
  const { data: allAreasForWeight } = await supabase
    .from('areas')
    .select('project_id, weight')
    .in('project_id', projectIds)

  for (const area of ((allAreasForWeight || []) as AreaRow[])) {
    totalWeightByProject[area.project_id] = (totalWeightByProject[area.project_id] || 0) + (area.weight || 1)
  }

  const projectContractValues: Record<string, number> = {}
  for (const p of projects as ProjectRow[]) {
    projectContractValues[p.id] = p.contract_value || 0
  }

  // Attribute earned value to the month each area was completed
  for (const area of allAreas) {
    if (!area.updated_at) continue
    const d = new Date(area.updated_at)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (monthlyMap[key]) {
      const totalWeight = totalWeightByProject[area.project_id] || 1
      const cv = projectContractValues[area.project_id] || 0
      monthlyMap[key].earned += cv * ((area.weight || 1) / totalWeight)
    }
  }

  // Attribute approved COR values to the month they were approved (cents → dollars)
  for (const cor of ((corsRes.data || []) as ChangeOrderRow[])) {
    if (!cor.updated_at) continue
    const d = new Date(cor.updated_at)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (monthlyMap[key]) {
      monthlyMap[key].corValue += corDollars(cor)
    }
  }

  // Attribute T&M costs to the month they were created
  for (const ticket of ((ticketsRes.data || []) as TMTicketRow[])) {
    if (!ticket.created_at) continue
    const d = new Date(ticket.created_at)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (monthlyMap[key]) {
      monthlyMap[key].costs += tmDollars(ticket)
    }
  }

  // Round values
  for (const entry of Object.values(monthlyMap)) {
    entry.earned = Math.round(entry.earned)
    entry.costs = Math.round(entry.costs)
    entry.corValue = Math.round(entry.corValue)
    // revenue = earned value + approved COR value for the month
    entry.revenue = entry.earned + entry.corValue
  }

  return Object.values(monthlyMap)
  } catch (err) { logError('getMonthlyRevenueTimeline', companyId, err as Error); return [] }
}

// ============================================
// Labor & crew analytics
// ============================================

export async function getPortfolioLaborSummary(companyId: string): Promise<PortfolioLaborSummary> {
  if (!isSupabaseConfigured || !companyId) return defaultLaborSummary()
  try {
  const { data: projects } = await supabase
    .from('projects')
    .select('id')
    .eq('company_id', companyId)
    .eq('status', 'active')

  if (!projects?.length) return defaultLaborSummary()

  const projectIds = (projects as Pick<ProjectRow, 'id'>[]).map(p => p.id)
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const { data: checkins } = await supabase
    .from('crew_checkins')
    .select('project_id, workers, check_in_date, created_at')
    .in('project_id', projectIds)
    .gte('check_in_date', thirtyDaysAgo.toISOString().split('T')[0])

  const allCheckins = (checkins || []) as CrewCheckinRow[]
  const today = new Date().toISOString().split('T')[0]
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const sevenStr = sevenDaysAgo.toISOString().split('T')[0]

  const todayCheckins = allCheckins.filter(c => c.check_in_date === today)
  const weekCheckins = allCheckins.filter(c => c.check_in_date >= sevenStr)

  const totalCrewToday = todayCheckins.reduce((s, c) => s + workerCount(c), 0)
  const totalManDays = allCheckins.reduce((s, c) => s + workerCount(c), 0)

  const weekTotal = weekCheckins.reduce((s, c) => s + workerCount(c), 0)
  const weekDays = new Set(weekCheckins.map(c => c.check_in_date)).size
  const avgCrewWeek = weekDays > 0 ? Math.round(weekTotal / weekDays) : 0

  const monthTotal = allCheckins.reduce((s, c) => s + workerCount(c), 0)
  const monthDays = new Set(allCheckins.map(c => c.check_in_date)).size
  const avgCrew30 = monthDays > 0 ? Math.round(monthTotal / monthDays) : 0

  return {
    totalCrewToday,
    avgCrewLast7Days: avgCrewWeek,
    avgCrewLast30Days: avgCrew30,
    totalManDays,
    utilization: totalManDays > 0 ? Math.min(Math.round((totalManDays / (projects.length * 30 * 5)) * 100), 100) : 0,
  }
  } catch (err) { logError('getPortfolioLaborSummary', companyId, err as Error); return defaultLaborSummary() }
}

export async function getCrewDistribution(companyId: string): Promise<CrewDistributionEntry[]> {
  if (!isSupabaseConfigured || !companyId) return []

  const { data: projects } = await supabase
    .from('projects')
    .select('id, name')
    .eq('company_id', companyId)
    .eq('status', 'active')

  if (!projects?.length) return []

  const projectIds = (projects as ProjectRow[]).map(p => p.id)
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const { data: checkins } = await supabase
    .from('crew_checkins')
    .select('project_id, workers, check_in_date')
    .in('project_id', projectIds)
    .gte('check_in_date', thirtyDaysAgo.toISOString().split('T')[0])

  const checkinsByProject = groupBy((checkins || []) as CrewCheckinRow[], 'project_id')
  const today = new Date().toISOString().split('T')[0]
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const sevenStr = sevenDaysAgo.toISOString().split('T')[0]

  return (projects as ProjectRow[]).map(p => {
    const pc = checkinsByProject[p.id] || []
    const todayCount = pc.filter(c => c.check_in_date === today).reduce((s, c) => s + workerCount(c), 0)
    const weekCheckins = pc.filter(c => c.check_in_date >= sevenStr)
    const weekDays = new Set(weekCheckins.map(c => c.check_in_date)).size
    const monthDays = new Set(pc.map(c => c.check_in_date)).size

    return {
      name: truncateName(p.name),
      fullName: p.name,
      today: todayCount,
      avg7Days: weekDays > 0 ? Math.round(weekCheckins.reduce((s, c) => s + workerCount(c), 0) / weekDays) : 0,
      avg30Days: monthDays > 0 ? Math.round(pc.reduce((s, c) => s + workerCount(c), 0) / monthDays) : 0,
    }
  }).sort((a, b) => b.avg30Days - a.avg30Days)
}

export async function getLaborCostByProject(companyId: string): Promise<LaborCostByProjectEntry[]> {
  if (!isSupabaseConfigured || !companyId) return []

  const { data: projects } = await supabase
    .from('projects')
    .select('id, name')
    .eq('company_id', companyId)
    .eq('status', 'active')

  if (!projects?.length) return []

  const projectIds = (projects as ProjectRow[]).map(p => p.id)
  const { data: tickets } = await supabase
    .from('t_and_m_tickets')
    .select('project_id, change_order_value')
    .in('project_id', projectIds)

  const ticketsByProject = groupBy((tickets || []) as TMTicketRow[], 'project_id')

  return (projects as ProjectRow[]).map(p => {
    const laborCost = (ticketsByProject[p.id] || []).reduce((s, t) => s + tmDollars(t), 0)
    return {
      name: truncateName(p.name),
      fullName: p.name,
      laborCost,
    }
  }).sort((a, b) => b.laborCost - a.laborCost)
}

// ============================================
// Progress & schedule
// ============================================

export async function getPortfolioProgressSummary(companyId: string): Promise<PortfolioProgressSummary> {
  if (!isSupabaseConfigured || !companyId) return defaultProgressSummary()
  try {
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, contract_value, start_date, end_date')
    .eq('company_id', companyId)
    .eq('status', 'active')

  if (!projects?.length) return defaultProgressSummary()

  const projectIds = (projects as ProjectRow[]).map(p => p.id)
  const { data: areas } = await supabase
    .from('areas')
    .select('project_id, weight, status')
    .in('project_id', projectIds)

  const areasByProject = groupBy((areas || []) as AreaRow[], 'project_id')

  let totalWeightedProgress = 0
  let totalWeight = 0
  let onTrack = 0
  let behind = 0
  let ahead = 0

  let withScheduleData = 0

  for (const project of projects as ProjectRow[]) {
    const pAreas = areasByProject[project.id] || []
    const progress = calculateWeightedProgress(pAreas)
    const expected = calculateExpectedProgress(project.start_date, project.end_date)
    const cv = project.contract_value || 1
    totalWeightedProgress += progress * cv
    totalWeight += cv

    // Only classify schedule status for projects with valid date ranges
    if (expected !== null) {
      withScheduleData++
      const variance = progress - expected
      if (variance > 5) ahead++
      else if (variance < -5) behind++
      else onTrack++
    }
  }

  return {
    avgCompletion: totalWeight > 0 ? Math.round(totalWeightedProgress / totalWeight) : 0,
    onTrack,
    behind,
    ahead,
    totalProjects: projects.length,
    projectsWithScheduleData: withScheduleData,
  }
  } catch (err) { logError('getPortfolioProgressSummary', companyId, err as Error); return defaultProgressSummary() }
}

export async function getScheduleVarianceByProject(companyId: string): Promise<ScheduleVarianceEntry[]> {
  if (!isSupabaseConfigured || !companyId) return []

  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, start_date, end_date')
    .eq('company_id', companyId)
    .eq('status', 'active')

  if (!projects?.length) return []

  const projectIds = (projects as ProjectRow[]).map(p => p.id)
  const { data: areas } = await supabase
    .from('areas')
    .select('project_id, weight, status')
    .in('project_id', projectIds)

  const areasByProject = groupBy((areas || []) as AreaRow[], 'project_id')

  return (projects as ProjectRow[]).map(p => {
    const pAreas = areasByProject[p.id] || []
    const actual = calculateWeightedProgress(pAreas)
    const expected = calculateExpectedProgress(p.start_date, p.end_date)
    const hasScheduleData = expected !== null
    return {
      name: truncateName(p.name),
      fullName: p.name,
      actual: Math.round(actual),
      expected: expected !== null ? Math.round(expected) : null,
      variance: expected !== null ? Math.round(actual - expected) : null,
      hasScheduleData,
    }
  })
}

export async function getAreaCompletionRates(companyId: string): Promise<AreaCompletionRateEntry[]> {
  if (!isSupabaseConfigured || !companyId) return []

  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, created_at')
    .eq('company_id', companyId)
    .eq('status', 'active')

  if (!projects?.length) return []

  const projectIds = (projects as ProjectRow[]).map(p => p.id)
  const { data: areas } = await supabase
    .from('areas')
    .select('project_id, weight, status, created_at, updated_at')
    .in('project_id', projectIds)

  const areasByProject = groupBy((areas || []) as AreaRow[], 'project_id')

  return (projects as ProjectRow[]).map(p => {
    const pAreas = areasByProject[p.id] || []
    const totalAreas = pAreas.length
    const completedAreas = pAreas.filter(isAreaDone).length
    const projectAge = Math.max(1, Math.ceil((Date.now() - new Date(p.created_at).getTime()) / (1000 * 60 * 60 * 24 * 7))) // weeks
    const velocity = totalAreas > 0 ? Math.round((completedAreas / projectAge) * 10) / 10 : 0

    return {
      name: truncateName(p.name),
      fullName: p.name,
      totalAreas,
      completedAreas,
      velocity, // areas completed per week
      completionRate: totalAreas > 0 ? Math.round((completedAreas / totalAreas) * 100) : 0,
    }
  }).sort((a, b) => b.velocity - a.velocity)
}

// ============================================
// Change orders
// ============================================

export async function getCORSummaryAcrossProjects(companyId: string): Promise<CORSummary> {
  if (!isSupabaseConfigured || !companyId) return defaultCORSummary()
  try {
  const { data: projects } = await supabase
    .from('projects')
    .select('id')
    .eq('company_id', companyId)
    .eq('status', 'active')

  if (!projects?.length) return defaultCORSummary()

  const projectIds = (projects as Pick<ProjectRow, 'id'>[]).map(p => p.id)
  const { data: cors } = await supabase
    .from('change_orders')
    .select('project_id, cor_total, status, created_at, updated_at')
    .in('project_id', projectIds)

  const allCors = (cors || []) as ChangeOrderRow[]
  let approved = 0, pending = 0, rejected = 0
  let approvedValue = 0, pendingValue = 0, rejectedValue = 0

  for (const cor of allCors) {
    const val = corDollars(cor)
    if (cor.status === 'approved') { approved++; approvedValue += val }
    else if (cor.status === 'pending_approval') { pending++; pendingValue += val }
    else if (cor.status === 'rejected') { rejected++; rejectedValue += val }
  }

  const totalWithDates = allCors.filter(c => c.created_at && c.updated_at && c.status === 'approved')
  const avgProcessingDays = totalWithDates.length > 0
    ? Math.round(totalWithDates.reduce((s, c) => {
        return s + (new Date(c.updated_at as string).getTime() - new Date(c.created_at as string).getTime()) / (1000 * 60 * 60 * 24)
      }, 0) / totalWithDates.length)
    : 0

  return {
    total: allCors.length,
    approved, pending, rejected,
    approvedValue, pendingValue, rejectedValue,
    totalValue: approvedValue + pendingValue + rejectedValue,
    approvalRate: allCors.length > 0 ? Math.round((approved / allCors.length) * 100) : 0,
    avgProcessingDays,
  }
  } catch (err) { logError('getCORSummaryAcrossProjects', companyId, err as Error); return defaultCORSummary() }
}

export async function getCORByProject(companyId: string): Promise<CORByProjectEntry[]> {
  if (!isSupabaseConfigured || !companyId) return []

  const { data: projects } = await supabase
    .from('projects')
    .select('id, name')
    .eq('company_id', companyId)
    .eq('status', 'active')

  if (!projects?.length) return []

  const projectIds = (projects as ProjectRow[]).map(p => p.id)
  const { data: cors } = await supabase
    .from('change_orders')
    .select('project_id, cor_total, status')
    .in('project_id', projectIds)

  const corsByProject = groupBy((cors || []) as ChangeOrderRow[], 'project_id')

  return (projects as ProjectRow[]).map(p => {
    const pCors = corsByProject[p.id] || []
    return {
      name: truncateName(p.name),
      fullName: p.name,
      approved: pCors.filter(c => c.status === 'approved').length,
      pending: pCors.filter(c => c.status === 'pending_approval').length,
      rejected: pCors.filter(c => c.status === 'rejected').length,
    }
  }).filter(p => p.approved + p.pending + p.rejected > 0)
    .sort((a, b) => (b.approved + b.pending + b.rejected) - (a.approved + a.pending + a.rejected))
}

export async function getCORTrendByMonth(companyId: string, months = 12): Promise<CORTrendEntry[]> {
  if (!isSupabaseConfigured || !companyId) return []

  const startDate = new Date()
  startDate.setMonth(startDate.getMonth() - months)

  const { data: projects } = await supabase
    .from('projects')
    .select('id')
    .eq('company_id', companyId)
    .eq('status', 'active')

  if (!projects?.length) return []

  const projectIds = (projects as Pick<ProjectRow, 'id'>[]).map(p => p.id)
  const { data: cors } = await supabase
    .from('change_orders')
    .select('created_at, cor_total, status')
    .in('project_id', projectIds)
    .gte('created_at', startDate.toISOString())

  const monthlyMap: Record<string, CORTrendEntry> = {}
  const now = new Date()
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    monthlyMap[key] = {
      month: key,
      label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      count: 0,
      value: 0,
    }
  }

  for (const cor of ((cors || []) as ChangeOrderRow[])) {
    const d = new Date(cor.created_at as string)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (monthlyMap[key]) {
      monthlyMap[key].count++
      monthlyMap[key].value += corDollars(cor)
    }
  }

  return Object.values(monthlyMap)
}

// ============================================
// Risk & health
// ============================================

export async function getPortfolioRiskMatrix(companyId: string): Promise<RiskMatrixEntry[]> {
  if (!isSupabaseConfigured || !companyId) return []
  try {
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, contract_value, start_date, end_date')
    .eq('company_id', companyId)
    .eq('status', 'active')

  if (!projects?.length) return []

  const projectIds = (projects as ProjectRow[]).map(p => p.id)
  const [areasRes, corsRes, ticketsRes] = await Promise.all([
    supabase.from('areas').select('project_id, weight, status').in('project_id', projectIds),
    supabase.from('change_orders').select('project_id, cor_total, status').in('project_id', projectIds),
    supabase.from('t_and_m_tickets').select('project_id, change_order_value').in('project_id', projectIds),
  ])

  const areasByProject = groupBy((areasRes.data || []) as AreaRow[], 'project_id')
  const corsByProject = groupBy((corsRes.data || []) as ChangeOrderRow[], 'project_id')
  const ticketsByProject = groupBy((ticketsRes.data || []) as TMTicketRow[], 'project_id')

  return (projects as ProjectRow[]).map(p => {
    const cv = p.contract_value || 0
    const areas = areasByProject[p.id] || []
    const progress = calculateWeightedProgress(areas)
    const expected = calculateExpectedProgress(p.start_date, p.end_date)

    const approvedCORValue = (corsByProject[p.id] || [])
      .filter(c => c.status === 'approved')
      .reduce((s, c) => s + corDollars(c), 0)
    const tmCost = (ticketsByProject[p.id] || []).reduce((s, t) => s + tmDollars(t), 0)

    const totalBudget = cv + approvedCORValue
    const costRatio = totalBudget > 0 ? tmCost / totalBudget : 0
    const hasScheduleData = expected !== null
    const scheduleVariance = expected !== null ? progress - expected : 0

    // Budget health: green if cost < 70% of budget, yellow if < 90%, red if >= 90%
    const budgetHealth: HealthColor = costRatio < 0.7 ? 'green' : costRatio < 0.9 ? 'yellow' : 'red'
    // Schedule health: green if on/ahead, yellow if slightly behind, red if far behind
    // Projects without schedule dates default to green (no data to assess)
    const scheduleHealth: HealthColor = !hasScheduleData ? 'green'
      : scheduleVariance >= -5 ? 'green' : scheduleVariance >= -15 ? 'yellow' : 'red'

    const healthScore = (
      (budgetHealth === 'green' ? 3 : budgetHealth === 'yellow' ? 2 : 1) +
      (scheduleHealth === 'green' ? 3 : scheduleHealth === 'yellow' ? 2 : 1)
    )

    return {
      name: truncateName(p.name),
      fullName: p.name,
      contractValue: cv,
      progress,
      expected: hasScheduleData ? expected : null,
      budgetHealth,
      scheduleHealth,
      healthScore, // 2-6 scale
      costRatio: Math.round(costRatio * 100),
      scheduleVariance: hasScheduleData ? Math.round(scheduleVariance) : null,
      hasScheduleData,
    }
  }).sort((a, b) => a.healthScore - b.healthScore) // worst health first
  } catch (err) { logError('getPortfolioRiskMatrix', companyId, err as Error); return [] }
}

export async function getProjectHealthScores(companyId: string): Promise<RiskMatrixEntry[]> {
  // Reuses risk matrix data, returns sorted by health score
  return getPortfolioRiskMatrix(companyId)
}

// ============================================
// Helpers
// ============================================

function groupBy<T>(arr: T[], key: keyof T): Record<string, T[]> {
  const map: Record<string, T[]> = {}
  for (const item of arr) {
    const k = String(item[key])
    if (!map[k]) map[k] = []
    map[k].push(item)
  }
  return map
}

function calculateWeightedProgress(areas: AreaRow[]): number {
  if (!areas?.length) return 0
  let totalWeight = 0
  let completedWeight = 0
  for (const area of areas) {
    const w = area.weight || 1
    totalWeight += w
    if (isAreaDone(area)) completedWeight += w
  }
  return totalWeight > 0 ? (completedWeight / totalWeight) * 100 : 0
}

function calculateExpectedProgress(startDate?: string | null, endDate?: string | null): number | null {
  if (!startDate || !endDate) return null // no dates = no expected progress (excluded from schedule variance)
  const start = new Date(startDate).getTime()
  const end = new Date(endDate).getTime()
  if (end <= start) return null // invalid date range
  const now = Date.now()
  if (now <= start) return 0
  if (now >= end) return 100
  return ((now - start) / (end - start)) * 100
}

function truncateName(name: string | null | undefined): string {
  if (!name) return ''
  return name.length > 25 ? name.substring(0, 22) + '...' : name
}

function defaultFinancialSummary(): PortfolioFinancialSummary {
  return {
    totalContractValue: 0, totalEarned: 0, totalCORApproved: 0, totalTMValue: 0,
    totalCrewManDays: 0, totalRevenue: 0, totalCosts: 0, totalProfit: 0, margin: 0, projectCount: 0,
  }
}

function defaultLaborSummary(): PortfolioLaborSummary {
  return {
    totalCrewToday: 0, avgCrewLast7Days: 0, avgCrewLast30Days: 0,
    totalManDays: 0, utilization: 0,
  }
}

function defaultProgressSummary(): PortfolioProgressSummary {
  return { avgCompletion: 0, onTrack: 0, behind: 0, ahead: 0, totalProjects: 0, projectsWithScheduleData: 0 }
}

function defaultCORSummary(): CORSummary {
  return {
    total: 0, approved: 0, pending: 0, rejected: 0,
    approvedValue: 0, pendingValue: 0, rejectedValue: 0,
    totalValue: 0, approvalRate: 0, avgProcessingDays: 0,
  }
}
