/**
 * LogoMark - FieldSync brand mark.
 * A construction hard hat on the brand-blue rounded square, drawn as an
 * inline SVG so it stays crisp at any size in both themes.
 */
export default function LogoMark({ size = 28, className = '' }) {
  return (
    <svg
      className={`logo-mark ${className}`}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="2" y="2" width="60" height="60" rx="14" fill="#1C4E80" />
      {/* hard hat dome */}
      <path d="M17 40a15 15 0 0 1 30 0Z" fill="#F59E0B" />
      {/* top ridge knob */}
      <rect x="28" y="17" width="8" height="12" rx="3" fill="#F59E0B" />
      {/* front ribs */}
      <rect x="22" y="31" width="3" height="9" rx="1.5" fill="#FBBF24" />
      <rect x="39" y="31" width="3" height="9" rx="1.5" fill="#FBBF24" />
      {/* brim */}
      <rect x="11" y="40" width="42" height="6" rx="3" fill="#FBBF24" />
    </svg>
  )
}
