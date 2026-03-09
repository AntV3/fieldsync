/**
 * Financial/COR/Notifications domain methods.
 * Extracted from supabase.js – COR Exports, Project Sharing,
 * Notifications.
 */

import {
  supabase,
  isSupabaseConfigured,
  observe,
  getClient,
  getLocalData,
  setLocalData,
  sanitize
} from './client'

export const financialOps = {

  // ============================================
  // COR Export Snapshots
  // ============================================

  async saveExportSnapshot(corId, snapshot, options = {}) {
    if (!isSupabaseConfigured) return null

    const {
      exportType = 'pdf',
      exportReason = null,
      clientEmail = null,
      clientName = null
    } = options

    try {
      const { data, error } = await supabase
        .from('cor_export_snapshots')
        .insert({
          cor_id: corId,
          export_type: exportType,
          export_reason: exportReason,
          cor_data: snapshot.cor_data,
          tickets_data: snapshot.tickets_data,
          photos_manifest: snapshot.photos_manifest,
          totals_snapshot: snapshot.totals_snapshot,
          checksum: snapshot.checksum,
          client_email: clientEmail,
          client_name: clientName
        })
        .select()
        .single()

      if (error) throw error
      return data
    } catch (error) {
      console.error('Error saving export snapshot:', error)
      throw error
    }
  },

  // Get export history for a COR
  async getExportSnapshots(corId) {
    if (!isSupabaseConfigured) return []

    const { data, error } = await supabase
      .from('cor_export_snapshots')
      .select('id, exported_at, export_type, export_reason, client_name, client_email, checksum')
      .eq('cor_id', corId)
      .order('exported_at', { ascending: false })

    if (error) {
      console.error('Error fetching export snapshots:', error)
      return []
    }
    return data || []
  },

  // Get a specific export snapshot with full data
  async getExportSnapshot(snapshotId) {
    if (!isSupabaseConfigured) return null

    const { data, error } = await supabase
      .from('cor_export_snapshots')
      .select('*')
      .eq('id', snapshotId)
      .single()

    if (error) {
      console.error('Error fetching export snapshot:', error)
      return null
    }
    return data
  },

  // ============================================
  // COR Export Jobs (Async Pipeline)
  // ============================================

  // Request a COR export (idempotent - returns existing job if key matches)
  async requestCORExport(corId, idempotencyKey, options = {}) {
    if (!isSupabaseConfigured) return null

    try {
      const user = await supabase.auth.getUser()
      const { data, error } = await supabase.rpc('request_cor_export', {
        p_cor_id: corId,
        p_idempotency_key: idempotencyKey,
        p_options: options,
        p_requested_by: user?.data?.user?.id || null
      })

      if (error) throw error
      return data?.[0] || null
    } catch (error) {
      observe.error('database', { message: error.message, operation: 'requestCORExport', extra: { corId } })
      throw error
    }
  },

  // Get export job status
  async getExportJob(jobId) {
    if (!isSupabaseConfigured) return null

    const { data, error } = await supabase
      .from('cor_export_jobs')
      .select('*')
      .eq('id', jobId)
      .single()

    if (error) {
      console.error('Error fetching export job:', error)
      return null
    }
    return data
  },

  // Get export jobs for a COR
  async getExportJobs(corId, limit = 10) {
    if (!isSupabaseConfigured) return []

    const { data, error } = await supabase
      .from('cor_export_jobs')
      .select('*')
      .eq('cor_id', corId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('Error fetching export jobs:', error)
      return []
    }
    return data || []
  },

  // Update export job status
  async updateExportJobStatus(jobId, status, details = {}) {
    if (!isSupabaseConfigured) return null

    try {
      const { data, error } = await supabase.rpc('update_export_job_status', {
        p_job_id: jobId,
        p_status: status,
        p_snapshot_id: details.snapshotId || null,
        p_pdf_url: details.pdfUrl || null,
        p_error: details.error || null,
        p_error_details: details.errorDetails || null,
        p_metrics: details.metrics || null
      })

      if (error) throw error
      return data
    } catch (error) {
      observe.error('database', { message: error.message, operation: 'updateExportJobStatus', extra: { jobId, status } })
      throw error
    }
  },

  // Get current valid snapshot for a COR (if exists and not stale)
  async getCurrentCORSnapshot(corId) {
    if (!isSupabaseConfigured) return null

    // First check if COR has been modified since last snapshot
    const { data: cor } = await supabase
      .from('change_orders')
      .select('version, last_snapshot_version')
      .eq('id', corId)
      .single()

    // If version changed, snapshot is stale
    if (!cor || cor.version !== cor.last_snapshot_version) {
      return null
    }

    // Get current snapshot
    const { data: snapshot } = await supabase
      .from('cor_export_snapshots')
      .select('*')
      .eq('cor_id', corId)
      .eq('is_current', true)
      .single()

    return snapshot || null
  },

  // Save a new snapshot and mark as current
  async saveCORSnapshot(snapshot, jobId) {
    if (!isSupabaseConfigured) return null

    try {
      // Mark previous snapshots as not current
      const { error: markError } = await supabase
        .from('cor_export_snapshots')
        .update({ is_current: false })
        .eq('cor_id', snapshot.corId)

      if (markError) throw markError

      const user = await supabase.auth.getUser()

      // Insert new snapshot
      const { data, error } = await supabase
        .from('cor_export_snapshots')
        .insert({
          id: snapshot.snapshotId,
          cor_id: snapshot.corId,
          job_id: jobId,
          cor_version: snapshot.corVersion,
          cor_data: snapshot.corData,
          tickets_data: snapshot.ticketsData,
          photos_manifest: snapshot.photoManifest,
          totals_snapshot: snapshot.totals,
          checksum: snapshot.checksum,
          is_current: true,
          exported_by: user?.data?.user?.id || null
        })
        .select()
        .single()

      if (error) throw error

      // Update COR's last snapshot version
      const { error: versionError } = await supabase
        .from('change_orders')
        .update({ last_snapshot_version: snapshot.corVersion })
        .eq('id', snapshot.corId)

      if (versionError) {
        // Snapshot was inserted but COR version not updated - log and throw
        observe.error('database', { message: versionError.message, operation: 'saveCORSnapshot:versionUpdate', extra: { corId: snapshot.corId } })
        throw versionError
      }

      return data
    } catch (error) {
      observe.error('database', { message: error.message, operation: 'saveCORSnapshot', extra: { corId: snapshot.corId } })
      throw error
    }
  },

  // Update COR aggregated stats (call after ticket changes)
  async updateCORAggregatedStats(corId) {
    if (!isSupabaseConfigured) return

    try {
      const { error } = await supabase.rpc('update_cor_aggregated_stats', { p_cor_id: corId })
      if (error) throw error
    } catch (error) {
      console.error('Error updating COR aggregated stats:', error)
      throw error
    }
  },

  // ============================================
  // Project Sharing
  // ============================================

  generateShareToken() {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    const array = new Uint8Array(12)
    crypto.getRandomValues(array)
    return Array.from(array, b => chars[b % chars.length]).join('')
  },

  async createProjectShare(projectId, createdBy, permissions, expiresAt = null) {
    if (!isSupabaseConfigured) {
      // Demo mode - store in localStorage
      const localData = getLocalData()
      if (!localData.projectShares) localData.projectShares = []

      const share = {
        id: crypto.randomUUID(),
        project_id: projectId,
        share_token: this.generateShareToken(),
        created_by: createdBy,
        expires_at: expiresAt,
        is_active: true,
        permissions: permissions,
        view_count: 0,
        last_viewed_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      localData.projectShares.push(share)
      setLocalData(localData)
      return share
    }

    // Use database function to generate unique token
    const { data: tokenData, error: tokenError } = await supabase.rpc('generate_share_token')
    if (tokenError) {
      console.error('Error generating share token:', tokenError)
      throw tokenError
    }

    const { data, error } = await supabase
      .from('project_shares')
      .insert({
        project_id: projectId,
        share_token: tokenData,
        created_by: createdBy,
        expires_at: expiresAt,
        permissions: permissions
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating project share:', error)
      throw error
    }
    return data
  },

  // Get share by token (public access)
  async getShareByToken(token) {
    if (!isSupabaseConfigured) {
      // Demo mode
      const localData = getLocalData()
      if (!localData.projectShares) return null

      const share = localData.projectShares.find(s =>
        s.share_token === token &&
        s.is_active &&
        (!s.expires_at || new Date(s.expires_at) > new Date())
      )

      if (share) {
        // Increment view count
        share.view_count++
        share.last_viewed_at = new Date().toISOString()
        setLocalData(localData)
      }

      return share
    }

    const { data, error } = await supabase
      .from('project_shares')
      .select('*, projects(*)')
      .eq('share_token', token)
      .eq('is_active', true)
      .single()

    if (error) {
      console.error('Error fetching share by token:', error)
      return null
    }

    // Check if expired
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      return null
    }

    // Increment view count (fire-and-forget is acceptable for analytics)
    const { error: viewCountError } = await supabase.rpc('increment_share_view_count', { token })
    if (viewCountError) {
      console.warn('Failed to increment share view count:', viewCountError)
    }

    return data
  },

  // Get all shares for a project
  async getProjectShares(projectId) {
    if (!isSupabaseConfigured) {
      // Demo mode
      const localData = getLocalData()
      if (!localData.projectShares) return []

      return localData.projectShares.filter(s => s.project_id === projectId)
    }

    const { data, error } = await supabase
      .from('project_shares')
      .select('*, users(name, email)')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching project shares:', error)
      return []
    }
    return data || []
  },

  // Update share (e.g., change permissions or expiration)
  async updateProjectShare(shareId, updates) {
    if (!isSupabaseConfigured) {
      // Demo mode
      const localData = getLocalData()
      if (!localData.projectShares) return null

      const shareIndex = localData.projectShares.findIndex(s => s.id === shareId)
      if (shareIndex === -1) return null

      localData.projectShares[shareIndex] = {
        ...localData.projectShares[shareIndex],
        ...updates,
        updated_at: new Date().toISOString()
      }
      setLocalData(localData)
      return localData.projectShares[shareIndex]
    }

    // Allowlist: only permit safe fields to be updated
    const ALLOWED_FIELDS = ['permissions', 'expires_at', 'is_active']
    const filtered = { updated_at: new Date().toISOString() }
    for (const key of ALLOWED_FIELDS) {
      if (key in updates) filtered[key] = updates[key]
    }

    const { data, error } = await supabase
      .from('project_shares')
      .update(filtered)
      .eq('id', shareId)
      .select()
      .single()

    if (error) {
      console.error('Error updating project share:', error)
      throw error
    }
    return data
  },

  // Revoke a share (deactivate)
  async revokeProjectShare(shareId) {
    return this.updateProjectShare(shareId, { is_active: false })
  },

  // Delete a share permanently
  async deleteProjectShare(shareId) {
    if (!isSupabaseConfigured) {
      // Demo mode
      const localData = getLocalData()
      if (!localData.projectShares) return

      localData.projectShares = localData.projectShares.filter(s => s.id !== shareId)
      setLocalData(localData)
      return
    }

    const { error } = await supabase
      .from('project_shares')
      .delete()
      .eq('id', shareId)

    if (error) {
      console.error('Error deleting project share:', error)
      throw error
    }
  },

  // Get public project data (filtered by permissions)
  async getPublicProjectData(shareToken) {
    const share = await this.getShareByToken(shareToken)
    if (!share) return null

    const projectId = share.project_id || share.projects?.id

    if (!isSupabaseConfigured) {
      // Demo mode
      const localData = getLocalData()
      const project = localData.projects.find(p => p.id === projectId)
      if (!project) return null

      const areas = localData.areas.filter(a => a.project_id === projectId)

      // Calculate progress
      const totalWeight = areas.reduce((sum, area) => sum + parseFloat(area.weight || 0), 0)
      const completedWeight = areas
        .filter(a => a.status === 'done')
        .reduce((sum, area) => sum + parseFloat(area.weight || 0), 0)
      const progress = totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : 0

      return {
        share,
        project,
        progress,
        areas: share.permissions.progress ? areas : [],
        photos: [],
        dailyReports: [],
        tmTickets: []
      }
    }

    // Get project details
    const project = share.projects || await this.getProject(projectId)
    if (!project) return null

    // Build response based on permissions
    const result = {
      share,
      project,
      areas: [],
      photos: [],
      dailyReports: [],
      tmTickets: []
    }

    // Get areas for progress calculation
    if (share.permissions.progress) {
      result.areas = await this.getAreas(projectId)

      // Calculate progress
      const totalWeight = result.areas.reduce((sum, area) => sum + parseFloat(area.weight || 0), 0)
      const completedWeight = result.areas
        .filter(a => a.status === 'done')
        .reduce((sum, area) => sum + parseFloat(area.weight || 0), 0)
      result.progress = totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : 0
    }

    // Get photos if permitted
    if (share.permissions.photos) {
      const { data: tickets } = await supabase
        .from('t_and_m_tickets')
        .select('photos, work_date')
        .eq('project_id', projectId)
        .not('photos', 'is', null)
        .order('work_date', { ascending: false })
        .limit(20)

      result.photos = tickets?.flatMap(t =>
        (t.photos || []).map(photo => ({
          url: photo,
          date: t.work_date
        }))
      ) || []
    }

    // Get daily reports if permitted
    if (share.permissions.daily_reports) {
      const { data: reports } = await supabase
        .from('daily_reports')
        .select('*')
        .eq('project_id', projectId)
        .order('report_date', { ascending: false })
        .limit(10)

      result.dailyReports = reports || []
    }

    // Get T&M tickets if permitted
    if (share.permissions.tm_tickets) {
      result.tmTickets = await this.getTMTickets(projectId)
    }

    return result
  },

  // ============================================
  // Notifications
  // ============================================

  async getCompanyUsers(companyId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('user_companies')
        .select(`
          user_id,
          role,
          users (
            id,
            name,
            email
          )
        `)
        .eq('company_id', companyId)

      if (error) {
        console.error('Error fetching company users:', error)
        return []
      }
      return data?.map(uc => ({
        id: uc.user_id,
        name: uc.users?.name || uc.users?.email,
        email: uc.users?.email,
        role: uc.role
      })) || []
    }
    return []
  },

  // Get notification preferences for a project
  async getProjectNotificationPreferences(projectId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('notification_preferences')
        .select(`
          *,
          users (
            id,
            name,
            email
          )
        `)
        .eq('project_id', projectId)

      if (error) {
        console.error('Error fetching notification preferences:', error)
        return []
      }
      return data || []
    }
    // Demo mode - use localStorage
    const localData = getLocalData()
    if (!localData.notificationPreferences) return []
    return localData.notificationPreferences.filter(np => np.project_id === projectId)
  },

  // Get notification preferences for a user across all projects
  async getUserNotificationPreferences(userId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('notification_preferences')
        .select(`
          *,
          projects (
            id,
            name
          )
        `)
        .eq('user_id', userId)

      if (error) {
        console.error('Error fetching user notification preferences:', error)
        return []
      }
      return data || []
    }
    const localData = getLocalData()
    if (!localData.notificationPreferences) return []
    return localData.notificationPreferences.filter(np => np.user_id === userId)
  },

  // Set notification preferences for a user on a project
  async setNotificationPreference(projectId, userId, notificationTypes) {
    if (isSupabaseConfigured) {
      // Upsert - update if exists, insert if not
      const { data, error } = await supabase
        .from('notification_preferences')
        .upsert({
          project_id: projectId,
          user_id: userId,
          notification_types: notificationTypes,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'project_id,user_id'
        })
        .select()
        .single()

      if (error) {
        console.error('Error setting notification preference:', error)
        throw error
      }
      return data
    }
    // Demo mode
    const localData = getLocalData()
    if (!localData.notificationPreferences) {
      localData.notificationPreferences = []
    }

    const existingIndex = localData.notificationPreferences.findIndex(
      np => np.project_id === projectId && np.user_id === userId
    )

    const pref = {
      id: existingIndex >= 0 ? localData.notificationPreferences[existingIndex].id : crypto.randomUUID(),
      project_id: projectId,
      user_id: userId,
      notification_types: notificationTypes,
      created_at: existingIndex >= 0 ? localData.notificationPreferences[existingIndex].created_at : new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    if (existingIndex >= 0) {
      localData.notificationPreferences[existingIndex] = pref
    } else {
      localData.notificationPreferences.push(pref)
    }

    setLocalData(localData)
    return pref
  },

  // Remove notification preferences for a user on a project
  async removeNotificationPreference(projectId, userId) {
    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('notification_preferences')
        .delete()
        .eq('project_id', projectId)
        .eq('user_id', userId)

      if (error) {
        console.error('Error removing notification preference:', error)
        throw error
      }
      return true
    }
    // Demo mode
    const localData = getLocalData()
    if (!localData.notificationPreferences) return true
    localData.notificationPreferences = localData.notificationPreferences.filter(
      np => !(np.project_id === projectId && np.user_id === userId)
    )
    setLocalData(localData)
    return true
  },

  // Bulk set notification preferences for multiple users on a project
  async setProjectNotificationPreferences(projectId, userPreferences) {
    // userPreferences is an array of { userId, notificationTypes }
    // Process in parallel for better performance
    const toSet = userPreferences.filter(p => p.notificationTypes?.length > 0)
    const toRemove = userPreferences.filter(p => !p.notificationTypes?.length)

    const [setResults] = await Promise.all([
      Promise.all(toSet.map(pref =>
        this.setNotificationPreference(projectId, pref.userId, pref.notificationTypes)
      )),
      Promise.all(toRemove.map(pref =>
        this.removeNotificationPreference(projectId, pref.userId)
      ))
    ])

    return setResults
  },

  // ============================================
  // Notification Presets (Company-wide roles)
  // ============================================

  // Get notification presets for a company
  async getNotificationPresets(companyId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('notification_presets')
        .select('*')
        .eq('company_id', companyId)
        .order('name')

      if (error) {
        console.error('Error fetching notification presets:', error)
        return []
      }
      return data || []
    }
    // Demo mode
    const localData = getLocalData()
    if (!localData.notificationPresets) {
      // Return default presets
      return [
        { id: 'preset-1', name: 'Project Manager', notification_types: ['message', 'material_request', 'injury_report', 'tm_ticket'], company_id: companyId },
        { id: 'preset-2', name: 'Safety Officer', notification_types: ['injury_report'], company_id: companyId },
        { id: 'preset-3', name: 'Purchasing', notification_types: ['material_request'], company_id: companyId },
        { id: 'preset-4', name: 'Accounting', notification_types: ['tm_ticket'], company_id: companyId }
      ]
    }
    return localData.notificationPresets.filter(np => np.company_id === companyId)
  },

  // Create a notification preset
  async createNotificationPreset(companyId, name, notificationTypes) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('notification_presets')
        .insert({
          company_id: companyId,
          name,
          notification_types: notificationTypes
        })
        .select()
        .single()

      if (error) {
        console.error('Error creating notification preset:', error)
        throw error
      }
      return data
    }
    // Demo mode
    const localData = getLocalData()
    if (!localData.notificationPresets) {
      localData.notificationPresets = []
    }
    const preset = {
      id: crypto.randomUUID(),
      company_id: companyId,
      name,
      notification_types: notificationTypes,
      created_at: new Date().toISOString()
    }
    localData.notificationPresets.push(preset)
    setLocalData(localData)
    return preset
  },

  // Update a notification preset
  async updateNotificationPreset(presetId, name, notificationTypes) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('notification_presets')
        .update({
          name,
          notification_types: notificationTypes,
          updated_at: new Date().toISOString()
        })
        .eq('id', presetId)
        .select()
        .single()

      if (error) {
        console.error('Error updating notification preset:', error)
        throw error
      }
      return data
    }
    // Demo mode
    const localData = getLocalData()
    if (!localData.notificationPresets) return null
    const index = localData.notificationPresets.findIndex(p => p.id === presetId)
    if (index === -1) return null
    localData.notificationPresets[index] = {
      ...localData.notificationPresets[index],
      name,
      notification_types: notificationTypes,
      updated_at: new Date().toISOString()
    }
    setLocalData(localData)
    return localData.notificationPresets[index]
  },

  // Delete a notification preset
  async deleteNotificationPreset(presetId) {
    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('notification_presets')
        .delete()
        .eq('id', presetId)

      if (error) {
        console.error('Error deleting notification preset:', error)
        throw error
      }
      return true
    }
    // Demo mode
    const localData = getLocalData()
    if (!localData.notificationPresets) return true
    localData.notificationPresets = localData.notificationPresets.filter(p => p.id !== presetId)
    setLocalData(localData)
    return true
  },

  // ============================================
  // Real-time Subscriptions
  // ============================================

  // Subscribe to COR export job changes (for tracking async export progress)
  subscribeToExportJobs(corId, callback) {
    if (isSupabaseConfigured) {
      return supabase
        .channel(`cor_export_jobs:${corId}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'cor_export_jobs', filter: `cor_id=eq.${corId}` },
          callback
        )
        .subscribe()
    }
    return null
  },

}
