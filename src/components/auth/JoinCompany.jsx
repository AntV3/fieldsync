import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, ArrowLeft, Check } from 'lucide-react'
import { db, supabase } from '../../lib/supabase'
import { isValidEmail, StepIndicator, PasswordInput } from './authUtils'
import Logo from '../Logo'

export default function JoinCompany({ onShowToast }) {
  const navigate = useNavigate()

  const [loading, setLoading] = useState(false)
  const [companyCode, setCompanyCode] = useState('')
  const [joinStep, setJoinStep] = useState(1)
  const [joinCompany, setJoinCompany] = useState(null)
  const [officeCode, setOfficeCode] = useState('')
  const [joinName, setJoinName] = useState('')
  const [joinEmail, setJoinEmail] = useState('')
  const [joinPassword, setJoinPassword] = useState('')
  const [joinSuccess, setJoinSuccess] = useState(false)

  const handleCompanyCodeChange = (value) => {
    const cleaned = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20)
    setCompanyCode(cleaned)
  }

  // Verify company code
  const verifyJoinCode = async () => {
    if (companyCode.length < 2) {
      onShowToast('Enter company code', 'error')
      return
    }

    setLoading(true)
    try {
      const foundCompany = await db.getCompanyByCode(companyCode)
      if (foundCompany) {
        setJoinCompany(foundCompany)
        setJoinStep(2)
      } else {
        onShowToast('Invalid company code', 'error')
        setCompanyCode('')
      }
    } catch (_err) {
      onShowToast('Error checking code', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Verify office code
  const verifyOfficeCode = async () => {
    if (!officeCode.trim()) {
      onShowToast('Enter office code', 'error')
      return
    }

    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('verify_office_code', {
        company_id: joinCompany.id,
        code: officeCode.trim()
      })

      if (error) throw error

      if (data === true) {
        setJoinStep(3)
      } else {
        onShowToast('Invalid office code', 'error')
        setOfficeCode('')
      }
    } catch (_err) {
      onShowToast('Error verifying code', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Handle join submit
  const handleJoinSubmit = async () => {
    if (loading) return
    if (!joinName.trim()) {
      onShowToast('Enter your name', 'error')
      return
    }
    if (!joinEmail.trim() || !isValidEmail(joinEmail)) {
      onShowToast('Enter a valid email address', 'error')
      return
    }
    if (joinPassword.length < 6) {
      onShowToast('Password must be 6+ characters', 'error')
      return
    }

    setLoading(true)
    try {
      const normalizedEmail = joinEmail.toLowerCase().trim()

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password: joinPassword
      })

      let userId

      const userAlreadyExists = authError?.message?.includes('already registered') ||
        (authData?.user && authData.user.identities?.length === 0)

      if (userAlreadyExists) {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password: joinPassword
        })

        if (signInError) {
          onShowToast('Account exists with different password. Use your existing password.', 'error')
          setLoading(false)
          return
        }

        userId = signInData.user.id

        const { data: existingMembership } = await supabase
          .from('user_companies')
          .select('id, status')
          .eq('user_id', userId)
          .eq('company_id', joinCompany.id)
          .maybeSingle()

        if (existingMembership) {
          if (existingMembership.status === 'active') {
            onShowToast('You already belong to this company. Logging you in...', 'success')
            setTimeout(() => window.location.reload(), 1000)
          } else if (existingMembership.status === 'pending') {
            onShowToast('Your request is still pending approval.', 'error')
            await supabase.auth.signOut()
          } else {
            onShowToast('Your membership was removed. Contact the company admin.', 'error')
            await supabase.auth.signOut()
          }
          return
        }

        const { error: ucError } = await supabase
          .from('user_companies')
          .insert({
            user_id: userId,
            company_id: joinCompany.id,
            role: 'member',
            status: 'pending'
          })

        if (ucError) {
          console.error('Error adding to user_companies:', ucError)
          await supabase.auth.signOut()
          throw new Error('Failed to submit join request')
        }

        await supabase.auth.signOut()
        setJoinSuccess(true)

      } else if (authError) {
        throw authError

      } else {
        userId = authData.user?.id
        if (!userId) throw new Error('Failed to create user')

        const { error: userError } = await supabase
          .from('users')
          .insert({
            id: userId,
            email: normalizedEmail,
            password_hash: 'managed_by_supabase_auth',
            name: joinName.trim(),
            company_id: joinCompany.id,
            role: 'member',
            is_active: true
          })

        if (userError) throw userError

        const { error: ucError } = await supabase
          .from('user_companies')
          .insert({
            user_id: userId,
            company_id: joinCompany.id,
            role: 'member',
            status: 'pending'
          })

        if (ucError) {
          console.error('Error adding to user_companies:', ucError)
          throw new Error('Failed to submit join request')
        }

        await supabase.auth.signOut()
        setJoinSuccess(true)
      }

    } catch (err) {
      console.error('Join error:', err)
      onShowToast(err.message || 'Error creating account', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Success screen
  if (joinSuccess) {
    return (
      <div className="entry-container">
        <div className="entry-card animate-scale-in">
          <div className="entry-success-icon">
            <Check size={32} />
          </div>
          <h2 className="entry-success-title">Request Submitted</h2>
          <p className="entry-success-message">
            Your request to join <strong>{joinCompany?.name}</strong> has been submitted.
            A company admin will review and approve your access.
          </p>
          <p className="entry-success-detail">
            You'll be able to sign in once approved.
          </p>
          <button
            className="entry-login-btn"
            onClick={() => navigate('/login/office')}
            style={{ marginTop: '1.5rem' }}
          >
            Back to Sign In
          </button>
        </div>
      </div>
    )
  }

  // Step 1: Enter company code
  if (joinStep === 1) {
    return (
      <div className="entry-container">
        <div className="entry-card animate-fade-in">
          <button className="entry-back" onClick={() => navigate('/login/office')}>
            <ArrowLeft size={20} />
          </button>

          <Logo className="entry-logo" showPoweredBy={false} />
          <StepIndicator steps={['Company', 'Verify', 'Account']} currentStep={1} />
          <p className="entry-subtitle">Enter your company code</p>
          <p className="entry-hint">Ask your manager or admin for the code</p>

          <div className="entry-input-group">
            <input
              type="text"
              value={companyCode}
              onChange={(e) => handleCompanyCodeChange(e.target.value)}
              placeholder="Company Code"
              disabled={loading}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') verifyJoinCode()
              }}
            />
            <button
              className="entry-submit-btn"
              onClick={verifyJoinCode}
              disabled={loading || companyCode.length < 2}
            >
              {loading ? <div className="spinner-small" /> : <ChevronRight size={20} />}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Step 2: Enter office code
  if (joinStep === 2) {
    return (
      <div className="entry-container">
        <div className="entry-card animate-fade-in">
          <button className="entry-back" onClick={() => { setJoinStep(1); setJoinCompany(null); setOfficeCode(''); }}>
            <ArrowLeft size={20} />
          </button>

          <Logo className="entry-logo" showPoweredBy={false} />
          <StepIndicator steps={['Company', 'Verify', 'Account']} currentStep={2} />
          <div className="entry-company-badge">{joinCompany?.name}</div>
          <p className="entry-subtitle">Enter office code</p>
          <p className="entry-hint">This verifies your office access</p>

          <div className="entry-input-group">
            <input
              type="password"
              value={officeCode}
              onChange={(e) => setOfficeCode(e.target.value)}
              placeholder="Office Code"
              disabled={loading}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') verifyOfficeCode()
              }}
            />
            <button
              className="entry-submit-btn"
              onClick={verifyOfficeCode}
              disabled={loading || !officeCode.trim()}
            >
              {loading ? <div className="spinner-small" /> : <ChevronRight size={20} />}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Step 3: Create account
  return (
    <div className="entry-container">
      <div className="entry-card animate-fade-in">
        <button className="entry-back" onClick={() => { setJoinStep(2); setOfficeCode(''); }}>
          <ArrowLeft size={20} />
        </button>

        <Logo className="entry-logo" showPoweredBy={false} />
        <StepIndicator steps={['Company', 'Verify', 'Account']} currentStep={3} />
        <div className="entry-company-badge">{joinCompany?.name}</div>
        <p className="entry-subtitle">Create your account</p>

        <div className="entry-form">
          <input
            type="text"
            value={joinName}
            onChange={(e) => setJoinName(e.target.value)}
            placeholder="Your Name"
            autoFocus
          />
          <input
            type="email"
            value={joinEmail}
            onChange={(e) => setJoinEmail(e.target.value)}
            placeholder="Email"
            className={joinEmail && !isValidEmail(joinEmail) ? 'input-error' : ''}
          />
          <PasswordInput
            value={joinPassword}
            onChange={(e) => setJoinPassword(e.target.value)}
            placeholder="Password (6+ characters)"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleJoinSubmit()
            }}
            showStrength={true}
          />
          <button
            className="entry-login-btn"
            onClick={handleJoinSubmit}
            disabled={loading || !joinName.trim() || !isValidEmail(joinEmail) || joinPassword.length < 6}
          >
            {loading ? (
              <span className="btn-loading">
                <div className="spinner-small" />
                Creating account...
              </span>
            ) : 'Join Company'}
          </button>
        </div>

        <p className="entry-join-note">
          You'll join as a team member. Your admin can update your role.
        </p>
      </div>
    </div>
  )
}
