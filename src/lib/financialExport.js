/**
 * Financial Export Module
 * Generates CSV/IIF exports for accounting integration
 */

// Helper to trigger file download
function downloadFile(content, filename, mimeType = 'text/csv') {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// Escape CSV field (handle commas, quotes, newlines, and formula injection)
export function escapeCSV(value) {
  if (value == null) return ''
  let str = String(value)
  // Prevent CSV formula injection: prefix dangerous first characters with a single quote
  if (/^[=+\-@\t\r]/.test(str)) {
    str = "'" + str
  }
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

// Convert array of objects to CSV string
export function toCSV(headers, rows) {
  const headerLine = headers.map(h => escapeCSV(h.label)).join(',')
  const dataLines = rows.map(row =>
    headers.map(h => escapeCSV(row[h.key])).join(',')
  )
  return [headerLine, ...dataLines].join('\n')
}

/**
 * Export project financial summary as CSV
 */
export function exportProjectFinancials(project, financialData) {
  const headers = [
    { key: 'category', label: 'Category' },
    { key: 'description', label: 'Description' },
    { key: 'amount', label: 'Amount' },
    { key: 'date', label: 'Date' },
    { key: 'type', label: 'Type' }
  ]

  const rows = []

  // Contract value
  rows.push({ category: 'Revenue', description: 'Original Contract Value', amount: project.contract_value || 0, date: project.start_date || '', type: 'Contract' })

  // Earned revenue
  if (financialData?.earnedRevenue) {
    rows.push({ category: 'Revenue', description: 'Earned Revenue (Progress)', amount: financialData.earnedRevenue, date: new Date().toISOString().split('T')[0], type: 'Earned' })
  }

  // Approved CORs
  if (financialData?.approvedCORs) {
    financialData.approvedCORs.forEach(cor => {
      rows.push({ category: 'Revenue', description: `COR: ${cor.cor_number} - ${cor.title}`, amount: (cor.cor_total || 0) / 100, date: cor.approved_at?.split('T')[0] || '', type: 'Change Order' })
    })
  }

  // Labor costs
  if (financialData?.laborByDate) {
    financialData.laborByDate.forEach(d => {
      rows.push({ category: 'Cost', description: 'Labor', amount: d.cost, date: d.date, type: 'Labor' })
    })
  }

  // Disposal costs
  if (financialData?.haulOffByDate) {
    financialData.haulOffByDate.forEach(d => {
      rows.push({ category: 'Cost', description: 'Disposal/Haul-off', amount: d.cost, date: d.date, type: 'Disposal' })
    })
  }

  // Custom costs
  if (financialData?.customCosts) {
    financialData.customCosts.forEach(c => {
      rows.push({ category: 'Cost', description: c.description || c.category || 'Other', amount: parseFloat(c.amount) || 0, date: c.cost_date || '', type: c.category || 'Other' })
    })
  }

  // Summary row
  const totalRevenue = rows.filter(r => r.category === 'Revenue').reduce((s, r) => s + (parseFloat(r.amount) || 0), 0)
  const totalCosts = rows.filter(r => r.category === 'Cost').reduce((s, r) => s + (parseFloat(r.amount) || 0), 0)
  rows.push({ category: '', description: '', amount: '', date: '', type: '' })
  rows.push({ category: 'Summary', description: 'Total Revenue', amount: totalRevenue, date: '', type: '' })
  rows.push({ category: 'Summary', description: 'Total Costs', amount: totalCosts, date: '', type: '' })
  rows.push({ category: 'Summary', description: 'Gross Profit', amount: totalRevenue - totalCosts, date: '', type: '' })
  rows.push({ category: 'Summary', description: 'Margin %', amount: totalRevenue > 0 ? ((totalRevenue - totalCosts) / totalRevenue * 100).toFixed(1) + '%' : 'N/A', date: '', type: '' })

  const csv = toCSV(headers, rows)
  const filename = `${project.name.replace(/[^a-zA-Z0-9]/g, '_')}_Financials_${new Date().toISOString().split('T')[0]}.csv`
  downloadFile(csv, filename)
}

/**
 * Export COR detail as CSV
 */
export function exportCORDetail(cor, project) {
  const rows = []
  const headers = [
    { key: 'section', label: 'Section' },
    { key: 'description', label: 'Description' },
    { key: 'quantity', label: 'Quantity' },
    { key: 'unit', label: 'Unit' },
    { key: 'rate', label: 'Rate' },
    { key: 'total', label: 'Total' }
  ]

  // COR header info
  rows.push({ section: 'COR Info', description: `${cor.cor_number} - ${cor.title}`, quantity: '', unit: '', rate: '', total: '' })
  rows.push({ section: 'Status', description: cor.status, quantity: '', unit: '', rate: '', total: '' })
  rows.push({ section: 'Period', description: `${cor.period_start || ''} to ${cor.period_end || ''}`, quantity: '', unit: '', rate: '', total: '' })
  rows.push({ section: '', description: '', quantity: '', unit: '', rate: '', total: '' })

  // Labor
  if (cor.change_order_labor?.length > 0) {
    rows.push({ section: 'LABOR', description: '', quantity: '', unit: '', rate: '', total: '' })
    cor.change_order_labor.forEach(item => {
      const regHrs = parseFloat(item.regular_hours) || 0
      const otHrs = parseFloat(item.overtime_hours) || 0
      rows.push({ section: '', description: item.description || item.classification, quantity: regHrs + otHrs, unit: 'hours', rate: (parseInt(item.regular_rate) || 0) / 100, total: (parseInt(item.total) || 0) / 100 })
    })
  }

  // Materials
  if (cor.change_order_materials?.length > 0) {
    rows.push({ section: 'MATERIALS', description: '', quantity: '', unit: '', rate: '', total: '' })
    cor.change_order_materials.forEach(item => {
      rows.push({ section: '', description: item.description, quantity: parseFloat(item.quantity) || 0, unit: item.unit || 'each', rate: (parseInt(item.unit_cost) || 0) / 100, total: (parseInt(item.total) || 0) / 100 })
    })
  }

  // Equipment
  if (cor.change_order_equipment?.length > 0) {
    rows.push({ section: 'EQUIPMENT', description: '', quantity: '', unit: '', rate: '', total: '' })
    cor.change_order_equipment.forEach(item => {
      rows.push({ section: '', description: item.description, quantity: parseFloat(item.quantity) || 0, unit: item.unit || 'day', rate: (parseInt(item.unit_cost) || 0) / 100, total: (parseInt(item.total) || 0) / 100 })
    })
  }

  // Subcontractors
  if (cor.change_order_subcontractors?.length > 0) {
    rows.push({ section: 'SUBCONTRACTORS', description: '', quantity: '', unit: '', rate: '', total: '' })
    cor.change_order_subcontractors.forEach(item => {
      rows.push({ section: '', description: item.description, quantity: parseFloat(item.quantity) || 0, unit: item.unit || 'lump sum', rate: (parseInt(item.unit_cost) || 0) / 100, total: (parseInt(item.total) || 0) / 100 })
    })
  }

  const csv = toCSV(headers, rows)
  const filename = `COR_${cor.cor_number || cor.id}_${new Date().toISOString().split('T')[0]}.csv`
  downloadFile(csv, filename)
}

/**
 * Export T&M tickets as CSV
 */
export function exportTMTicketsCSV(tickets, project) {
  const headers = [
    { key: 'date', label: 'Date' },
    { key: 'status', label: 'Status' },
    { key: 'workers', label: 'Worker Count' },
    { key: 'totalHours', label: 'Total Hours' },
    { key: 'otHours', label: 'OT Hours' },
    { key: 'materialsCost', label: 'Materials Cost' },
    { key: 'corNumber', label: 'COR #' },
    { key: 'notes', label: 'Notes' }
  ]

  const rows = tickets.map(t => {
    const workers = t.t_and_m_workers || []
    const items = t.t_and_m_items || []
    const totalHours = workers.reduce((s, w) => s + (parseFloat(w.hours) || 0), 0)
    const otHours = workers.reduce((s, w) => s + (parseFloat(w.overtime_hours) || 0), 0)
    const materialsCost = items.reduce((s, i) => s + ((parseFloat(i.quantity) || 0) * (i.materials_equipment?.cost_per_unit || 0)), 0)

    return {
      date: t.work_date,
      status: t.status,
      workers: workers.length,
      totalHours: (totalHours + otHours).toFixed(1),
      otHours: otHours.toFixed(1),
      materialsCost: materialsCost.toFixed(2),
      corNumber: t.assigned_cor_id ? 'Linked' : '',
      notes: t.notes || ''
    }
  })

  const csv = toCSV(headers, rows)
  const filename = `${project.name.replace(/[^a-zA-Z0-9]/g, '_')}_TM_Tickets_${new Date().toISOString().split('T')[0]}.csv`
  downloadFile(csv, filename)
}

/**
 * Export to QuickBooks IIF format (General Journal Entry)
 * IIF = Intuit Interchange Format - importable by QuickBooks Desktop
 */
export function exportToQuickBooksIIF(project, financialData) {
  const lines = []
  const txnDate = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
  // Sanitize project name for IIF (strip tabs/newlines that could break format)
  const safeName = (project.name || '').replace(/[\t\r\n]/g, ' ')

  // IIF Header
  lines.push('!TRNS\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tMEMO')
  lines.push('!SPL\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tMEMO')
  lines.push('!ENDTRNS')

  // Revenue entry
  const totalRevenue = (project.contract_value || 0)
  lines.push(`TRNS\tGENERAL JOURNAL\t${txnDate}\tAccounts Receivable\t${safeName}\t${totalRevenue.toFixed(2)}\tFieldSync - Contract Revenue`)
  lines.push(`SPL\tGENERAL JOURNAL\t${txnDate}\tConstruction Revenue\t${safeName}\t${(-totalRevenue).toFixed(2)}\tContract: ${safeName}`)
  lines.push('ENDTRNS')

  // Cost entries
  const totalLabor = financialData?.totalLaborCost || 0
  if (totalLabor > 0) {
    lines.push(`TRNS\tGENERAL JOURNAL\t${txnDate}\tDirect Labor\t${safeName}\t${totalLabor.toFixed(2)}\tLabor costs - ${safeName}`)
    lines.push(`SPL\tGENERAL JOURNAL\t${txnDate}\tAccounts Payable\t${safeName}\t${(-totalLabor).toFixed(2)}\tLabor costs`)
    lines.push('ENDTRNS')
  }

  const totalDisposal = financialData?.totalDisposalCost || 0
  if (totalDisposal > 0) {
    lines.push(`TRNS\tGENERAL JOURNAL\t${txnDate}\tDisposal Expense\t${safeName}\t${totalDisposal.toFixed(2)}\tDisposal costs - ${safeName}`)
    lines.push(`SPL\tGENERAL JOURNAL\t${txnDate}\tAccounts Payable\t${safeName}\t${(-totalDisposal).toFixed(2)}\tDisposal costs`)
    lines.push('ENDTRNS')
  }

  const content = lines.join('\n')
  const filename = `${project.name.replace(/[^a-zA-Z0-9]/g, '_')}_QB_${new Date().toISOString().split('T')[0]}.iif`
  downloadFile(content, filename, 'application/x-iif')
}

/**
 * Export multi-project summary as CSV
 */
export function exportPortfolioSummary(projects, projectDataMap) {
  const headers = [
    { key: 'name', label: 'Project Name' },
    { key: 'jobNumber', label: 'Job #' },
    { key: 'status', label: 'Status' },
    { key: 'contractValue', label: 'Contract Value' },
    { key: 'progress', label: 'Progress %' },
    { key: 'earnedRevenue', label: 'Earned Revenue' },
    { key: 'totalCosts', label: 'Total Costs' },
    { key: 'profit', label: 'Profit' },
    { key: 'margin', label: 'Margin %' }
  ]

  const rows = projects.map(p => {
    const data = projectDataMap?.[p.id] || {}
    const earned = data.earnedRevenue || 0
    const costs = data.totalCosts || 0
    const profit = earned - costs
    return {
      name: p.name,
      jobNumber: p.job_number || '',
      status: p.status || 'active',
      contractValue: (p.contract_value || 0).toFixed(2),
      progress: (data.progress || 0).toFixed(1),
      earnedRevenue: earned.toFixed(2),
      totalCosts: costs.toFixed(2),
      profit: profit.toFixed(2),
      margin: earned > 0 ? ((profit / earned) * 100).toFixed(1) : '0.0'
    }
  })

  const csv = toCSV(headers, rows)
  const filename = `Portfolio_Summary_${new Date().toISOString().split('T')[0]}.csv`
  downloadFile(csv, filename)
}
