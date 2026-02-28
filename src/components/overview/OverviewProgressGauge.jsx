import { memo, useEffect, useState, useRef } from 'react'

/**
 * OverviewProgressGauge - Large circular progress indicator for project overview
 * Shows completion percentage with animated stroke and areas status
 */
export const OverviewProgressGauge = memo(function OverviewProgressGauge({
  progress = 0,
  areasComplete = 0,
  totalAreas = 0,
  areasWorking = 0,
  size = 110,
  strokeWidth = 9
}) {
  const [animatedProgress, setAnimatedProgress] = useState(0)
  const animationRef = useRef(null)

  // Animate progress on mount/change
  useEffect(() => {
    const startValue = animatedProgress
    const endValue = Math.min(100, Math.max(0, progress))
    const duration = 800
    const startTime = performance.now()

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime
      const progressRatio = Math.min(elapsed / duration, 1)

      // Ease out cubic
      const eased = 1 - Math.pow(1 - progressRatio, 3)
      const current = startValue + (endValue - startValue) * eased

      setAnimatedProgress(current)

      if (progressRatio < 1) {
        animationRef.current = requestAnimationFrame(animate)
      }
    }

    animationRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress])

  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const offset = circumference - (animatedProgress / 100) * circumference

  // Color based on progress
  const getProgressColor = () => {
    if (animatedProgress >= 80) return 'var(--accent-green)'
    if (animatedProgress >= 50) return 'var(--accent-blue)'
    if (animatedProgress >= 25) return 'var(--accent-blue)'
    return 'var(--text-muted)'
  }

  return (
    <div className="overview-progress-gauge">
      <div className="progress-gauge-circle" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* Background track */}
          <circle
            className="gauge-track"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            stroke="var(--bg-tertiary)"
          />
          {/* Progress arc */}
          <circle
            className="gauge-fill"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={getProgressColor()}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: 'stroke 0.3s ease' }}
          />
        </svg>
        {/* Center content */}
        <div className="gauge-center">
          <span className="gauge-value">{Math.round(animatedProgress)}%</span>
          <span className="gauge-label">Complete</span>
        </div>
      </div>

      {/* Areas status below */}
      <div className="gauge-areas-status">
        <span className="areas-count">
          <strong>{areasComplete}</strong>/{totalAreas} Areas Done
        </span>
        {areasWorking > 0 && (
          <span className="areas-active">{areasWorking} active</span>
        )}
      </div>
    </div>
  )
})

export default OverviewProgressGauge
