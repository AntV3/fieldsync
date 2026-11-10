import { CheckCircle2 } from 'lucide-react'
import { getOfficeQuickActions, isCaughtUp, COUNTED_ROWS } from '../../lib/officeActions'

// Short tile labels (same order as the quick-action rows)
const TILE_LABELS = {
  review: 'To review',
  buildCor: 'Ready for COR',
  sendCor: 'To send',
  waiting: 'Waiting on client'
}

/**
 * NeedsActionStrip - The office to-do counts as four tappable tiles.
 * Used on the portfolio (company totals) and inside a project (that
 * project's counts). Renders nothing until the counts are known.
 */
export default function NeedsActionStrip({ counts, scope = 'project', onAction }) {
  if (!counts) return null

  if (isCaughtUp(counts)) {
    return (
      <p className="needs-action-clear" role="status">
        <CheckCircle2 size={16} aria-hidden="true" />
        You&apos;re caught up
      </p>
    )
  }

  // Four tiles; change orders the client returned ride on the "To send" tile
  const tiles = getOfficeQuickActions({ scope, counts }).rows.filter(row => COUNTED_ROWS[row.id] && TILE_LABELS[row.id])
  const returned = Number(counts.returnedCORs) || 0
  const awaitingSignature = Number(counts.awaitingSignature) || 0

  return (
    <section className="needs-action" aria-label="Needs action">
      <h3 className="needs-action-title">Needs action</h3>
      <div className="needs-action-grid">
        {tiles.map(tile => {
          const hint = tile.id === 'review' && awaitingSignature > 0
            ? `${awaitingSignature} awaiting client signature`
            : tile.id === 'sendCor' && returned > 0
              ? `${returned} returned by client`
              : null
          const isZero = tile.count === 0 && !hint
          return (
            <button
              key={tile.id}
              type="button"
              className={`needs-action-tile ${isZero ? 'needs-action-tile--zero' : ''} ${tile.tone === 'warn' ? 'needs-action-tile--warn' : ''}`}
              onClick={() => onAction?.(tile.id === 'sendCor' && tile.count === 0 && returned > 0 ? 'returned' : tile.id)}
              title={tile.subtitle}
            >
              <span className="needs-action-count">{tile.count}</span>
              <span className="needs-action-label">{TILE_LABELS[tile.id]}</span>
              {hint && <span className="needs-action-hint">{hint}</span>}
            </button>
          )
        })}
      </div>
    </section>
  )
}
