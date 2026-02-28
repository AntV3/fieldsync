import { useState, useCallback, useMemo } from 'react'

/**
 * useModal - Manages modal/dialog state
 * Replaces the common pattern of showModal/setShowModal state
 *
 * @param {boolean} initialOpen - Whether modal starts open
 * @returns {Object} Modal state and controls
 */
export function useModal(initialOpen = false) {
  const [isOpen, setIsOpen] = useState(initialOpen)
  const [data, setData] = useState(null)

  const open = useCallback((modalData = null) => {
    setData(modalData)
    setIsOpen(true)
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
    // Delay clearing data to allow close animation
    setTimeout(() => setData(null), 300)
  }, [])

  const toggle = useCallback(() => {
    setIsOpen(prev => !prev)
  }, [])

  return {
    isOpen,
    data,
    open,
    close,
    toggle,
    setData
  }
}

/**
 * useMultiModal - Manages multiple modals with a single state object
 * Replaces the pattern of having 10+ individual modal state variables
 *
 * @param {Object} initialModals - Object with modal names and initial states
 * @returns {Object} Modal states and controls
 *
 * @example
 * const modals = useMultiModal({
 *   share: false,
 *   settings: false,
 *   confirm: false
 * })
 *
 * // Open with data
 * modals.open('share', { projectId: 123 })
 *
 * // Check if open
 * {modals.isOpen('share') && <ShareModal data={modals.getData('share')} />}
 *
 * // Close
 * modals.close('share')
 */
export function useMultiModal(initialModals = {}) {
  const [modals, setModals] = useState(() => {
    const state = {}
    for (const key of Object.keys(initialModals)) {
      state[key] = { isOpen: initialModals[key], data: null }
    }
    return state
  })

  const isOpen = useCallback((name) => {
    return modals[name]?.isOpen || false
  }, [modals])

  const getData = useCallback((name) => {
    return modals[name]?.data || null
  }, [modals])

  const open = useCallback((name, data = null) => {
    setModals(prev => ({
      ...prev,
      [name]: { isOpen: true, data }
    }))
  }, [])

  const close = useCallback((name) => {
    setModals(prev => ({
      ...prev,
      [name]: { ...prev[name], isOpen: false }
    }))
    // Delay clearing data
    setTimeout(() => {
      setModals(prev => ({
        ...prev,
        [name]: { ...prev[name], data: null }
      }))
    }, 300)
  }, [])

  const toggle = useCallback((name) => {
    setModals(prev => ({
      ...prev,
      [name]: { ...prev[name], isOpen: !prev[name]?.isOpen }
    }))
  }, [])

  const closeAll = useCallback(() => {
    setModals(prev => {
      const newState = {}
      for (const key of Object.keys(prev)) {
        newState[key] = { isOpen: false, data: null }
      }
      return newState
    })
  }, [])

  // Get currently open modal (useful for single-modal-at-a-time UIs)
  const activeModal = useMemo(() => {
    for (const [name, state] of Object.entries(modals)) {
      if (state.isOpen) return { name, data: state.data }
    }
    return null
  }, [modals])

  return {
    modals,
    isOpen,
    getData,
    open,
    close,
    toggle,
    closeAll,
    activeModal
  }
}

/**
 * useConfirmModal - Specialized modal for confirmation dialogs
 * Returns a promise that resolves when user confirms/cancels
 *
 * @returns {Object} Confirm modal controls
 *
 * @example
 * const confirm = useConfirmModal()
 *
 * const handleDelete = async () => {
 *   const confirmed = await confirm.show({
 *     title: 'Delete Item?',
 *     message: 'This action cannot be undone.',
 *     confirmText: 'Delete',
 *     cancelText: 'Cancel'
 *   })
 *
 *   if (confirmed) {
 *     // Perform delete
 *   }
 * }
 */
export function useConfirmModal() {
  const [state, setState] = useState({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    variant: 'default', // 'default' | 'danger' | 'warning'
    resolver: null
  })

  const show = useCallback((options = {}) => {
    return new Promise((resolve) => {
      setState({
        isOpen: true,
        title: options.title || 'Confirm',
        message: options.message || 'Are you sure?',
        confirmText: options.confirmText || 'Confirm',
        cancelText: options.cancelText || 'Cancel',
        variant: options.variant || 'default',
        resolver: resolve
      })
    })
  }, [])

  const confirm = useCallback(() => {
    if (state.resolver) {
      state.resolver(true)
    }
    setState(prev => ({ ...prev, isOpen: false, resolver: null }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.resolver])

  const cancel = useCallback(() => {
    if (state.resolver) {
      state.resolver(false)
    }
    setState(prev => ({ ...prev, isOpen: false, resolver: null }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.resolver])

  return {
    isOpen: state.isOpen,
    title: state.title,
    message: state.message,
    confirmText: state.confirmText,
    cancelText: state.cancelText,
    variant: state.variant,
    show,
    confirm,
    cancel
  }
}

export default useModal
