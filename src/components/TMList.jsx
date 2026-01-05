import { useState, useEffect, useMemo } from 'react'
import { HardHat, FileText, Wrench, Camera, ChevronDown, ChevronRight, Calendar, Link, Lock, Link2, X, RefreshCw, AlertTriangle, CheckCircle } from 'lucide-react'
import { db } from '../lib/supabase'
import { useBranding } from '../lib/BrandingContext'
import SignatureLinkGenerator from './SignatureLinkGenerator'
import { TicketSkeleton, CountBadge } from './ui'
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

export default function TMList({
  project,
  company,
  onShowToast,
  compact = false,
  // Preview mode props
  previewMode = false,   // When true, shows current month tickets with "See All" button
  onViewAll              // Callback when "See All" is clicked
}) {
  const { branding } = useBranding()
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [expandedTicket, setExpandedTicket] = useState(null)
  const [selectedTickets, setSelectedTickets] = useState(new Set())

  // View mode state - in preview mode, we filter to current month
  const [viewMode, setViewMode] = useState('recent') // 'recent' | 'all'
  const [expandedMonths, setExpandedMonths] = useState(new Set())
  const [dateFilter, setDateFilter] = useState({ start: '', end: '' })

  // Change order approval modal state
  const [showChangeOrderModal, setShowChangeOrderModal] = useState(false)
  const [pendingApprovalTicket, setPendingApprovalTicket] = useState(null)
  const [changeOrderValue, setChangeOrderValue] = useState('')

  // Signature link modal state
  const [showSignatureLink, setShowSignatureLink] = useState(false)
  const [signatureLinkTicket, setSignatureLinkTicket] = useState(null)

  // COR association modal state
  const [showCorAssignModal, setShowCorAssignModal] = useState(false)
  const [pendingCorAssignTicket, setPendingCorAssignTicket] = useState(null)
  const [availableCors, setAvailableCors] = useState([])
  const [selectedCorForAssign, setSelectedCorForAssign] = useState('')
  const [loadingCors, setLoadingCors] = useState(false)

  // Track which tickets are locked (linked to approved COR)
  const [lockedTickets, setLockedTickets] = useState({})

  // Track failed COR imports for retry UI
  const [failedImports, setFailedImports] = useState({})
  const [retryingImport, setRetryingImport] = useState(null)

  useEffect(() => {
    loadTickets()

    // Subscribe to real-time updates for T&M tickets
    const subscription = db.subscribeToTMTickets?.(project.id, () => {
      loadTickets()
    })

    return () => {
      if (subscription) db.unsubscribe?.(subscription)
    }
  }, [project.id])

  const loadTickets = async () => {
    try {
      const data = await db.getTMTickets(project.id)
      setTickets(data)

      // Check editability for tickets with COR assignments
      const ticketsWithCOR = data.filter(t => t.assigned_cor_id)
      if (ticketsWithCOR.length > 0) {
        const lockResults = {}
        const importStatusResults = {}
        await Promise.all(ticketsWithCOR.map(async (ticket) => {
          const result = await db.isTicketEditable(ticket)
          if (!result.editable) {
            lockResults[ticket.id] = result
          }
          // Check import status for each ticket
          try {
            const importStatus = await db.getTicketImportStatus(ticket.id, ticket.assigned_cor_id)
            if (importStatus?.import_status === 'failed') {
              importStatusResults[ticket.id] = importStatus
            }
          } catch (e) {
            // Ignore - column may not exist yet
          }
        }))
        setLockedTickets(lockResults)
        setFailedImports(importStatusResults)
      }
    } catch (error) {
      console.error('Error loading tickets:', error)
      onShowToast('Error loading T&M tickets', 'error')
    } finally {
      setLoading(false)
    }
  }

  const updateStatus = async (ticketId, newStatus) => {
    // Check if ticket is locked due to approved COR
    if (lockedTickets[ticketId]) {
      onShowToast(lockedTickets[ticketId].reason || 'This ticket is locked (COR approved)', 'error')
      return
    }

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

  // Handle approval - approve directly (CE/PCO is informational only)
  const handleApprove = (ticket) => {
    // Check if ticket is locked due to approved COR
    if (lockedTickets[ticket.id]) {
      onShowToast(lockedTickets[ticket.id].reason || 'This ticket is locked (COR approved)', 'error')
      return
    }

    updateStatus(ticket.id, 'approved')
  }

  // Confirm approval with change order value
  const confirmChangeOrderApproval = async () => {
    if (!pendingApprovalTicket) return

    try {
      const value = parseFloat(changeOrderValue) || 0
      await db.approveTMTicket(pendingApprovalTicket.id, null, null, value)
      setTickets(tickets.map(t =>
        t.id === pendingApprovalTicket.id
          ? { ...t, status: 'approved', change_order_value: value }
          : t
      ))
      onShowToast(`Ticket approved with $${value.toLocaleString()} change order`, 'success')
      setShowChangeOrderModal(false)
      setPendingApprovalTicket(null)
      setChangeOrderValue('')
    } catch (error) {
      console.error('Error approving ticket:', error)
      onShowToast('Error approving ticket', 'error')
    }
  }

  const deleteTicket = async (ticketId) => {
    // Check if ticket is locked due to approved COR
    if (lockedTickets[ticketId]) {
      onShowToast(lockedTickets[ticketId].reason || 'This ticket is locked (COR approved)', 'error')
      return
    }

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

  // Open COR association modal
  const openCorAssignModal = async (ticket) => {
    setPendingCorAssignTicket(ticket)
    setSelectedCorForAssign(ticket.assigned_cor_id || '')
    setShowCorAssignModal(true)
    setLoadingCors(true)

    try {
      // Load CORs that can receive tickets (not billed/archived)
      const cors = await db.getAssignableCORs(project.id)
      setAvailableCors(cors || [])
    } catch (error) {
      console.error('Error loading CORs:', error)
      onShowToast('Error loading change orders', 'error')
    } finally {
      setLoadingCors(false)
    }
  }

  // Associate ticket with selected COR
  const handleAssignToCor = async () => {
    if (!pendingCorAssignTicket) return

    try {
      if (selectedCorForAssign) {
        // Associate with COR using atomic function (ticketId, corId)
        await db.assignTicketToCOR(pendingCorAssignTicket.id, selectedCorForAssign)
        const cor = availableCors.find(c => c.id === selectedCorForAssign)
        onShowToast(`Ticket linked to ${cor?.cor_number || 'COR'}`, 'success')
      } else if (pendingCorAssignTicket.assigned_cor_id) {
        // Remove association using atomic function (ticketId, corId)
        await db.unassignTicketFromCOR(pendingCorAssignTicket.id, pendingCorAssignTicket.assigned_cor_id)
        onShowToast('Ticket unlinked from COR', 'success')
      }

      // Refresh tickets
      loadTickets()
      setShowCorAssignModal(false)
      setPendingCorAssignTicket(null)
      setSelectedCorForAssign('')
    } catch (error) {
      console.error('Error updating COR association:', error)
      onShowToast('Error updating COR link', 'error')
    }
  }

  // Retry a failed COR import
  const handleRetryImport = async (ticket, e) => {
    e?.stopPropagation()
    if (!ticket.assigned_cor_id) return

    setRetryingImport(ticket.id)
    try {
      await db.importTicketDataToCOR(
        ticket.id,
        ticket.assigned_cor_id,
        company.id,
        project.work_type || 'demolition',
        project.job_type || 'standard'
      )
      onShowToast('COR data import successful!', 'success')
      // Clear the failed import state for this ticket
      setFailedImports(prev => {
        const next = { ...prev }
        delete next[ticket.id]
        return next
      })
      loadTickets()
    } catch (error) {
      console.error('Error retrying import:', error)
      onShowToast('Import retry failed. Please try again.', 'error')
    } finally {
      setRetryingImport(null)
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

    // Authorization Signature Section (Dual Signatures)
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
    yPos += 20

    // Helper to get first ticket's signature data (for single-ticket exports)
    // For multi-ticket exports, signatures would be per-ticket
    const firstTicket = ticketsToExport[0] || {}

    // Helper function to render a signature block
    const renderSignatureBlock = (startY, label, signatureData, signerName, signerTitle, signerCompany, signedDate) => {
      // Label
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.setTextColor(...primaryColor)
      doc.text(label, margin, startY)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(100, 116, 139)

      const sigLineY = startY + 18

      // Signature line
      doc.setDrawColor(...secondaryColor)
      doc.setLineWidth(0.5)
      doc.line(margin, sigLineY, margin + 70, sigLineY)
      doc.text('Signature', margin, sigLineY + 8)

      // Title/Company line
      doc.line(margin + 85, sigLineY, margin + 145, sigLineY)
      doc.text('Title / Company', margin + 85, sigLineY + 8)

      // Date line
      doc.line(pageWidth - margin - 40, sigLineY, pageWidth - margin, sigLineY)
      doc.text('Date', pageWidth - margin - 40, sigLineY + 8)

      // If signature exists, add it
      if (signatureData) {
        try {
          doc.addImage(signatureData, 'PNG', margin, sigLineY - 16, 60, 16)
          if (signerName) {
            doc.setFontSize(8)
            doc.text(signerName, margin, sigLineY + 15)
          }
          if (signerTitle || signerCompany) {
            const titleCompany = [signerTitle, signerCompany].filter(Boolean).join(' - ')
            doc.text(titleCompany, margin + 85, sigLineY - 5)
          }
          if (signedDate) {
            const formattedDate = new Date(signedDate).toLocaleDateString()
            doc.text(formattedDate, pageWidth - margin - 40, sigLineY - 5)
          }
        } catch (e) {
          console.error('Error adding signature to PDF:', e)
        }
      }

      return sigLineY + 25
    }

    // GC Signature (Signature 1)
    yPos = renderSignatureBlock(
      yPos,
      'GC AUTHORIZATION',
      firstTicket.gc_signature_data,
      firstTicket.gc_signature_name,
      firstTicket.gc_signature_title,
      firstTicket.gc_signature_company,
      firstTicket.gc_signature_date
    )

    yPos += 8

    // Client Signature (Signature 2)
    yPos = renderSignatureBlock(
      yPos,
      'CLIENT AUTHORIZATION',
      firstTicket.client_signature_data,
      firstTicket.client_signature_name,
      firstTicket.client_signature_title,
      firstTicket.client_signature_company,
      firstTicket.client_signature_date
    )

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

  // Filter tickets by status, view mode, and date range
  const filteredTickets = useMemo(() => {
    let filtered = filter === 'all'
      ? [...tickets]
      : tickets.filter(t => t.status === filter)

    // Apply date filter if set
    if (dateFilter.start) {
      const startDate = new Date(dateFilter.start)
      startDate.setHours(0, 0, 0, 0)
      filtered = filtered.filter(t => {
        const ticketDate = new Date(t.work_date)
        return ticketDate >= startDate
      })
    }
    if (dateFilter.end) {
      const endDate = new Date(dateFilter.end)
      endDate.setHours(23, 59, 59, 999)
      filtered = filtered.filter(t => {
        const ticketDate = new Date(t.work_date)
        return ticketDate <= endDate
      })
    }

    // In preview mode, show only current month's tickets
    if (previewMode) {
      const now = new Date()
      const currentMonth = now.getMonth()
      const currentYear = now.getFullYear()
      filtered = filtered.filter(t => {
        const ticketDate = new Date(t.work_date)
        return ticketDate.getMonth() === currentMonth && ticketDate.getFullYear() === currentYear
      })
    }
    // In recent mode (not preview), show only last 7 days
    else if (viewMode === 'recent') {
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
      sevenDaysAgo.setHours(0, 0, 0, 0)
      filtered = filtered.filter(t => {
        const ticketDate = new Date(t.work_date)
        return ticketDate >= sevenDaysAgo
      })
    }

    return filtered
  }, [tickets, filter, viewMode, dateFilter, previewMode])

  // Group tickets by month for 'all' view
  const ticketsByMonth = useMemo(() => {
    if (viewMode !== 'all') return null

    const groups = {}
    filteredTickets.forEach(ticket => {
      const date = new Date(ticket.work_date)
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      const monthLabel = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

      if (!groups[monthKey]) {
        groups[monthKey] = { label: monthLabel, tickets: [], hours: 0, cost: 0 }
      }
      groups[monthKey].tickets.push(ticket)
      groups[monthKey].hours += calculateTotalHours(ticket)
      groups[monthKey].cost += calculateTicketTotal(ticket)
    })

    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]))
  }, [filteredTickets, viewMode])

  // Auto-expand current month
  useEffect(() => {
    if (ticketsByMonth && ticketsByMonth.length > 0) {
      const currentMonthKey = ticketsByMonth[0][0]
      setExpandedMonths(new Set([currentMonthKey]))
    }
  }, [ticketsByMonth])

  const toggleMonthExpand = (monthKey) => {
    const newExpanded = new Set(expandedMonths)
    if (newExpanded.has(monthKey)) {
      newExpanded.delete(monthKey)
    } else {
      newExpanded.add(monthKey)
    }
    setExpandedMonths(newExpanded)
  }

  // Calculate totals for summary
  const totalHours = filteredTickets.reduce((sum, t) => sum + calculateTotalHours(t), 0)
  const totalCost = filteredTickets.reduce((sum, t) => sum + calculateTicketTotal(t), 0)
  const totalTicketsCount = filter === 'all' ? tickets.length : tickets.filter(t => t.status === filter).length

  if (loading) {
    return (
      <div className={`tm-list ${compact ? 'tm-list-compact' : ''}`}>
        <div className="tm-loading-skeletons">
          {[1, 2, 3].map(i => (
            <TicketSkeleton key={i} />
          ))}
        </div>
      </div>
    )
  }

  // Check if all filtered tickets are selected
  const allFilteredSelected = filteredTickets.length > 0 && filteredTickets.every(t => selectedTickets.has(t.id))
  const someSelected = selectedTickets.size > 0

  // Helper function to render a single ticket card
  const renderTicketCard = (ticket) => {
    const isLocked = !!lockedTickets[ticket.id]
    const lockInfo = lockedTickets[ticket.id]
    const hasFailedImport = !!failedImports[ticket.id]
    const isRetrying = retryingImport === ticket.id

    return (
    <div key={ticket.id} className={`tm-ticket-card hover-lift animate-fade-in-up ${ticket.status} ${selectedTickets.has(ticket.id) ? 'selected' : ''} ${isLocked ? 'locked' : ''}`}>
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
          {ticket.ce_pco_number && (
            <span className="tm-ce-badge">{ticket.ce_pco_number}</span>
          )}
          {/* Show COR link badge if assigned to a COR */}
          {ticket.assigned_cor_id && lockInfo?.lockedBy && (
            <span className={`tm-cor-badge ${isLocked ? 'locked' : ''}`} title={lockInfo.reason}>
              {isLocked && <Lock size={10} />}
              {lockInfo.lockedBy.cor_number}
            </span>
          )}
          {/* Show photo count badge */}
          {ticket.photos?.length > 0 && (
            <CountBadge
              count={ticket.photos.length}
              icon={Camera}
              size="small"
              variant="default"
            />
          )}
          {/* Show failed import warning badge */}
          {hasFailedImport && (
            <span className="tm-import-failed-badge" title="COR data import failed - retry needed">
              <AlertTriangle size={12} /> Import Failed
            </span>
          )}
          {/* Show client verified badge */}
          {ticket.client_signature_data && (
            <span className="tm-verified-badge" title={`Verified by ${ticket.client_signature_name || 'client'}${ticket.client_signature_date ? ` on ${formatDate(ticket.client_signature_date)}` : ''}`}>
              <CheckCircle size={12} /> Verified
            </span>
          )}
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
              <h4><HardHat size={16} className="inline-icon" /> Workers</h4>
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
              <h4><Wrench size={16} className="inline-icon" /> Materials & Equipment</h4>
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
              <h4><FileText size={16} className="inline-icon" /> Description</h4>
              <p className="tm-notes-text">{ticket.notes}</p>
            </div>
          )}

          {ticket.photos && ticket.photos.length > 0 && (
            <div className="tm-detail-section">
              <h4><Camera size={16} className="inline-icon" /> Photos ({ticket.photos.length})</h4>
              <div className="tm-photos-grid">
                {ticket.photos.map((photo, idx) => (
                  <a key={idx} href={photo} target="_blank" rel="noopener noreferrer" className="tm-photo-thumb">
                    <img
                      src={photo}
                      alt={`Photo ${idx + 1}`}
                      onError={(e) => {
                        e.target.onerror = null
                        e.target.classList.add('photo-error')
                        e.target.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0OCIgaGVpZ2h0PSI0OCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiM5NGEzYjgiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cmVjdCB4PSIzIiB5PSIzIiB3aWR0aD0iMTgiIGhlaWdodD0iMTgiIHJ4PSIyIiByeT0iMiIvPjxjaXJjbGUgY3g9IjguNSIgY3k9IjguNSIgcj0iMS41Ii8+PHBvbHlsaW5lIHBvaW50cz0iMjEgMTUgMTYgMTAgNSAyMSIvPjwvc3ZnPg=='
                        console.error('Failed to load photo:', photo)
                      }}
                    />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Show change order value if approved with CE/PCO */}
          {ticket.ce_pco_number && ticket.change_order_value > 0 && (
            <div className="tm-change-order-value">
              <span className="tm-co-label">Change Order Value:</span>
              <span className="tm-co-amount">${ticket.change_order_value.toLocaleString()}</span>
            </div>
          )}

          {/* Lock notice if ticket is locked */}
          {isLocked && (
            <div className="tm-lock-notice">
              <Lock size={14} />
              <span>{lockInfo?.reason || 'This ticket is locked (COR approved)'}</span>
            </div>
          )}

          <div className="tm-ticket-actions">
            {ticket.status === 'pending' && !isLocked && (
              <>
                <button
                  className="btn btn-success btn-small"
                  onClick={(e) => { e.stopPropagation(); handleApprove(ticket); }}
                >
                  Approve
                </button>
                <button
                  className="btn btn-warning btn-small"
                  onClick={(e) => { e.stopPropagation(); updateStatus(ticket.id, 'rejected'); }}
                >
                  Reject
                </button>
              </>
            )}
            {ticket.status === 'approved' && !isLocked && (
              <>
                <button
                  className="btn btn-primary btn-small"
                  onClick={(e) => { e.stopPropagation(); updateStatus(ticket.id, 'billed'); }}
                >
                  Mark Billed
                </button>
                <button
                  className="btn btn-secondary btn-small"
                  onClick={(e) => {
                    e.stopPropagation()
                    setSignatureLinkTicket(ticket)
                    setShowSignatureLink(true)
                  }}
                >
                  <Link size={14} /> Signature Link
                </button>
              </>
            )}
            {ticket.status === 'rejected' && !isLocked && (
              <button
                className="btn btn-secondary btn-small"
                onClick={(e) => { e.stopPropagation(); updateStatus(ticket.id, 'pending'); }}
              >
                Restore
              </button>
            )}
            {/* Link to COR button - show for any ticket not locked */}
            {!isLocked && (
              <button
                className={`btn btn-small ${ticket.assigned_cor_id ? 'btn-ghost' : 'btn-secondary'}`}
                onClick={(e) => { e.stopPropagation(); openCorAssignModal(ticket); }}
                title={ticket.assigned_cor_id ? 'Change COR link' : 'Link to Change Order'}
              >
                <Link2 size={14} /> {ticket.assigned_cor_id ? 'COR' : 'Link COR'}
              </button>
            )}
            {/* Retry import button - show when import failed */}
            {hasFailedImport && !isLocked && (
              <button
                className="btn btn-warning btn-small"
                onClick={(e) => handleRetryImport(ticket, e)}
                disabled={isRetrying}
                title="Retry syncing data to COR"
              >
                <RefreshCw size={14} className={isRetrying ? 'spin' : ''} /> {isRetrying ? 'Syncing...' : 'Retry Sync'}
              </button>
            )}
            {!isLocked && (
              <button
                className="btn btn-danger btn-small"
                onClick={(e) => { e.stopPropagation(); deleteTicket(ticket.id); }}
              >
                Delete
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
  }

  return (
    <div className={`tm-list ${compact ? 'tm-list-compact' : ''}`}>
      {!compact && (
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

        {/* View Mode Bar */}
        <div className="view-mode-bar">
          <div className="view-mode-tabs">
            <button
              className={`view-mode-tab ${viewMode === 'recent' ? 'active' : ''}`}
              onClick={() => { setViewMode('recent'); setDateFilter({ start: '', end: '' }); }}
            >
              Recent (7 days)
            </button>
            <button
              className={`view-mode-tab ${viewMode === 'all' ? 'active' : ''}`}
              onClick={() => setViewMode('all')}
            >
              All ({totalTicketsCount})
            </button>
          </div>

          {viewMode === 'all' && (
            <div className="date-filter">
              <Calendar size={16} />
              <input
                type="date"
                value={dateFilter.start}
                onChange={(e) => setDateFilter(prev => ({ ...prev, start: e.target.value }))}
                placeholder="Start date"
              />
              <span>to</span>
              <input
                type="date"
                value={dateFilter.end}
                onChange={(e) => setDateFilter(prev => ({ ...prev, end: e.target.value }))}
                placeholder="End date"
              />
              {(dateFilter.start || dateFilter.end) && (
                <button
                  className="btn btn-ghost btn-small"
                  onClick={() => setDateFilter({ start: '', end: '' })}
                >
                  Clear
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      )}

      {/* Summary Bar - hidden in compact mode */}
      {!compact && filteredTickets.length > 0 && (
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
          <p>No {filter === 'all' ? '' : filter} T&M tickets{viewMode === 'recent' ? ' in the last 7 days' : ''}</p>
          {viewMode === 'recent' && totalTicketsCount > 0 && (
            <button className="btn btn-secondary btn-small" onClick={() => setViewMode('all')}>
              View All Tickets
            </button>
          )}
        </div>
      ) : (
        <div className="tm-tickets stagger-children">
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

          {/* Render tickets - with month grouping in 'all' mode */}
          {viewMode === 'all' && ticketsByMonth ? (
            ticketsByMonth.map(([monthKey, monthData]) => (
              <div key={monthKey} className="month-group animate-fade-in">
                <div
                  className="month-header"
                  onClick={() => toggleMonthExpand(monthKey)}
                >
                  <div className="month-header-left">
                    {expandedMonths.has(monthKey) ? (
                      <ChevronDown size={18} />
                    ) : (
                      <ChevronRight size={18} />
                    )}
                    <span className="month-label">{monthData.label}</span>
                    <CountBadge count={monthData.tickets.length} label="tickets" size="small" />
                  </div>
                  <div className="month-header-right">
                    <span className="month-stat">{monthData.hours.toFixed(1)} hrs</span>
                    <span className="month-stat">${monthData.cost.toFixed(2)}</span>
                  </div>
                </div>
                {expandedMonths.has(monthKey) && (
                  <div className="month-tickets stagger-children">
                    {monthData.tickets.map(ticket => renderTicketCard(ticket))}
                  </div>
                )}
              </div>
            ))
          ) : (
            // Recent view - simple list
            filteredTickets.map(ticket => renderTicketCard(ticket))
          )}
        </div>
      )}

      {/* See All Footer - only in preview mode */}
      {previewMode && tickets.length > 0 && (
        <button className="tm-see-all-btn" onClick={onViewAll}>
          See all {tickets.length} T&M tickets
          <ChevronRight size={16} />
        </button>
      )}

      {/* Change Order Approval Modal */}
      {showChangeOrderModal && pendingApprovalTicket && (
        <div className="modal-overlay" onClick={() => setShowChangeOrderModal(false)}>
          <div className="modal change-order-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Approve Change Order Work</h3>
            <p className="modal-subtitle">
              This T&M ticket is associated with <strong>{pendingApprovalTicket.ce_pco_number}</strong>
            </p>

            <div className="form-group">
              <label>Change Order Value ($)</label>
              <input
                type="number"
                value={changeOrderValue}
                onChange={(e) => setChangeOrderValue(e.target.value)}
                placeholder="Enter the change order amount"
                autoFocus
              />
              <p className="form-help">
                This amount will be added to the project's total contract value.
              </p>
            </div>

            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setShowChangeOrderModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-success"
                onClick={confirmChangeOrderApproval}
              >
                Approve with ${parseFloat(changeOrderValue || 0).toLocaleString()}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Signature Link Generator Modal */}
      {showSignatureLink && signatureLinkTicket && (
        <SignatureLinkGenerator
          documentType="tm_ticket"
          documentId={signatureLinkTicket.id}
          companyId={company?.id}
          projectId={project?.id}
          documentTitle={`T&M Ticket - ${new Date(signatureLinkTicket.work_date).toLocaleDateString()}${signatureLinkTicket.ce_pco_number ? ` (${signatureLinkTicket.ce_pco_number})` : ''}`}
          onClose={() => {
            setShowSignatureLink(false)
            setSignatureLinkTicket(null)
          }}
          onShowToast={onShowToast}
        />
      )}

      {/* COR Association Modal */}
      {showCorAssignModal && pendingCorAssignTicket && (
        <div className="modal-overlay" onClick={() => setShowCorAssignModal(false)}>
          <div className="modal cor-assign-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Link Ticket to Change Order</h3>
              <button className="close-btn" onClick={() => setShowCorAssignModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              <p className="modal-subtitle">
                Ticket: <strong>{new Date(pendingCorAssignTicket.work_date).toLocaleDateString()}</strong>
                {pendingCorAssignTicket.ce_pco_number && ` (${pendingCorAssignTicket.ce_pco_number})`}
              </p>

              {loadingCors ? (
                <div className="loading">Loading change orders...</div>
              ) : availableCors.length === 0 ? (
                <div className="empty-state">
                  <p>No change orders found for this project.</p>
                  <p className="text-muted">Create a COR first, then link tickets to it.</p>
                </div>
              ) : (
                <div className="cor-select-wrapper">
                  <label>Select Change Order:</label>
                  <select
                    value={selectedCorForAssign}
                    onChange={(e) => setSelectedCorForAssign(e.target.value)}
                    className="cor-select"
                  >
                    <option value="">-- No COR (unlink) --</option>
                    {availableCors.map(cor => (
                      <option key={cor.id} value={cor.id}>
                        {cor.cor_number} - {cor.title || 'Untitled'} ({cor.status})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setShowCorAssignModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleAssignToCor}
                disabled={loadingCors || (availableCors.length === 0)}
              >
                {pendingCorAssignTicket.assigned_cor_id && !selectedCorForAssign
                  ? 'Unlink from COR'
                  : 'Link to COR'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
