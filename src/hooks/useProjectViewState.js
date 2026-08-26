import { useState, useEffect, useCallback, useRef } from 'react'

/**
 * useProjectViewState - UI state for the project detail view.
 *
 * Owns tab/section navigation, sidebar toggles, and every modal's
 * open/close state (share, alerts, COR form/detail, costs, equipment,
 * draw requests). Lives in Dashboard (not ProjectDetailView) because
 * portfolio-level callbacks also navigate into specific tabs/sections.
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

  // First time the user visits the Tickets section, land on the full
  // dashboard; on later visits keep whatever mode they last picked so
  // switching sections doesn't discard their preview/full choice.
  const seenTicketsSectionRef = useRef(false)
  useEffect(() => {
    if (financialsSection === 'tickets' && !seenTicketsSectionRef.current) {
      seenTicketsSectionRef.current = true
      setTMViewMode('full')
    }
  }, [financialsSection])

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
    setCORListExpanded(prev => !prev)
  }, [])

  const handleCreateCOR = useCallback(() => {
    setEditingCOR(null)
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
    setShowCORForm(true)
  }, [])

  const handleAddCost = useCallback(() => {
    setShowAddCostModal(true)
  }, [])

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
    setProjectTab,
    resetSections,
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
    handleCreateTMTicket,
    handleCreateDailyReport,
    handleViewCOR,
    handleEditCOR,
    handleAddCost
  }
}
