import { useState, useEffect, useRef } from 'react'

/**
 * useAnimatedNumber - Smoothly animates number transitions
 * Uses requestAnimationFrame for 60fps count-up/down effect
 *
 * @param {number} target - The target number to animate to
 * @param {Object} options
 * @param {number} options.duration - Animation duration in ms (default: 400)
 * @param {boolean} options.enabled - Whether animation is enabled (default: true)
 * @returns {number} The current animated value
 *
 * @example
 * const animatedProgress = useAnimatedNumber(progress, { duration: 600 })
 * return <span>{animatedProgress}%</span>
 */
export default function useAnimatedNumber(target, { duration = 400, enabled = true } = {}) {
  const [current, setCurrent] = useState(target)
  const rafRef = useRef(null)
  const startRef = useRef(null)
  const fromRef = useRef(target)

  useEffect(() => {
    if (!enabled || target === fromRef.current) {
      setCurrent(target)
      fromRef.current = target
      return
    }

    const from = fromRef.current
    startRef.current = performance.now()

    const animate = (now) => {
      const elapsed = now - startRef.current
      const progress = Math.min(elapsed / duration, 1)
      // Ease-out cubic for smooth deceleration
      const eased = 1 - Math.pow(1 - progress, 3)
      const value = from + (target - from) * eased

      setCurrent(value)

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate)
      } else {
        fromRef.current = target
      }
    }

    rafRef.current = requestAnimationFrame(animate)

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
      }
    }
  }, [target, duration, enabled])

  return Math.round(current)
}
