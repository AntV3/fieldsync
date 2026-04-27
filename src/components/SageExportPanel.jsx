/**
 * SageExportPanel — Export FieldSync data to Sage 300 CRE format.
 * Provides one-click exports for job costing, change orders, cost codes, and WIP.
 * Includes a live data preview so users can verify data before exporting.
 */
import { useState } from 'react'
import { db } from '../lib/supabase'
import {
  exportSageJobCostCSV,
  exportSageChangeOrdersCSV,
  exportSageCostCodesCSV,
  exportSageProjectSetupCSV,
  exportSageWIPScheduleCSV
} from '../lib/sageExport'
import { exportToQuickBooksIIF } from '../lib/financialExport'
import { exportAIABillingPDF, exportAIABillingCSV } from '../lib/aiaBillingExport'
import {
  Download, FileSpreadsheet, Building2, Receipt,
  FileText, BarChart3, Hash, ChevronDown, ChevronRight,
  Eye, EyeOff, TrendingDown, Minus,
  AlertTriangle, CheckCircle2
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------
function fmtCurrency(val) {
  const n = Number(val) || 0
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function fmtPct(val) {
  const n = Number(val) || 0
  return `${n.toFixed(1)}%`
}

// Return a semantic status for a financial metric
function profitStatus(profit, revenue) {
  if (revenue === 0 && profit === 0) return 'neutral'
  const margin = revenue > 0 ? (profit / revenue) * 100 : profit > 0 ? 100 : -100
  if (margin >= 15) return 'healthy'
  if (margin >= 0) return 'warning'
  return 'danger'
}

const STATUS_STYLES = {
  healthy: { color: 'var(--status-success, #2E865F)', bg: 'rgba(46, 134, 95, 0.08)', icon: CheckCircle2, label: 'Healthy' },
  warning: { color: 'var(--status-warning, #F5A623)', bg: 'rgba(245, 166, 35, 0.08)', icon: AlertTriangle, label: 'Thin Margin' },
  danger:  { color: 'var(--status-danger, #EA6A47)',  bg: 'rgba(234, 106, 71, 0.08)', icon: TrendingDown, label: 'Over Budget' },
  neutral: { color: 'var(--text-tertiary, #8A8A8A)',  bg: 'var(--bg-elevated, #FAFAFA)', icon: Minus, label: 'No Data' }
}

// ---------------------------------------------------------------------------
// ExportPreview — live preview of the data that will be exported
// ---------------------------------------------------------------------------
function ExportPreview({ project, areas, financialData }) {
  const earnedRevenue = financialData.billable || financialData.earnedRevenue || financialData.earnedValue || 0
  const laborCost = financialData.laborCost || financialData.totalLaborCost || 0
  const materialCost = financialData.materialsEquipmentCost || financialData.totalMaterialCost || 0
  const equipmentCost = financialData.projectEquipmentCost || 0
  const customCostTotal = financialData.customCostTotal || 0
  const totalCosts = financialData.allCostsTotal || financialData.totalCosts || 0
  const profit = earnedRevenue - totalCosts
  const margin = earnedRevenue > 0 ? (profit / earnedRevenue) * 100 : 0
  const status = profitStatus(profit, earnedRevenue)
  const st = STATUS_STYLES[status]
  const StatusIcon = st.icon

  const contractValue = project.contract_value || 0
  const changeOrderValue = financialData.changeOrderValue || 0
  const revisedContract = financialData.revisedContractValue || contractValue + changeOrderValue
  const progress = financialData.progress || 0

  // Section styles
  const sectionHead = {
    fontSize: '0.7rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: 'var(--text-secondary, #5F5F5F)',
    padding: '0.4rem 0',
    borderBottom: '1px solid var(--border-subtle, #E0E0E0)',
    marginTop: '0.75rem',
    marginBottom: '0.25rem'
  }
  const row = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.35rem 0',
    fontSize: '0.85rem',
    borderBottom: '1px solid var(--border-light, #ECECEC)'
  }
  const valStyle = {
    fontFamily: 'var(--font-data, "JetBrains Mono", monospace)',
    fontVariantNumeric: 'tabular-nums lining-nums',
    fontWeight: 500
  }

  const hasFinancialData = earnedRevenue > 0 || totalCosts > 0

  return (
    <div style={{
      background: 'var(--bg-surface, #fff)',
      border: '1px solid var(--border-subtle, #E0E0E0)',
      borderRadius: 'var(--radius-lg, 8px)',
      padding: '1rem',
      marginBottom: '0.75rem',
      boxShadow: 'var(--shadow-card, 0 1px 3px rgba(0,0,0,0.04))'
    }}>
      {/* Status Banner */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.5rem 0.75rem',
        borderRadius: 'var(--radius-md, 6px)',
        background: st.bg,
        marginBottom: '0.75rem'
      }}>
        <StatusIcon size={16} style={{ color: st.color }} />
        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: st.color }}>{st.label}</span>
        <span style={{ flex: 1 }} />
        {hasFinancialData && (
          <span style={{ fontSize: '0.8rem', fontWeight: 500, color: st.color }}>
            {fmtPct(margin)} margin
          </span>
        )}
      </div>

      {/* Hero Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
        {[
          { label: 'Earned Revenue', value: earnedRevenue, color: 'var(--color-accent, #0091D5)' },
          { label: 'Total Costs', value: totalCosts, color: 'var(--color-accent-warm, #EA6A47)' },
          { label: 'Profit', value: profit, color: st.color }
        ].map(m => (
          <div key={m.label} style={{
            textAlign: 'center',
            padding: '0.5rem',
            borderRadius: 'var(--radius-sm, 4px)',
            background: 'var(--bg-elevated, #FAFAFA)'
          }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary, #5F5F5F)', marginBottom: '0.25rem' }}>{m.label}</div>
            <div style={{
              fontSize: '1.1rem',
              fontWeight: 600,
              fontFamily: 'var(--font-data, monospace)',
              fontVariantNumeric: 'tabular-nums',
              color: m.color
            }}>{fmtCurrency(m.value)}</div>
          </div>
        ))}
      </div>

      {/* Project Info */}
      <div style={sectionHead}>Project Details</div>
      {[
        { label: 'Job Number', value: project.job_number || '—' },
        { label: 'Job Name', value: project.name },
        { label: 'Status', value: project.status || 'active' },
        { label: 'Contract Amount', value: fmtCurrency(contractValue) },
        { label: 'Approved COs', value: changeOrderValue ? fmtCurrency(changeOrderValue) : '—' },
        { label: 'Revised Contract', value: revisedContract !== contractValue ? fmtCurrency(revisedContract) : '—' },
        { label: 'Progress', value: fmtPct(progress) },
        { label: 'Start Date', value: project.start_date || '—' },
        { label: 'End Date', value: project.end_date || '—' }
      ].map(r => (
        <div key={r.label} style={row}>
          <span style={{ color: 'var(--text-secondary, #5F5F5F)' }}>{r.label}</span>
          <span style={valStyle}>{r.value}</span>
        </div>
      ))}

      {/* Schedule of Values */}
      {areas.length > 0 && (
        <>
          <div style={sectionHead}>Schedule of Values ({areas.length} items)</div>
          {areas.map((area, i) => {
            const sovVal = area.sov_value || area.weight || 0
            return (
              <div key={area.id || i} style={row}>
                <span style={{ color: 'var(--text-secondary, #5F5F5F)' }}>{area.name}</span>
                <span style={valStyle}>{sovVal > 0 ? fmtCurrency(sovVal) : '—'}</span>
              </div>
            )
          })}
        </>
      )}

      {/* Cost Breakdown */}
      <div style={sectionHead}>Cost Breakdown</div>
      {[
        { label: 'Labor', value: laborCost, color: 'var(--color-primary, #1C4E80)' },
        { label: 'Materials & Equipment (T&M)', value: materialCost, color: 'var(--color-accent, #0091D5)' },
        { label: 'Equipment Rental', value: equipmentCost, color: 'var(--status-info, #0091D5)' },
        { label: 'Other / Custom', value: customCostTotal, color: 'var(--text-secondary, #5F5F5F)' }
      ].map(c => (
        <div key={c.label} style={row}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-secondary)' }}>
            <span style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: c.color,
              flexShrink: 0
            }} />
            {c.label}
          </span>
          <span style={{ ...valStyle, color: c.value > 0 ? 'var(--text-primary, #202020)' : 'var(--text-tertiary, #8A8A8A)' }}>
            {fmtCurrency(c.value)}
          </span>
        </div>
      ))}
      {/* Cost bar visualization */}
      {totalCosts > 0 && (
        <div style={{
          display: 'flex',
          height: 6,
          borderRadius: 3,
          overflow: 'hidden',
          marginTop: '0.5rem',
          background: 'var(--bg-elevated, #FAFAFA)'
        }}>
          {[
            { value: laborCost, color: 'var(--color-primary, #1C4E80)' },
            { value: materialCost, color: 'var(--color-accent, #0091D5)' },
            { value: equipmentCost, color: 'var(--status-info, #0091D5)' },
            { value: customCostTotal, color: 'var(--text-secondary, #5F5F5F)' }
          ].filter(s => s.value > 0).map((s, i) => (
            <div key={i} style={{
              width: `${(s.value / totalCosts) * 100}%`,
              background: s.color,
              minWidth: s.value > 0 ? 2 : 0
            }} />
          ))}
        </div>
      )}

      {/* No data warning */}
      {!hasFinancialData && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.5rem 0.75rem',
          borderRadius: 'var(--radius-md, 6px)',
          background: 'rgba(245, 166, 35, 0.08)',
          marginTop: '0.75rem',
          fontSize: '0.8rem',
          color: 'var(--status-warning, #F5A623)'
        }}>
          <AlertTriangle size={14} />
          No financial data yet — costs and revenue will populate as work is tracked.
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main SageExportPanel
// ---------------------------------------------------------------------------
export default function SageExportPanel({
  project,
  company,
  areas = [],
  changeOrders = [],
  costCodes = [],
  financialData = {},
  allProjects = [],
  projectDataMap = {},
  onShowToast
}) {
  const [exporting, setExporting] = useState(null)
  const [expandedSection, setExpandedSection] = useState('sage')
  const [showPreview, setShowPreview] = useState(false)
  const [aiaOptions, setAiaOptions] = useState({
    applicationNumber: 1,
    periodTo: new Date().toISOString().split('T')[0],
    architect: '',
    owner: '',
    contractDate: ''
  })

  const handleExport = async (type, exportFn) => {
    setExporting(type)
    try {
      await exportFn()
      onShowToast?.(`${type} export downloaded`, 'success')
    } catch (err) {
      console.error(`Export failed (${type}):`, err)
      onShowToast?.(`Export failed: ${err.message}`, 'error')
    } finally {
      setExporting(null)
    }
  }

  const loadTicketsAndExport = async () => {
    const tickets = await db.getTMTickets(project.id)
    return exportSageJobCostCSV(project, tickets, costCodes)
  }

  const sections = [
    {
      id: 'sage',
      title: 'Sage 300 CRE',
      icon: Building2,
      description: 'Export data in Sage 300 Construction & Real Estate format',
      exports: [
        {
          id: 'sage-jobcost',
          label: 'Job Cost Transactions',
          description: 'T&M labor, materials & equipment mapped to Sage cost types',
          icon: FileSpreadsheet,
          action: () => handleExport('Job Cost', loadTicketsAndExport)
        },
        {
          id: 'sage-co',
          label: 'Change Orders',
          description: 'Approved CORs for Sage budget revision import',
          icon: Receipt,
          action: () => handleExport('Change Orders', () => exportSageChangeOrdersCSV(project, changeOrders)),
          disabled: !changeOrders?.length
        },
        {
          id: 'sage-costcodes',
          label: 'Cost Code Mapping',
          description: 'Cost codes in Sage category import format',
          icon: Hash,
          action: () => handleExport('Cost Codes', () => exportSageCostCodesCSV(costCodes, company?.name)),
          disabled: !costCodes?.length
        },
        {
          id: 'sage-setup',
          label: 'Project Setup',
          description: 'Project details & SOV for Sage job creation',
          icon: FileText,
          action: () => handleExport('Project Setup', () => exportSageProjectSetupCSV(project, areas, financialData)),
          hasPreview: true
        },
        {
          id: 'sage-wip',
          label: 'WIP Schedule',
          description: 'Work-in-progress with over/under billing across all projects',
          icon: BarChart3,
          action: () => handleExport('WIP', () => exportSageWIPScheduleCSV(allProjects, projectDataMap)),
          disabled: !allProjects?.length
        }
      ]
    },
    {
      id: 'aia',
      title: 'AIA Billing (G702/G703)',
      icon: FileText,
      description: 'Generate industry-standard AIA billing documents',
      exports: [
        {
          id: 'aia-pdf',
          label: 'AIA G702/G703 PDF',
          description: 'Application for Payment with continuation sheet',
          icon: FileText,
          action: () => handleExport('AIA PDF', () => exportAIABillingPDF(project, areas, changeOrders, { ...aiaOptions, company }))
        },
        {
          id: 'aia-csv',
          label: 'AIA G703 CSV',
          description: 'Schedule of values for import into billing software',
          icon: FileSpreadsheet,
          action: () => handleExport('AIA CSV', () => exportAIABillingCSV(project, areas, changeOrders, aiaOptions))
        }
      ]
    },
    {
      id: 'quickbooks',
      title: 'QuickBooks',
      icon: Receipt,
      description: 'Export to QuickBooks IIF format',
      exports: [
        {
          id: 'qb-iif',
          label: 'QuickBooks IIF',
          description: 'General journal entries for QuickBooks Desktop import',
          icon: FileSpreadsheet,
          action: () => handleExport('QuickBooks', () => exportToQuickBooksIIF(project, financialData))
        }
      ]
    }
  ]

  return (
    <div className="sage-export-panel">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
        <Download size={20} />
        <h3 style={{ margin: 0 }}>Accounting Export</h3>
        <span style={{ flex: 1 }} />
        <button
          onClick={() => setShowPreview(v => !v)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
            padding: '0.35rem 0.65rem',
            fontSize: '0.8rem',
            fontWeight: 500,
            background: showPreview ? 'var(--color-accent, #0091D5)' : 'transparent',
            color: showPreview ? '#fff' : 'var(--text-secondary, #5F5F5F)',
            border: showPreview ? 'none' : '1px solid var(--border-color, #e5e7eb)',
            borderRadius: 'var(--radius-md, 6px)',
            cursor: 'pointer',
            transition: 'all 0.15s'
          }}
        >
          {showPreview ? <EyeOff size={14} /> : <Eye size={14} />}
          {showPreview ? 'Hide Preview' : 'Preview Data'}
        </button>
      </div>

      <p style={{ fontSize: '0.85rem', opacity: 0.7, margin: '0 0 1rem' }}>
        Export FieldSync data to your accounting system. All exports use standard CSV format compatible with Sage 300 CRE, QuickBooks, and other accounting platforms.
      </p>

      {/* Data Preview */}
      {showPreview && (
        <ExportPreview
          project={project}
          areas={areas}
          financialData={financialData}
        />
      )}

      {/* AIA Options (shared across AIA exports) */}
      {expandedSection === 'aia' && (
        <div style={{ padding: '0.75rem', background: 'var(--bg-secondary, #f8f9fa)', borderRadius: '0.5rem', marginBottom: '1rem' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem' }}>AIA Application Settings</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
            <div>
              <label style={{ fontSize: '0.75rem', opacity: 0.7 }}>Application #</label>
              <input type="number" value={aiaOptions.applicationNumber} onChange={e => setAiaOptions(o => ({ ...o, applicationNumber: parseInt(e.target.value) || 1 }))} className="form-input" min="1" />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', opacity: 0.7 }}>Period To</label>
              <input type="date" value={aiaOptions.periodTo} onChange={e => setAiaOptions(o => ({ ...o, periodTo: e.target.value }))} className="form-input" />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', opacity: 0.7 }}>Contract Date</label>
              <input type="date" value={aiaOptions.contractDate} onChange={e => setAiaOptions(o => ({ ...o, contractDate: e.target.value }))} className="form-input" />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', opacity: 0.7 }}>Owner</label>
              <input type="text" placeholder="Owner name" value={aiaOptions.owner} onChange={e => setAiaOptions(o => ({ ...o, owner: e.target.value }))} className="form-input" />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', opacity: 0.7 }}>Architect</label>
              <input type="text" placeholder="Architect name" value={aiaOptions.architect} onChange={e => setAiaOptions(o => ({ ...o, architect: e.target.value }))} className="form-input" />
            </div>
          </div>
        </div>
      )}

      {/* Export Sections */}
      {sections.map(section => {
        const isExpanded = expandedSection === section.id
        const Icon = section.icon

        return (
          <div key={section.id} style={{ marginBottom: '0.5rem', border: '1px solid var(--border-color, #e5e7eb)', borderRadius: '0.5rem', overflow: 'hidden' }}>
            <button
              onClick={() => setExpandedSection(isExpanded ? null : section.id)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1rem',
                background: isExpanded ? 'var(--bg-secondary, #f8f9fa)' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: '0.95rem',
                fontWeight: 600
              }}
            >
              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              <Icon size={18} />
              {section.title}
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: '0.75rem', fontWeight: 400, opacity: 0.6 }}>{section.description}</span>
            </button>

            {isExpanded && (
              <div style={{ padding: '0.5rem 1rem 1rem' }}>
                {section.exports.map(exp => (
                  <button
                    key={exp.id}
                    onClick={exp.action}
                    disabled={exp.disabled || exporting === exp.label}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.75rem',
                      marginBottom: '0.5rem',
                      background: 'var(--bg-primary, white)',
                      border: '1px solid var(--border-color, #e5e7eb)',
                      borderRadius: '0.5rem',
                      cursor: exp.disabled ? 'not-allowed' : 'pointer',
                      opacity: exp.disabled ? 0.5 : 1,
                      textAlign: 'left',
                      transition: 'background 0.15s'
                    }}
                    onMouseEnter={e => { if (!exp.disabled) e.currentTarget.style.background = 'var(--bg-secondary, #f8f9fa)' }}
                    onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-primary, white)'}
                  >
                    <exp.icon size={20} style={{ opacity: 0.7 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500 }}>{exp.label}</div>
                      <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>{exp.description}</div>
                    </div>
                    <Download size={16} style={{ opacity: 0.4 }} />
                    {exporting === exp.label && (
                      <span style={{ fontSize: '0.8rem', color: 'var(--color-primary, #3b82f6)' }}>Exporting...</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
