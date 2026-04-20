/**
 * Portfolio Analytics Service
 * Aggregates metrics across all company projects for portfolio-level views.
 * Uses existing Supabase client and RLS — user only sees their company's data.
 */

import { supabase, isSupabaseConfigured } from '../supabaseClient'
import { observe } from '../observability'

/** Log errors via observability */
function logError(operation, companyId, error) {
  observe.error('database', { message: error.message, operation, company_id: companyId })
}

// ============================================
// Financial rollups
// ============================================

export async function getPortfolioFinancialSummary(companyId) {
  if (!isSupabaseConfigured || !companyId) return defaultFinancialSummary()
  try {
  const { data: projects, error } = await supabase
    .from('projects')
    .select('id, name, contract_value, status, created_at')
    .eq('company_id', companyId)
    .eq('status', 'active')

  if (error) throw error
  if (!projects?.length) return defaultFinancialSummary()

  const projectIds = projects.map(p => p.id)

  // Fetch areas, change orders, T&M tickets, and crew checkins in parallel
  const [areasRes, corsRes, ticketsRes, checkinsRes] = await Promise.all([
    supabase.from('areas').select('project_id, weight, is_complete').in('project_id', projectIds),
    supabase.from('change_orders').select('project_id, total_value, status').in('project_id', projectIds),
    supabase.from('t_and_m_tickets').select('project_id, total_value, status').in('project_id', projectIds),
    supabase.from('crew_checkins').select('project_id, worker_count, checkin_date').in('project_id', projectIds),
  ])

  let totalContractValue = 0
  let totalEarned = 0
  let totalCORApproved = 0
  let totalTMValue = 0
  let totalCrewManDays = 0

  // Compute earned per project from area weights
  const areasByProject = groupBy(areasRes.data || [], 'project_id')
  const corsByProject = groupBy(corsRes.data || [], 'project_id')
  const ticketsByProject = groupBy(ticketsRes.data || [], 'project_id')
  const checkinsByProject = groupBy(checkinsRes.data || [], 'project_id')

  for (const project of projects) {
    const cv = project.contract_value || 0
    totalContractValue += cv

    // Earned = contract_value * weighted completion
    const areas = areasByProject[project.id] || []
    const progress = calculateWeightedProgress(areas)
    totalEarned += cv * (progress / 100)

    // COR approved values
    const cors = corsByProject[project.id] || []
    for (const cor of cors) {
      if (cor.status === 'approved') totalCORApproved += cor.total_value || 0
    }

    // T&M ticket values
    const tickets = ticketsByProject[project.id] || []
    for (const t of tickets) {
      totalTMValue += t.total_value || 0
    }

    // Crew man-days (each checkin worker_count = workers on site that day)
    const checkins = checkinsByProject[project.id] || []
    for (const c of checkins) {
      totalCrewManDays += c.worker_count || 1
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
  } catch (err) { logError('getPortfolioFinancialSummary', companyId, err); return defaultFinancialSummary() }
}

export async function getProjectFinancialComparison(companyId) {
  if (!isSupabaseConfigured || !companyId) return []
  try {
  const { data: projects, error } = await supabase
    .from('projects')
    .select('id, name, contract_value')
    .eq('company_id', companyId)
    .eq('status', 'active')

  if (error) throw error
  if (!projects?.length) return []

  const projectIds = projects.map(p => p.id)
  const [areasRes, corsRes] = await Promise.all([
    supabase.from('areas').select('project_id, weight, is_complete').in('project_id', projectIds),
    supabase.from('change_orders').select('project_id, total_value, status').in('project_id', projectIds),
  ])

  const areasByProject = groupBy(areasRes.data || [], 'project_id')
  const corsByProject = groupBy(corsRes.data || [], 'project_id')

  return projects.map(p => {
    const areas = areasByProject[p.id] || []
    const progress = calculateWeightedProgress(areas)
    const earned = (p.contract_value || 0) * (progress / 100)
    const cors = (corsByProject[p.id] || [])
      .filter(c => c.status === 'approved')
      .reduce((sum, c) => sum + (c.total_value || 0), 0)

    return {
      name: truncateName(p.name),
      fullName: p.name,
      budget: p.contract_value || 0,
      earned: earned + cors,
      progress,
    }
  }).sort((a, b) => b.budget - a.budget)
  } catch (err) { logError('getProjectFinancialComparison', companyId, err); return [] }
}

export async function getMonthlyRevenueTimeline(companyId, months = 12) {
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

  const projectIds = projects.map(p => p.id)

  // Fetch actual financial data: approved CORs and T&M tickets with timestamps
  const [corsRes, ticketsRes, areasRes] = await Promise.all([
    supabase.from('change_orders')
      .select('project_id, total_value, status, updated_at')
      .in('project_id', projectIds)
      .eq('status', 'approved'),
    supabase.from('t_and_m_tickets')
      .select('project_id, total_value, created_at')
      .in('project_id', projectIds),
    supabase.from('areas')
      .select('project_id, weight, is_complete, updated_at')
      .in('project_id', projectIds)
      .eq('is_complete', true),
  ])

  // Build monthly buckets
  const monthlyMap = {}
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
    }
  }

  // Build per-project total weight for earned value calculation
  const allAreas = areasRes.data || []
  // We need all areas (complete + incomplete) for weight totals
  // But we only fetched complete ones — recalculate from projects
  const totalWeightByProject = {}
  // Fetch all areas for weight totals (including incomplete)
  const { data: allAreasForWeight } = await supabase
    .from('areas')
    .select('project_id, weight')
    .in('project_id', projectIds)

  for (const area of (allAreasForWeight || [])) {
    totalWeightByProject[area.project_id] = (totalWeightByProject[area.project_id] || 0) + (area.weight || 1)
  }

  const projectContractValues = {}
  for (const p of projects) {
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

  // Attribute approved COR values to the month they were approved
  for (const cor of (corsRes.data || [])) {
    if (!cor.updated_at) continue
    const d = new Date(cor.updated_at)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (monthlyMap[key]) {
      monthlyMap[key].corValue += cor.total_value || 0
    }
  }

  // Attribute T&M costs to the month they were created
  for (const ticket of (ticketsRes.data || [])) {
    if (!ticket.created_at) continue
    const d = new Date(ticket.created_at)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (monthlyMap[key]) {
      monthlyMap[key].costs += ticket.total_value || 0
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
  } catch (err) { logError('getMonthlyRevenueTimeline', companyId, err); return [] }
}

// ============================================
// Labor & crew analytics
// ============================================

export async function getPortfolioLaborSummary(companyId) {
  if (!isSupabaseConfigured || !companyId) return defaultLaborSummary()
  try {
  const { data: projects } = await supabase
    .from('projects')
    .select('id')
    .eq('company_id', companyId)
    .eq('status', 'active')

  if (!projects?.length) return defaultLaborSummary()

  const projectIds = projects.map(p => p.id)
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const { data: checkins } = await supabase
    .from('crew_checkins')
    .select('project_id, worker_count, checkin_date, created_at')
    .in('project_id', projectIds)
    .gte('checkin_date', thirtyDaysAgo.toISOString().split('T')[0])

  const allCheckins = checkins || []
  const today = new Date().toISOString().split('T')[0]
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const sevenStr = sevenDaysAgo.toISOString().split('T')[0]

  const todayCheckins = allCheckins.filter(c => c.checkin_date === today)
  const weekCheckins = allCheckins.filter(c => c.checkin_date >= sevenStr)

  const totalCrewToday = todayCheckins.reduce((s, c) => s + (c.worker_count || 1), 0)
  const totalManDays = allCheckins.reduce((s, c) => s + (c.worker_count || 1), 0)

  const weekTotal = weekCheckins.reduce((s, c) => s + (c.worker_count || 1), 0)
  const weekDays = new Set(weekCheckins.map(c => c.checkin_date)).size
  const avgCrewWeek = weekDays > 0 ? Math.round(weekTotal / weekDays) : 0

  const monthTotal = allCheckins.reduce((s, c) => s + (c.worker_count || 1), 0)
  const monthDays = new Set(allCheckins.map(c => c.checkin_date)).size
  const avgCrew30 = monthDays > 0 ? Math.round(monthTotal / monthDays) : 0

  return {
    totalCrewToday,
    avgCrewLast7Days: avgCrewWeek,
    avgCrewLast30Days: avgCrew30,
    totalManDays,
    utilization: totalManDays > 0 ? Math.min(Math.round((totalManDays / (projects.length * 30 * 5)) * 100), 100) : 0,
  }
  } catch (err) { logError('getPortfolioLaborSummary', companyId, err); return defaultLaborSummary() }
}

export async function getCrewDistribution(companyId) {
  if (!isSupabaseConfigured || !companyId) return []

  const { data: projects } = await supabase
    .from('projects')
    .select('id, name')
    .eq('company_id', companyId)
    .eq('status', 'active')

  if (!projects?.length) return []

  const projectIds = projects.map(p => p.id)
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const { data: checkins } = await supabase
    .from('crew_checkins')
    .select('project_id, worker_count, checkin_date')
    .in('project_id', projectIds)
    .gte('checkin_date', thirtyDaysAgo.toISOString().split('T')[0])

  const checkinsByProject = groupBy(checkins || [], 'project_id')
  const today = new Date().toISOString().split('T')[0]
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const sevenStr = sevenDaysAgo.toISOString().split('T')[0]

  return projects.map(p => {
    const pc = checkinsByProject[p.id] || []
    const todayCount = pc.filter(c => c.checkin_date === today).reduce((s, c) => s + (c.worker_count || 1), 0)
    const weekCheckins = pc.filter(c => c.checkin_date >= sevenStr)
    const weekDays = new Set(weekCheckins.map(c => c.checkin_date)).size
    const monthDays = new Set(pc.map(c => c.checkin_date)).size

    return {
      name: truncateName(p.name),
      fullName: p.name,
      today: todayCount,
      avg7Days: weekDays > 0 ? Math.round(weekCheckins.reduce((s, c) => s + (c.worker_count || 1), 0) / weekDays) : 0,
      avg30Days: monthDays > 0 ? Math.round(pc.reduce((s, c) => s + (c.worker_count || 1), 0) / monthDays) : 0,
    }
  }).sort((a, b) => b.avg30Days - a.avg30Days)
}

export async function getLaborCostByProject(companyId) {
  if (!isSupabaseConfigured || !companyId) return []

  const { data: projects } = await supabase
    .from('projects')
    .select('id, name')
    .eq('company_id', companyId)
    .eq('status', 'active')

  if (!projects?.length) return []

  const projectIds = projects.map(p => p.id)
  const { data: tickets } = await supabase
    .from('t_and_m_tickets')
    .select('project_id, total_value')
    .in('project_id', projectIds)

  const ticketsByProject = groupBy(tickets || [], 'project_id')

  return projects.map(p => {
    const laborCost = (ticketsByProject[p.id] || []).reduce((s, t) => s + (t.total_value || 0), 0)
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

export async function getPortfolioProgressSummary(companyId) {
  if (!isSupabaseConfigured || !companyId) return defaultProgressSummary()
  try {
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, contract_value, start_date, end_date')
    .eq('company_id', companyId)
    .eq('status', 'active')

  if (!projects?.length) return defaultProgressSummary()

  const projectIds = projects.map(p => p.id)
  const { data: areas } = await supabase
    .from('areas')
    .select('project_id, weight, is_complete')
    .in('project_id', projectIds)

  const areasByProject = groupBy(areas || [], 'project_id')

  let totalWeightedProgress = 0
  let totalWeight = 0
  let onTrack = 0
  let behind = 0
  let ahead = 0

  let withScheduleData = 0

  for (const project of projects) {
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
  } catch (err) { logError('getPortfolioProgressSummary', companyId, err); return defaultProgressSummary() }
}

export async function getScheduleVarianceByProject(companyId) {
  if (!isSupabaseConfigured || !companyId) return []

  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, start_date, end_date')
    .eq('company_id', companyId)
    .eq('status', 'active')

  if (!projects?.length) return []

  const projectIds = projects.map(p => p.id)
  const { data: areas } = await supabase
    .from('areas')
    .select('project_id, weight, is_complete')
    .in('project_id', projectIds)

  const areasByProject = groupBy(areas || [], 'project_id')

  return projects.map(p => {
    const pAreas = areasByProject[p.id] || []
    const actual = calculateWeightedProgress(pAreas)
    const expected = calculateExpectedProgress(p.start_date, p.end_date)
    const hasScheduleData = expected !== null
    return {
      name: truncateName(p.name),
      fullName: p.name,
      actual: Math.round(actual),
      expected: hasScheduleData ? Math.round(expected) : null,
      variance: hasScheduleData ? Math.round(actual - expected) : null,
      hasScheduleData,
    }
  })
}

export async function getAreaCompletionRates(companyId) {
  if (!isSupabaseConfigured || !companyId) return []

  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, created_at')
    .eq('company_id', companyId)
    .eq('status', 'active')

  if (!projects?.length) return []

  const projectIds = projects.map(p => p.id)
  const { data: areas } = await supabase
    .from('areas')
    .select('project_id, weight, is_complete, created_at, updated_at')
    .in('project_id', projectIds)

  const areasByProject = groupBy(areas || [], 'project_id')

  return projects.map(p => {
    const pAreas = areasByProject[p.id] || []
    const totalAreas = pAreas.length
    const completedAreas = pAreas.filter(a => a.is_complete).length
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

export async function getCORSummaryAcrossProjects(companyId) {
  if (!isSupabaseConfigured || !companyId) return defaultCORSummary()
  try {
  const { data: projects } = await supabase
    .from('projects')
    .select('id')
    .eq('company_id', companyId)
    .eq('status', 'active')

  if (!projects?.length) return defaultCORSummary()

  const projectIds = projects.map(p => p.id)
  const { data: cors } = await supabase
    .from('change_orders')
    .select('project_id, total_value, status, created_at, updated_at')
    .in('project_id', projectIds)

  const allCors = cors || []
  let approved = 0, pending = 0, rejected = 0
  let approvedValue = 0, pendingValue = 0, rejectedValue = 0

  for (const cor of allCors) {
    const val = cor.total_value || 0
    if (cor.status === 'approved') { approved++; approvedValue += val }
    else if (cor.status === 'pending') { pending++; pendingValue += val }
    else if (cor.status === 'rejected') { rejected++; rejectedValue += val }
  }

  const totalWithDates = allCors.filter(c => c.created_at && c.updated_at && c.status === 'approved')
  const avgProcessingDays = totalWithDates.length > 0
    ? Math.round(totalWithDates.reduce((s, c) => {
        return s + (new Date(c.updated_at) - new Date(c.created_at)) / (1000 * 60 * 60 * 24)
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
  } catch (err) { logError('getCORSummaryAcrossProjects', companyId, err); return defaultCORSummary() }
}

export async function getCORByProject(companyId) {
  if (!isSupabaseConfigured || !companyId) return []

  const { data: projects } = await supabase
    .from('projects')
    .select('id, name')
    .eq('company_id', companyId)
    .eq('status', 'active')

  if (!projects?.length) return []

  const projectIds = projects.map(p => p.id)
  const { data: cors } = await supabase
    .from('change_orders')
    .select('project_id, total_value, status')
    .in('project_id', projectIds)

  const corsByProject = groupBy(cors || [], 'project_id')

  return projects.map(p => {
    const pCors = corsByProject[p.id] || []
    return {
      name: truncateName(p.name),
      fullName: p.name,
      approved: pCors.filter(c => c.status === 'approved').length,
      pending: pCors.filter(c => c.status === 'pending').length,
      rejected: pCors.filter(c => c.status === 'rejected').length,
    }
  }).filter(p => p.approved + p.pending + p.rejected > 0)
    .sort((a, b) => (b.approved + b.pending + b.rejected) - (a.approved + a.pending + a.rejected))
}

export async function getCORTrendByMonth(companyId, months = 12) {
  if (!isSupabaseConfigured || !companyId) return []

  const startDate = new Date()
  startDate.setMonth(startDate.getMonth() - months)

  const { data: projects } = await supabase
    .from('projects')
    .select('id')
    .eq('company_id', companyId)
    .eq('status', 'active')

  if (!projects?.length) return []

  const projectIds = projects.map(p => p.id)
  const { data: cors } = await supabase
    .from('change_orders')
    .select('created_at, total_value, status')
    .in('project_id', projectIds)
    .gte('created_at', startDate.toISOString())

  const monthlyMap = {}
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

  for (const cor of (cors || [])) {
    const d = new Date(cor.created_at)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (monthlyMap[key]) {
      monthlyMap[key].count++
      monthlyMap[key].value += cor.total_value || 0
    }
  }

  return Object.values(monthlyMap)
}

// ============================================
// Risk & health
// ============================================

export async function getPortfolioRiskMatrix(companyId) {
  if (!isSupabaseConfigured || !companyId) return []
  try {
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, contract_value, start_date, end_date')
    .eq('company_id', companyId)
    .eq('status', 'active')

  if (!projects?.length) return []

  const projectIds = projects.map(p => p.id)
  const [areasRes, corsRes, ticketsRes] = await Promise.all([
    supabase.from('areas').select('project_id, weight, is_complete').in('project_id', projectIds),
    supabase.from('change_orders').select('project_id, total_value, status').in('project_id', projectIds),
    supabase.from('t_and_m_tickets').select('project_id, total_value').in('project_id', projectIds),
  ])

  const areasByProject = groupBy(areasRes.data || [], 'project_id')
  const corsByProject = groupBy(corsRes.data || [], 'project_id')
  const ticketsByProject = groupBy(ticketsRes.data || [], 'project_id')

  return projects.map(p => {
    const cv = p.contract_value || 0
    const areas = areasByProject[p.id] || []
    const progress = calculateWeightedProgress(areas)
    const expected = calculateExpectedProgress(p.start_date, p.end_date)

    const approvedCORValue = (corsByProject[p.id] || [])
      .filter(c => c.status === 'approved')
      .reduce((s, c) => s + (c.total_value || 0), 0)
    const tmCost = (ticketsByProject[p.id] || []).reduce((s, t) => s + (t.total_value || 0), 0)

    const totalBudget = cv + approvedCORValue
    const costRatio = totalBudget > 0 ? tmCost / totalBudget : 0
    const hasScheduleData = expected !== null
    const scheduleVariance = hasScheduleData ? progress - expected : 0

    // Budget health: green if cost < 70% of budget, yellow if < 90%, red if >= 90%
    const budgetHealth = costRatio < 0.7 ? 'green' : costRatio < 0.9 ? 'yellow' : 'red'
    // Schedule health: green if on/ahead, yellow if slightly behind, red if far behind
    // Projects without schedule dates default to green (no data to assess)
    const scheduleHealth = !hasScheduleData ? 'green'
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
  } catch (err) { logError('getPortfolioRiskMatrix', companyId, err); return [] }
}

export async function getProjectHealthScores(companyId) {
  // Reuses risk matrix data, returns sorted by health score
  return getPortfolioRiskMatrix(companyId)
}

// ============================================
// Helpers
// ============================================

function groupBy(arr, key) {
  const map = {}
  for (const item of arr) {
    const k = item[key]
    if (!map[k]) map[k] = []
    map[k].push(item)
  }
  return map
}

function calculateWeightedProgress(areas) {
  if (!areas?.length) return 0
  let totalWeight = 0
  let completedWeight = 0
  for (const area of areas) {
    const w = area.weight || 1
    totalWeight += w
    if (area.is_complete) completedWeight += w
  }
  return totalWeight > 0 ? (completedWeight / totalWeight) * 100 : 0
}

function calculateExpectedProgress(startDate, endDate) {
  if (!startDate || !endDate) return null // no dates = no expected progress (excluded from schedule variance)
  const start = new Date(startDate).getTime()
  const end = new Date(endDate).getTime()
  if (end <= start) return null // invalid date range
  const now = Date.now()
  if (now <= start) return 0
  if (now >= end) return 100
  return ((now - start) / (end - start)) * 100
}

function truncateName(name) {
  if (!name) return ''
  return name.length > 25 ? name.substring(0, 22) + '...' : name
}

function defaultFinancialSummary() {
  return {
    totalContractValue: 0, totalEarned: 0, totalCORApproved: 0, totalTMValue: 0,
    totalCrewManDays: 0, totalRevenue: 0, totalCosts: 0, totalProfit: 0, margin: 0, projectCount: 0,
  }
}

function defaultLaborSummary() {
  return {
    totalCrewToday: 0, avgCrewLast7Days: 0, avgCrewLast30Days: 0,
    totalManDays: 0, utilization: 0,
  }
}

function defaultProgressSummary() {
  return { avgCompletion: 0, onTrack: 0, behind: 0, ahead: 0, totalProjects: 0, projectsWithScheduleData: 0 }
}

function defaultCORSummary() {
  return {
    total: 0, approved: 0, pending: 0, rejected: 0,
    approvedValue: 0, pendingValue: 0, rejectedValue: 0,
    totalValue: 0, approvalRate: 0, avgProcessingDays: 0,
  }
}
