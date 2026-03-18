import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Check } from 'lucide-react'
import LoadingDots from '../ui/LoadingDots'
import { supabase } from '../../lib/supabase'
import { isValidEmail, generateCode, StepIndicator, PasswordInput } from './authUtils'
import Logo from '../Logo'

export default function RegisterCompany({ onShowToast }) {
  const navigate = useNavigate()

  const [loading, setLoading] = useState(false)
  const [registerStep, setRegisterStep] = useState(1)
  const [registerCompanyName, setRegisterCompanyName] = useState('')
  const [registerName, setRegisterName] = useState('')
  const [registerEmail, setRegisterEmail] = useState('')
  const [registerPassword, setRegisterPassword] = useState('')
  const [createdCompany, setCreatedCompany] = useState(null)

  const handleRegisterCompany = async () => {
    if (loading) return
    if (!registerName.trim()) {
      onShowToast('Enter your name', 'error')
      return
    }
    if (!registerEmail.trim() || !isValidEmail(registerEmail)) {
      onShowToast('Enter a valid email address', 'error')
      return
    }
    if (registerPassword.length < 6) {
      onShowToast('Password must be 6+ characters', 'error')
      return
    }

    setLoading(true)
    try {
      const normalizedEmail = registerEmail.toLowerCase().trim()
      const companyCodeGenerated = generateCode(6)
      const officeCodeGenerated = generateCode(6)

      // Step 1: Create auth user
      let userId
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password: registerPassword
      })

      const userAlreadyExists = authError?.message?.includes('already registered') ||
        (authData?.user && authData.user.identities?.length === 0)

      if (userAlreadyExists) {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password: registerPassword
        })

        if (signInError) {
          onShowToast('An account with this email already exists. Use your existing password or sign in instead.', 'error')
          return
        }

        const { data: existingUser } = await supabase
          .from('users')
          .select('id, company_id')
          .eq('id', signInData.user.id)
          .maybeSingle()

        if (existingUser?.company_id) {
          await supabase.auth.signOut()
          onShowToast('An account with this email already exists. Sign in instead.', 'error')
          return
        }

        userId = signInData.user.id
      } else if (authError) {
        throw authError
      } else {
        userId = authData.user?.id
        if (!userId) throw new Error('Failed to create account')
      }

      // Step 2: Try atomic RPC registration
      const { data: rpcResult, error: rpcError } = await supabase.rpc('register_company', {
        p_user_id: userId,
        p_user_email: normalizedEmail,
        p_user_name: registerName.trim(),
        p_company_name: registerCompanyName.trim(),
        p_company_code: companyCodeGenerated,
        p_office_code: officeCodeGenerated
      })

      if (!rpcError && rpcResult) {
        setCreatedCompany({
          name: registerCompanyName.trim(),
          code: companyCodeGenerated,
          officeCode: officeCodeGenerated
        })
        setRegisterStep(3)
        return
      }

      // Step 3: Fallback to direct inserts
      if (rpcError) {
        console.warn('register_company RPC unavailable, using direct inserts:', rpcError.message)
      }

      const { data: companyData, error: companyError } = await supabase
        .from('companies')
        .insert({
          name: registerCompanyName.trim(),
          code: companyCodeGenerated,
          office_code: officeCodeGenerated,
          subscription_tier: 'free',
          owner_user_id: userId
        })
        .select()
        .single()

      if (companyError) {
        console.error('Company creation error:', companyError)
        throw new Error('Failed to create company. Please try again.')
      }

      const { error: userError } = await supabase
        .from('users')
        .upsert({
          id: userId,
          email: normalizedEmail,
          password_hash: 'managed_by_supabase_auth',
          name: registerName.trim(),
          company_id: companyData.id,
          role: 'admin',
          is_active: true
        }, { onConflict: 'id' })

      if (userError) {
        console.error('User record error:', userError)
        throw new Error('Failed to set up user profile')
      }

      const { error: ucError } = await supabase
        .from('user_companies')
        .insert({
          user_id: userId,
          company_id: companyData.id,
          role: 'admin',
          access_level: 'administrator',
          status: 'active'
        })

      if (ucError) {
        console.warn('Direct user_companies insert failed, trying repair RPC:', ucError.message)
        const { error: repairError } = await supabase.rpc('repair_legacy_user', {
          p_user_id: userId,
          p_company_id: companyData.id,
          p_role: 'admin'
        })

        if (repairError) {
          console.error('Repair RPC also failed:', repairError.message)
        }
      }

      setCreatedCompany({
        name: companyData.name,
        code: companyCodeGenerated,
        officeCode: officeCodeGenerated
      })
      setRegisterStep(3)

    } catch (err) {
      console.error('Registration error:', err)
      onShowToast(err.message || 'Error creating company', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Step 3: Success
  if (registerStep === 3 && createdCompany) {
    return (
      <div className="entry-container">
        <div className="entry-card entry-card-wide animate-scale-in">
          <div className="entry-success-icon">
            <Check size={32} />
          </div>
          <h2 className="entry-success-title">Company Created</h2>
          <p className="entry-success-message">
            <strong>{createdCompany.name}</strong> is ready to go.
            Save these codes to share with your team.
          </p>

          <div className="entry-codes-grid">
            <div className="entry-code-card">
              <span className="entry-code-label">Company Code</span>
              <span className="entry-code-value">{createdCompany.code}</span>
              <span className="entry-code-hint">Share with all employees</span>
            </div>
            <div className="entry-code-card">
              <span className="entry-code-label">Office Code</span>
              <span className="entry-code-value">{createdCompany.officeCode}</span>
              <span className="entry-code-hint">Office staff only</span>
            </div>
          </div>

          <p className="entry-codes-warning">
            Save these codes now. You can also find them in your company settings later.
          </p>

          <button
            className="entry-login-btn"
            onClick={() => window.location.reload()}
            style={{ marginTop: '0.5rem' }}
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    )
  }

  // Step 1: Company info
  if (registerStep === 1) {
    return (
      <div className="entry-container">
        <div className="entry-card animate-fade-in">
          <button className="entry-back" onClick={() => navigate('/')}>
            <ArrowLeft size={20} />
          </button>

          <Logo className="entry-logo" showPoweredBy={false} />
          <StepIndicator steps={['Company', 'Your Account']} currentStep={1} />
          <p className="entry-subtitle">Register your company</p>
          <p className="entry-hint">Set up your company on FieldSync</p>

          <div className="entry-form">
            <input
              type="text"
              value={registerCompanyName}
              onChange={(e) => setRegisterCompanyName(e.target.value)}
              placeholder="Company Name"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && registerCompanyName.trim()) {
                  setRegisterStep(2)
                }
              }}
            />
            <button
              className="entry-login-btn"
              onClick={() => setRegisterStep(2)}
              disabled={!registerCompanyName.trim()}
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Step 2: Admin account
  return (
    <div className="entry-container">
      <div className="entry-card animate-fade-in">
        <button className="entry-back" onClick={() => setRegisterStep(1)}>
          <ArrowLeft size={20} />
        </button>

        <Logo className="entry-logo" showPoweredBy={false} />
        <StepIndicator steps={['Company', 'Your Account']} currentStep={2} />
        <div className="entry-company-badge">{registerCompanyName}</div>
        <p className="entry-subtitle">Create your admin account</p>

        <div className="entry-form">
          <input
            type="text"
            value={registerName}
            onChange={(e) => setRegisterName(e.target.value)}
            placeholder="Your Name"
            autoFocus
          />
          <input
            type="email"
            value={registerEmail}
            onChange={(e) => setRegisterEmail(e.target.value)}
            placeholder="Email"
            className={registerEmail && !isValidEmail(registerEmail) ? 'input-error' : ''}
          />
          <PasswordInput
            value={registerPassword}
            onChange={(e) => setRegisterPassword(e.target.value)}
            placeholder="Password (6+ characters)"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRegisterCompany()
            }}
            showStrength={true}
          />
          <button
            className="entry-login-btn"
            onClick={handleRegisterCompany}
            disabled={loading || !registerName.trim() || !isValidEmail(registerEmail) || registerPassword.length < 6}
          >
            {loading ? (
              <span className="btn-loading">
                <LoadingDots size="small" />
                Setting up company...
              </span>
            ) : 'Create Company'}
          </button>
        </div>

        <p className="entry-join-note">
          You'll be the administrator. Company and office codes will be generated for you.
        </p>
      </div>
    </div>
  )
}
