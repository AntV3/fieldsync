import { useState, useEffect } from 'react'
import { User, Mail, Lock, Save, Loader2 } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import MFASetup from './MFASetup'

export default function AccountSettings({ user, company, onShowToast }) {
  const [name, setName] = useState(user?.name || '')
  const [email] = useState(user?.email || '')
  const [saving, setSaving] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)

  useEffect(() => {
    if (user?.name) setName(user.name)
  }, [user?.name])

  const handleUpdateProfile = async (e) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      onShowToast('Name cannot be empty', 'error')
      return
    }
    if (trimmed === user?.name) return

    setSaving(true)
    try {
      if (isSupabaseConfigured) {
        // Update users table
        const { error } = await supabase
          .from('users')
          .update({ name: trimmed, updated_at: new Date().toISOString() })
          .eq('id', user.id)
        if (error) throw error

        // Update auth metadata
        await supabase.auth.updateUser({ data: { name: trimmed } })
      }
      onShowToast('Profile updated', 'success')
    } catch (err) {
      console.error('Error updating profile:', err)
      onShowToast('Failed to update profile', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    if (!currentPassword || !newPassword) {
      onShowToast('Please fill in all password fields', 'error')
      return
    }
    if (newPassword.length < 8) {
      onShowToast('New password must be at least 8 characters', 'error')
      return
    }
    if (newPassword !== confirmPassword) {
      onShowToast('New passwords do not match', 'error')
      return
    }

    setChangingPassword(true)
    try {
      if (isSupabaseConfigured) {
        // Verify current password by re-authenticating
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: user.email,
          password: currentPassword,
        })
        if (signInError) {
          onShowToast('Current password is incorrect', 'error')
          return
        }

        const { error } = await supabase.auth.updateUser({ password: newPassword })
        if (error) throw error
      }
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      onShowToast('Password updated successfully', 'success')
    } catch (err) {
      console.error('Error changing password:', err)
      onShowToast(err.message || 'Failed to change password', 'error')
    } finally {
      setChangingPassword(false)
    }
  }

  return (
    <div className="account-settings">
      <div className="account-settings-header">
        <h2>Account Settings</h2>
        {company && <span className="account-company-name">{company.name}</span>}
      </div>

      {/* Profile Section */}
      <div className="account-section">
        <div className="account-section-title">
          <User size={18} />
          <h3>Profile</h3>
        </div>
        <form onSubmit={handleUpdateProfile} className="account-form">
          <div className="form-group">
            <label htmlFor="account-name">Full Name</label>
            <input
              id="account-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
            />
          </div>
          <div className="form-group">
            <label htmlFor="account-email">
              <Mail size={14} />
              Email
            </label>
            <input
              id="account-email"
              type="email"
              value={email}
              disabled
              className="input-disabled"
            />
            <span className="form-hint">Email cannot be changed</span>
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={saving || name.trim() === user?.name}
          >
            {saving ? <><Loader2 size={14} className="spinner" /> Saving...</> : <><Save size={14} /> Save Profile</>}
          </button>
        </form>
      </div>

      {/* Password Section */}
      {isSupabaseConfigured && (
        <div className="account-section">
          <div className="account-section-title">
            <Lock size={18} />
            <h3>Change Password</h3>
          </div>
          <form onSubmit={handleChangePassword} className="account-form">
            <div className="form-group">
              <label htmlFor="current-password">Current Password</label>
              <input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                autoComplete="current-password"
              />
            </div>
            <div className="form-group">
              <label htmlFor="new-password">New Password</label>
              <input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                minLength={8}
              />
            </div>
            <div className="form-group">
              <label htmlFor="confirm-password">Confirm New Password</label>
              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                autoComplete="new-password"
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
            >
              {changingPassword ? <><Loader2 size={14} className="spinner" /> Updating...</> : <><Lock size={14} /> Update Password</>}
            </button>
          </form>
        </div>
      )}

      {/* MFA Section */}
      {isSupabaseConfigured && (
        <div className="account-section">
          <MFASetup onShowToast={onShowToast} />
        </div>
      )}
    </div>
  )
}
