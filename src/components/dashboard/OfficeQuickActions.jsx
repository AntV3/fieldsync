import { useEffect, useMemo, useRef, useState } from 'react'
import { Zap, X, ArrowLeft, ChevronRight, ChevronDown, ClipboardCheck, FilePlus2, Send, Clock, Plus, Search, Undo2 } from 'lucide-react'
import {
  getOfficeQuickActions, getRowCount, isCaughtUp, pickProjectForRow,
  COUNTED_ROWS, ROWS_NEEDING_PROJECT
} from '../../lib/officeActions'

const ROW_ICONS = {
  review: ClipboardCheck,
  buildCor: FilePlus2,
  sendCor: Send,
  returned: Undo2,
  waiting: Clock,
  newCor: Plus,
  search: Search
}

const badgeText = (badge) => (badge > 99 ? '99+' : String(badge))

/**
 * OfficeQuickActions - The office's "what's next" launcher.
 *
 * A floating button (phones) that opens a sheet of the office workflow steps
 * with live counts: review tickets, build a COR, send it, wait on the client.
 * Above 768px the button is hidden by CSS and the same sheet is opened from a
 * header button through `open` / `onOpenChange`, rendering as a centered dialog.
 *
 * Presentational only: counts come in as props (see useOfficeQueue) and every
 * tap is reported through onAction(actionId, project?). In portfolio scope a
 * row that needs a project either goes straight to the only project with
 * items or swaps the sheet to a project picker. `pickerRowId` opens the sheet
 * directly on the picker for that row (used by the portfolio tiles).
 */
