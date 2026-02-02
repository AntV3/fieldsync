import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { FileText, Plus, ChevronDown, ChevronRight, Calendar, Download, FolderPlus, X, List, Table, FileSpreadsheet, CheckSquare, Search } from 'lucide-react'
import { db } from '../../lib/supabase'
import { formatCurrency, getStatusInfo, formatDate, formatDateRange, calculateCORTotals } from '../../lib/corCalculations'
import { hexToRgb, loadImageAsBase64 } from '../../lib/imageUtils'
import { CardSkeleton, CountBadge } from '../ui'
import { useBranding } from '../../lib/BrandingContext'
import { useFilteredPagination } from '../../hooks/useFilteredPagination'
import Pagination from '../ui/Pagination'
import CORLog from './CORLog'
import CORCard from './CORCard'

// Status display mapping for exports
const STATUS_DISPLAY = {
  draft: { label: 'Draft', color: [107, 114, 128], bgColor: [243, 244, 246] },
  pending_approval: { label: 'Pending Approval', color: [217, 119, 6], bgColor: [254, 243, 199] },
  approved: { label: 'Approved', color: [5, 150, 105], bgColor: [209, 250, 229] },
  rejected: { label: 'Rejected', color: [220, 38, 38], bgColor: [254, 226, 226] },
  billed: { label: 'Billed', color: [37, 99, 235], bgColor: [219, 234, 254] },
  closed: { label: 'Closed', color: [75, 85, 99], bgColor: [229, 231, 235] }
}

