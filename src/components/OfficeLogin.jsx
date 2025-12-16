import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function OfficeLogin({ onLogin, onShowToast }) {
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      // Authenticate user
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password: password
      })

      if (error) {
        onShowToast?.(error.message || 'Invalid email or password', 'error')
        setLoading(false)
        return
      }

      // Get user profile - simple query to avoid RLS circular dependency
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id, email, full_name, role, company_id, created_at, updated_at')
        .eq('id', data.user.id)
        .single()

      if (userError || !userData) {
        console.error('User fetch error:', userError)
        onShowToast?.('Error loading profile. Please contact support.', 'error')
        await supabase.auth.signOut()
        setLoading(false)
        return
      }

      // Get company info separately
      const { data: companyData, error: companyError } = await supabase
        .from('companies')
        .select('*')
        .eq('id', userData.company_id)
        .single()

      if (companyError || !companyData) {
        console.error('Company fetch error:', companyError)
        onShowToast?.('Company not found. Please contact support.', 'error')
        await supabase.auth.signOut()
        setLoading(false)
        return
      }

      // Success!
      onShowToast?.('Logged in successfully!', 'success')
      onLogin?.(userData, companyData)

    } catch (error) {
      console.error('Login error:', error)
      onShowToast?.('Failed to log in. Please try again.', 'error')
      await supabase.auth.signOut()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <a href="/register" className="small-register-link">
          New company? Register here
        </a>
        <div className="login-header">
          <h1>FieldSync</h1>
          <h2>Office Dashboard</h2>
          <p>Sign in to access your dashboard</p>
        </div>

        <form onSubmit={handleLogin} className="login-form">
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              disabled={loading}
              autoFocus
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
            {loading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>

        <div className="login-footer">
          <p>
            Field worker? <a href="/field">Enter here</a>
          </p>
        </div>
      </div>
    </div>
  )
}
