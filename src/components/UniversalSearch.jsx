import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, X, FolderOpen, FileText, Users, ClipboardList, ChevronRight, Command } from 'lucide-react'
import { db } from '../lib/supabase'

export default function UniversalSearch({
  isOpen,
  onClose,
  companyId,
  onSelectProject,
  onSelectTicket,
  onSelectCOR,
  onShowToast
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState({ projects: [], tickets: [], cors: [], workers: [] })
  const [loading, setLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef(null)
  const searchTimeoutRef = useRef(null)
  const focusTimeoutRef = useRef(null)

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
      if (focusTimeoutRef.current) clearTimeout(focusTimeoutRef.current)
    }
  }, [])

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setResults({ projects: [], tickets: [], cors: [], workers: [] })
      setSelectedIndex(0)
      focusTimeoutRef.current = setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  // Debounced search
  const performSearch = useCallback(async (searchQuery) => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setResults({ projects: [], tickets: [], cors: [], workers: [] })
      return
    }

    setLoading(true)
    try {
      const searchResults = await db.universalSearch(companyId, searchQuery.trim())
      setResults(searchResults)
      setSelectedIndex(0)
    } catch (error) {
      console.error('Search error:', error)
      onShowToast?.('Search failed', 'error')
    } finally {
      setLoading(false)
    }
  }, [companyId, onShowToast])

  // Handle input change with debounce
  const handleInputChange = (e) => {
    const value = e.target.value
    setQuery(value)

    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    // Debounce search
    searchTimeoutRef.current = setTimeout(() => {
      performSearch(value)
    }, 200)
  }

  // Get all results as flat array for keyboard navigation
  const getAllResults = () => {
    const all = []
    results.projects.forEach(p => all.push({ type: 'project', data: p }))
    results.tickets.forEach(t => all.push({ type: 'ticket', data: t }))
    results.cors.forEach(c => all.push({ type: 'cor', data: c }))
    results.workers.forEach(w => all.push({ type: 'worker', data: w }))
    return all
  }

  const allResults = getAllResults()
  const hasResults = allResults.length > 0

  // Handle keyboard navigation
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(prev => Math.min(prev + 1, allResults.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(prev => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter' && hasResults) {
      e.preventDefault()
      handleSelect(allResults[selectedIndex])
    }
  }

  // Handle selection
  const handleSelect = (item) => {
    if (!item) return

    switch (item.type) {
      case 'project':
        onSelectProject?.(item.data)
        break
      case 'ticket':
        onSelectTicket?.(item.data)
        break
      case 'cor':
        onSelectCOR?.(item.data)
        break
      case 'worker':
        // Navigate to project where worker was last seen
        if (item.data.lastProject) {
          onSelectProject?.(item.data.lastProject)
        }
        break
    }
    onClose()
  }

  // Get icon for result type
  const getIcon = (type) => {
    switch (type) {
      case 'project': return FolderOpen
      case 'ticket': return FileText
      case 'cor': return ClipboardList
      case 'worker': return Users
      default: return FileText
    }
  }

  // Get label for result type
  const getTypeLabel = (type) => {
    switch (type) {
      case 'project': return 'Project'
      case 'ticket': return 'Time & Material'
      case 'cor': return 'Change Order'
      case 'worker': return 'Worker'
      default: return type
    }
  }

  if (!isOpen) return null

  return (
    <div className="universal-search-overlay" onClick={onClose}>
      <div className="universal-search-modal" onClick={e => e.stopPropagation()}>
        {/* Search Input */}
        <div className="universal-search-input-wrapper">
          <Search size={20} className="universal-search-icon" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Search projects, tickets, CORs, workers..."
            className="universal-search-input"
            autoComplete="off"
            autoCorrect="off"
            spellCheck="false"
          />
          {query && (
            <button className="universal-search-clear" onClick={() => setQuery('')}>
              <X size={16} />
            </button>
          )}
          <div className="universal-search-shortcut">
            <span>esc</span>
          </div>
        </div>

        {/* Results */}
        <div className="universal-search-results">
          {loading ? (
            <div className="universal-search-loading">
              <div className="spinner-small"></div>
              <span>Searching...</span>
            </div>
          ) : !query.trim() ? (
            <div className="universal-search-empty">
              <div className="universal-search-tip">
                <Command size={14} />
                <span>Type to search across all data</span>
              </div>
              <div className="universal-search-hints">
                <span>Projects</span>
                <span>Time & Material</span>
                <span>Change Orders</span>
                <span>Workers</span>
              </div>
            </div>
          ) : !hasResults ? (
            <div className="universal-search-no-results">
              <span>No results for "{query}"</span>
            </div>
          ) : (
            <>
              {/* Projects */}
              {results.projects.length > 0 && (
                <div className="universal-search-section">
                  <div className="universal-search-section-header">
                    <FolderOpen size={14} />
                    <span>Projects</span>
                  </div>
                  {results.projects.map((project, idx) => {
                    const globalIdx = idx
                    return (
                      <button
                        key={project.id}
                        className={`universal-search-item ${selectedIndex === globalIdx ? 'selected' : ''}`}
                        onClick={() => handleSelect({ type: 'project', data: project })}
                        onMouseEnter={() => setSelectedIndex(globalIdx)}
                      >
                        <FolderOpen size={18} />
                        <div className="universal-search-item-content">
                          <span className="universal-search-item-title">{project.name}</span>
                          {project.job_number && (
                            <span className="universal-search-item-meta">#{project.job_number}</span>
                          )}
                        </div>
                        <ChevronRight size={16} className="universal-search-item-arrow" />
                      </button>
                    )
                  })}
                </div>
              )}

              {/* T&M Tickets */}
              {results.tickets.length > 0 && (
                <div className="universal-search-section">
                  <div className="universal-search-section-header">
                    <FileText size={14} />
                    <span>Time & Material</span>
                  </div>
                  {results.tickets.map((ticket, idx) => {
                    const globalIdx = results.projects.length + idx
                    return (
                      <button
                        key={ticket.id}
                        className={`universal-search-item ${selectedIndex === globalIdx ? 'selected' : ''}`}
                        onClick={() => handleSelect({ type: 'ticket', data: ticket })}
                        onMouseEnter={() => setSelectedIndex(globalIdx)}
                      >
                        <FileText size={18} />
                        <div className="universal-search-item-content">
                          <span className="universal-search-item-title">
                            {ticket.notes?.substring(0, 50) || 'Time & Material Ticket'}
                            {ticket.notes?.length > 50 && '...'}
                          </span>
                          <span className="universal-search-item-meta">
                            {ticket.projectName} • {ticket.work_date}
                          </span>
                        </div>
                        <span className={`universal-search-item-badge ${ticket.status}`}>
                          {ticket.status}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Change Orders */}
              {results.cors.length > 0 && (
                <div className="universal-search-section">
                  <div className="universal-search-section-header">
                    <ClipboardList size={14} />
                    <span>Change Orders</span>
                  </div>
                  {results.cors.map((cor, idx) => {
                    const globalIdx = results.projects.length + results.tickets.length + idx
                    return (
                      <button
                        key={cor.id}
                        className={`universal-search-item ${selectedIndex === globalIdx ? 'selected' : ''}`}
                        onClick={() => handleSelect({ type: 'cor', data: cor })}
                        onMouseEnter={() => setSelectedIndex(globalIdx)}
                      >
                        <ClipboardList size={18} />
                        <div className="universal-search-item-content">
                          <span className="universal-search-item-title">
                            {cor.cor_number ? `COR #${cor.cor_number}: ` : ''}{cor.title}
                          </span>
                          <span className="universal-search-item-meta">
                            {cor.projectName}
                          </span>
                        </div>
                        <span className={`universal-search-item-badge ${cor.status}`}>
                          {cor.status}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Workers */}
              {results.workers.length > 0 && (
                <div className="universal-search-section">
                  <div className="universal-search-section-header">
                    <Users size={14} />
                    <span>Workers</span>
                  </div>
                  {results.workers.map((worker, idx) => {
                    const globalIdx = results.projects.length + results.tickets.length + results.cors.length + idx
                    return (
                      <button
                        key={`${worker.name}-${idx}`}
                        className={`universal-search-item ${selectedIndex === globalIdx ? 'selected' : ''}`}
                        onClick={() => handleSelect({ type: 'worker', data: worker })}
                        onMouseEnter={() => setSelectedIndex(globalIdx)}
                      >
                        <Users size={18} />
                        <div className="universal-search-item-content">
                          <span className="universal-search-item-title">{worker.name}</span>
                          <span className="universal-search-item-meta">
                            {worker.role} • {worker.projectName}
                          </span>
                        </div>
                        <ChevronRight size={16} className="universal-search-item-arrow" />
                      </button>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="universal-search-footer">
          <div className="universal-search-footer-hint">
            <span className="key">↑↓</span> navigate
          </div>
          <div className="universal-search-footer-hint">
            <span className="key">↵</span> select
          </div>
          <div className="universal-search-footer-hint">
            <span className="key">esc</span> close
          </div>
        </div>
      </div>
    </div>
  )
}

// Hook for keyboard shortcut
export function useUniversalSearch() {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Cmd+K (Mac) or Ctrl+K (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setIsOpen(prev => !prev)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  return { isOpen, setIsOpen, open: () => setIsOpen(true), close: () => setIsOpen(false) }
}