export default function CORList({
  project,
  company,
  areas,
  refreshKey,
  onShowToast,
  onCreateCOR,
  onViewCOR,
  onEditCOR,
  // Preview mode props
  previewMode = false,  // When true, shows limited items with "See All" button
  previewLimit = 5,     // Number of items to show in preview mode
  onViewAll,            // Callback when "See All" is clicked
  onDisplayModeChange   // Callback when display mode changes (for parent layout adjustments)
}) {
  const { branding } = useBranding()
  const [cors, setCORs] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [areaFilter, setAreaFilter] = useState('all')
  const [groupFilter, setGroupFilter] = useState('all')
  const [expandedCOR, setExpandedCOR] = useState(null)
  const [selectedCORs, setSelectedCORs] = useState(new Set())
  const [selectMode, setSelectMode] = useState(false)
  const [showGroupModal, setShowGroupModal] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [showExportMenu, setShowExportMenu] = useState(false)
  const exportMenuRef = useRef(null)

  // Close export menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target)) {
        setShowExportMenu(false)
      }
    }
    if (showExportMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showExportMenu])

  // Display mode state - 'list' (card view) or 'log' (table view for client presentation)
  const [displayMode, setDisplayMode] = useState('list') // 'list' | 'log'

  // Notify parent when display mode changes
  const handleDisplayModeChange = (mode) => {
    setDisplayMode(mode)
    onDisplayModeChange?.(mode)
  }

  // View mode state - default to 'all' in preview mode so we can limit by count
  const [viewMode, setViewMode] = useState(previewMode ? 'all' : 'recent') // 'recent' | 'all'
  const [expandedMonths, setExpandedMonths] = useState(new Set())
  const [dateFilter, setDateFilter] = useState({ start: '', end: '' })

  // Stats state
  const [stats, setStats] = useState(null)

  // Define load functions before useEffect that uses them
  const loadCORs = useCallback(async () => {
    try {
      const data = await db.getCORs(project.id)
      setCORs(data || [])
    } catch (error) {
      console.error('Error loading CORs:', error)
      onShowToast?.('Error loading change order requests', 'error')
    } finally {
      setLoading(false)
    }
  }, [project.id]) // onShowToast is stable

  const loadStats = useCallback(async () => {
    try {
      const data = await db.getCORStats?.(project.id)
      setStats(data)
    } catch (error) {
      console.error('Error loading COR stats:', error)
    }
  }, [project.id])

  useEffect(() => {
    loadCORs()
    loadStats()

    // Subscribe to realtime updates
    const subscription = db.subscribeToCORs?.(project.id, () => {
      loadCORs()
      loadStats()
    })

    return () => {
      if (subscription) db.unsubscribe?.(subscription)
    }
  }, [project.id, refreshKey, loadCORs, loadStats])

  // Professional Excel Export
  const exportToExcel = async () => {
    if (cors.length === 0) {
      onShowToast?.('No CORs to export', 'error')
      return
    }

    onShowToast?.('Generating Excel report...', 'info')

    try {
      const XLSX = await import('xlsx')

      // Calculate statistics
      const approved = cors.filter(c => c.status === 'approved')
      const pending = cors.filter(c => ['draft', 'pending_approval'].includes(c.status))
      const rejected = cors.filter(c => c.status === 'rejected')
      const billed = cors.filter(c => c.status === 'billed')
      const totalValue = cors.reduce((sum, c) => sum + (c.cor_total || 0), 0) / 100
      const approvedValue = approved.reduce((sum, c) => sum + (c.cor_total || 0), 0) / 100
      const pendingValue = pending.reduce((sum, c) => sum + (c.cor_total || 0), 0) / 100

      // Create workbook
      const wb = XLSX.utils.book_new()

      // === SUMMARY SHEET ===
      const summaryData = [
        ['CHANGE ORDER REQUEST SUMMARY'],
        [],
        ['Company:', company?.name || ''],
        ['Project:', project.name],
        ['Job Number:', project.job_number || 'N/A'],
        ['Report Date:', new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })],
        [],
        ['FINANCIAL OVERVIEW'],
        [],
        ['Category', 'Count', 'Value'],
        ['Total CORs', cors.length, totalValue],
        ['Approved', approved.length, approvedValue],
        ['Pending Approval', pending.length, pendingValue],
        ['Rejected', rejected.length, rejected.reduce((s, c) => s + (c.cor_total || 0), 0) / 100],
        ['Billed', billed.length, billed.reduce((s, c) => s + (c.cor_total || 0), 0) / 100],
        [],
        ['CONTRACT IMPACT'],
        [],
        ['Original Contract Value:', project.contract_value || 0],
        ['Total Approved CORs:', approvedValue],
        ['Revised Contract Value:', (project.contract_value || 0) + approvedValue],
        ['Pending COR Value:', pendingValue],
        ['Potential Total:', (project.contract_value || 0) + approvedValue + pendingValue]
      ]

      const wsSummary = XLSX.utils.aoa_to_sheet(summaryData)
      wsSummary['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 18 }]
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary')

      // === DETAIL SHEET ===
      const detailHeaders = [
        'COR #', 'Title', 'Description', 'Amount', 'Status',
        'Created Date', 'Submitted Date', 'Approved Date', 'Approved By',
        'Work Period Start', 'Work Period End', 'Area'
      ]

      const detailData = cors.map(cor => [
        cor.cor_number || '',
        cor.title || 'Untitled',
        cor.scope_of_work || '',
        (cor.cor_total || 0) / 100,
        STATUS_DISPLAY[cor.status]?.label || cor.status,
        cor.created_at ? new Date(cor.created_at).toLocaleDateString() : '',
        cor.submitted_at ? new Date(cor.submitted_at).toLocaleDateString() : '',
        cor.approved_at ? new Date(cor.approved_at).toLocaleDateString() : '',
        cor.approved_by_name || '',
        cor.period_start ? new Date(cor.period_start).toLocaleDateString() : '',
        cor.period_end ? new Date(cor.period_end).toLocaleDateString() : '',
        cor.area?.name || ''
      ])

      const wsDetail = XLSX.utils.aoa_to_sheet([detailHeaders, ...detailData])
      wsDetail['!cols'] = [
        { wch: 10 }, { wch: 30 }, { wch: 40 }, { wch: 14 }, { wch: 16 },
        { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 18 },
        { wch: 12 }, { wch: 12 }, { wch: 15 }
      ]

      // Format currency column
      for (let i = 1; i <= detailData.length; i++) {
        const cellRef = XLSX.utils.encode_cell({ r: i, c: 3 })
        if (wsDetail[cellRef]) wsDetail[cellRef].z = '$#,##0.00'
      }

      XLSX.utils.book_append_sheet(wb, wsDetail, 'COR Details')

      // === STATUS BREAKDOWN SHEET ===
      const statusSheets = [
        { name: 'Approved CORs', data: approved, status: 'approved' },
        { name: 'Pending CORs', data: pending, status: 'pending' }
      ]

      statusSheets.forEach(({ name, data }) => {
        if (data.length > 0) {
          const sheetData = [
            ['COR #', 'Title', 'Amount', 'Date'],
            ...data.map(cor => [
              cor.cor_number || '',
              cor.title || 'Untitled',
              (cor.cor_total || 0) / 100,
              cor.created_at ? new Date(cor.created_at).toLocaleDateString() : ''
            ]),
            [],
            ['TOTAL', '', data.reduce((s, c) => s + (c.cor_total || 0), 0) / 100, '']
          ]
          const ws = XLSX.utils.aoa_to_sheet(sheetData)
          ws['!cols'] = [{ wch: 12 }, { wch: 40 }, { wch: 14 }, { wch: 12 }]
          XLSX.utils.book_append_sheet(wb, ws, name)
        }
      })

      // Save file
      const fileName = `COR_Report_${project.job_number || project.name}_${new Date().toISOString().split('T')[0]}.xlsx`
      XLSX.writeFile(wb, fileName)

      onShowToast?.('Excel report exported successfully', 'success')
    } catch (error) {
      console.error('Export error:', error)
      onShowToast?.('Export failed', 'error')
    }
  }

  // Professional PDF Export with Branding
  const exportToPDF = async () => {
    if (cors.length === 0) {
      onShowToast?.('No CORs to export', 'error')
      return
    }

    onShowToast?.('Generating PDF report...', 'info')

    try {
      const { default: jsPDF } = await import('jspdf')
      const { default: autoTable } = await import('jspdf-autotable')

      const doc = new jsPDF('landscape')
      const pageWidth = doc.internal.pageSize.width
      const pageHeight = doc.internal.pageSize.height
      const margin = 15

      // Get brand colors
      const primaryColor = hexToRgb(branding?.primary_color || '#3B82F6')
      const secondaryColor = hexToRgb(branding?.secondary_color || '#1E40AF')

      // === HEADER WITH BRANDING ===
      // Primary color header bar
      doc.setFillColor(...primaryColor)
      doc.rect(0, 0, pageWidth, 40, 'F')

      // Secondary color accent stripe
      doc.setFillColor(...secondaryColor)
      doc.rect(0, 38, pageWidth, 3, 'F')

      // Company logo if available
      let logoOffset = margin
      if (branding?.logo_url) {
        try {
          const logoBase64 = await loadImageAsBase64(branding.logo_url)
          if (logoBase64) {
            doc.addImage(logoBase64, 'PNG', margin, 6, 28, 28)
            logoOffset = margin + 35
          }
        } catch (e) {
          console.error('Logo load error:', e)
        }
      }

      // Company name and document title
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(20)
      doc.setFont('helvetica', 'bold')
      doc.text(company?.name || 'Company', logoOffset, 18)

      doc.setFontSize(11)
      doc.setFont('helvetica', 'normal')
      doc.text('CHANGE ORDER REQUEST REPORT', logoOffset, 28)

      // Right side - date and job info
      doc.setFontSize(9)
      doc.text(new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }), pageWidth - margin, 15, { align: 'right' })
      if (project.job_number) {
        doc.text(`Job #: ${project.job_number}`, pageWidth - margin, 23, { align: 'right' })
      }
      doc.text(`${cors.length} Change Orders`, pageWidth - margin, 31, { align: 'right' })

      // === PROJECT INFO BOX ===
      let yPos = 50

      doc.setFillColor(248, 250, 252)
      doc.setDrawColor(...primaryColor)
      doc.setLineWidth(0.5)
      doc.roundedRect(margin, yPos, pageWidth - margin * 2, 25, 3, 3, 'FD')

      doc.setTextColor(...primaryColor)
      doc.setFontSize(14)
      doc.setFont('helvetica', 'bold')
      doc.text(project.name, margin + 8, yPos + 10)

      doc.setTextColor(100, 116, 139)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      if (project.address) {
        doc.text(project.address, margin + 8, yPos + 18)
      }

      // === FINANCIAL SUMMARY BOXES ===
      yPos += 35

      const approved = cors.filter(c => c.status === 'approved')
      const pending = cors.filter(c => ['draft', 'pending_approval'].includes(c.status))
      const totalValue = cors.reduce((sum, c) => sum + (c.cor_total || 0), 0)
      const approvedValue = approved.reduce((sum, c) => sum + (c.cor_total || 0), 0)
      const pendingValue = pending.reduce((sum, c) => sum + (c.cor_total || 0), 0)

      const boxWidth = (pageWidth - margin * 2 - 30) / 4
      const summaryBoxes = [
        { label: 'Total CORs', value: cors.length.toString(), subValue: formatCurrency(totalValue) },
        { label: 'Approved', value: approved.length.toString(), subValue: formatCurrency(approvedValue), color: [5, 150, 105] },
        { label: 'Pending', value: pending.length.toString(), subValue: formatCurrency(pendingValue), color: [217, 119, 6] },
        { label: 'Revised Contract', value: formatCurrency((project.contract_value || 0) * 100 + approvedValue), subValue: `+${formatCurrency(approvedValue)} from original`, color: primaryColor }
      ]

      summaryBoxes.forEach((box, i) => {
        const boxX = margin + (i * (boxWidth + 10))
        const boxColor = box.color || primaryColor
        const lightColor = boxColor.map(c => Math.min(255, c + 200))

        doc.setFillColor(...lightColor)
        doc.setDrawColor(...boxColor)
        doc.roundedRect(boxX, yPos, boxWidth, 32, 2, 2, 'FD')

        doc.setTextColor(...boxColor)
        doc.setFontSize(18)
        doc.setFont('helvetica', 'bold')
        doc.text(box.value, boxX + boxWidth / 2, yPos + 14, { align: 'center' })

        doc.setTextColor(100, 116, 139)
        doc.setFontSize(8)
        doc.setFont('helvetica', 'normal')
        doc.text(box.label, boxX + boxWidth / 2, yPos + 22, { align: 'center' })

        if (box.subValue) {
          doc.setFontSize(7)
          doc.text(box.subValue, boxX + boxWidth / 2, yPos + 28, { align: 'center' })
        }
      })

      // === COR TABLE ===
      yPos += 42

      doc.setTextColor(...primaryColor)
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.text('CHANGE ORDER DETAILS', margin, yPos)
      yPos += 5

      const tableData = cors.map((cor, i) => {
        const status = STATUS_DISPLAY[cor.status] || { label: cor.status, color: [107, 114, 128] }
        return [
          (i + 1).toString(),
          cor.cor_number || '-',
          cor.title || 'Untitled',
          formatCurrency(cor.cor_total || 0),
          status.label,
          cor.created_at ? new Date(cor.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '-'
        ]
      })

      autoTable(doc, {
        startY: yPos,
        head: [['#', 'COR #', 'Description', 'Amount', 'Status', 'Date']],
        body: tableData,
        theme: 'grid',
        styles: {
          fontSize: 9,
          cellPadding: 4,
          lineColor: [226, 232, 240],
          lineWidth: 0.1
        },
        headStyles: {
          fillColor: primaryColor,
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          halign: 'center'
        },
        columnStyles: {
          0: { cellWidth: 12, halign: 'center' },
          1: { cellWidth: 25, halign: 'center' },
          2: { cellWidth: 'auto' },
          3: { cellWidth: 30, halign: 'right', fontStyle: 'bold' },
          4: { cellWidth: 28, halign: 'center' },
          5: { cellWidth: 28, halign: 'center' }
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252]
        },
        didParseCell: (data) => {
          // Color-code status column
          if (data.column.index === 4 && data.section === 'body') {
            const statusKey = Object.keys(STATUS_DISPLAY).find(
              key => STATUS_DISPLAY[key].label === data.cell.raw
            )
            if (statusKey) {
              data.cell.styles.textColor = STATUS_DISPLAY[statusKey].color
              data.cell.styles.fontStyle = 'bold'
            }
          }
        }
      })

      // === FOOTER ===
      const footerY = pageHeight - 12
      doc.setDrawColor(226, 232, 240)
      doc.setLineWidth(0.5)
      doc.line(margin, footerY - 5, pageWidth - margin, footerY - 5)

      doc.setTextColor(148, 163, 184)
      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      doc.text(`Generated on ${new Date().toLocaleString()}`, margin, footerY)
      doc.text(`${company?.name || 'FieldSync'} • Confidential`, pageWidth / 2, footerY, { align: 'center' })
      doc.text('Page 1 of 1', pageWidth - margin, footerY, { align: 'right' })

      // Save
      const fileName = `COR_Report_${project.job_number || project.name}_${new Date().toISOString().split('T')[0]}.pdf`
      doc.save(fileName)

      onShowToast?.('PDF report exported successfully', 'success')
    } catch (error) {
      console.error('Export error:', error)
      onShowToast?.('Export failed', 'error')
    }
  }

  const handleDelete = useCallback(async (corId, e) => {
    e?.stopPropagation()
    if (!confirm('Are you sure you want to delete this COR? This action cannot be undone.')) return

    try {
      await db.deleteCOR(corId)
      setCORs(prev => prev.filter(c => c.id !== corId))
      onShowToast?.('COR deleted', 'success')
      loadStats()
    } catch (error) {
      console.error('Error deleting COR:', error)
      onShowToast?.('Error deleting COR', 'error')
    }
  }, [loadStats]) // onShowToast is stable (memoized in App.jsx)

  const handleSubmitForApproval = useCallback(async (corId, e) => {
    e?.stopPropagation()
    try {
      await db.submitCORForApproval(corId)
      await loadCORs()
      onShowToast?.('COR submitted for approval', 'success')
      loadStats()
    } catch (error) {
      console.error('Error submitting COR:', error?.message || error)
      onShowToast?.(error?.message || 'Error submitting COR', 'error')
    }
  }, [loadCORs, loadStats]) // onShowToast is stable (memoized in App.jsx)

  // Toggle COR selection
  const toggleCORSelection = useCallback((corId, e) => {
    e?.stopPropagation()
    setSelectedCORs(prev => {
      const next = new Set(prev)
      if (next.has(corId)) {
        next.delete(corId)
      } else {
        next.add(corId)
      }
      return next
    })
  }, [])

  // Exit select mode
  const exitSelectMode = () => {
    setSelectMode(false)
    setSelectedCORs(new Set())
  }

  // Group selected CORs
  const handleGroupSelected = async () => {
    if (!newGroupName.trim()) {
      onShowToast?.('Please enter a group name', 'error')
      return
    }

    try {
      await db.bulkUpdateCORGroup([...selectedCORs], newGroupName.trim())
      onShowToast?.(`${selectedCORs.size} CORs grouped as "${newGroupName.trim()}"`, 'success')
      setShowGroupModal(false)
      setNewGroupName('')
      setSelectedCORs(new Set())
      setSelectMode(false)
      loadCORs()
    } catch (error) {
      console.error('Error grouping CORs:', error)
      onShowToast?.('Error grouping CORs', 'error')
    }
  }

  // Get unique groups from CORs
  const availableGroups = useMemo(() => {
    const groups = cors
      .map(c => c.group_name)
      .filter(Boolean)
    return [...new Set(groups)].sort()
  }, [cors])

  // Filter CORs by status, area, group, view mode, and date range
  const filteredCORs = useMemo(() => {
    let filtered = [...cors]

    // Status filter
    if (filter !== 'all') {
      filtered = filtered.filter(c => c.status === filter)
    }

    // Area filter
    if (areaFilter !== 'all') {
      filtered = filtered.filter(c => c.area_id === areaFilter)
    }

    // Group filter
    if (groupFilter !== 'all') {
      filtered = filtered.filter(c => c.group_name === groupFilter)
    }

    // Apply date filter if set
    if (dateFilter.start) {
      const startDate = new Date(dateFilter.start)
      startDate.setHours(0, 0, 0, 0)
      filtered = filtered.filter(c => {
        const corDate = new Date(c.created_at)
        return corDate >= startDate
      })
    }
    if (dateFilter.end) {
      const endDate = new Date(dateFilter.end)
      endDate.setHours(23, 59, 59, 999)
      filtered = filtered.filter(c => {
        const corDate = new Date(c.created_at)
        return corDate <= endDate
      })
    }

    // In recent mode (not preview mode), show only last 7 days
    if (viewMode === 'recent' && !previewMode) {
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
      sevenDaysAgo.setHours(0, 0, 0, 0)
      filtered = filtered.filter(c => {
        const corDate = new Date(c.created_at)
        return corDate >= sevenDaysAgo
      })
    }

    // Sort by created_at descending
    filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

    // In preview mode, limit to previewLimit items
    if (previewMode) {
      filtered = filtered.slice(0, previewLimit)
    }

    return filtered
  }, [cors, filter, areaFilter, groupFilter, viewMode, dateFilter, previewMode, previewLimit])

  // Pagination for COR list (skipped in preview mode)
  const {
    paginatedItems,
    searchTerm,
    setSearchTerm,
    currentPage,
    totalPages,
    goToPage,
    pageSize,
    setPageSize,
    totalItems: paginatedTotalItems
  } = useFilteredPagination(filteredCORs, {
    pageSize: 25,
    searchFields: ['title', 'cor_number', 'scope_of_work', 'status']
  })

  // In preview mode use filteredCORs directly; otherwise use paginated results
  const displayCORs = previewMode ? filteredCORs : paginatedItems

  // Group CORs by month for 'all' view
  const corsByMonth = useMemo(() => {
    if (viewMode !== 'all') return null

    const groups = {}
    displayCORs.forEach(cor => {
      const date = new Date(cor.created_at)
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      const monthLabel = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

      if (!groups[monthKey]) {
        groups[monthKey] = { label: monthLabel, cors: [], totalAmount: 0 }
      }
      groups[monthKey].cors.push(cor)
      groups[monthKey].totalAmount += cor.cor_total || 0
    })

    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]))
  }, [displayCORs, viewMode])

  // Auto-expand current month
  useEffect(() => {
    if (corsByMonth && corsByMonth.length > 0) {
      const currentMonthKey = corsByMonth[0][0]
      setExpandedMonths(new Set([currentMonthKey]))
    }
  }, [corsByMonth])

  const toggleMonthExpand = (monthKey) => {
    const newExpanded = new Set(expandedMonths)
    if (newExpanded.has(monthKey)) {
      newExpanded.delete(monthKey)
    } else {
      newExpanded.add(monthKey)
    }
    setExpandedMonths(newExpanded)
  }

  // Count by status
  const counts = useMemo(() => ({
    all: cors.length,
    draft: cors.filter(c => c.status === 'draft').length,
    pending_approval: cors.filter(c => c.status === 'pending_approval').length,
    approved: cors.filter(c => c.status === 'approved').length,
    rejected: cors.filter(c => c.status === 'rejected').length,
    billed: cors.filter(c => c.status === 'billed').length,
    closed: cors.filter(c => c.status === 'closed').length
  }), [cors])

  const totalCORsCount = filter === 'all' ? cors.length : cors.filter(c => c.status === filter).length

  // Render COR card using memoized component
  const renderCORCard = (cor) => (
    <CORCard
      key={cor.id}
      cor={cor}
      isSelected={selectedCORs.has(cor.id)}
      selectMode={selectMode}
      areas={areas}
      onToggleSelect={toggleCORSelection}
      onView={onViewCOR}
      onEdit={onEditCOR}
      onDelete={handleDelete}
      onSubmitForApproval={handleSubmitForApproval}
    />
  )

  if (loading) {
    return (
      <div className="cor-list">
        <div className="cor-loading-skeletons">
          {[1, 2, 3].map(i => (
            <CardSkeleton key={i} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className={`cor-list ${previewMode ? 'cor-list-preview' : ''}`}>
      {/* Clean Header */}
      <div className="cor-list-header">
        <div className="cor-list-info">
          <h3>Change Orders</h3>
          <div className="cor-stats-inline">
            <span className="cor-stat-item">{counts.all} total</span>
            {counts.pending_approval > 0 && (
              <span className="cor-stat-item pending">{counts.pending_approval} pending</span>
            )}
            {stats?.totalApproved > 0 && (
              <span className="cor-stat-item approved">{formatCurrency(stats.totalApproved)}</span>
            )}
          </div>
        </div>
        <div className="cor-header-actions">
          {/* Export buttons - always visible */}
          {/* Export Dropdown */}
          <div className="cor-export-dropdown" ref={exportMenuRef}>
            <button
              className="btn btn-secondary btn-small"
              onClick={() => setShowExportMenu(!showExportMenu)}
              disabled={cors.length === 0}
            >
              <Download size={14} /> Export <ChevronDown size={12} />
            </button>
            {showExportMenu && (
              <div className="cor-export-menu">
                <button onClick={() => { exportToPDF(); setShowExportMenu(false); }}>
                  <FileText size={14} /> Export as PDF
                </button>
                <button onClick={() => { exportToExcel(); setShowExportMenu(false); }}>
                  <FileSpreadsheet size={14} /> Export as Excel
                </button>
              </div>
            )}
          </div>
          {/* Display Mode Toggle - Log button is prominent for business use */}
          <div className="cor-display-toggle">
            <button
              className={`cor-display-btn ${displayMode === 'list' ? 'active' : ''}`}
              onClick={() => handleDisplayModeChange('list')}
              title="List View"
            >
              <List size={14} />
              <span>List</span>
            </button>
            <button
              className={`cor-display-btn log-btn ${displayMode === 'log' ? 'active' : ''}`}
              onClick={() => handleDisplayModeChange('log')}
              title="COR Log - Edit & Export for Clients"
            >
              <Table size={14} />
              <span>COR Log</span>
            </button>
          </div>
          {previewMode ? (
            // In preview mode, show "See All" button and New COR button
            <>
              <button className="btn btn-primary btn-small" onClick={onCreateCOR}>
                <Plus size={14} /> New COR
              </button>
            </>
          ) : (
            // Full mode shows select and new buttons
            <>
              {displayMode === 'list' && (
                <button
                  className={`btn btn-secondary btn-small ${selectMode ? 'active' : ''}`}
                  onClick={() => selectMode ? exitSelectMode() : setSelectMode(true)}
                >
                  {selectMode ? <><X size={14} /> Cancel</> : <><CheckSquare size={14} /> Select</>}
                </button>
              )}
              <button className="btn btn-primary btn-small" onClick={onCreateCOR}>
                <Plus size={14} /> New COR
              </button>
            </>
          )}
        </div>
      </div>

      {/* Log View - renders CORLog in a full-screen modal for better editing */}
      {displayMode === 'log' && (
        <div className="cor-log-modal-overlay" onClick={() => handleDisplayModeChange('list')}>
          <div className="cor-log-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cor-log-modal-header">
              <h2>Change Order Log</h2>
              <button
                className="cor-log-modal-close"
                onClick={() => handleDisplayModeChange('list')}
                title="Close"
              >
                <X size={24} />
              </button>
            </div>
            <div className="cor-log-modal-content">
              <CORLog project={project} company={company} onShowToast={onShowToast} />
            </div>
          </div>
        </div>
      )}

      {displayMode === 'list' && (
        <>
          {/* Selection Action Bar */}
          {selectMode && selectedCORs.size > 0 && (
            <div className="cor-selection-bar">
              <span className="selection-count">{selectedCORs.size} selected</span>
              <button
                className="btn btn-primary btn-small"
                onClick={() => setShowGroupModal(true)}
              >
                <FolderPlus size={14} /> Group Selected
              </button>
            </div>
          )}

          {/* Minimal Filter Row - hidden in preview mode */}
          {!previewMode && (
            <div className="cor-controls">
              <div className="cor-filter-pills" role="tablist">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'draft', label: 'Draft' },
                  { id: 'pending_approval', label: 'Pending' },
                  { id: 'approved', label: 'Approved' }
                ].map(status => (
                  <button
                    key={status.id}
                    role="tab"
                    aria-selected={filter === status.id}
                    className={`cor-pill ${filter === status.id ? 'active' : ''}`}
                    onClick={() => setFilter(status.id)}
                  >
                    {status.label}
                    {counts[status.id] > 0 && <span className="cor-pill-count">{counts[status.id]}</span>}
                  </button>
                ))}
              </div>

              {/* Group Filter */}
              {availableGroups.length > 0 && (
                <select
                  className="cor-group-filter"
                  value={groupFilter}
                  onChange={(e) => setGroupFilter(e.target.value)}
                >
                  <option value="all">All Groups</option>
                  {availableGroups.map(group => (
                    <option key={group} value={group}>{group}</option>
                  ))}
                </select>
              )}

              {/* View Toggle */}
              <div className="cor-view-toggle">
                <button
                  className={`cor-toggle-btn ${viewMode === 'recent' ? 'active' : ''}`}
                  onClick={() => { setViewMode('recent'); setDateFilter({ start: '', end: '' }); }}
                >
                  Recent
                </button>
                <button
                  className={`cor-toggle-btn ${viewMode === 'all' ? 'active' : ''}`}
                  onClick={() => setViewMode('all')}
                >
                  All
                </button>
              </div>
            </div>
          )}

          {/* Search Input */}
          {!previewMode && (
            <div className="cor-search">
              <Search size={14} className="cor-search-icon" />
              <input
                type="text"
                className="cor-search-input"
                placeholder="Search CORs by title, number, scope, or status..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button className="cor-search-clear" onClick={() => setSearchTerm('')}>
                  <X size={14} />
                </button>
              )}
            </div>
          )}

          {/* Date Filter - Only in All mode and not preview mode */}
          {viewMode === 'all' && !previewMode && (
            <div className="cor-date-filter">
              <Calendar size={14} />
              <input
                type="date"
                value={dateFilter.start}
                onChange={(e) => setDateFilter(prev => ({ ...prev, start: e.target.value }))}
              />
              <span className="cor-date-sep">to</span>
              <input
                type="date"
                value={dateFilter.end}
                onChange={(e) => setDateFilter(prev => ({ ...prev, end: e.target.value }))}
              />
              {(dateFilter.start || dateFilter.end) && (
                <button className="cor-clear-btn" onClick={() => setDateFilter({ start: '', end: '' })}>
                  Clear
                </button>
              )}
            </div>
          )}

          {/* COR List */}
          {displayCORs.length === 0 ? (
            <div className="cor-empty">
              <FileText size={24} className="cor-empty-icon" />
              <p>No change orders {filter !== 'all' ? `(${filter.replace('_', ' ')})` : ''}</p>
              <button className="btn btn-primary btn-small" onClick={onCreateCOR}>
                <Plus size={14} /> Create COR
              </button>
            </div>
          ) : (
            <div className="cor-cards stagger-children">
              {viewMode === 'all' && corsByMonth ? (
                corsByMonth.map(([monthKey, monthData]) => (
                  <div key={monthKey} className="cor-month-group animate-fade-in">
                    <button
                      className="cor-month-header"
                      onClick={() => toggleMonthExpand(monthKey)}
                    >
                      <div className="cor-month-left">
                        {expandedMonths.has(monthKey) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        <span>{monthData.label}</span>
                        <CountBadge count={monthData.cors.length} size="small" />
                      </div>
                      <span className="cor-month-total">{formatCurrency(monthData.totalAmount)}</span>
                    </button>
                    {expandedMonths.has(monthKey) && (
                      <div className="cor-month-items stagger-children">
                        {monthData.cors.map(cor => renderCORCard(cor))}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                displayCORs.map(cor => renderCORCard(cor))
              )}
            </div>
          )}

          {/* Pagination - only in full mode */}
          {!previewMode && totalPages > 1 && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={goToPage}
              pageSize={pageSize}
              onPageSizeChange={setPageSize}
              totalItems={paginatedTotalItems}
            />
          )}

          {/* See All Footer - only in preview mode when there are more items */}
          {previewMode && cors.length > previewLimit && (
            <button className="cor-see-all-btn" onClick={onViewAll}>
              See all {cors.length} change orders
              <ChevronRight size={16} />
            </button>
          )}
        </>
      )}

      {/* Group Modal */}
      {showGroupModal && (
        <div className="modal-overlay" onClick={() => setShowGroupModal(false)}>
          <div className="modal-content cor-group-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Group {selectedCORs.size} CORs</h3>
              <button className="close-btn" onClick={() => setShowGroupModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Group Name</label>
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="e.g., Phase 1, Building A, Week 1"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleGroupSelected()
                    if (e.key === 'Escape') setShowGroupModal(false)
                  }}
                />
              </div>
              {availableGroups.length > 0 && (
                <div className="existing-groups">
                  <label>Or select existing group:</label>
                  <div className="group-chips">
                    {availableGroups.map(group => (
                      <button
                        key={group}
                        className="group-chip"
                        onClick={() => setNewGroupName(group)}
                      >
                        {group}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowGroupModal(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleGroupSelected}>
                Group CORs
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
