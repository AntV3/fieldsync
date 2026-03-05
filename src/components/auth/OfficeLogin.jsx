import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { UserPlus, ArrowLeft } from 'lucide-react'
import { useToast } from '../../lib/ToastContext'
import Logo from '../Logo'

export default function OfficeLogin({ onOfficeLogin }) {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleOfficeSubmit = () => {
    if (!email.trim() || !password.trim()) {
      showToast('Enter email and password', 'error')
      return
    }
    onOfficeLogin(email, password)
  }

  return (
    <div className="entry-container">
      <div className="entry-card animate-fade-in">
        <button className="entry-back" onClick={() => navigate('/login')}>
          <ArrowLeft size={20} />
        </button>

        <Logo className="entry-logo" showPoweredBy={false} />
        <p className="entry-subtitle">Sign in to your account</p>

        <div className="entry-form">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleOfficeSubmit()
            }}
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleOfficeSubmit()
            }}
          />
          <button
            className="entry-login-btn"
            onClick={handleOfficeSubmit}
          >
            Sign In
          </button>
        </div>

        <div className="entry-signup-hint">
          <div className="entry-signup-options">
            <button className="entry-join-link" onClick={() => navigate('/login/office/join')}>
              <UserPlus size={16} />
              <span>Join your company</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
