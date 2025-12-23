import { useState, useEffect } from 'react'
import { db } from '../lib/supabase'
import { useBranding } from '../lib/BrandingContext'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// Helper to convert hex color to RGB array for jsPDF
const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result ? [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16)
  ] : [30, 41, 59] // Default dark slate
}

// Helper to load image as base64 for PDF
const loadImageAsBase64 = (url) => {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => resolve(null)
    img.src = url
  })
}

export default function TMList({ project, company, onShowToast }) {
  const { branding } = useBranding()
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [expandedTicket, setExpandedTicket] = useState(null)
  const [selectedTickets, setSelectedTickets] = useState(new Set())

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
    return ticket.t_and_m_workers.reduce((sum, w) => {
      const regHours = parseFloat(w.hours) || 0
      const otHours = parseFloat(w.overtime_hours) || 0
      return sum + regHours + otHours
    }, 0)
  }

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  // Selection helpers
  const toggleTicketSelection = (ticketId, e) => {
    e.stopPropagation()
    setSelectedTickets(prev => {
      const next = new Set(prev)
      if (next.has(ticketId)) {
        next.delete(ticketId)
      } else {
        next.add(ticketId)
      }
      return next
    })
  }

  const toggleSelectAll = () => {
    const currentFiltered = filter === 'all' ? tickets : tickets.filter(t => t.status === filter)
    const allSelected = currentFiltered.every(t => selectedTickets.has(t.id))
    if (allSelected) {
      setSelectedTickets(new Set())
    } else {
      setSelectedTickets(new Set(currentFiltered.map(t => t.id)))
    }
  }

  const clearSelection = () => {
    setSelectedTickets(new Set())
  }

  // Get tickets to export (selected or all filtered)
  const getExportTickets = () => {
    const filtered = filter === 'all' ? tickets : tickets.filter(t => t.status === filter)
    if (selectedTickets.size > 0) {
      return filtered.filter(t => selectedTickets.has(t.id))
    }
    return filtered
  }

  // Export to Excel
  const exportToExcel = () => {
    const exportTickets = getExportTickets()
    
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
          const regHours = parseFloat(worker.hours) || 0
          const otHours = parseFloat(worker.overtime_hours) || 0
          workersData.push({
            'Date': ticketDate,
            'Status': ticketStatus,
            'Worker Name': worker.name,
            'Role': worker.role || 'Laborer',
            'Regular Hours': regHours,
            'OT Hours': otHours,
            'Total Hours': regHours + otHours
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

  // Export to PDF - Professional format with company branding
  const exportToPDF = async () => {
    const exportTickets = getExportTickets()

    if (exportTickets.length === 0) {
      onShowToast('No tickets to export', 'error')
      return
    }

    onShowToast('Generating PDF...', 'info')

    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const margin = 20
    let yPos = margin

    // Get company colors from branding
    const primaryColor = hexToRgb(branding?.primary_color || '#3B82F6')
    const secondaryColor = hexToRgb(branding?.secondary_color || '#1E40AF')

    // Company Header with branded colors
    doc.setFillColor(...primaryColor)
    doc.rect(0, 0, pageWidth, 45, 'F')

    // Add accent stripe
    doc.setFillColor(...secondaryColor)
    doc.rect(0, 42, pageWidth, 3, 'F')

    // Add company logo if available
    let logoOffset = margin
    if (branding?.logo_url) {
      try {
        const logoBase64 = await loadImageAsBase64(branding.logo_url)
        if (logoBase64) {
          // Add logo (max height 30px, maintain aspect ratio)
          const logoHeight = 30
          const logoWidth = 30 // Square assumption, will be adjusted by aspect ratio
          doc.addImage(logoBase64, 'PNG', margin, 7, logoWidth, logoHeight)
          logoOffset = margin + logoWidth + 10
        }
      } catch (e) {
        console.error('Error adding logo:', e)
      }
    }

    doc.setTextColor(255, 255, 255)
    doc.setFontSize(22)
    doc.setFont('helvetica', 'bold')
    doc.text(company?.name || 'Company Name', logoOffset, 20)

    // Add company tagline/subtitle
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text('TIME & MATERIALS REPORT', logoOffset, 30)

    // Right side info
    doc.setFontSize(9)
    doc.text(`Report Date: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`, pageWidth - margin, 18, { align: 'right' })
    if (project.job_number) {
      doc.text(`Job #: ${project.job_number}`, pageWidth - margin, 26, { align: 'right' })
    }
    doc.text(`Status: ${filter.charAt(0).toUpperCase() + filter.slice(1)}`, pageWidth - margin, 34, { align: 'right' })

    yPos = 55

    // Project Info Box
    doc.setFillColor(248, 250, 252) // Light gray
    doc.rect(margin, yPos - 5, pageWidth - (margin * 2), 30, 'F')
    doc.setDrawColor(...primaryColor)
    doc.setLineWidth(0.5)
    doc.rect(margin, yPos - 5, pageWidth - (margin * 2), 30, 'S')

    doc.setTextColor(...primaryColor)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text(`Project: ${project.name}`, margin + 5, yPos + 7)

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(51, 65, 85)

    // Date range
    const dates = exportTickets.map(t => new Date(t.work_date)).sort((a, b) => a - b)
    const startDate = dates[0]?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    const endDate = dates[dates.length - 1]?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    doc.text(`Date Range: ${startDate} - ${endDate}`, margin + 5, yPos + 17)
    doc.text(`Total Tickets: ${exportTickets.length}`, pageWidth - margin - 5, yPos + 7, { align: 'right' })

    yPos += 40

    // Summary Section
    const grandTotalHours = exportTickets.reduce((sum, t) => sum + calculateTotalHours(t), 0)
    const grandTotalMaterials = exportTickets.reduce((sum, t) => sum + calculateTicketTotal(t), 0)
    const totalWorkers = new Set(exportTickets.flatMap(t => t.t_and_m_workers?.map(w => w.name) || [])).size

    doc.setTextColor(...primaryColor)
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('SUMMARY', margin, yPos)
    yPos += 8

    // Summary boxes with brand colors
    const boxWidth = (pageWidth - margin * 2 - 20) / 3
    const summaryBoxData = [
      { label: 'Total Labor Hours', value: grandTotalHours.toFixed(1) },
      { label: 'Unique Workers', value: totalWorkers.toString() },
      { label: 'Materials Cost', value: `$${grandTotalMaterials.toFixed(2)}` }
    ]

    // Create lighter version of primary color for box backgrounds
    const lightPrimary = primaryColor.map(c => Math.min(255, c + 180))

    summaryBoxData.forEach((item, index) => {
      const boxX = margin + (index * (boxWidth + 10))
      doc.setFillColor(...lightPrimary)
      doc.rect(boxX, yPos, boxWidth, 25, 'F')
      doc.setDrawColor(...primaryColor)
      doc.setLineWidth(0.5)
      doc.rect(boxX, yPos, boxWidth, 25, 'S')

      doc.setTextColor(...primaryColor)
      doc.setFontSize(16)
      doc.setFont('helvetica', 'bold')
      doc.text(item.value, boxX + boxWidth / 2, yPos + 12, { align: 'center' })

      doc.setTextColor(100, 116, 139)
      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      doc.text(item.label, boxX + boxWidth / 2, yPos + 20, { align: 'center' })
    })

    yPos += 35

    // Collect workers by type
    const supervisionData = []
    const operatorsData = []
    const laborersData = []
    let supervisionRegHours = 0, supervisionOTHours = 0
    let operatorsRegHours = 0, operatorsOTHours = 0
    let laborersRegHours = 0, laborersOTHours = 0

    exportTickets.forEach(ticket => {
      if (ticket.t_and_m_workers) {
        ticket.t_and_m_workers.forEach(worker => {
          const regHrs = parseFloat(worker.hours) || 0
          const otHrs = parseFloat(worker.overtime_hours) || 0
          const role = worker.role || 'Laborer'
          const rowData = [
            formatDate(ticket.work_date),
            worker.name,
            regHrs.toString(),
            otHrs > 0 ? otHrs.toString() : '-',
            (regHrs + otHrs).toString()
          ]

          if (role === 'Foreman' || role === 'Superintendent') {
            supervisionData.push(rowData)
            supervisionRegHours += regHrs
            supervisionOTHours += otHrs
          } else if (role === 'Operator') {
            operatorsData.push(rowData)
            operatorsRegHours += regHrs
            operatorsOTHours += otHrs
          } else {
            laborersData.push(rowData)
            laborersRegHours += regHrs
            laborersOTHours += otHrs
          }
        })
      }
    })

    // Helper function to render a labor table
    const renderLaborTable = (title, data, regHours, otHours) => {
      if (data.length === 0) return

      // Check if we need a new page
      if (yPos > pageHeight - 80) {
        doc.addPage()
        yPos = margin
      }

      doc.setTextColor(...primaryColor)
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.text(title, margin, yPos)
      yPos += 5

      autoTable(doc, {
        startY: yPos,
        head: [['Date', 'Name', 'Reg Hrs', 'OT Hrs', 'Total']],
        body: data,
        margin: { left: margin, right: margin },
        headStyles: {
          fillColor: primaryColor,
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 9
        },
        bodyStyles: {
          fontSize: 9,
          textColor: [51, 65, 85]
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252]
        },
        columnStyles: {
          0: { cellWidth: 30 },
          2: { halign: 'center', cellWidth: 22 },
          3: { halign: 'center', cellWidth: 22 },
          4: { halign: 'center', cellWidth: 22 }
        },
        foot: [[
          '', 'SUBTOTAL:', regHours.toString(), otHours > 0 ? otHours.toString() : '-', (regHours + otHours).toString()
        ]],
        footStyles: {
          fillColor: secondaryColor,
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 9
        }
      })

      yPos = doc.lastAutoTable.finalY + 10
    }

    // Render each labor category
    if (supervisionData.length > 0 || operatorsData.length > 0 || laborersData.length > 0) {
      doc.setTextColor(...primaryColor)
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.text('LABOR', margin, yPos)
      yPos += 8

      renderLaborTable('SUPERVISION', supervisionData, supervisionRegHours, supervisionOTHours)
      renderLaborTable('OPERATORS', operatorsData, operatorsRegHours, operatorsOTHours)
      renderLaborTable('LABORERS', laborersData, laborersRegHours, laborersOTHours)

      // Grand total for all labor
      const totalRegHours = supervisionRegHours + operatorsRegHours + laborersRegHours
      const totalOTHours = supervisionOTHours + operatorsOTHours + laborersOTHours

      doc.setFillColor(...primaryColor)
      doc.rect(margin, yPos, pageWidth - margin * 2, 12, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.text('LABOR TOTAL:', margin + 5, yPos + 8)
      doc.text(`${totalRegHours} Reg + ${totalOTHours} OT = ${totalRegHours + totalOTHours} Hours`, pageWidth - margin - 5, yPos + 8, { align: 'right' })

      yPos += 20
    }

    // Check if we need a new page
    if (yPos > pageHeight - 100) {
      doc.addPage()
      yPos = margin
    }

    // Collect materials by category
    const categoryData = {}
    const categoryTotals = {}
    const categoryOrder = ['Containment', 'PPE', 'Disposal', 'Equipment', 'Other']

    exportTickets.forEach(ticket => {
      if (ticket.t_and_m_items) {
        ticket.t_and_m_items.forEach(item => {
          const itemName = item.custom_name || item.materials_equipment?.name || 'Unknown'
          const category = item.custom_category || item.materials_equipment?.category || 'Other'
          const unit = item.materials_equipment?.unit || 'each'
          const costPer = item.materials_equipment?.cost_per_unit || 0
          const total = item.quantity * costPer

          if (!categoryData[category]) {
            categoryData[category] = []
            categoryTotals[category] = 0
          }

          categoryData[category].push([
            formatDate(ticket.work_date),
            itemName,
            item.quantity.toString(),
            unit,
            `$${costPer.toFixed(2)}`,
            `$${total.toFixed(2)}`
          ])
          categoryTotals[category] += total
        })
      }
    })

    // Helper function to render a materials table for a category
    const renderMaterialsTable = (category, data, subtotal) => {
      if (!data || data.length === 0) return

      // Check if we need a new page
      if (yPos > pageHeight - 80) {
        doc.addPage()
        yPos = margin
      }

      doc.setTextColor(...primaryColor)
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.text(category.toUpperCase(), margin, yPos)
      yPos += 5

      autoTable(doc, {
        startY: yPos,
        head: [['Date', 'Item', 'Qty', 'Unit', 'Rate', 'Total']],
        body: data,
        margin: { left: margin, right: margin },
        headStyles: {
          fillColor: primaryColor,
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 9
        },
        bodyStyles: {
          fontSize: 9,
          textColor: [51, 65, 85]
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252]
        },
        columnStyles: {
          2: { halign: 'center', cellWidth: 20 },
          3: { halign: 'center', cellWidth: 25 },
          4: { halign: 'right', cellWidth: 25 },
          5: { halign: 'right', cellWidth: 30 }
        },
        foot: [[
          '', '', '', '', 'Subtotal:', `$${subtotal.toFixed(2)}`
        ]],
        footStyles: {
          fillColor: secondaryColor,
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 9
        }
      })

      yPos = doc.lastAutoTable.finalY + 10
    }

    // Render each category
    const hasItems = Object.keys(categoryData).length > 0

    if (hasItems) {
      doc.setTextColor(...primaryColor)
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.text('MATERIALS & EQUIPMENT', margin, yPos)
      yPos += 8

      // Render in order
      categoryOrder.forEach(cat => {
        if (categoryData[cat]) {
          renderMaterialsTable(cat, categoryData[cat], categoryTotals[cat])
        }
      })

      // Render any other categories not in order
      Object.keys(categoryData).forEach(cat => {
        if (!categoryOrder.includes(cat)) {
          renderMaterialsTable(cat, categoryData[cat], categoryTotals[cat])
        }
      })

      // Grand total for all materials
      doc.setFillColor(...primaryColor)
      doc.rect(margin, yPos, pageWidth - margin * 2, 12, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.text('MATERIALS TOTAL:', margin + 5, yPos + 8)
      doc.text(`$${grandTotalMaterials.toFixed(2)}`, pageWidth - margin - 5, yPos + 8, { align: 'right' })

      yPos += 20
    }

    // Check if we need a new page for signature section
    if (yPos > pageHeight - 80) {
      doc.addPage()
      yPos = margin
    }

    // Authorization Signature Section
    yPos += 10
    doc.setDrawColor(...primaryColor)
    doc.setLineWidth(1)
    doc.line(margin, yPos, pageWidth - margin, yPos)
    yPos += 15

    doc.setTextColor(...primaryColor)
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('AUTHORIZATION', margin, yPos)
    yPos += 10

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(71, 85, 105)
    doc.text('I hereby authorize the above time and materials charges as accurate and approved for billing.', margin, yPos)
    yPos += 25

    // Signature lines
    const sigLineWidth = (pageWidth - margin * 2 - 30) / 2

    // Left signature block
    doc.setDrawColor(...secondaryColor)
    doc.setLineWidth(0.5)
    doc.line(margin, yPos + 20, margin + sigLineWidth, yPos + 20)
    doc.setFontSize(9)
    doc.setTextColor(100, 116, 139)
    doc.text('Authorized Signature (GC / Client)', margin, yPos + 28)
    doc.text('Date: ____________________', margin, yPos + 38)

    // Right signature block
    doc.line(margin + sigLineWidth + 30, yPos + 20, pageWidth - margin, yPos + 20)
    doc.text('Print Name', margin + sigLineWidth + 30, yPos + 28)
    doc.text('Title: ____________________', margin + sigLineWidth + 30, yPos + 38)

    // Add page numbers to all pages
    const totalPages = doc.internal.getNumberOfPages()
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i)
      const footerY = pageHeight - 15
      doc.setFontSize(8)
      doc.setTextColor(148, 163, 184)
      doc.text(`${company?.name || 'Company'} - T&M Report - ${project.name}`, margin, footerY)
      doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, footerY, { align: 'right' })
    }

    // Download
    const fileName = `${project.name}_TM_Report_${new Date().toISOString().split('T')[0]}.pdf`
    doc.save(fileName)
    onShowToast('PDF exported!', 'success')
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

  // Check if all filtered tickets are selected
  const allFilteredSelected = filteredTickets.length > 0 && filteredTickets.every(t => selectedTickets.has(t.id))
  const someSelected = selectedTickets.size > 0

  return (
    <div className="tm-list">
      <div className="tm-list-header">
        <div className="tm-list-title">
          <h3>T&M Tickets</h3>
          <div className="tm-export-buttons">
            {someSelected && (
              <button className="btn btn-ghost btn-small" onClick={clearSelection}>
                Clear ({selectedTickets.size})
              </button>
            )}
            <button className="btn btn-secondary btn-small" onClick={exportToExcel}>
              Excel {someSelected ? `(${selectedTickets.size})` : ''}
            </button>
            <button className="btn btn-primary btn-small" onClick={exportToPDF}>
              PDF {someSelected ? `(${selectedTickets.size})` : ''}
            </button>
          </div>
        </div>

        <div className="tm-filter-tabs">
          {['all', 'pending', 'approved', 'billed', 'rejected'].map(status => (
            <button
              key={status}
              className={`tm-filter-tab ${filter === status ? 'active' : ''}`}
              onClick={() => { setFilter(status); clearSelection(); }}
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
          {/* Select All Row */}
          <div className="tm-select-all-row">
            <label className="tm-checkbox-label" onClick={toggleSelectAll}>
              <input
                type="checkbox"
                checked={allFilteredSelected}
                onChange={toggleSelectAll}
                className="tm-checkbox"
              />
              <span>Select All ({filteredTickets.length})</span>
            </label>
          </div>

          {filteredTickets.map(ticket => (
            <div key={ticket.id} className={`tm-ticket-card ${ticket.status} ${selectedTickets.has(ticket.id) ? 'selected' : ''}`}>
              <div
                className="tm-ticket-header"
                onClick={() => setExpandedTicket(expandedTicket === ticket.id ? null : ticket.id)}
              >
                <input
                  type="checkbox"
                  checked={selectedTickets.has(ticket.id)}
                  onChange={(e) => toggleTicketSelection(ticket.id, e)}
                  onClick={(e) => e.stopPropagation()}
                  className="tm-checkbox"
                />
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
                            <span>
                              {worker.hours} hrs
                              {parseFloat(worker.overtime_hours) > 0 && (
                                <span className="tm-ot-badge"> +{worker.overtime_hours} OT</span>
                              )}
                            </span>
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
