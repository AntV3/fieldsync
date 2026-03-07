import { useState, useRef, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Info } from 'lucide-react'

/**
 * InfoTooltip - Hover icon that reveals a description tooltip.
 * Uses a React Portal so the bubble renders at document.body,
 * fully escaping overflow:hidden, transforms, and stacking contexts.
 *
 * @param {string} text - The tooltip description to show on hover
 * @param {number} size - Icon size in px (default 14)
 */
export default function InfoTooltip({ text, size = 14 }) {
  const [visible, setVisible] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const wrapperRef = useRef(null)

  const updatePosition = useCallback(() => {
    if (!wrapperRef.current) return
    const rect = wrapperRef.current.getBoundingClientRect()
    const tooltipMaxWidth = 280
    let left = rect.left + rect.width / 2

    // Keep tooltip from going off-screen left/right
    const halfWidth = tooltipMaxWidth / 2
    if (left - halfWidth < 8) left = halfWidth + 8
    if (left + halfWidth > window.innerWidth - 8) left = window.innerWidth - halfWidth - 8

    setPos({
      top: rect.top,
      left,
    })
  }, [])

  const show = useCallback(() => {
    updatePosition()
    setVisible(true)
  }, [updatePosition])

  const hide = useCallback(() => setVisible(false), [])

  // Update position on scroll/resize while visible
  useEffect(() => {
    if (!visible) return
    const handleReposition = () => updatePosition()
    window.addEventListener('scroll', handleReposition, true)
    window.addEventListener('resize', handleReposition)
    return () => {
      window.removeEventListener('scroll', handleReposition, true)
      window.removeEventListener('resize', handleReposition)
    }
  }, [visible, updatePosition])

  return (
    <span
      ref={wrapperRef}
      className="info-tooltip-wrapper"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      tabIndex={0}
    >
      <Info
        size={size}
        className="info-tooltip-icon"
        aria-hidden="true"
      />
      {visible && createPortal(
        <span
          className="info-tooltip-bubble--fixed"
          role="tooltip"
          style={{
            top: pos.top,
            left: pos.left,
          }}
        >
          {text}
        </span>,
        document.body
      )}
    </span>
  )
}
