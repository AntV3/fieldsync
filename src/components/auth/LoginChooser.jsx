import { useNavigate } from 'react-router-dom'
import { HardHat, Briefcase, ArrowLeft } from 'lucide-react'
import Logo from '../Logo'

export default function LoginChooser() {
  const navigate = useNavigate()

  return (
    <div className="entry-container">
      <div className="entry-card animate-fade-in-up">
        <Logo className="entry-logo" showPoweredBy={false} />

        <div className="entry-buttons stagger-children">
          <button
            className="entry-mode-btn foreman"
            onClick={() => navigate('/login/field')}
          >
            <span className="entry-mode-icon"><HardHat size={32} /></span>
            <span className="entry-mode-title">Field Site</span>
            <span className="entry-mode-desc">Enter project PIN</span>
          </button>

          <button
            className="entry-mode-btn office"
            onClick={() => navigate('/login/office')}
          >
            <span className="entry-mode-icon"><Briefcase size={32} /></span>
            <span className="entry-mode-title">Office</span>
            <span className="entry-mode-desc">Sign in to dashboard</span>
          </button>
        </div>

        <button
          className="entry-join-link"
          style={{ marginTop: '1rem', display: 'flex', alignSelf: 'center' }}
          onClick={() => {
            localStorage.removeItem('fieldsync-has-visited')
            navigate('/')
          }}
        >
          <ArrowLeft size={16} />
          <span>Back to home</span>
        </button>
      </div>
    </div>
  )
}
