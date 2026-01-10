import { memo } from 'react'
import { AlertCircle } from 'lucide-react'

/**
 * FormField - Reusable form field wrapper with validation display
 * Provides consistent styling and error handling for form inputs
 */
export const FormField = memo(function FormField({
  label,
  error,
  required = false,
  hint,
  children,
  className = ''
}) {
  return (
    <div className={`form-field ${error ? 'has-error' : ''} ${className}`}>
      {label && (
        <label className="form-field-label">
          {label}
          {required && <span className="form-field-required">*</span>}
        </label>
      )}
      <div className="form-field-input">
        {children}
      </div>
      {error && (
        <div className="form-field-error" role="alert">
          <AlertCircle size={14} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}
      {hint && !error && (
        <div className="form-field-hint">{hint}</div>
      )}
    </div>
  )
})

/**
 * ValidatedInput - Input with built-in validation styling
 */
export const ValidatedInput = memo(function ValidatedInput({
  type = 'text',
  value,
  onChange,
  onBlur,
  error,
  placeholder,
  disabled,
  min,
  max,
  step,
  pattern,
  required,
  autoComplete,
  name,
  id,
  className = '',
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy
}) {
  const inputId = id || name
  const errorId = error ? `${inputId}-error` : undefined

  return (
    <>
      <input
        type={type}
        id={inputId}
        name={name}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        placeholder={placeholder}
        disabled={disabled}
        min={min}
        max={max}
        step={step}
        pattern={pattern}
        required={required}
        autoComplete={autoComplete}
        className={`validated-input ${error ? 'has-error' : ''} ${className}`}
        aria-label={ariaLabel}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : ariaDescribedBy}
      />
      {error && (
        <div id={errorId} className="input-error-inline" role="alert">
          <AlertCircle size={12} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}
    </>
  )
})

/**
 * ValidatedSelect - Select with built-in validation styling
 */
export const ValidatedSelect = memo(function ValidatedSelect({
  value,
  onChange,
  onBlur,
  error,
  disabled,
  required,
  name,
  id,
  className = '',
  children,
  'aria-label': ariaLabel
}) {
  const selectId = id || name
  const errorId = error ? `${selectId}-error` : undefined

  return (
    <>
      <select
        id={selectId}
        name={name}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        disabled={disabled}
        required={required}
        className={`validated-select ${error ? 'has-error' : ''} ${className}`}
        aria-label={ariaLabel}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
      >
        {children}
      </select>
      {error && (
        <div id={errorId} className="input-error-inline" role="alert">
          <AlertCircle size={12} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}
    </>
  )
})

/**
 * ValidatedTextarea - Textarea with built-in validation styling
 */
export const ValidatedTextarea = memo(function ValidatedTextarea({
  value,
  onChange,
  onBlur,
  error,
  placeholder,
  disabled,
  required,
  rows = 3,
  maxLength,
  name,
  id,
  className = '',
  'aria-label': ariaLabel
}) {
  const textareaId = id || name
  const errorId = error ? `${textareaId}-error` : undefined

  return (
    <>
      <textarea
        id={textareaId}
        name={name}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        rows={rows}
        maxLength={maxLength}
        className={`validated-textarea ${error ? 'has-error' : ''} ${className}`}
        aria-label={ariaLabel}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
      />
      {maxLength && (
        <div className="textarea-counter">
          {value?.length || 0} / {maxLength}
        </div>
      )}
      {error && (
        <div id={errorId} className="input-error-inline" role="alert">
          <AlertCircle size={12} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}
    </>
  )
})

export default FormField
