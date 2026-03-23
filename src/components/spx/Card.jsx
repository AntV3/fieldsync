/**
 * Card — Base elevated surface component
 * bg-secondary, no border-radius, 1px subtle border, 24px padding
 */

export default function Card({ children, className = '', ...props }) {
  return (
    <div
      className={`bg-bg-secondary border border-border-subtle p-[24px] ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}
