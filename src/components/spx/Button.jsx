/**
 * Button — SpaceX-styled action buttons
 * Variants: primary, ghost, destructive, disabled
 */

const base = 'inline-flex items-center justify-center uppercase tracking-spx-label font-semibold text-[14px] px-[32px] py-[12px] transition-colors duration-150 cursor-pointer'

const VARIANTS = {
  primary: `${base} bg-accent-blue text-white hover:bg-accent-blue-light`,
  ghost: `${base} bg-transparent border border-white text-white hover:bg-white hover:text-bg-primary`,
  destructive: `${base} bg-status-red text-white hover:bg-red-700`,
  disabled: `${base} bg-bg-tertiary text-text-secondary cursor-not-allowed pointer-events-none`,
}

export default function Button({ variant = 'primary', disabled, children, className = '', ...props }) {
  const v = disabled ? 'disabled' : variant

  return (
    <button
      className={`${VARIANTS[v] || VARIANTS.primary} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  )
}
