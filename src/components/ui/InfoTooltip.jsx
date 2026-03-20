import { useState, useRef, useCallback } from 'react'
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
  const wrapperRef = useRef(null)

  const show = useCallback(() => {
    if (!wrapperRef.current) return
    const rect = wrapperRef.current.getBoundingClientRect()
    setPos({
      top: rect.top,
      left: rect.left + rect.width / 2,
    })
    setVisible(true)
  }, [])

  const hide = useCallback(() => setVisible(false), [])

  return (
    <span
      ref={wrapperRef}
      className="info-tooltip-wrapper"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      title={text}
    >
      <Info
        size={size}
        className="info-tooltip-icon"
        aria-hidden="true"
        tabIndex={0}
      />
      {visible && text && (
        <span
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
    </span>
  )
}
