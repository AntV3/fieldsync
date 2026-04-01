/**
 * SageExportPanel — Export FieldSync data to Sage 300 CRE format.
 * Provides one-click exports for job costing, change orders, cost codes, and WIP.
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
  FileText, BarChart3, Hash, ChevronDown, ChevronRight
} from 'lucide-react'

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
          action: () => handleExport('Project Setup', () => exportSageProjectSetupCSV(project, areas, financialData))
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
          action: () => handleExport('AIA PDF', () => exportAIABillingPDF(project, areas, changeOrders, aiaOptions))
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
      </div>

      <p style={{ fontSize: '0.85rem', opacity: 0.7, margin: '0 0 1rem' }}>
        Export FieldSync data to your accounting system. All exports use standard CSV format compatible with Sage 300 CRE, QuickBooks, and other accounting platforms.
      </p>

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
