import { useState, useEffect, useMemo } from 'react'
import { FileSpreadsheet, Download, FileText, Loader2, RefreshCw, Clock, CheckCircle, XCircle } from 'lucide-react'
import { db } from '../../lib/supabase'
import { formatCurrency } from '../../lib/corCalculations'
import CORLogRow from './CORLogRow'

// Status display mapping for client presentation
const STATUS_DISPLAY = {
  draft: { label: 'Draft', className: 'draft' },
  pending_approval: { label: 'Pending', className: 'pending' },
  approved: { label: 'Approved', className: 'approved' },
  rejected: { label: 'Rejected', className: 'rejected' },
  billed: { label: 'Billed', className: 'billed' },
  closed: { label: 'Closed', className: 'closed' }
}

// Status categories for grouping
const STATUS_CATEGORIES = {
  pending: ['draft', 'pending_approval'],
  approved: ['approved', 'billed'],
  void: ['rejected', 'closed']
}

export default function CORLog({ project, company, onShowToast }) {
  const [logEntries, setLogEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [savingId, setSavingId] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    loadCORLog()

    // Subscribe to COR log changes
    const subscription = db.subscribeToCORLog?.(project.id, () => {
      loadCORLog()
    })

    return () => {
      if (subscription) db.unsubscribe?.(subscription)
    }
  }, [project.id])

  const loadCORLog = async () => {
    try {
      const data = await db.getCORLog(project.id)
      setLogEntries(data || [])
    } catch (error) {
      console.error('Error loading COR log:', error)
      onShowToast?.('Error loading COR log', 'error')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const handleRefresh = () => {
    setRefreshing(true)
    loadCORLog()
  }

  const handleSave = async (entryId, updates, changeOrderId) => {
    setSavingId(entryId)
    try {
      // Update log entry fields
      await db.updateCORLogEntry(entryId, updates)

      // If status changed, update the change order status too
      if (updates.status) {
        await db.updateChangeOrderStatus(changeOrderId, updates.status)
      }

      // Update local state
      setLogEntries(prev => prev.map(entry =>
        entry.id === entryId
          ? {
              ...entry,
              dateSentToClient: updates.dateSentToClient,
              ceNumber: updates.ceNumber,
              comments: updates.comments,
              changeOrder: {
                ...entry.changeOrder,
                status: updates.status || entry.changeOrder.status
              }
            }
          : entry
      ))
      setEditingId(null)
      onShowToast?.('Log entry updated', 'success')
    } catch (error) {
      console.error('Error updating log entry:', error)
      onShowToast?.('Error updating log entry', 'error')
    } finally {
      setSavingId(null)
    }
  }

  // Group entries by status category
  const groupedEntries = useMemo(() => {
    const pending = logEntries.filter(e => STATUS_CATEGORIES.pending.includes(e.changeOrder.status))
    const approved = logEntries.filter(e => STATUS_CATEGORIES.approved.includes(e.changeOrder.status))
    const voided = logEntries.filter(e => STATUS_CATEGORIES.void.includes(e.changeOrder.status))

    return { pending, approved, voided }
  }, [logEntries])

  // Calculate summary statistics
  const summary = useMemo(() => {
    const { pending, approved, voided } = groupedEntries

    return {
      totalCORs: logEntries.length,
      approvedCount: approved.length,
      pendingCount: pending.length,
      voidCount: voided.length,
      approvedTotal: approved.reduce((sum, e) => sum + (e.changeOrder.corTotal || 0), 0),
      pendingTotal: pending.reduce((sum, e) => sum + (e.changeOrder.corTotal || 0), 0),
      voidTotal: voided.reduce((sum, e) => sum + (e.changeOrder.corTotal || 0), 0),
      grandTotal: logEntries.reduce((sum, e) => sum + (e.changeOrder.corTotal || 0), 0)
    }
  }, [logEntries, groupedEntries])

  // Export to PDF
  const exportToPDF = async () => {
    try {
      // Dynamic import for jspdf
      const { default: jsPDF } = await import('jspdf')
      const { default: autoTable } = await import('jspdf-autotable')

      const doc = new jsPDF('landscape')
      const pageWidth = doc.internal.pageSize.width

      // Header
      doc.setFontSize(18)
      doc.setFont(undefined, 'bold')
      doc.text('CHANGE ORDER LOG', pageWidth / 2, 20, { align: 'center' })

      doc.setFontSize(12)
      doc.setFont(undefined, 'normal')
      doc.text(`Project: ${project.name}`, pageWidth / 2, 28, { align: 'center' })
      if (project.job_number) {
        doc.text(`Job #${project.job_number}`, pageWidth / 2, 35, { align: 'center' })
      }
      doc.setFontSize(10)
      doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth / 2, 42, { align: 'center' })

      // Company info if available
      if (company?.name) {
        doc.setFontSize(11)
        doc.setFont(undefined, 'bold')
        doc.text(company.name, 14, 20)
        doc.setFont(undefined, 'normal')
        if (company.phone) {
          doc.setFontSize(9)
          doc.text(company.phone, 14, 25)
        }
      }

      // Table data - include all editable columns
      const tableData = logEntries.map(entry => [
        entry.logNumber,
        entry.changeOrder.corNumber || '-',
        entry.dateSentToClient ? new Date(entry.dateSentToClient).toLocaleDateString() : '-',
        entry.ceNumber || '-',
        entry.changeOrder.title || 'Untitled',
        formatCurrency(entry.changeOrder.corTotal || 0),
        STATUS_DISPLAY[entry.changeOrder.status]?.label || entry.changeOrder.status,
        entry.comments || '-'
      ])

      // Generate table with all columns
      autoTable(doc, {
        startY: 50,
        head: [['Log #', 'COR #', 'Date Sent', 'CE #', 'Description', 'Amount', 'Status', 'Comments']],
        body: tableData,
        styles: {
          fontSize: 8,
          cellPadding: 3,
          overflow: 'linebreak',
          valign: 'top'
        },
        headStyles: {
          fillColor: [51, 51, 51],
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 8
        },
        columnStyles: {
          0: { cellWidth: 12, halign: 'center' },  // Log #
          1: { cellWidth: 18 },                     // COR #
          2: { cellWidth: 22 },                     // Date Sent
          3: { cellWidth: 18 },                     // CE #
          4: { cellWidth: 55 },                     // Description
          5: { cellWidth: 22, halign: 'right' },    // Amount
          6: { cellWidth: 18, halign: 'center' },   // Status
          7: { cellWidth: 'auto', minCellWidth: 50 } // Comments - flexible width
        },
        alternateRowStyles: {
          fillColor: [248, 248, 248]
        },
        didParseCell: (data) => {
          // Style status cells based on value
          if (data.column.index === 6 && data.section === 'body') {
            const status = data.cell.raw?.toLowerCase()
            if (status === 'approved' || status === 'billed') {
              data.cell.styles.textColor = [5, 150, 105]
            } else if (status === 'pending' || status === 'pending approval') {
              data.cell.styles.textColor = [217, 119, 6]
            } else if (status === 'rejected' || status === 'void') {
              data.cell.styles.textColor = [220, 38, 38]
            }
          }
        }
      })

      // Summary section
      const finalY = (doc.lastAutoTable?.finalY || 100) + 10
      doc.setFontSize(10)
      doc.setFont(undefined, 'bold')
      doc.text('SUMMARY', 14, finalY)

      doc.setFont(undefined, 'normal')
      doc.setFontSize(9)
      const col1X = 14
      const col2X = 100
      doc.text(`Total CORs: ${summary.totalCORs}`, col1X, finalY + 7)
      doc.text(`Approved: ${summary.approvedCount} (${formatCurrency(summary.approvedTotal)})`, col1X, finalY + 14)
      doc.text(`Pending: ${summary.pendingCount} (${formatCurrency(summary.pendingTotal)})`, col2X, finalY + 7)
      doc.text(`Void: ${summary.voidCount} (${formatCurrency(summary.voidTotal)})`, col2X, finalY + 14)

      doc.setFont(undefined, 'bold')
      doc.setFontSize(10)
      doc.text(`Total Value: ${formatCurrency(summary.grandTotal)}`, col1X, finalY + 24)

      // Save
      const fileName = `COR_Log_${project.job_number || project.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`
      doc.save(fileName)

      onShowToast?.('PDF exported successfully', 'success')
    } catch (error) {
      console.error('Error exporting PDF:', error)
      onShowToast?.('Error exporting PDF', 'error')
    }
  }

  // Export to Excel
  const exportToExcel = async () => {
    try {
      // Dynamic import for xlsx
      const XLSX = await import('xlsx')

      // Prepare data
      const data = logEntries.map(entry => ({
        'Log #': entry.logNumber,
        'COR Number': entry.changeOrder.corNumber,
        'Date Sent to Client': entry.dateSentToClient || '',
        'CE Number': entry.ceNumber || '',
        'Description': entry.changeOrder.title || 'Untitled',
        'Amount': entry.changeOrder.corTotal || 0,
        'Status': STATUS_DISPLAY[entry.changeOrder.status]?.label || entry.changeOrder.status,
        'Created Date': entry.changeOrder.createdAt ? new Date(entry.changeOrder.createdAt).toLocaleDateString() : '',
        'Approved Date': entry.changeOrder.approvedAt ? new Date(entry.changeOrder.approvedAt).toLocaleDateString() : '',
        'Approved By': entry.changeOrder.approvedBy || '',
        'Comments': entry.comments || ''
      }))

      // Add summary row
      data.push({})
      data.push({
        'Log #': 'SUMMARY',
        'Description': `Total CORs: ${summary.totalCORs}`,
        'Amount': summary.grandTotal,
        'Status': `Approved: ${summary.approvedCount}, Pending: ${summary.pendingCount}`
      })

      // Create workbook
      const ws = XLSX.utils.json_to_sheet(data)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'COR Log')

      // Format amount column
      const amountCol = 5 // 0-indexed, 'Amount' column
      const range = XLSX.utils.decode_range(ws['!ref'])
      for (let row = range.s.r + 1; row <= range.e.r; row++) {
        const cellRef = XLSX.utils.encode_cell({ r: row, c: amountCol })
        if (ws[cellRef] && typeof ws[cellRef].v === 'number') {
          ws[cellRef].z = '$#,##0.00'
        }
      }

      // Column widths
      ws['!cols'] = [
        { wch: 8 },   // Log #
        { wch: 12 },  // COR Number
        { wch: 15 },  // Date Sent
        { wch: 12 },  // CE Number
        { wch: 40 },  // Description
        { wch: 12 },  // Amount
        { wch: 12 },  // Status
        { wch: 12 },  // Created Date
        { wch: 12 },  // Approved Date
        { wch: 20 },  // Approved By
        { wch: 30 }   // Comments
      ]

      // Save
      const fileName = `COR_Log_${project.job_number || project.name}_${new Date().toISOString().split('T')[0]}.xlsx`
      XLSX.writeFile(wb, fileName)

      onShowToast?.('Excel exported successfully', 'success')
    } catch (error) {
      console.error('Error exporting Excel:', error)
      onShowToast?.('Error exporting Excel', 'error')
    }
  }

  if (loading) {
    return (
      <div className="cor-log cor-log-loading">
        <Loader2 size={24} className="spin" />
        <span>Loading COR Log...</span>
      </div>
    )
  }

  // Helper to render a section table
  const renderSectionTable = (entries, showHeader = true) => (
    <table className="cor-log-table">
      {showHeader && (
        <thead>
          <tr>
            <th className="col-log-num">Log #</th>
            <th className="col-date-sent">Date Sent</th>
            <th className="col-ce-num">CE #</th>
            <th className="col-description">Description</th>
            <th className="col-amount">Amount</th>
            <th className="col-status">Status</th>
            <th className="col-comments">Comments</th>
            <th className="col-actions">Actions</th>
          </tr>
        </thead>
      )}
      <tbody>
        {entries.map(entry => (
          <CORLogRow
            key={entry.id}
            entry={entry}
            isEditing={editingId === entry.id}
            isSaving={savingId === entry.id}
            onEdit={() => setEditingId(entry.id)}
            onSave={(updates) => handleSave(entry.id, updates, entry.changeOrder.id)}
            onCancel={() => setEditingId(null)}
            statusDisplay={STATUS_DISPLAY}
          />
        ))}
      </tbody>
    </table>
  )

  return (
    <div className="cor-log cor-log-expanded">
      {/* Header */}
      <div className="cor-log-header">
        <div className="cor-log-title">
          <FileSpreadsheet size={20} />
          <h3>Change Order Log</h3>
          <span className="cor-log-count">{logEntries.length} entries</span>
        </div>
        <div className="cor-log-actions">
          <button
            className="btn btn-icon btn-ghost"
            onClick={handleRefresh}
            disabled={refreshing}
            title="Refresh"
          >
            <RefreshCw size={16} className={refreshing ? 'spin' : ''} />
          </button>
          <button className="btn btn-secondary btn-small" onClick={exportToExcel}>
            <FileSpreadsheet size={14} /> Excel
          </button>
          <button className="btn btn-secondary btn-small" onClick={exportToPDF}>
            <FileText size={14} /> PDF
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="cor-log-summary-cards">
        <div className="summary-card pending">
          <Clock size={18} />
          <div className="summary-card-content">
            <span className="summary-card-label">Pending</span>
            <span className="summary-card-count">{summary.pendingCount} CORs</span>
            <span className="summary-card-amount">{formatCurrency(summary.pendingTotal)}</span>
          </div>
        </div>
        <div className="summary-card approved">
          <CheckCircle size={18} />
          <div className="summary-card-content">
            <span className="summary-card-label">Approved</span>
            <span className="summary-card-count">{summary.approvedCount} CORs</span>
            <span className="summary-card-amount">{formatCurrency(summary.approvedTotal)}</span>
          </div>
        </div>
        <div className="summary-card void">
          <XCircle size={18} />
          <div className="summary-card-content">
            <span className="summary-card-label">Void</span>
            <span className="summary-card-count">{summary.voidCount} CORs</span>
            <span className="summary-card-amount">{formatCurrency(summary.voidTotal)}</span>
          </div>
        </div>
        <div className="summary-card total">
          <FileSpreadsheet size={18} />
          <div className="summary-card-content">
            <span className="summary-card-label">Total</span>
            <span className="summary-card-count">{summary.totalCORs} CORs</span>
            <span className="summary-card-amount">{formatCurrency(summary.grandTotal)}</span>
          </div>
        </div>
      </div>

      {/* Content */}
      {logEntries.length === 0 ? (
        <div className="cor-log-empty">
          <FileSpreadsheet size={32} />
          <p>No change orders in log</p>
          <span>CORs will appear here as they are created</span>
        </div>
      ) : (
        <div className="cor-log-sections">
          {/* Pending Section */}
          {groupedEntries.pending.length > 0 && (
            <div className="cor-log-section pending">
              <div className="cor-log-section-header">
                <Clock size={16} />
                <h4>Pending Change Orders</h4>
                <span className="section-count">{groupedEntries.pending.length}</span>
                <span className="section-total">{formatCurrency(summary.pendingTotal)}</span>
              </div>
              <div className="cor-log-table-wrapper">
                {renderSectionTable(groupedEntries.pending)}
              </div>
            </div>
          )}

          {/* Approved Section */}
          {groupedEntries.approved.length > 0 && (
            <div className="cor-log-section approved">
              <div className="cor-log-section-header">
                <CheckCircle size={16} />
                <h4>Approved Change Orders</h4>
                <span className="section-count">{groupedEntries.approved.length}</span>
                <span className="section-total">{formatCurrency(summary.approvedTotal)}</span>
              </div>
              <div className="cor-log-table-wrapper">
                {renderSectionTable(groupedEntries.approved)}
              </div>
            </div>
          )}

          {/* Void Section */}
          {groupedEntries.voided.length > 0 && (
            <div className="cor-log-section void">
              <div className="cor-log-section-header">
                <XCircle size={16} />
                <h4>Void Change Orders</h4>
                <span className="section-count">{groupedEntries.voided.length}</span>
                <span className="section-total">{formatCurrency(summary.voidTotal)}</span>
              </div>
              <div className="cor-log-table-wrapper">
                {renderSectionTable(groupedEntries.voided)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
