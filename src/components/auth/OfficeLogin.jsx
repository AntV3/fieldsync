import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { UserPlus, Building2, ArrowLeft } from 'lucide-react'
import Logo from '../Logo'

export default function OfficeLogin({ onOfficeLogin, onShowToast }) {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const emailRef = useRef(null)
  const passwordRef = useRef(null)

  const handleOfficeSubmit = (e) => {
    if (e) e.preventDefault()
    // Read straight from the DOM inputs. On mobile, password managers and
    // keychain autofill often set the field value without firing React's
    // onChange, leaving the controlled state empty. Falling back to the ref
    // value uses whatever the browser actually filled in.
    const emailValue = (emailRef.current?.value ?? email).trim()
    const passwordValue = passwordRef.current?.value ?? password
    if (!emailValue || !passwordValue) {
      onShowToast('Enter email and password', 'error')
      return
    }
    onOfficeLogin(emailValue, passwordValue)
  }

  return (
    <div className="entry-container">
      <div className="entry-card animate-fade-in">
        <button className="entry-back" onClick={() => navigate('/login')}>
          <ArrowLeft size={20} />
        </button>

        <Logo className="entry-logo" showPoweredBy={false} />
        <p className="entry-subtitle">Sign in to your account</p>

        <form className="entry-form" onSubmit={handleOfficeSubmit}>
          <input
            ref={emailRef}
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            autoFocus
          />
          <input
            ref={passwordRef}
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
          />
          <button
            type="submit"
            className="entry-login-btn"
          >
            Sign In
          </button>
          <button
            type="button"
            className="entry-forgot-link"
            onClick={() => navigate('/forgot-password')}
          >
            Forgot password?
          </button>
        </form>

        <div className="entry-signup-hint">
          <div className="entry-signup-options">
            <button className="entry-join-link" onClick={() => navigate('/login/office/join')}>
              <UserPlus size={16} />
              <span>Join your company</span>
            </button>
            <button className="entry-join-link" onClick={() => navigate('/register')}>
              <Building2 size={16} />
              <span>Register a new company</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
