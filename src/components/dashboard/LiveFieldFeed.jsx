import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ClipboardList, Users, CheckCircle2, FileText } from 'lucide-react'

function timeAgo(ts) {
  if (!ts) return ''
  const then = new Date(ts)
  if (isNaN(then)) return ''
  const mins = Math.max(0, Math.floor((Date.now() - then.getTime()) / 60000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return then.toLocaleDateString()
}

function initialsOf(name) {
  return String(name || 'FC')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('') || 'FC'
}

const KIND_ICONS = {
  tm: ClipboardList,
  crew: Users,
  area: CheckCircle2,
  report: FileText,
  safety: AlertTriangle
}

/**
 * LiveFieldFeed - The hero real-time activity card on Overview.
 * Full-width card with a pulsing LIVE badge; each entry shows
 * [Avatar] [Name] [Action] [Item] [Time ago] with a type icon.
 * `activityPulse` increments when a realtime event arrives for this
 * project, briefly flashing the header to show fresh data landed.
 */
export default function LiveFieldFeed({ projectData, onSetActiveTab, activityPulse = 0 }) {
  // Flash the header briefly whenever new realtime data arrives
  const [justUpdated, setJustUpdated] = useState(false)
  const firstPulseRef = useRef(true)
  useEffect(() => {
    if (firstPulseRef.current) {
      firstPulseRef.current = false
      return
    }
    setJustUpdated(true)
    const t = setTimeout(() => setJustUpdated(false), 4000)
    return () => clearTimeout(t)
  }, [activityPulse])

  // Merge every field-originated stream into a single reverse-chron feed
  const feedItems = useMemo(() => {
    const items = []
    for (const t of (projectData?.tmTickets || []).slice(0, 8)) {
      items.push({
        id: `tm-${t.id}`,
        ts: t.created_at || t.work_date,
        who: t.foreman_name || t.created_by_name || 'Field crew',
        kind: 'tm',
        action: 'submitted T&M ticket',
        item: t.ce_pco_number
          ? `CE/PCO ${t.ce_pco_number}`
          : (t.description_of_work || t.description || `Ticket · ${t.work_date || ''}`)
      })
    }
    for (const c of (projectData?.crewCheckins || projectData?.crewHistory || []).slice(0, 8)) {
      const workerCount = c.worker_count ?? (c.workers || []).length
      items.push({
        id: `crew-${c.id || c.check_in_date}`,
        ts: c.created_at || c.updated_at || c.check_in_date,
        who: c.created_by || 'Foreman',
        kind: 'crew',
        action: 'checked in crew',
        item: `${workerCount} worker${workerCount !== 1 ? 's' : ''} on site`
      })
    }
    for (const a of (projectData?.areas || [])) {
      if (a.status !== 'done' || !a.updated_at) continue
      items.push({
        id: `area-${a.id}`,
        ts: a.updated_at,
        who: 'Field crew',
        kind: 'area',
        action: 'completed area',
        item: a.name || 'Work area'
      })
    }
    for (const r of (projectData?.dailyReports || []).slice(0, 8)) {
      items.push({
        id: `dr-${r.id}`,
        ts: r.created_at || r.report_date,
        who: r.foreman_name || r.created_by_name || 'Field crew',
        kind: 'report',
        action: 'filed daily report',
        item: r.work_performed || r.field_notes || `Daily log · ${r.report_date || ''}`,
        issues: r.issues
      })
    }
    for (const ir of (projectData?.injuryReports || []).slice(0, 3)) {
      items.push({
        id: `inj-${ir.id}`,
        ts: ir.created_at || ir.incident_date,
        who: ir.reported_by || ir.injured_person_name || 'Field crew',
        kind: 'safety',
        action: 'reported an incident',
        item: ir.description || ir.injury_description || 'Safety incident'
      })
    }
    return items
      .filter(i => i.ts)
      .sort((a, b) => new Date(b.ts) - new Date(a.ts))
      .slice(0, 8)
  }, [projectData])

  return (
    <div className="sdx-card sdx-panel sdx-feed-hero" role="region" aria-label="Live field feed">
      <div className="sdx-panel-header sdx-feed-hero-header">
        <div className="sdx-feed-hero-title">
          <span className={`sdx-live-badge ${justUpdated ? 'burst' : ''}`}>
            <span className="sdx-live-dot" aria-hidden="true" />
            LIVE
          </span>
          <h3>Live field feed</h3>
          {justUpdated && <span className="sdx-feed-fresh" role="status">New activity</span>}
        </div>
        <button className="sdx-link" onClick={() => onSetActiveTab('field')}>
          View all →
        </button>
      </div>

      <div className="sdx-feed">
        {feedItems.length === 0 && (
          <div className="sdx-empty-row">
            No field activity yet — crew check-ins, T&amp;M tickets, and daily reports will appear here the moment they&apos;re submitted.
          </div>
        )}
        {feedItems.map(item => {
          const KindIcon = KIND_ICONS[item.kind] || FileText
          return (
            <div key={item.id} className={`sdx-feed-item ${item.kind === 'safety' ? 'safety' : ''}`}>
              <div className="sdx-feed-avatar-wrap">
                {item.kind === 'safety' ? (
                  <div className="sdx-feed-avatar icon warn" aria-hidden="true">
                    <AlertTriangle size={15} />
                  </div>
                ) : (
                  <div className={`sdx-feed-avatar ${item.kind}`} aria-hidden="true">{initialsOf(item.who)}</div>
                )}
                <span className={`sdx-feed-kind-icon ${item.kind}`} aria-hidden="true">
                  <KindIcon size={10} />
                </span>
              </div>
              <div className="sdx-feed-body">
                <div className="sdx-feed-meta">
                  <span className="sdx-feed-who">{item.who}</span>
                  <span className="sdx-feed-action">{item.action}</span>
                  <span className="sdx-feed-time">{timeAgo(item.ts)}</span>
                </div>
                <p className="sdx-feed-text">
                  {item.item}
                  {item.issues && <span className="sdx-feed-issue"> · Issue: {item.issues}</span>}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
