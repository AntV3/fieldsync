/**
 * FormInput — SpaceX-styled form input with label
 */

export default function FormInput({ label, id, type = 'text', placeholder, value, onChange, className = '', ...props }) {
  return (
    <div className={`flex flex-col gap-[8px] ${className}`}>
      {label && (
        <label htmlFor={id} className="text-[12px] uppercase tracking-spx-label text-text-secondary">
          {label}
        </label>
      )}
      <input
        id={id}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        className="h-[44px] px-[16px] bg-bg-tertiary border border-border-input text-[14px] text-text-primary placeholder:text-text-secondary focus:border-accent-blue focus:outline-none transition-colors duration-150"
        {...props}
      />
    </div>
  )
}
