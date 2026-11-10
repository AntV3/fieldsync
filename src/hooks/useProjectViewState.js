import { useState, useEffect, useCallback, useRef } from 'react'

/**
 * useProjectViewState - UI state for the project detail view.
 *
 * Owns tab/section navigation, sidebar toggles, and every modal's
 * open/close state (share, alerts, COR form/detail, costs, equipment,
 * draw requests). Lives in Dashboard (not ProjectDetailView) because
 * portfolio-level callbacks also navigate into specific tabs/sections.
 *
 * Deep links from the office quick actions travel as "requests"
 * ({ key, filter }): ticketReviewRequest is read by TMList, corFilterRequest
 * by CORList. A new key means "apply this filter again".
 */
export default function useProjectViewState() {
  const [activeProjectTab, setActiveProjectTab] = useState('overview')
  const [fieldSection, setFieldSection] = useState('reports') // 'reports' | 'rfis' | 'submittals' | 'observations' | 'punchlist'
  const [infoSection, setInfoSection] = useState('details') // 'details' | 'analytics' | 'team' | 'settings'
  const [financialsSection, setFinancialsSection] = useState('overview') // 'overview' | 'cors' | 'tickets' | 'billing' | 'exports'
  const [financialsSidebarCollapsed, setFinancialsSidebarCollapsed] = useState(true) // Start collapsed for more real estate
  const [financialsSidebarMobileOpen, setFinancialsSidebarMobileOpen] = useState(false) // For mobile sidebar overlay
  const [corListExpanded, setCORListExpanded] = useState(false) // Whether the full card list is shown below the log
  const [corDisplayMode, setCORDisplayMode] = useState('list') // 'list' | 'log' - for layout expansion
  const [tmViewMode, setTMViewMode] = useState('preview') // 'preview' | 'full'
  const [showShareModal, setShowShareModal] = useState(false)
  const [showNotificationSettings, setShowNotificationSettings] = useState(false)
  const [showCORForm, setShowCORForm] = useState(false)
  const [editingCOR, setEditingCOR] = useState(null)
  const [showCORDetail, setShowCORDetail] = useState(false)
  const [viewingCOR, setViewingCOR] = useState(null)
  const [showTMTicketModal, setShowTMTicketModal] = useState(false)
  const [showDailyReportModal, setShowDailyReportModal] = useState(false)
  const [showAddCostModal, setShowAddCostModal] = useState(false)
  const [savingCost, setSavingCost] = useState(false)
  const [showEquipmentModal, setShowEquipmentModal] = useState(false)
  const [editingEquipment, setEditingEquipment] = useState(null)
  const [equipmentRefreshKey, setEquipmentRefreshKey] = useState(0)
  const [showDrawRequestModal, setShowDrawRequestModal] = useState(false)
  const [editingDrawRequest, setEditingDrawRequest] = useState(null)
  const [drawRequestRefreshKey, setDrawRequestRefreshKey] = useState(0)
  const [ticketReviewRequest, setTicketReviewRequest] = useState(null) // null | { key, filter: 'pending' }
  const [corFilterRequest, setCORFilterRequest] = useState(null) // null | { key, filter: 'draft' | 'pending_approval' }
  const [corFormStartWithTickets, setCORFormStartWithTickets] = useState(false) // New COR opens on the ticket picker
  const requestKeyRef = useRef(0)

  // Prevent body scroll when mobile sidebar is open
  useEffect(() => {
    if (financialsSidebarMobileOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }

    return () => {
      document.body.style.overflow = ''
    }
  }, [financialsSidebarMobileOpen])

  // When navigating to tickets section, switch to full mode to show dashboard
  useEffect(() => {
    if (financialsSection === 'tickets') {
      setTMViewMode('full')
    }
  }, [financialsSection])

  // A request only lives while its list is on screen, so coming back to the
  // section later does not force the filter again
  useEffect(() => {
    const inFinancials = activeProjectTab === 'financials'
    if (!inFinancials || financialsSection !== 'tickets') setTicketReviewRequest(null)
    if (!inFinancials || financialsSection !== 'cors') setCORFilterRequest(null)
  }, [activeProjectTab, financialsSection])

  // Closing the COR form (from anywhere) ends the "start with tickets" mode
  useEffect(() => {
    if (!showCORForm) setCORFormStartWithTickets(false)
  }, [showCORForm])

  // Navigate to a tab, mapping legacy tab ids (from before the 9→5 consolidation)
  // to their new home: parent tab + sub-section
  const setProjectTab = useCallback((tabId) => {
    switch (tabId) {
      case 'reports':
        setActiveProjectTab('field')
        setFieldSection('reports')
        break
      case 'rfis':
        setActiveProjectTab('field')
        setFieldSection('rfis')
        break
      case 'submittals':
        setActiveProjectTab('field')
        setFieldSection('submittals')
        break
      case 'exports':
        setActiveProjectTab('financials')
        setFinancialsSection('exports')
        break
      case 'analytics':
        setActiveProjectTab('info')
        setInfoSection('analytics')
        break
      case 'info':
        setActiveProjectTab('info')
        setInfoSection('details')
        break
      default:
        setActiveProjectTab(tabId)
    }
  }, [])

  // Reset navigation when leaving the project detail view
  const resetSections = useCallback(() => {
    setActiveProjectTab('overview')
    setFieldSection('reports')
    setInfoSection('details')
    setTicketReviewRequest(null)
    setCORFilterRequest(null)
    setCORFormStartWithTickets(false)
  }, [])

  // Open the ticket list on what the office still has to review
  const openTicketReview = useCallback(() => {
    setActiveProjectTab('financials')
    setFinancialsSection('tickets')
    setTMViewMode('full')
    requestKeyRef.current += 1
    setTicketReviewRequest({ key: requestKeyRef.current, filter: 'pending' })
  }, [])

  // Open the COR list on one status: 'draft' | 'pending_approval'
  const openCORs = useCallback((filter) => {
    setActiveProjectTab('financials')
    setFinancialsSection('cors')
    setCORListExpanded(true)
    requestKeyRef.current += 1
    setCORFilterRequest({ key: requestKeyRef.current, filter })
  }, [])

  // Memoized handlers so child components don't re-render from new inline closures
  const handleAddEquipment = useCallback(() => {
    setEditingEquipment(null)
    setShowEquipmentModal(true)
  }, [])

  const handleEditEquipment = useCallback((item) => {
    setEditingEquipment(item)
    setShowEquipmentModal(true)
  }, [])

  const handleCreateDraw = useCallback(() => {
    setEditingDrawRequest(null)
    setShowDrawRequestModal(true)
  }, [])

  const handleViewDraw = useCallback((drawRequest) => {
    setEditingDrawRequest(drawRequest)
    setShowDrawRequestModal(true)
  }, [])

  const handleViewAllTickets = useCallback(() => {
    setTMViewMode('full')
  }, [])

  const handleBackToTMPreview = useCallback(() => {
    setTMViewMode('preview')
  }, [])

  const handleToggleFinancialsSidebar = useCallback(() => {
    setFinancialsSidebarCollapsed(prev => !prev)
  }, [])

  const handleToggleMobileSidebar = useCallback(() => {
    setFinancialsSidebarMobileOpen(prev => !prev)
  }, [])

  const handleCloseMobileSidebar = useCallback(() => {
    setFinancialsSidebarMobileOpen(false)
  }, [])

  const handleToggleCORList = useCallback(() => {
    // A filter request is one-shot: re-opening the list must not re-apply it
    setCORFilterRequest(null)
    setCORListExpanded(prev => !prev)
  }, [])

  const handleCreateCOR = useCallback(() => {
    setEditingCOR(null)
    setCORFormStartWithTickets(false)
    setShowCORForm(true)
  }, [])

  // New COR that opens straight on the approved-ticket picker
  const handleBuildCORFromTickets = useCallback(() => {
    setEditingCOR(null)
    setCORFormStartWithTickets(true)
    setShowCORForm(true)
  }, [])

  const handleCreateTMTicket = useCallback(() => {
    setShowTMTicketModal(true)
  }, [])

  const handleCreateDailyReport = useCallback(() => {
    setShowDailyReportModal(true)
  }, [])

  const handleViewCOR = useCallback((cor) => {
    setViewingCOR(cor)
    setShowCORDetail(true)
  }, [])

  const handleEditCOR = useCallback((cor) => {
    setEditingCOR(cor)
    setCORFormStartWithTickets(false)
    setShowCORForm(true)
  }, [])

  const handleAddCost = useCallback(() => {
    setShowAddCostModal(true)
  }, [])

  // Anything covering the page: the floating quick-actions button hides under it
  const isModalOpen = showShareModal || showNotificationSettings || showCORForm || showCORDetail ||
    showTMTicketModal || showDailyReportModal || showAddCostModal || showEquipmentModal ||
    showDrawRequestModal || corDisplayMode === 'log' || financialsSidebarMobileOpen

  return {
    activeProjectTab, setActiveProjectTab,
    fieldSection, setFieldSection,
    infoSection, setInfoSection,
    financialsSection, setFinancialsSection,
    financialsSidebarCollapsed,
    financialsSidebarMobileOpen,
    corListExpanded,
    corDisplayMode, setCORDisplayMode,
    tmViewMode,
    showShareModal, setShowShareModal,
    showNotificationSettings, setShowNotificationSettings,
    showCORForm, setShowCORForm,
    editingCOR, setEditingCOR,
    showCORDetail, setShowCORDetail,
    viewingCOR, setViewingCOR,
    showTMTicketModal, setShowTMTicketModal,
    showDailyReportModal, setShowDailyReportModal,
    showAddCostModal, setShowAddCostModal,
    savingCost, setSavingCost,
    showEquipmentModal, setShowEquipmentModal,
    editingEquipment, setEditingEquipment,
    equipmentRefreshKey, setEquipmentRefreshKey,
    showDrawRequestModal, setShowDrawRequestModal,
    editingDrawRequest, setEditingDrawRequest,
    drawRequestRefreshKey, setDrawRequestRefreshKey,
    ticketReviewRequest,
    corFilterRequest,
    corFormStartWithTickets,
    isModalOpen,
    setProjectTab,
    resetSections,
    openTicketReview,
    openCORs,
    handleAddEquipment,
    handleEditEquipment,
    handleCreateDraw,
    handleViewDraw,
    handleViewAllTickets,
    handleBackToTMPreview,
    handleToggleFinancialsSidebar,
    handleToggleMobileSidebar,
    handleCloseMobileSidebar,
    handleToggleCORList,
    handleCreateCOR,
    handleBuildCORFromTickets,
    handleCreateTMTicket,
    handleCreateDailyReport,
    handleViewCOR,
    handleEditCOR,
    handleAddCost
  }
}
