import { useState, useCallback, useMemo } from 'react'

/**
 * useFinancialsState - Consolidates all Financials tab state and handlers
 *
 * Extracts 18 useState hooks and ~15 useCallback handlers from Dashboard.jsx
 * into a single cohesive hook. Manages:
 * - Sidebar navigation state (section, collapsed, mobile overlay)
 * - COR state (form, detail, log, list expansion, display mode, refresh)
 * - T&M state (view mode)
 * - Equipment state (modal, editing, refresh)
 * - Draw Request state (modal, editing, refresh)
 * - Cost state (modal, saving)
 */
export default function useFinancialsState() {
  // Sidebar navigation
  const [financialsSection, setFinancialsSection] = useState('overview')
  const [financialsSidebarCollapsed, setFinancialsSidebarCollapsed] = useState(true)
  const [financialsSidebarMobileOpen, setFinancialsSidebarMobileOpen] = useState(false)

  // COR state
  const [corListExpanded, setCORListExpanded] = useState(false)
  const [corDisplayMode, setCORDisplayMode] = useState('list')
  const [tmViewMode, setTMViewMode] = useState('preview')
  const [showCORForm, setShowCORForm] = useState(false)
  const [editingCOR, setEditingCOR] = useState(null)
  const [showCORDetail, setShowCORDetail] = useState(false)
  const [viewingCOR, setViewingCOR] = useState(null)
  const [corRefreshKey, setCORRefreshKey] = useState(0)

  // Cost state
  const [showAddCostModal, setShowAddCostModal] = useState(false)
  const [savingCost, setSavingCost] = useState(false)

  // Equipment state
  const [showEquipmentModal, setShowEquipmentModal] = useState(false)
  const [editingEquipment, setEditingEquipment] = useState(null)
  const [equipmentRefreshKey, setEquipmentRefreshKey] = useState(0)

  // Draw request state
  const [showDrawRequestModal, setShowDrawRequestModal] = useState(false)
  const [editingDrawRequest, setEditingDrawRequest] = useState(null)
  const [drawRequestRefreshKey, setDrawRequestRefreshKey] = useState(0)

  // Sidebar handlers
  const handleToggleFinancialsSidebar = useCallback(() => {
    setFinancialsSidebarCollapsed(prev => !prev)
  }, [])

  const handleToggleMobileSidebar = useCallback(() => {
    setFinancialsSidebarMobileOpen(prev => !prev)
  }, [])

  const handleCloseMobileSidebar = useCallback(() => {
    setFinancialsSidebarMobileOpen(false)
  }, [])

  // COR handlers
  const handleToggleCORList = useCallback(() => {
    setCORListExpanded(prev => !prev)
  }, [])

  const handleViewFullCORLog = useCallback(() => {
    setCORDisplayMode('log')
  }, [])

  const handleCreateCOR = useCallback(() => {
    setEditingCOR(null)
    setShowCORForm(true)
  }, [])

  const handleViewCOR = useCallback((cor) => {
    setViewingCOR(cor)
    setShowCORDetail(true)
  }, [])

  const handleEditCOR = useCallback((cor) => {
    setEditingCOR(cor)
    setShowCORForm(true)
  }, [])

  const refreshCORs = useCallback(() => {
    setCORRefreshKey(prev => prev + 1)
  }, [])

  // T&M handlers
  const handleViewAllTickets = useCallback(() => {
    setTMViewMode('full')
  }, [])

  const handleBackToTMPreview = useCallback(() => {
    setTMViewMode('preview')
  }, [])

  // Equipment handlers
  const handleAddEquipment = useCallback(() => {
    setEditingEquipment(null)
    setShowEquipmentModal(true)
  }, [])

  const handleEditEquipment = useCallback((item) => {
    setEditingEquipment(item)
    setShowEquipmentModal(true)
  }, [])

  // Draw request handlers
  const handleCreateDraw = useCallback(() => {
    setEditingDrawRequest(null)
    setShowDrawRequestModal(true)
  }, [])

  const handleViewDraw = useCallback((drawRequest) => {
    setEditingDrawRequest(drawRequest)
    setShowDrawRequestModal(true)
  }, [])

  // Cost handler
  const handleAddCost = useCallback(() => {
    setShowAddCostModal(true)
  }, [])

  // Modal close/save handlers for FinancialsModals component
  const handleCloseCORForm = useCallback(() => {
    setShowCORForm(false)
    setEditingCOR(null)
  }, [])

  const handleCORFormSaved = useCallback(() => {
    setShowCORForm(false)
    setEditingCOR(null)
    setCORRefreshKey(prev => prev + 1)
  }, [])

  const handleCloseCORDetail = useCallback(() => {
    setShowCORDetail(false)
    setViewingCOR(null)
  }, [])

  const handleCORDetailEdit = useCallback((cor) => {
    setShowCORDetail(false)
    setViewingCOR(null)
    setEditingCOR(cor)
    setShowCORForm(true)
  }, [])

  const handleCloseCORLog = useCallback(() => {
    setCORDisplayMode('list')
  }, [])

  const handleCloseAddCostModal = useCallback(() => {
    setShowAddCostModal(false)
  }, [])

  const handleCloseEquipmentModal = useCallback(() => {
    setShowEquipmentModal(false)
    setEditingEquipment(null)
  }, [])

  const handleEquipmentSaved = useCallback(() => {
    setShowEquipmentModal(false)
    const wasEditing = editingEquipment
    setEditingEquipment(null)
    setEquipmentRefreshKey(prev => prev + 1)
    return wasEditing ? 'Equipment updated' : 'Equipment added'
  }, [editingEquipment])

  const handleCloseDrawRequestModal = useCallback(() => {
    setShowDrawRequestModal(false)
    setEditingDrawRequest(null)
  }, [])

  const handleDrawRequestSaved = useCallback(() => {
    setShowDrawRequestModal(false)
    const wasEditing = editingDrawRequest
    setEditingDrawRequest(null)
    setDrawRequestRefreshKey(prev => prev + 1)
    return wasEditing ? 'Draw request updated' : 'Draw request created'
  }, [editingDrawRequest])

  return {
    // Sidebar state
    financialsSection,
    setFinancialsSection,
    financialsSidebarCollapsed,
    financialsSidebarMobileOpen,
    onToggleFinancialsSidebar: handleToggleFinancialsSidebar,
    onToggleMobileSidebar: handleToggleMobileSidebar,
    onCloseMobileSidebar: handleCloseMobileSidebar,

    // COR state
    corListExpanded,
    corDisplayMode,
    setCORDisplayMode,
    corRefreshKey,
    showCORForm,
    editingCOR,
    showCORDetail,
    viewingCOR,
    onToggleCORList: handleToggleCORList,
    onViewFullCORLog: handleViewFullCORLog,
    onCreateCOR: handleCreateCOR,
    onViewCOR: handleViewCOR,
    onEditCOR: handleEditCOR,
    refreshCORs,

    // T&M state
    tmViewMode,
    onViewAllTickets: handleViewAllTickets,
    onBackToTMPreview: handleBackToTMPreview,

    // Equipment state
    showEquipmentModal,
    editingEquipment,
    equipmentRefreshKey,
    onAddEquipment: handleAddEquipment,
    onEditEquipment: handleEditEquipment,

    // Draw request state
    showDrawRequestModal,
    editingDrawRequest,
    drawRequestRefreshKey,
    onCreateDraw: handleCreateDraw,
    onViewDraw: handleViewDraw,

    // Cost state
    showAddCostModal,
    savingCost,
    setSavingCost,
    onAddCost: handleAddCost,

    // Modal close/save handlers (for FinancialsModals)
    handleCloseCORForm,
    handleCORFormSaved,
    handleCloseCORDetail,
    handleCORDetailEdit,
    handleCloseCORLog,
    handleCloseAddCostModal,
    handleCloseEquipmentModal,
    handleEquipmentSaved,
    handleCloseDrawRequestModal,
    handleDrawRequestSaved,
  }
}