export default function OfficeQuickActions({
  scope = 'project',
  counts = null,
  projects = [],
  isAdmin = false,
  open = false,
  onOpenChange,
  onAction,
  hidden = false,
  pickerRowId: initialPickerRowId = null
}) {
  const [pickerRowId, setPickerRowId] = useState(null)
  const [fieldEntryOpen, setFieldEntryOpen] = useState(false)
  const panelRef = useRef(null)
  const fabRef = useRef(null)
  const returnFocusRef = useRef(null)

  const { badge, rows, footer } = useMemo(
    () => getOfficeQuickActions({ scope, counts, isAdmin }),
    [scope, counts, isAdmin]
  )
  const caughtUp = isCaughtUp(counts)
  const pickerRow = pickerRowId ? rows.find(row => row.id === pickerRowId) : null
  const showing = open && !hidden

  const close = () => onOpenChange?.(false)

  // A sheet left open under something that hides it should not come back later
  useEffect(() => {
    if (hidden && open) onOpenChange?.(false)
  }, [hidden, open, onOpenChange])

  // Each opening starts on the main list, or on the picker it was asked for
  useEffect(() => {
    setPickerRowId(showing ? initialPickerRowId : null)
    setFieldEntryOpen(false)
  }, [showing, initialPickerRowId])

  // Move focus into the sheet, and back to whatever opened it on close
  useEffect(() => {
    if (!showing) return
    returnFocusRef.current = document.activeElement
    const fab = fabRef.current
    panelRef.current?.focus()
    return () => {
      const opener = returnFocusRef.current
      const target = opener && opener !== document.body && opener.isConnected ? opener : fab
      target?.focus?.()
    }
  }, [showing])

  // Keep focus on the sheet when it swaps between the list and the picker
  useEffect(() => {
    if (showing) panelRef.current?.focus()
  }, [pickerRowId, showing])

  useEffect(() => {
    if (!showing) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onOpenChange?.(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [showing, onOpenChange])

  if (hidden) return null

  const fire = (actionId, project) => {
    close()
    onAction?.(actionId, project)
  }

  const handleRow = (row) => {
    if (scope !== 'portfolio' || !ROWS_NEEDING_PROJECT.includes(row.id)) {
      fire(row.id)
      return
    }
    const project = pickProjectForRow(row.id, projects)
    if (project) fire(row.id, project)
    else setPickerRowId(row.id)
  }

  const handleFooter = (link) => {
    if (link.children) {
      setFieldEntryOpen(prev => !prev)
      return
    }
    fire(link.id)
  }

  // Focus trap: Tab wraps inside the sheet
  const handlePanelKeyDown = (e) => {
    if (e.key !== 'Tab') return
    const focusable = panelRef.current?.querySelectorAll('button:not([disabled])')
    if (!focusable || focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  const fabLabel = typeof badge === 'number'
    ? `Quick actions, ${badge} ticket${badge === 1 ? '' : 's'} to review`
    : badge === 'dot'
      ? 'Quick actions, items waiting'
      : 'Quick actions'

  // Picker: projects with items for this row first, biggest count first
  const pickerProjects = pickerRow
    ? projects
        .map(project => ({ project, count: getRowCount(pickerRow.id, project.counts) }))
        .sort((a, b) => b.count - a.count)
    : []
  const pickerShowsCounts = Boolean(pickerRow && COUNTED_ROWS[pickerRow.id]) && Boolean(counts)

  return (
    <>
      <button
        ref={fabRef}
        type="button"
        className="oqa-fab"
        onClick={() => onOpenChange?.(true)}
        aria-label={fabLabel}
        aria-haspopup="dialog"
        aria-expanded={showing}
      >
        <Zap size={22} aria-hidden="true" />
        {badge !== null && (
          <span className={`oqa-badge ${badge === 'dot' ? 'oqa-badge--dot' : ''}`} aria-hidden="true">
            {badge === 'dot' ? '' : badgeText(badge)}
          </span>
        )}
      </button>

      {showing && (
        <div className="oqa-overlay" onClick={close} role="presentation">
          <div
            ref={panelRef}
            className="oqa-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Quick actions"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handlePanelKeyDown}
          >
            <div className="oqa-grabber" aria-hidden="true" />

            <div className="oqa-header">
              {pickerRow && (
                <button type="button" className="oqa-icon-btn" onClick={() => setPickerRowId(null)} aria-label="Back to quick actions">
                  <ArrowLeft size={18} aria-hidden="true" />
                </button>
              )}
              <div className="oqa-header-text">
                <h2 className="oqa-title">{pickerRow ? pickerRow.label : 'Quick actions'}</h2>
                {pickerRow
                  ? <p className="oqa-subtitle">Choose a project</p>
                  : caughtUp && <p className="oqa-subtitle oqa-subtitle--ok">You&apos;re caught up</p>}
              </div>
              <button type="button" className="oqa-icon-btn" onClick={close} aria-label="Close quick actions">
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            {pickerRow ? (
              <ul className="oqa-rows" aria-label="Projects">
                {pickerProjects.length === 0 && (
                  <li className="oqa-empty">No projects yet</li>
                )}
                {pickerProjects.map(({ project, count }) => (
                  <li key={project.id}>
                    <button
                      type="button"
                      className={`oqa-row ${pickerShowsCounts && count === 0 ? 'oqa-row--dim' : ''}`}
                      onClick={() => fire(pickerRow.id, project)}
                    >
                      <span className="oqa-row-text">
                        <span className="oqa-row-label">{project.name}</span>
                        {project.job_number && <span className="oqa-row-sub">Job #{project.job_number}</span>}
                      </span>
                      {pickerShowsCounts && <span className="oqa-count">{count}</span>}
                      <ChevronRight size={16} className="oqa-row-chevron" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <>
                <ul className="oqa-rows">
                  {rows.map(row => {
                    const Icon = ROW_ICONS[row.id]
                    return (
                      <li key={row.id}>
                        <button
                          type="button"
                          className={`oqa-row ${row.dimmed ? 'oqa-row--dim' : ''} ${row.tone === 'warn' ? 'oqa-row--warn' : ''}`}
                          onClick={() => handleRow(row)}
                        >
                          <span className="oqa-row-icon" aria-hidden="true"><Icon size={18} /></span>
                          <span className="oqa-row-text">
                            <span className="oqa-row-label">{row.label}</span>
                            <span className="oqa-row-sub">{row.subtitle}</span>
                          </span>
                          {row.count !== null && <span className="oqa-count">{row.count}</span>}
                          <ChevronRight size={16} className="oqa-row-chevron" aria-hidden="true" />
                        </button>
                      </li>
                    )
                  })}
                </ul>

                <div className="oqa-footer">
                  {footer.map(link => (
                    <button
                      key={link.id}
                      type="button"
                      className="oqa-footer-link"
                      onClick={() => handleFooter(link)}
                      aria-expanded={link.children ? fieldEntryOpen : undefined}
                    >
                      {link.label}
                      {link.children && (
                        <ChevronDown size={13} className={`oqa-footer-caret ${fieldEntryOpen ? 'open' : ''}`} aria-hidden="true" />
                      )}
                    </button>
                  ))}
                </div>
                {footer.filter(link => link.children && fieldEntryOpen).map(link => (
                  <div
                    key={link.id}
                    className="oqa-footer-children"
                    role="group"
                    aria-label={link.label}
                    ref={(el) => el?.scrollIntoView?.({ block: 'nearest' })}
                  >
                    <span className="oqa-footer-note">Normally entered by the foreman</span>
                    {link.children.map(child => (
                      <button key={child.id} type="button" className="oqa-footer-child" onClick={() => fire(child.id)}>
                        {child.label}
                      </button>
                    ))}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
