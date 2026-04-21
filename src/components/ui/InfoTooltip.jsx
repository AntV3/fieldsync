import { useState, useRef, useCallback, useId } from 'react'
import { Info } from 'lucide-react'

/**
 * InfoTooltip - Hover icon that reveals a formula/description tooltip
 * Uses fixed positioning to escape overflow:hidden and stacking context issues.
 *
 * @param {string} text - The tooltip description to show on hover
 * @param {number} size - Icon size in px (default 14)
 */
export default function InfoTooltip({ text, size = 14 }) {
  const [visible, setVisible] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const buttonRef = useRef(null)
  const tooltipId = useId()

  const show = useCallback(() => {
    if (!buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    setPos({
      top: rect.top,
      left: rect.left + rect.width / 2,
    })
    setVisible(true)
  }, [])

  const hide = useCallback(() => setVisible(false), [])

  return (
    <>
      <button
        type="button"
        ref={buttonRef}
        className="info-tooltip-wrapper"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        aria-label={text}
        aria-describedby={visible && text ? tooltipId : undefined}
      >
        <Info size={size} className="info-tooltip-icon" aria-hidden="true" />
      </button>
      {visible && text && (
        <span
          id={tooltipId}
          className="info-tooltip-bubble info-tooltip-bubble--fixed"
          role="tooltip"
          style={{
            top: pos.top,
            left: pos.left,
          }}
        >
          {text}
        </span>
      )}
    </>
  )
}
