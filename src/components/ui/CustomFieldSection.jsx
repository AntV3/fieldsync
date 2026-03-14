import { useState, useEffect, useCallback } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useTradeConfig } from '../../lib/TradeConfigContext'
import { db } from '../../lib/supabase'
import CustomFieldRenderer from './CustomFieldRenderer'

/**
 * CustomFieldSection - Collapsible section for trade-specific custom fields.
 *
 * Props:
 * - formType: 'daily_report' | 'tm_ticket' | 'crew_checkin' | 'injury_report'
 * - projectId: UUID of the project
 * - entityId: UUID of the record (null for new records)
 * - values: Current field values (for controlled mode)
 * - onChange: (allValues) => void (for controlled mode)
 * - disabled: boolean
 */
export default function CustomFieldSection({
  formType,
  projectId: _projectId,
  entityId,
  values: controlledValues,
  onChange: controlledOnChange,
  disabled = false
}) {
  const { resolvedConfig, loading: configLoading } = useTradeConfig()
  const [expanded, setExpanded] = useState(true)
  const [internalValues, setInternalValues] = useState({})
  const [loadedFromDb, setLoadedFromDb] = useState(false)

  // Get field definitions for this form type
  const fields = resolvedConfig?.custom_fields?.[formType] || []

  // Use controlled or internal values
  const isControlled = controlledValues !== undefined
  const values = isControlled ? controlledValues : internalValues

  // Load saved values for existing entities
  useEffect(() => {
    if (!entityId || !formType || isControlled || loadedFromDb) return

    const load = async () => {
      const data = await db.getCustomFieldData(formType, entityId)
      setInternalValues(data)
      setLoadedFromDb(true)
    }
    load()
  }, [entityId, formType, isControlled, loadedFromDb])

  const handleFieldChange = useCallback((key, value) => {
    if (isControlled) {
      controlledOnChange({ ...values, [key]: value })
    } else {
      setInternalValues(prev => ({ ...prev, [key]: value }))
    }
  }, [isControlled, values, controlledOnChange])

  // Don't render if no custom fields defined
  if (configLoading || fields.length === 0) return null

  const tradeName = resolvedConfig?.trade_name || 'Trade-Specific'

  return (
    <div className="custom-field-section">
      <button
        type="button"
        className="custom-field-section-header"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="custom-field-section-title">
          {tradeName} Fields
        </span>
        {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>

      {expanded && (
        <div className="custom-field-section-body">
          <CustomFieldRenderer
            fields={fields}
            values={values}
            onChange={handleFieldChange}
            disabled={disabled}
          />
        </div>
      )}
    </div>
  )
}

// Export saveFields helper for parent components to use
export { CustomFieldSection }
