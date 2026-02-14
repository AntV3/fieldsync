import { useState, useEffect } from 'react'
import { AlertTriangle, DollarSign, ArrowRight, X } from 'lucide-react'
import { db } from '../../lib/supabase'
import { formatCurrency } from '../../lib/corCalculations'

/**
 * UnbilledWorkAlert
 *
 * Surfaces approved but uninvoiced T&M tickets and CORs.
 * "You have $47,200 in approved T&M that hasn't been invoiced"
 *
 * Shown in the billing center and optionally on the dashboard.
 */
export default function UnbilledWorkAlert({ companyId, projectId, onNavigate, onDismiss }) {
  const [unbilled, setUnbilled] = useState(null)
  const [loading, setLoading] = useState(true)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    loadUnbilledWork()
  }, [companyId, projectId])

  const loadUnbilledWork = async () => {
    try {
      setLoading(true)
      const data = projectId
        ? await db.getProjectUnbilledWork(projectId)
        : await db.getUnbilledWork(companyId)
      setUnbilled(data)
    } catch (error) {
      console.error('Error loading unbilled work:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDismiss = () => {
    setDismissed(true)
    onDismiss?.()
  }

  if (loading || dismissed || !unbilled || unbilled.totalUnbilled === 0) {
    return null
  }

  const itemCount = (unbilled.cors?.length || 0) + (unbilled.tickets?.length || 0)

  return (
    <div className="unbilled-work-alert">
      <div className="unbilled-work-alert__icon">
        <DollarSign size={20} />
      </div>
      <div className="unbilled-work-alert__content">
        <div className="unbilled-work-alert__title">
          <AlertTriangle size={14} />
          Unbilled Approved Work
        </div>
        <div className="unbilled-work-alert__description">
          You have <strong>{formatCurrency(unbilled.totalUnbilled)}</strong> in approved work that hasn't been invoiced
          ({itemCount} item{itemCount !== 1 ? 's' : ''}: {unbilled.cors?.length || 0} COR{(unbilled.cors?.length || 0) !== 1 ? 's' : ''}, {unbilled.tickets?.length || 0} T&M ticket{(unbilled.tickets?.length || 0) !== 1 ? 's' : ''})
        </div>
        {onNavigate && (
          <button
            className="unbilled-work-alert__action"
            onClick={() => onNavigate('billing')}
          >
            Create Invoice
            <ArrowRight size={14} />
          </button>
        )}
      </div>
      {onDismiss && (
        <button
          className="unbilled-work-alert__dismiss"
          onClick={handleDismiss}
          aria-label="Dismiss alert"
        >
          <X size={16} />
        </button>
      )}
    </div>
  )
}
