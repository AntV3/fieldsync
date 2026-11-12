/**
 * "I agree" checkbox for the sign-up forms. The links open in a new tab so
 * the form keeps what was typed.
 */
export default function TermsAgreement({ checked, onChange, id = 'terms-agreement' }) {
  return (
    <label className="terms-agreement" htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        I agree to the{' '}
        <a href="/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a>
        {' '}and the{' '}
        <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>,
        and I am authorized to accept them for my company.
      </span>
    </label>
  )
}
