import { memo } from 'react'

/**
 * LoadingDots - Standardized 3-dot pulsing loading indicator
 *
 * Sizes:
 *   'small'   - 6px dots, for inline/button usage
 *   'default' - 8px dots, for section loading
 *   'large'   - 10px dots, for full-page loading
 */
const LoadingDots = memo(function LoadingDots({ size = 'default', className = '' }) {
  return (
    <div className={`loading-dots ${size !== 'default' ? `loading-dots--${size}` : ''} ${className}`.trim()}>
      <span></span>
      <span></span>
      <span></span>
    </div>
  )
})

export default LoadingDots
