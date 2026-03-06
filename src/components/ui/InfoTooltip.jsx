import { Info } from 'lucide-react'

/**
 * InfoTooltip - Hover icon that reveals a formula/description tooltip
 *
 * @param {string} text - The tooltip description to show on hover
 * @param {number} size - Icon size in px (default 14)
 */
export default function InfoTooltip({ text, size = 14 }) {
  return (
    <span className="info-tooltip-wrapper">
      <Info size={size} className="info-tooltip-icon" aria-hidden="true" />
      <span className="info-tooltip-bubble" role="tooltip">
        {text}
      </span>
    </span>
  )
}
