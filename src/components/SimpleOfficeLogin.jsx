import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function SimpleOfficeLogin({ onLogin, onShowToast }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      console.log('Attempting login for:', email)

      // Simple direct auth call
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password
      })

      if (authError) {
        console.error('Auth error:', authError)
        onShowToast?.(authError.message || 'Login failed', 'error')
        setLoading(false)
        return
      }

      console.log('Auth successful, user ID:', authData.user.id)

      // Get user data
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', authData.user.id)
        .single()

      if (userError || !user) {
        console.error('User error:', userError)
        onShowToast?.('User profile not found', 'error')
        setLoading(false)
        return
      }

      console.log('User found:', user)

      // Get company data
      const { data: company, error: companyError } = await supabase
        .from('companies')
        .select('*')
        .eq('id', user.company_id)
        .single()

      if (companyError || !company) {
        console.error('Company error:', companyError)
        onShowToast?.('Company not found', 'error')
        setLoading(false)
        return
      }

      console.log('Company found:', company.name)

      // Success!
      onLogin?.(user, company)
      onShowToast?.(`Welcome to ${company.name}!`, 'success')

    } catch (error) {
      console.error('Login exception:', error)
      onShowToast?.('Login failed - check console', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>FieldSync</h1>
          <h2>Office Login</h2>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              autoFocus
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            className="btn-primary btn-block"
            disabled={loading}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="login-footer">
          <p>
            <small>Field worker? <a href="/field">Enter here</a></small>
          </p>
        </div>
      </div>
    </div>
  )
}
