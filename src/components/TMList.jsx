import { useState, useEffect } from 'react'
import { db } from '../lib/supabase'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import 'jspdf-autotable'

export default function TMList({ project, onShowToast }) {
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [expandedTicket, setExpandedTicket] = useState(null)

  useEffect(() => {
    loadTickets()
  }, [project.id])

  const loadTickets = async () => {
    try {
      const data = await db.getTMTickets(project.id)
      setTickets(data)
    } catch (error) {
      console.error('Error loading tickets:', error)
      onShowToast('Error loading T&M tickets', 'error')
    } finally {
      setLoading(false)
    }
  }

  const updateStatus = async (ticketId, newStatus) => {
    try {
      await db.updateTMTicketStatus(ticketId, newStatus)
      setTickets(tickets.map(t => 
        t.id === ticketId ? { ...t, status: newStatus } : t
      ))
      onShowToast(`Ticket ${newStatus}`, 'success')
    } catch (error) {
      console.error('Error updating status:', error)
      onShowToast('Error updating status', 'error')
    }
  }

  const deleteTicket = async (ticketId) => {
    if (!confirm('Delete this T&M ticket?')) return
    try {
      await db.deleteTMTicket(ticketId)
      setTickets(tickets.filter(t => t.id !== ticketId))
      onShowToast('Ticket deleted', 'success')
    } catch (error) {
      console.error('Error deleting ticket:', error)
      onShowToast('Error deleting ticket', 'error')
    }
  }

  const calculateTicketTotal = (ticket) => {
    let total = 0
    if (ticket.t_and_m_items) {
      ticket.t_and_m_items.forEach(item => {
        if (item.materials_equipment?.cost_per_unit) {
          total += item.quantity * item.materials_equipment.cost_per_unit
        }
      })
    }
    return total
  }

  const calculateTotalHours = (ticket) => {
    if (!ticket.t_and_m_workers) return 0
    return ticket.t_and_m_workers.reduce((sum, w) => sum + parseFloat(w.hours), 0)
  }

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  // Export to Excel
  const exportToExcel = () => {
    const exportTickets = filter === 'all' ? tickets : tickets.filter(t => t.status === filter)
    
    if (exportTickets.length === 0) {
      onShowToast('No tickets to export', 'error')
      return
    }

    // Create workers sheet
    const workersData = []
    // Create items sheet
    const itemsData = []
    // Create summary sheet
    const summaryData = []

    exportTickets.forEach(ticket => {
      const ticketDate = formatDate(ticket.work_date)
      const ticketStatus = ticket.status
      
      // Workers
      if (ticket.t_and_m_workers) {
        ticket.t_and_m_workers.forEach(worker => {
          workersData.push({
            'Date': ticketDate,
            'Status': ticketStatus,
            'Worker Name': worker.name,
            'Hours': worker.hours
          })
        })
      }
      
      // Items
      if (ticket.t_and_m_items) {
        ticket.t_and_m_items.forEach(item => {
          const itemName = item.custom_name || item.materials_equipment?.name || 'Unknown'
          const category = item.custom_category || item.materials_equipment?.category || 'Unknown'
          const unit = item.materials_equipment?.unit || 'each'
          const costPer = item.materials_equipment?.cost_per_unit || 0
          const total = item.quantity * costPer
          
          itemsData.push({
            'Date': ticketDate,
            'Status': ticketStatus,
            'Category': category,
            'Item': itemName,
            'Quantity': item.quantity,
            'Unit': unit,
            'Cost/Unit': costPer,
            'Total': total
          })
        })
      }
      
      // Summary
      summaryData.push({
        'Date': ticketDate,
        'Status': ticketStatus,
        'Workers': ticket.t_and_m_workers?.length || 0,
        'Total Hours': calculateTotalHours(ticket),
        'Items': ticket.t_and_m_items?.length || 0,
        'Materials Cost': calculateTicketTotal(ticket),
        'Notes': ticket.notes || ''
      })
    })

    // Create workbook
    const wb = XLSX.utils.book_new()
    
    // Add sheets
    const summarySheet = XLSX.utils.json_to_sheet(summaryData)
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary')
    
    if (workersData.length > 0) {
      const workersSheet = XLSX.utils.json_to_sheet(workersData)
      XLSX.utils.book_append_sheet(wb, workersSheet, 'Workers')
    }
    
    if (itemsData.length > 0) {
      const itemsSheet = XLSX.utils.json_to_sheet(itemsData)
      XLSX.utils.book_append_sheet(wb, itemsSheet, 'Materials & Equipment')
    }
    
    // Download
    const fileName = `${project.name}_TM_${new Date().toISOString().split('T')[0]}.xlsx`
    XLSX.writeFile(wb, fileName)
    onShowToast('Export downloaded!', 'success')
  }

  // Export to PDF
  const exportToPDF = async () => {
    const exportTickets = filter === 'all' ? tickets : tickets.filter(t => t.status === filter)

    if (exportTickets.length === 0) {
      onShowToast('No tickets to export', 'error')
      return
    }

    // Get company info
    let companyName = 'Company Name'
    try {
      const companyData = await db.getCompany(project.company_id)
      if (companyData) companyName = companyData.name
    } catch (error) {
      console.error('Error fetching company:', error)
    }

    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.width
    let yPos = 20

    // Header - Company Name
    doc.setFontSize(20)
    doc.setFont('helvetica', 'bold')
    doc.text(companyName, pageWidth / 2, yPos, { align: 'center' })
    yPos += 10

    // Project Title
    doc.setFontSize(16)
    doc.setFont('helvetica', 'normal')
    doc.text(`Time & Materials Report`, pageWidth / 2, yPos, { align: 'center' })
    yPos += 8

    doc.setFontSize(12)
    doc.text(`Project: ${project.name}`, pageWidth / 2, yPos, { align: 'center' })
    yPos += 6

    if (project.job_number) {
      doc.setFontSize(10)
      doc.text(`Job #: ${project.job_number}`, pageWidth / 2, yPos, { align: 'center' })
      yPos += 6
    }

    doc.setFontSize(9)
    doc.setTextColor(100)
    doc.text(`Generated: ${formatDate(new Date().toISOString())}`, pageWidth / 2, yPos, { align: 'center' })
    yPos += 10
    doc.setTextColor(0)

    // Line separator
    doc.setDrawColor(200)
    doc.line(14, yPos, pageWidth - 14, yPos)
    yPos += 8

    // Summary totals
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text(`Total Tickets: ${exportTickets.length}`, 14, yPos)
    doc.text(`Total Hours: ${totalHours.toFixed(1)}`, pageWidth / 2, yPos, { align: 'center' })
    doc.text(`Materials Cost: $${totalCost.toFixed(2)}`, pageWidth - 14, yPos, { align: 'right' })
    yPos += 10

    // Tickets
    exportTickets.forEach((ticket, index) => {
      if (yPos > 250) {
        doc.addPage()
        yPos = 20
      }

      // Ticket header
      doc.setFillColor(240, 240, 245)
      doc.rect(14, yPos - 4, pageWidth - 28, 8, 'F')

      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.text(`${formatDate(ticket.work_date)}`, 16, yPos)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      const statusText = ticket.status.toUpperCase()
      const statusColor = ticket.status === 'approved' ? [34, 197, 94] :
                          ticket.status === 'billed' ? [59, 130, 246] :
                          ticket.status === 'rejected' ? [239, 68, 68] : [245, 158, 11]
      doc.setTextColor(...statusColor)
      doc.text(statusText, pageWidth - 16, yPos, { align: 'right' })
      doc.setTextColor(0)
      yPos += 10

      // Workers table
      if (ticket.t_and_m_workers && ticket.t_and_m_workers.length > 0) {
        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        doc.text('Labor:', 16, yPos)
        yPos += 2

        const workerRows = ticket.t_and_m_workers.map(w => [
          w.name,
          w.role || 'Laborer',
          `${w.hours} hrs`
        ])

        doc.autoTable({
          startY: yPos,
          head: [['Worker', 'Role', 'Hours']],
          body: workerRows,
          margin: { left: 18, right: 18 },
          theme: 'plain',
          styles: { fontSize: 9, cellPadding: 2 },
          headStyles: { fillColor: [248, 250, 252], textColor: [71, 85, 105], fontStyle: 'bold' },
        })
        yPos = doc.lastAutoTable.finalY + 6
      }

      // Materials/Equipment table
      if (ticket.t_and_m_items && ticket.t_and_m_items.length > 0) {
        if (yPos > 220) {
          doc.addPage()
          yPos = 20
        }

        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        doc.text('Materials & Equipment:', 16, yPos)
        yPos += 2

        const itemRows = ticket.t_and_m_items.map(item => {
          const itemName = item.custom_name || item.materials_equipment?.name || 'Unknown'
          const unit = item.materials_equipment?.unit || 'each'
          const costPer = item.materials_equipment?.cost_per_unit || 0
          const total = item.quantity * costPer

          return [
            itemName,
            `${item.quantity} ${unit}`,
            costPer > 0 ? `$${costPer.toFixed(2)}` : '-',
            costPer > 0 ? `$${total.toFixed(2)}` : '-'
          ]
        })

        doc.autoTable({
          startY: yPos,
          head: [['Item', 'Quantity', 'Unit Cost', 'Total']],
          body: itemRows,
          margin: { left: 18, right: 18 },
          theme: 'plain',
          styles: { fontSize: 9, cellPadding: 2 },
          headStyles: { fillColor: [248, 250, 252], textColor: [71, 85, 105], fontStyle: 'bold' },
        })
        yPos = doc.lastAutoTable.finalY + 6
      }

      // Notes
      if (ticket.notes) {
        if (yPos > 250) {
          doc.addPage()
          yPos = 20
        }

        doc.setFontSize(9)
        doc.setFont('helvetica', 'italic')
        doc.setTextColor(100)
        doc.text(`Notes: ${ticket.notes}`, 18, yPos, { maxWidth: pageWidth - 36 })
        doc.setTextColor(0)
        yPos += 10
      }

      yPos += 4
    })

    // Add signature section on last page
    if (yPos > 220) {
      doc.addPage()
      yPos = 20
    }

    yPos += 10
    doc.setDrawColor(200)
    doc.line(14, yPos, pageWidth - 14, yPos)
    yPos += 10

    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('Authorized Signatures', 14, yPos)
    yPos += 12

    // Two signature boxes side by side
    const boxWidth = (pageWidth - 40) / 2

    // Client signature
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text('Client/General Contractor:', 14, yPos)
    yPos += 2
    doc.line(14, yPos + 8, 14 + boxWidth, yPos + 8)
    doc.setFontSize(8)
    doc.setTextColor(150)
    doc.text('Signature', 14, yPos + 12)
    doc.text('Date: ________________', 14 + boxWidth - 50, yPos + 12)
    doc.setTextColor(0)

    // Company signature
    doc.setFontSize(10)
    doc.text(`${companyName} Representative:`, pageWidth / 2 + 3, yPos)
    doc.line(pageWidth / 2 + 3, yPos + 8, pageWidth - 14, yPos + 8)
    doc.setFontSize(8)
    doc.setTextColor(150)
    doc.text('Signature', pageWidth / 2 + 3, yPos + 12)
    doc.text('Date: ________________', pageWidth - 14 - 50, yPos + 12, { align: 'left' })
    doc.setTextColor(0)

    // Save PDF
    const pdfFileName = `${project.name}_TM_${new Date().toISOString().split('T')[0]}.pdf`
    doc.save(pdfFileName)
    onShowToast('PDF exported successfully!', 'success')
  }

  const filteredTickets = filter === 'all'
    ? tickets
    : tickets.filter(t => t.status === filter)

  // Calculate totals for summary
  const totalHours = filteredTickets.reduce((sum, t) => sum + calculateTotalHours(t), 0)
  const totalCost = filteredTickets.reduce((sum, t) => sum + calculateTicketTotal(t), 0)

  if (loading) {
    return <div className="loading">Loading T&M tickets...</div>
  }

  return (
    <div className="tm-list">
      <div className="tm-list-header">
        <div className="tm-list-title">
          <h3>T&M Tickets</h3>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-secondary btn-small" onClick={exportToPDF}>
              📄 Export PDF
            </button>
            <button className="btn btn-secondary btn-small" onClick={exportToExcel}>
              📥 Export Excel
            </button>
          </div>
        </div>
        
        <div className="tm-filter-tabs">
          {['all', 'pending', 'approved', 'billed', 'rejected'].map(status => (
            <button
              key={status}
              className={`tm-filter-tab ${filter === status ? 'active' : ''}`}
              onClick={() => setFilter(status)}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
              <span className="tm-filter-count">
                {status === 'all' ? tickets.length : tickets.filter(t => t.status === status).length}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Summary Bar */}
      {filteredTickets.length > 0 && (
        <div className="tm-summary-bar">
          <div className="tm-summary-stat">
            <span className="tm-summary-label">Tickets</span>
            <span className="tm-summary-value">{filteredTickets.length}</span>
          </div>
          <div className="tm-summary-stat">
            <span className="tm-summary-label">Total Hours</span>
            <span className="tm-summary-value">{totalHours.toFixed(1)}</span>
          </div>
          <div className="tm-summary-stat">
            <span className="tm-summary-label">Materials Cost</span>
            <span className="tm-summary-value">${totalCost.toFixed(2)}</span>
          </div>
        </div>
      )}

      {filteredTickets.length === 0 ? (
        <div className="tm-empty-state">
          <p>No {filter === 'all' ? '' : filter} T&M tickets</p>
        </div>
      ) : (
        <div className="tm-tickets">
          {filteredTickets.map(ticket => (
            <div key={ticket.id} className={`tm-ticket-card ${ticket.status}`}>
              <div 
                className="tm-ticket-header"
                onClick={() => setExpandedTicket(expandedTicket === ticket.id ? null : ticket.id)}
              >
                <div className="tm-ticket-info">
                  <span className="tm-ticket-date">{formatDate(ticket.work_date)}</span>
                  <span className={`tm-ticket-status ${ticket.status}`}>{ticket.status}</span>
                </div>
                <div className="tm-ticket-summary">
                  <span className="tm-ticket-hours">{calculateTotalHours(ticket)} hrs</span>
                  <span className="tm-ticket-total">${calculateTicketTotal(ticket).toFixed(2)}</span>
                  <span className="tm-expand-arrow">{expandedTicket === ticket.id ? '▼' : '▶'}</span>
                </div>
              </div>

              {expandedTicket === ticket.id && (
                <div className="tm-ticket-details">
                  {ticket.t_and_m_workers?.length > 0 && (
                    <div className="tm-detail-section">
                      <h4>👷 Workers</h4>
                      <div className="tm-detail-list">
                        {ticket.t_and_m_workers.map(worker => (
                          <div key={worker.id} className="tm-detail-row">
                            <span>
                              {worker.role && worker.role !== 'Laborer' && (
                                <span className="tm-role-badge">{worker.role}</span>
                              )}
                              {worker.name}
                            </span>
                            <span>{worker.hours} hrs</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {ticket.t_and_m_items?.length > 0 && (
                    <div className="tm-detail-section">
                      <h4>🔧 Materials & Equipment</h4>
                      <div className="tm-detail-list">
                        {ticket.t_and_m_items.map(item => (
                          <div key={item.id} className="tm-detail-row">
                            <span>
                              {item.custom_name ? (
                                <><span className="tm-custom-badge">Custom</span> {item.custom_name}</>
                              ) : (
                                item.materials_equipment?.name
                              )}
                            </span>
                            <span className="tm-detail-qty">
                              {item.quantity} {item.materials_equipment?.unit || 'each'}
                              {item.materials_equipment?.cost_per_unit > 0 && (
                                <span className="tm-item-cost">
                                  ${(item.quantity * item.materials_equipment.cost_per_unit).toFixed(2)}
                                </span>
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {ticket.notes && (
                    <div className="tm-detail-section">
                      <h4>📝 Description</h4>
                      <p className="tm-notes-text">{ticket.notes}</p>
                    </div>
                  )}

                  {ticket.photos && ticket.photos.length > 0 && (
                    <div className="tm-detail-section">
                      <h4>📷 Photos ({ticket.photos.length})</h4>
                      <div className="tm-photos-grid">
                        {ticket.photos.map((photo, idx) => (
                          <a key={idx} href={photo} target="_blank" rel="noopener noreferrer" className="tm-photo-thumb">
                            <img src={photo} alt={`Photo ${idx + 1}`} />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="tm-ticket-actions">
                    {ticket.status === 'pending' && (
                      <>
                        <button 
                          className="btn btn-success btn-small"
                          onClick={(e) => { e.stopPropagation(); updateStatus(ticket.id, 'approved'); }}
                        >
                          ✓ Approve
                        </button>
                        <button 
                          className="btn btn-warning btn-small"
                          onClick={(e) => { e.stopPropagation(); updateStatus(ticket.id, 'rejected'); }}
                        >
                          ✗ Reject
                        </button>
                      </>
                    )}
                    {ticket.status === 'approved' && (
                      <button 
                        className="btn btn-primary btn-small"
                        onClick={(e) => { e.stopPropagation(); updateStatus(ticket.id, 'billed'); }}
                      >
                        💰 Mark Billed
                      </button>
                    )}
                    {ticket.status === 'rejected' && (
                      <button 
                        className="btn btn-secondary btn-small"
                        onClick={(e) => { e.stopPropagation(); updateStatus(ticket.id, 'pending'); }}
                      >
                        ↩ Restore
                      </button>
                    )}
                    <button 
                      className="btn btn-danger btn-small"
                      onClick={(e) => { e.stopPropagation(); deleteTicket(ticket.id); }}
                    >
                      🗑 Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
