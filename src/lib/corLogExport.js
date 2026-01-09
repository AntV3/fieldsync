/**
 * COR Log Export Utility
 * Generates client-presentable COR logs showing status breakdown
 */

import { formatCurrency, formatDate, getStatusInfo } from './corCalculations'

/**
 * Generate HTML for COR log report
 * Groups CORs by client-relevant categories:
 * - Awaiting Client Response (pending_approval)
 * - Approved & Billed (billed)
 * - Completed/Processed (closed)
 * - In Progress (draft, approved)
 */
export function generateCORLogHTML(cors, project, company, filters = {}) {
  const {
    startDate = null,
    endDate = null,
    includeRejected = false
  } = filters

  // Filter by date range if provided
  let filteredCORs = cors.filter(cor => {
    if (startDate) {
      const corDate = new Date(cor.created_at)
      const start = new Date(startDate)
      if (corDate < start) return false
    }
    if (endDate) {
      const corDate = new Date(cor.created_at)
      const end = new Date(endDate)
      end.setHours(23, 59, 59, 999)
      if (corDate > end) return false
    }
    return true
  })

  // Group CORs by client-relevant status
  const awaitingClient = filteredCORs.filter(c => c.status === 'pending_approval')
  const billed = filteredCORs.filter(c => c.status === 'billed')
  const completed = filteredCORs.filter(c => c.status === 'closed')
  const inProgress = filteredCORs.filter(c => c.status === 'draft' || c.status === 'approved')
  const rejected = includeRejected ? filteredCORs.filter(c => c.status === 'rejected') : []

  // Calculate totals
  const awaitingTotal = awaitingClient.reduce((sum, c) => sum + (c.cor_total || 0), 0)
  const billedTotal = billed.reduce((sum, c) => sum + (c.cor_total || 0), 0)
  const completedTotal = completed.reduce((sum, c) => sum + (c.cor_total || 0), 0)
  const inProgressTotal = inProgress.reduce((sum, c) => sum + (c.cor_total || 0), 0)
  const grandTotal = awaitingTotal + billedTotal + completedTotal + inProgressTotal

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Change Order Log - ${project.name}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      padding: 40px;
      background: #ffffff;
      color: #1a1a1a;
      line-height: 1.5;
    }

    .header {
      border-bottom: 3px solid #2563eb;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }

    .company-name {
      font-size: 14px;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }

    h1 {
      font-size: 28px;
      font-weight: 700;
      color: #1a1a1a;
      margin-bottom: 8px;
    }

    .subtitle {
      font-size: 16px;
      color: #6b7280;
    }

    .report-meta {
      display: flex;
      gap: 30px;
      margin-bottom: 30px;
      padding: 15px;
      background: #f9fafb;
      border-radius: 8px;
    }

    .meta-item {
      display: flex;
      flex-direction: column;
    }

    .meta-label {
      font-size: 11px;
      text-transform: uppercase;
      color: #6b7280;
      font-weight: 600;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
    }

    .meta-value {
      font-size: 14px;
      color: #1a1a1a;
      font-weight: 600;
    }

    .summary-cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin-bottom: 40px;
    }

    .summary-card {
      padding: 20px;
      border-radius: 8px;
      border: 1px solid #e5e7eb;
    }

    .summary-card.awaiting {
      background: #fef3c7;
      border-color: #fbbf24;
    }

    .summary-card.billed {
      background: #dbeafe;
      border-color: #3b82f6;
    }

    .summary-card.completed {
      background: #d1fae5;
      border-color: #10b981;
    }

    .summary-card.in-progress {
      background: #f3e8ff;
      border-color: #a855f7;
    }

    .summary-label {
      font-size: 13px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
      opacity: 0.8;
    }

    .summary-count {
      font-size: 32px;
      font-weight: 700;
      margin-bottom: 4px;
    }

    .summary-amount {
      font-size: 16px;
      font-weight: 600;
    }

    .section {
      margin-bottom: 40px;
      page-break-inside: avoid;
    }

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: #f9fafb;
      border-left: 4px solid #2563eb;
      margin-bottom: 16px;
      border-radius: 4px;
    }

    .section-header.awaiting {
      border-left-color: #fbbf24;
      background: #fffbeb;
    }

    .section-header.billed {
      border-left-color: #3b82f6;
      background: #eff6ff;
    }

    .section-header.completed {
      border-left-color: #10b981;
      background: #f0fdf4;
    }

    .section-header.in-progress {
      border-left-color: #a855f7;
      background: #faf5ff;
    }

    .section-title {
      font-size: 18px;
      font-weight: 700;
      color: #1a1a1a;
    }

    .section-count {
      font-size: 14px;
      color: #6b7280;
      font-weight: 600;
    }

    .cor-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }

    .cor-table thead {
      background: #f9fafb;
    }

    .cor-table th {
      padding: 12px;
      text-align: left;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #6b7280;
      border-bottom: 2px solid #e5e7eb;
    }

    .cor-table td {
      padding: 12px;
      font-size: 13px;
      border-bottom: 1px solid #f3f4f6;
    }

    .cor-table tbody tr:hover {
      background: #f9fafb;
    }

    .cor-number {
      font-weight: 700;
      color: #2563eb;
    }

    .cor-title {
      font-weight: 600;
      color: #1a1a1a;
    }

    .cor-date {
      color: #6b7280;
      font-size: 12px;
    }

    .cor-amount {
      font-weight: 700;
      text-align: right;
    }

    .section-total {
      display: flex;
      justify-content: flex-end;
      padding: 12px;
      background: #f9fafb;
      border-radius: 4px;
      margin-top: 8px;
      font-weight: 700;
    }

    .grand-total {
      margin-top: 40px;
      padding: 20px;
      background: #1f2937;
      color: white;
      border-radius: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .grand-total-label {
      font-size: 18px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    .grand-total-amount {
      font-size: 28px;
      font-weight: 700;
    }

    .footer {
      margin-top: 60px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      text-align: center;
      color: #6b7280;
      font-size: 12px;
    }

    .empty-section {
      padding: 20px;
      text-align: center;
      color: #9ca3af;
      font-style: italic;
      background: #f9fafb;
      border-radius: 4px;
    }

    @media print {
      body {
        padding: 20px;
      }

      .section {
        page-break-inside: avoid;
      }

      .cor-table thead {
        display: table-header-group;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="company-name">${company?.name || 'Company Name'}</div>
    <h1>Change Order Log</h1>
    <div class="subtitle">${project.name}</div>
  </div>

  <div class="report-meta">
    <div class="meta-item">
      <div class="meta-label">Report Date</div>
      <div class="meta-value">${formatDate(new Date())}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">Total CORs</div>
      <div class="meta-value">${filteredCORs.length}</div>
    </div>
    ${startDate || endDate ? `
    <div class="meta-item">
      <div class="meta-label">Date Range</div>
      <div class="meta-value">${startDate ? formatDate(startDate) : 'Start'} - ${endDate ? formatDate(endDate) : 'Present'}</div>
    </div>
    ` : ''}
  </div>

  <div class="summary-cards">
    <div class="summary-card awaiting">
      <div class="summary-label">Awaiting Client</div>
      <div class="summary-count">${awaitingClient.length}</div>
      <div class="summary-amount">${formatCurrency(awaitingTotal)}</div>
    </div>
    <div class="summary-card billed">
      <div class="summary-label">Billed</div>
      <div class="summary-count">${billed.length}</div>
      <div class="summary-amount">${formatCurrency(billedTotal)}</div>
    </div>
    <div class="summary-card completed">
      <div class="summary-label">Completed</div>
      <div class="summary-count">${completed.length}</div>
      <div class="summary-amount">${formatCurrency(completedTotal)}</div>
    </div>
    <div class="summary-card in-progress">
      <div class="summary-label">In Progress</div>
      <div class="summary-count">${inProgress.length}</div>
      <div class="summary-amount">${formatCurrency(inProgressTotal)}</div>
    </div>
  </div>

  ${renderSection('Awaiting Client Response', awaitingClient, 'awaiting',
    'These change orders require client review and approval.')}

  ${renderSection('Billed', billed, 'billed',
    'These change orders have been approved and billed to the client.')}

  ${renderSection('Completed/Processed', completed, 'completed',
    'These change orders have been fully processed and closed.')}

  ${renderSection('In Progress', inProgress, 'in-progress',
    'These change orders are currently being prepared or have been approved but not yet billed.')}

  ${includeRejected && rejected.length > 0 ? renderSection('Rejected', rejected, 'rejected',
    'These change orders were rejected by the client.') : ''}

  <div class="grand-total">
    <div class="grand-total-label">Total Change Order Value</div>
    <div class="grand-total-amount">${formatCurrency(grandTotal)}</div>
  </div>

  <div class="footer">
    Generated by FieldSync on ${new Date().toLocaleString()}<br>
    This is a summary report for client presentation purposes.
  </div>
</body>
</html>
`

  return html
}

/**
 * Render a section of CORs
 */
function renderSection(title, cors, className, description) {
  if (cors.length === 0) {
    return `
      <div class="section">
        <div class="section-header ${className}">
          <div class="section-title">${title}</div>
          <div class="section-count">0 CORs</div>
        </div>
        <div class="empty-section">No change orders in this category</div>
      </div>
    `
  }

  const sectionTotal = cors.reduce((sum, c) => sum + (c.cor_total || 0), 0)

  return `
    <div class="section">
      <div class="section-header ${className}">
        <div class="section-title">${title}</div>
        <div class="section-count">${cors.length} COR${cors.length !== 1 ? 's' : ''} · ${formatCurrency(sectionTotal)}</div>
      </div>
      <p style="margin-bottom: 16px; color: #6b7280; font-size: 13px;">${description}</p>
      <table class="cor-table">
        <thead>
          <tr>
            <th>COR #</th>
            <th>Title</th>
            <th>Period</th>
            <th>Created</th>
            <th style="text-align: right;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${cors.map(cor => `
            <tr>
              <td><span class="cor-number">${cor.cor_number}</span></td>
              <td><span class="cor-title">${cor.title || 'Untitled'}</span></td>
              <td><span class="cor-date">${formatDate(cor.period_start)} - ${formatDate(cor.period_end)}</span></td>
              <td><span class="cor-date">${formatDate(cor.created_at)}</span></td>
              <td class="cor-amount">${formatCurrency(cor.cor_total || 0)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div class="section-total">
        <span>Section Total: ${formatCurrency(sectionTotal)}</span>
      </div>
    </div>
  `
}

/**
 * Export COR log as printable HTML in new window
 */
export function exportCORLog(cors, project, company, filters = {}) {
  const html = generateCORLogHTML(cors, project, company, filters)

  // Open in new window for printing
  const printWindow = window.open('', '_blank')
  if (printWindow) {
    printWindow.document.write(html)
    printWindow.document.close()

    // Auto-print after a short delay to allow styles to load
    setTimeout(() => {
      printWindow.focus()
      printWindow.print()
    }, 250)
  } else {
    alert('Please allow popups to export COR log')
  }
}

/**
 * Download COR log as HTML file
 */
export function downloadCORLogHTML(cors, project, company, filters = {}) {
  const html = generateCORLogHTML(cors, project, company, filters)
  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = `COR-Log-${project.name.replace(/[^a-z0-9]/gi, '-')}-${new Date().toISOString().split('T')[0]}.html`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Export COR log as CSV
 */
export function exportCORLogCSV(cors, project) {
  const headers = ['COR Number', 'Title', 'Status', 'Period Start', 'Period End', 'Created Date', 'Amount', 'Signed']

  const rows = cors.map(cor => [
    cor.cor_number,
    cor.title || 'Untitled',
    cor.status,
    formatDate(cor.period_start),
    formatDate(cor.period_end),
    formatDate(cor.created_at),
    (cor.cor_total / 100).toFixed(2),
    (cor.gc_signature_data || cor.client_signature_data) ? 'Yes' : 'No'
  ])

  const csv = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n')

  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = `COR-Log-${project.name.replace(/[^a-z0-9]/gi, '-')}-${new Date().toISOString().split('T')[0]}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
