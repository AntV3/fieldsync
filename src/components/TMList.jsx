import { useState, useEffect, useMemo, useCallback } from 'react'
import { FileText, ChevronDown, ChevronRight, Calendar, X, FileSpreadsheet, BarChart3, List, Search } from 'lucide-react'
import { db } from '../lib/supabase'
import { useBranding } from '../lib/BrandingContext'
import { hexToRgb } from '../lib/imageUtils'
import {
  resolvePrimaryColor,
  loadBrandLogo,
  drawDocumentHeader,
  drawContinuationAccent,
  applyDocumentFooters,
} from '../lib/pdfBranding'
import SignatureLinkGenerator from './SignatureLinkGenerator'
import { TicketSkeleton, CountBadge, EmptyState } from './ui'
import TMDashboard from './tm/TMDashboard'
import TMTicketCard from './tm/TMTicketCard'
import { exportTMTicketsCSV } from '../lib/financialExport'
import { loadXLSXSafe } from '../lib/safeXlsx'
// Dynamic imports for export libraries (loaded on-demand to reduce initial bundle)
// jsPDF + XLSX together are ~1MB, so we only load them when user actually exports
const loadXLSX = loadXLSXSafe
const loadJsPDF = () => Promise.all([import('jspdf'), import('jspdf-autotable')])

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
  const [loadingMore, setLoadingMore] = useState(false)
  const [filter, setFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedTicket, setExpandedTicket] = useState(null)
  const [selectedTickets, setSelectedTickets] = useState(new Set())

  // Pagination state
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [totalCount, setTotalCount] = useState(0)
  const TICKETS_PER_PAGE = 25
  const MAX_TICKETS_IN_MEMORY = 500 // Prevent memory bloat from infinite scroll

  // View mode state - in preview mode, we filter to current month
  const [viewMode, setViewMode] = useState('recent') // 'recent' | 'all'
  const [displayMode, setDisplayMode] = useState(() => {
    // Load user preference from localStorage, default to 'dashboard'
    const saved = localStorage.getItem('fieldsync-tm-default-view')
    return saved === 'list' || saved === 'dashboard' ? saved : 'dashboard'
  })
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

  // Load tickets with pagination - wrapped in useCallback so the subscription
  // callback always references the same function and doesn't cause leak/resubscribe cycles
  const loadTickets = useCallback(async (pageNum = 0, reset = false) => {
    try {
      if (reset) {
        setLoading(true)
      } else {
        setLoadingMore(true)
      }

      // Use paginated query for scalability
      const result = await db.getTMTicketsPaginated(project.id, {
        page: pageNum,
        limit: TICKETS_PER_PAGE,
        status: filter !== 'all' ? filter : null
      })

      if (reset) {
        setTickets(result.tickets)
      } else {
        // Append new tickets but limit total to prevent memory bloat
        setTickets(prev => {
          const combined = [...prev, ...result.tickets]
          // If exceeding limit, keep only the most recent tickets
          if (combined.length > MAX_TICKETS_IN_MEMORY) {
            return combined.slice(-MAX_TICKETS_IN_MEMORY)
          }
          return combined
        })
      }

      setPage(pageNum)
      setHasMore(result.hasMore)
      setTotalCount(result.totalCount)

      // Check editability for tickets with COR assignments
      const ticketsWithCOR = result.tickets.filter(t => t.assigned_cor_id)
      if (ticketsWithCOR.length > 0) {
        const lockResults = {}
        const importStatusResults = {}
        await Promise.all(ticketsWithCOR.map(async (ticket) => {
          const editResult = await db.isTicketEditable(ticket)
          if (!editResult.editable) {
            lockResults[ticket.id] = editResult
          }
          // Check import status for each ticket
          try {
            const importStatus = await db.getTicketImportStatus(ticket.id, ticket.assigned_cor_id)
            if (importStatus?.import_status === 'failed') {
              importStatusResults[ticket.id] = importStatus
            }
          } catch (_e) {
            // Ignore - column may not exist yet
          }
        }))
        setLockedTickets(prev => reset ? lockResults : { ...prev, ...lockResults })
        setFailedImports(prev => reset ? importStatusResults : { ...prev, ...importStatusResults })
      }
    } catch (_error) {
      onShowToast('Error loading tickets', 'error')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [project.id, filter, onShowToast])

  useEffect(() => {
    // Reset pagination when project changes
    setTickets([])
    setPage(0)
    setHasMore(true)
    loadTickets(0, true)

    // Subscribe to real-time updates for T&M tickets
    const subscription = db.subscribeToTMTickets?.(project.id, () => {
      // On real-time update, refresh the first page
      loadTickets(0, true)
    })

    return () => {
      if (subscription) db.unsubscribe?.(subscription)
    }
  }, [project.id, loadTickets])

  // Save user preference when displayMode changes
  useEffect(() => {
    if (!compact) {
      localStorage.setItem('fieldsync-tm-default-view', displayMode)
    }
  }, [displayMode, compact])

  // Reset to preferred view when switching to full mode
  useEffect(() => {
    if (!compact) {
      const saved = localStorage.getItem('fieldsync-tm-default-view')
      const preferredView = saved === 'list' || saved === 'dashboard' ? saved : 'dashboard'
      setDisplayMode(preferredView)
    }
  }, [compact])

  // Load more tickets (next page)
  const loadMore = () => {
    if (!loadingMore && hasMore) {
      loadTickets(page + 1, false)
    }
  }

  // Reload tickets when filter changes
  useEffect(() => {
    if (project?.id) {
      setTickets([])
      setPage(0)
      setHasMore(true)
      loadTickets(0, true)
    }
  }, [filter])

  const updateStatus = useCallback(async (ticketId, newStatus) => {
    // Check if ticket is locked due to approved COR
    if (lockedTickets[ticketId]) {
      onShowToast(lockedTickets[ticketId].reason || 'This ticket is locked (COR approved)', 'error')
      return
    }

    try {
      await db.updateTMTicketStatus(ticketId, newStatus)
      setTickets(prev => prev.map(t =>
        t.id === ticketId ? { ...t, status: newStatus } : t
      ))
      onShowToast(`Ticket ${newStatus}`, 'success')
    } catch (error) {
      console.error('Error updating status:', error)
      onShowToast('Error updating status', 'error')
    }
  }, [lockedTickets]) // onShowToast is stable (memoized in App.jsx)

  // Handle approval - approve directly (CE/PCO is informational only)
  const handleApprove = useCallback((ticket) => {
    // Check if ticket is locked due to approved COR
    if (lockedTickets[ticket.id]) {
      onShowToast(lockedTickets[ticket.id].reason || 'This ticket is locked (COR approved)', 'error')
      return
    }

    updateStatus(ticket.id, 'approved')
  }, [lockedTickets, updateStatus]) // onShowToast is stable

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

  const deleteTicket = useCallback(async (ticketId) => {
    // Check if ticket is locked due to approved COR
    if (lockedTickets[ticketId]) {
      onShowToast(lockedTickets[ticketId].reason || 'This ticket is locked (COR approved)', 'error')
      return
    }

    if (!confirm('Delete this Time & Material ticket?')) return
    try {
      await db.deleteTMTicket(ticketId)
      setTickets(prev => prev.filter(t => t.id !== ticketId))
      onShowToast('Ticket deleted', 'success')
    } catch (error) {
      console.error('Error deleting ticket:', error)
      onShowToast('Error deleting ticket', 'error')
    }
  }, [lockedTickets]) // onShowToast is stable (memoized in App.jsx)

  // Open COR association modal
  const openCorAssignModal = useCallback(async (ticket) => {
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
  }, [project.id]) // onShowToast is stable (memoized in App.jsx)

  // Associate ticket with selected COR
  const handleAssignToCor = async () => {
    if (!pendingCorAssignTicket) return

    try {
      if (selectedCorForAssign) {
        // Associate with COR using atomic function (ticketId, corId)
        await db.assignTicketToCOR(pendingCorAssignTicket.id, selectedCorForAssign)

        // Auto-import ticket cost data (labor, materials, equipment) into COR line items
        try {
          await db.importTicketDataToCOR(
            pendingCorAssignTicket.id,
            selectedCorForAssign,
            company.id,
            project.work_type || 'demolition',
            project.job_type || 'standard'
          )
        } catch (importError) {
          console.warn('Auto-import of ticket costs failed, can retry later:', importError)
        }

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
  const handleRetryImport = useCallback(async (ticket, e) => {
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
  }, [company.id, project.work_type, project.job_type]) // onShowToast and loadTickets are stable

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
    const s = String(dateStr)
    const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T00:00:00') : new Date(s)
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  // Selection helpers
  const toggleTicketSelection = useCallback((ticketId, e) => {
    e?.stopPropagation()
    setSelectedTickets(prev => {
      const next = new Set(prev)
      if (next.has(ticketId)) {
        next.delete(ticketId)
      } else {
        next.add(ticketId)
      }
      return next
    })
  }, [])

  // Memoized handlers for TMTicketCard - must be before any early returns
  const handleToggleExpand = useCallback((ticketId) => {
    setExpandedTicket(prev => prev === ticketId ? null : ticketId)
  }, [])

  const handleShowSignatureLink = useCallback((ticket) => {
    setSignatureLinkTicket(ticket)
    setShowSignatureLink(true)
  }, [])

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

  // Export to Excel (loads XLSX library on-demand)
  const exportToExcel = async () => {
    const exportTickets = getExportTickets()

    if (exportTickets.length === 0) {
      onShowToast('No tickets to export', 'error')
      return
    }

    onShowToast('Preparing Excel export...', 'info')

    // Dynamic import - only loads XLSX when user actually exports
    const XLSX = (await loadXLSX()).default || await loadXLSX()

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
    const fileName = `${project.name}_Time_Material_${new Date().toISOString().split('T')[0]}.xlsx`
    XLSX.writeFile(wb, fileName)
    onShowToast('Export downloaded!', 'success')
  }

  // Export to PDF - Professional format with company branding (loads jsPDF on-demand)
  const exportToPDF = async () => {
    const exportTickets = getExportTickets()

    if (exportTickets.length === 0) {
      onShowToast('No tickets to export', 'error')
      return
    }

    onShowToast('Generating PDF...', 'info')

    // Dynamic import - only loads jsPDF and autoTable when user actually exports
    const [jsPDFModule, autoTableModule] = await loadJsPDF()
    const jsPDF = jsPDFModule.default
    const autoTable = autoTableModule.default

    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const margin = 18

    const brandingForHeader = {
      primaryColor: branding?.primary_color || branding?.primaryColor,
      logoUrl: branding?.logo_url || branding?.logoUrl,
    }
    const primaryColor = resolvePrimaryColor({ branding: brandingForHeader, company })
    const brandLogo = await loadBrandLogo({ branding: brandingForHeader, company })

    // Editorial header
    let yPos = drawDocumentHeader(doc, {
      title: 'Time & Materials',
      subtitle: `${exportTickets.length} ticket${exportTickets.length !== 1 ? 's' : ''}  ·  ${filter.charAt(0).toUpperCase() + filter.slice(1)}`,
      context: { company, branding: brandingForHeader, project },
      brandLogo,
      primary: primaryColor,
    })

    // Project info strip
    const dates = exportTickets.map(t => new Date(t.work_date)).sort((a, b) => a - b)
    const startDate = dates[0]?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    const endDate = dates[dates.length - 1]?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

    doc.setFillColor(248, 250, 252)
    doc.roundedRect(margin, yPos, pageWidth - margin * 2, 11, 2, 2, 'F')
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(71, 85, 105)
    doc.text('PROJECT', margin + 5, yPos + 4.5)
    doc.setFontSize(9.5)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(15, 23, 42)
    const projInfo = (project?.name || 'Untitled') + (project?.job_number ? `   ·   Job #${project.job_number}` : '')
    doc.text(projInfo, margin + 22, yPos + 7.5)
    if (startDate && endDate) {
      doc.setFontSize(8.5)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(71, 85, 105)
      doc.text(`${startDate} — ${endDate}`, pageWidth - margin - 4, yPos + 7.5, { align: 'right' })
    }
    yPos += 17

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

    // Helper to format time for PDF
    const formatTimePdf = (timeStr) => {
      if (!timeStr) return ''
      const [hours, minutes] = timeStr.split(':')
      const h = parseInt(hours)
      const ampm = h >= 12 ? 'pm' : 'am'
      const h12 = h % 12 || 12
      return `${h12}:${minutes}${ampm}`
    }

    // Collect workers grouped by labor class/role
    const laborGroups = {}
    const laborGroupTotals = {}

    exportTickets.forEach(ticket => {
      if (ticket.t_and_m_workers) {
        ticket.t_and_m_workers.forEach(worker => {
          const regHrs = parseFloat(worker.hours) || 0
          const otHrs = parseFloat(worker.overtime_hours) || 0
          const laborClass = worker.role || worker.labor_class || 'Laborer'
          const timePeriod = worker.time_started && worker.time_ended
            ? `${formatTimePdf(worker.time_started)} – ${formatTimePdf(worker.time_ended)}`
            : '—'
          const rowData = [
            formatDate(ticket.work_date),
            worker.name,
            timePeriod,
            regHrs.toString(),
            otHrs > 0 ? otHrs.toString() : '—',
            (regHrs + otHrs).toString()
          ]

          if (!laborGroups[laborClass]) {
            laborGroups[laborClass] = []
            laborGroupTotals[laborClass] = { reg: 0, ot: 0 }
          }
          laborGroups[laborClass].push(rowData)
          laborGroupTotals[laborClass].reg += regHrs
          laborGroupTotals[laborClass].ot += otHrs
        })
      }
    })

    // Helper function to render a labor table by class
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
        head: [['Date', 'Name', 'Time Frame', 'Reg Hrs', 'OT Hrs', 'Total']],
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
          0: { cellWidth: 25 },
          2: { cellWidth: 38 },
          3: { halign: 'center', cellWidth: 18 },
          4: { halign: 'center', cellWidth: 18 },
          5: { halign: 'center', cellWidth: 18 }
        },
        foot: [[
          '', '', 'SUBTOTAL:', regHours.toString(), otHours > 0 ? otHours.toString() : '—', (regHours + otHours).toString()
        ]],
        footStyles: {
          fillColor: primaryColor,
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 9
        }
      })

      yPos = doc.lastAutoTable.finalY + 10
    }

    // Render each labor class as its own table
    const laborClassNames = Object.keys(laborGroups)
    if (laborClassNames.length > 0) {
      doc.setTextColor(...primaryColor)
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.text('LABOR', margin, yPos)
      yPos += 8

      // Sort: Supervision-type roles first, then alphabetical
      const supervisionRoles = ['Foreman', 'Superintendent']
      const sortedClasses = laborClassNames.sort((a, b) => {
        const aIsSuper = supervisionRoles.includes(a) ? 0 : 1
        const bIsSuper = supervisionRoles.includes(b) ? 0 : 1
        if (aIsSuper !== bIsSuper) return aIsSuper - bIsSuper
        return a.localeCompare(b)
      })

      let grandTotalReg = 0
      let grandTotalOT = 0

      sortedClasses.forEach(className => {
        const totals = laborGroupTotals[className]
        renderLaborTable(className.toUpperCase(), laborGroups[className], totals.reg, totals.ot)
        grandTotalReg += totals.reg
        grandTotalOT += totals.ot
      })

      doc.setFillColor(...primaryColor)
      doc.rect(margin, yPos, pageWidth - margin * 2, 12, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.text('LABOR TOTAL:', margin + 5, yPos + 8)
      doc.text(`${grandTotalReg} Reg + ${grandTotalOT} OT = ${grandTotalReg + grandTotalOT} Hours`, pageWidth - margin - 5, yPos + 8, { align: 'right' })

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
          fillColor: primaryColor,
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
    const firstTicket = exportTickets[0] || {}

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
      doc.setDrawColor(...primaryColor)
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

    // Continuation accents + branded footers on every page
    const totalPages = doc.internal.getNumberOfPages()
    for (let i = 2; i <= totalPages; i++) {
      doc.setPage(i)
      drawContinuationAccent(doc, { primary: primaryColor })
    }

    applyDocumentFooters(doc, {
      documentLabel: project?.name
        ? `Time & Materials · ${project.name}`
        : 'Time & Materials Report',
      context: { company, branding: brandingForHeader, project },
      primary: primaryColor,
    })

    // Download
    const fileName = `${project.name}_Time_Material_Report_${new Date().toISOString().split('T')[0]}.pdf`
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

    // Apply search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(t => {
        const workerNames = t.t_and_m_workers?.map(w => w.name?.toLowerCase()).join(' ') || ''
        const itemNames = t.t_and_m_items?.map(i => (i.custom_name || i.materials_equipment?.name || '').toLowerCase()).join(' ') || ''
        const dateStr = formatDate(t.work_date).toLowerCase()
        return (
          workerNames.includes(term) ||
          itemNames.includes(term) ||
          dateStr.includes(term) ||
          (t.notes || '').toLowerCase().includes(term) ||
          (t.ce_pco_number || '').toLowerCase().includes(term) ||
          (t.status || '').toLowerCase().includes(term)
        )
      })
    }

    return filtered
  }, [tickets, filter, viewMode, dateFilter, previewMode, searchTerm])

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

  // Helper function to render a single ticket card using memoized component
  const renderTicketCard = (ticket) => (
    <TMTicketCard
      key={ticket.id}
      ticket={ticket}
      isExpanded={expandedTicket === ticket.id}
      isSelected={selectedTickets.has(ticket.id)}
      isLocked={!!lockedTickets[ticket.id]}
      lockInfo={lockedTickets[ticket.id]}
      hasFailedImport={!!failedImports[ticket.id]}
      isRetrying={retryingImport === ticket.id}
      onToggleExpand={handleToggleExpand}
      onToggleSelect={toggleTicketSelection}
      onApprove={handleApprove}
      onUpdateStatus={updateStatus}
      onDelete={deleteTicket}
      onOpenCorAssign={openCorAssignModal}
      onRetryImport={handleRetryImport}
      onShowSignatureLink={handleShowSignatureLink}
      formatDate={formatDate}
      calculateTotalHours={calculateTotalHours}
      calculateTicketTotal={calculateTicketTotal}
    />
  )

  return (
    <div className={`tm-list ${compact ? 'tm-list-compact' : ''}`}>
      {/* Header */}
      <div className="tm-list-header">
        <div className="tm-list-title">
          <h3>Time & Material Tickets</h3>
          <div className="tm-header-controls">
            {/* Display Mode Toggle */}
            {!compact && (
              <div className="tm-display-toggle">
                <button
                  className={`tm-display-btn ${displayMode === 'dashboard' ? 'active' : ''}`}
                  onClick={() => setDisplayMode('dashboard')}
                  title="Dashboard View"
                >
                  <BarChart3 size={16} /> Dashboard
                </button>
                <button
                  className={`tm-display-btn ${displayMode === 'list' ? 'active' : ''}`}
                  onClick={() => setDisplayMode('list')}
                  title="List View"
                >
                  <List size={16} /> List
                </button>
              </div>
            )}
            <div className="tm-export-buttons">
              {!compact && someSelected && (
                <button className="btn btn-ghost btn-small" onClick={clearSelection}>
                  Clear ({selectedTickets.size})
                </button>
              )}
              <button className="btn btn-ghost btn-small" onClick={() => exportTMTicketsCSV(tickets, project)} disabled={tickets.length === 0}>
                <FileSpreadsheet size={14} /> CSV
              </button>
              <button className="btn btn-secondary btn-small" onClick={exportToExcel} disabled={tickets.length === 0}>
                <FileSpreadsheet size={14} /> Excel {!compact && someSelected ? `(${selectedTickets.size})` : ''}
              </button>
              <button className="btn btn-secondary btn-small" onClick={exportToPDF} disabled={tickets.length === 0}>
                <FileText size={14} /> PDF {!compact && someSelected ? `(${selectedTickets.size})` : ''}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Unified Toolbar - hidden in compact mode */}
      {!compact && (
        <div className="tm-toolbar">
          {/* Row 1: Filters + View Toggle */}
          <div className="tm-toolbar-row">
            <div className="tm-filter-tabs" role="tablist">
              {['all', 'pending', 'approved', 'billed', 'rejected'].map(status => (
                <button
                  key={status}
                  role="tab"
                  aria-selected={filter === status}
                  className={`tm-filter-tab ${filter === status ? 'active' : ''}`}
                  onClick={() => { setFilter(status); clearSelection(); setSearchTerm(''); }}
                >
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                  <span className="tm-filter-count">
                    {status === 'all' ? tickets.length : tickets.filter(t => t.status === status).length}
                  </span>
                </button>
              ))}
            </div>

            <div className="tm-toolbar-right">
              <div className="tm-view-toggle">
                <button
                  className={`tm-toggle-btn ${viewMode === 'recent' ? 'active' : ''}`}
                  onClick={() => { setViewMode('recent'); setDateFilter({ start: '', end: '' }); }}
                >
                  Recent
                </button>
                <button
                  className={`tm-toggle-btn ${viewMode === 'all' ? 'active' : ''}`}
                  onClick={() => setViewMode('all')}
                >
                  All ({totalTicketsCount})
                </button>
              </div>
            </div>
          </div>

          {/* Row 2: Search + Date Filter */}
          <div className="tm-toolbar-row tm-toolbar-search-row">
            <div className="tm-search">
              <Search size={14} className="tm-search-icon" />
              <input
                type="text"
                className="tm-search-input"
                placeholder="Search by worker, material, date, or notes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button className="tm-search-clear" onClick={() => setSearchTerm('')}>
                  <X size={14} />
                </button>
              )}
            </div>

            {viewMode === 'all' && (
              <div className="tm-date-filter">
                <Calendar size={14} />
                <input
                  type="date"
                  value={dateFilter.start}
                  onChange={(e) => setDateFilter(prev => ({ ...prev, start: e.target.value }))}
                />
                <span className="tm-date-sep">to</span>
                <input
                  type="date"
                  value={dateFilter.end}
                  onChange={(e) => setDateFilter(prev => ({ ...prev, end: e.target.value }))}
                />
                {(dateFilter.start || dateFilter.end) && (
                  <button className="tm-clear-btn" onClick={() => setDateFilter({ start: '', end: '' })}>
                    <X size={14} />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Dashboard View */}
      {!compact && displayMode === 'dashboard' && (
        <TMDashboard tickets={tickets} />
      )}

      {/* List View Content */}
      {displayMode === 'list' && (
        <>
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
        <EmptyState
          icon={FileText}
          title={`No ${filter === 'all' ? '' : filter} Time and Material tickets${viewMode === 'recent' ? ' in the last 7 days' : ''}`}
          message="Time and Material tickets created in the field will appear here"
          action={viewMode === 'recent' && totalTicketsCount > 0 ? (
            <button className="btn btn-secondary btn-small" onClick={() => setViewMode('all')}>
              View All Tickets
            </button>
          ) : null}
        />
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

          {/* Load More Button - for pagination */}
          {!previewMode && hasMore && !loading && tickets.length > 0 && (
            <div className="tm-load-more">
              <button
                className="btn btn-secondary"
                onClick={loadMore}
                disabled={loadingMore}
              >
                {loadingMore ? 'Loading...' : `Load More (${tickets.length} of ${totalCount})`}
              </button>
            </div>
          )}

          {/* See All Footer - only in preview mode */}
          {previewMode && tickets.length > 0 && (
            <button className="tm-see-all-btn" onClick={onViewAll}>
              See all {totalCount || tickets.length} Time & Material tickets
              <ChevronRight size={16} />
            </button>
          )}
        </>
      )}

      {/* Change Order Approval Modal */}
      {showChangeOrderModal && pendingApprovalTicket && (
        <div className="modal-overlay" onClick={() => setShowChangeOrderModal(false)}>
          <div className="modal change-order-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Approve Change Order Work</h3>
            <p className="modal-subtitle">
              This Time & Material ticket is associated with <strong>{pendingApprovalTicket.ce_pco_number}</strong>
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
          project={project}
          documentTitle={`Time & Material Ticket - ${new Date(signatureLinkTicket.work_date).toLocaleDateString()}${signatureLinkTicket.ce_pco_number ? ` (${signatureLinkTicket.ce_pco_number})` : ''}`}
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
