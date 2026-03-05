/**
 * Financial/COR/Notifications domain methods.
 * Extracted from supabase.js – COR Exports, Project Sharing,
 * Notifications, and Dump Sites / Haul-Off Tracking.
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
      return null
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
      await supabase
        .from('cor_export_snapshots')
        .update({ is_current: false })
        .eq('cor_id', snapshot.corId)

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
      await supabase
        .from('change_orders')
        .update({ last_snapshot_version: snapshot.corVersion })
        .eq('id', snapshot.corId)

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
      await supabase.rpc('update_cor_aggregated_stats', { p_cor_id: corId })
    } catch (error) {
      console.error('Error updating COR aggregated stats:', error)
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

    // Increment view count
    await supabase.rpc('increment_share_view_count', { token })

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

    const { data, error } = await supabase
      .from('project_shares')
      .update(updates)
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
    const results = []
    for (const pref of userPreferences) {
      if (pref.notificationTypes && pref.notificationTypes.length > 0) {
        const result = await this.setNotificationPreference(projectId, pref.userId, pref.notificationTypes)
        results.push(result)
      } else {
        await this.removeNotificationPreference(projectId, pref.userId)
      }
    }
    return results
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
  // Dump Sites & Haul-Off Tracking
  // ============================================

  // Get all dump sites for a company
  async getDumpSites(companyId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('dump_sites')
        .select(`
          *,
          dump_site_rates (*)
        `)
        .eq('company_id', companyId)
        .eq('active', true)
        .order('name')

      if (error) {
        console.error('Error fetching dump sites:', error)
        return []
      }
      return data || []
    }
    // Demo mode
    const localData = getLocalData()
    return (localData.dumpSites || []).filter(ds => ds.company_id === companyId && ds.active)
  },

  // Create a new dump site
  async createDumpSite(companyId, name, address = '', notes = '') {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('dump_sites')
        .insert({
          company_id: companyId,
          name: sanitize.text(name),
          address: sanitize.text(address),
          notes: sanitize.text(notes),
          active: true
        })
        .select()
        .single()

      if (error) {
        console.error('Error creating dump site:', error)
        throw error
      }
      return data
    }
    // Demo mode
    const localData = getLocalData()
    if (!localData.dumpSites) localData.dumpSites = []
    const dumpSite = {
      id: crypto.randomUUID(),
      company_id: companyId,
      name,
      address,
      notes,
      active: true,
      created_at: new Date().toISOString(),
      dump_site_rates: []
    }
    localData.dumpSites.push(dumpSite)
    setLocalData(localData)
    return dumpSite
  },

  // Update a dump site
  async updateDumpSite(dumpSiteId, updates) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('dump_sites')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', dumpSiteId)
        .select()
        .single()

      if (error) {
        console.error('Error updating dump site:', error)
        throw error
      }
      return data
    }
    // Demo mode
    const localData = getLocalData()
    if (!localData.dumpSites) return null
    const index = localData.dumpSites.findIndex(ds => ds.id === dumpSiteId)
    if (index === -1) return null
    localData.dumpSites[index] = { ...localData.dumpSites[index], ...updates }
    setLocalData(localData)
    return localData.dumpSites[index]
  },

  // Delete (soft) a dump site
  async deleteDumpSite(dumpSiteId) {
    return this.updateDumpSite(dumpSiteId, { active: false })
  },

  // Set rate for a waste type at a dump site
  async setDumpSiteRate(dumpSiteId, wasteType, estimatedCostPerLoad, unit = 'load') {
    if (isSupabaseConfigured) {
      // First check if rate exists
      const { data: existing } = await supabase
        .from('dump_site_rates')
        .select('id')
        .eq('dump_site_id', dumpSiteId)
        .eq('waste_type', wasteType)
        .maybeSingle()

      if (existing) {
        // Update existing rate
        const { data, error } = await supabase
          .from('dump_site_rates')
          .update({
            estimated_cost_per_load: estimatedCostPerLoad,
            unit
          })
          .eq('id', existing.id)
          .select()
          .single()

        if (error) {
          console.error('Error updating dump site rate:', error)
          throw error
        }
        return data
      } else {
        // Insert new rate
        const { data, error } = await supabase
          .from('dump_site_rates')
          .insert({
            dump_site_id: dumpSiteId,
            waste_type: wasteType,
            estimated_cost_per_load: estimatedCostPerLoad,
            unit
          })
          .select()
          .single()

        if (error) {
          console.error('Error inserting dump site rate:', error)
          throw error
        }
        return data
      }
    }
    // Demo mode
    const localData = getLocalData()
    if (!localData.dumpSiteRates) localData.dumpSiteRates = []
    const existingIndex = localData.dumpSiteRates.findIndex(
      r => r.dump_site_id === dumpSiteId && r.waste_type === wasteType
    )
    const rate = {
      id: existingIndex >= 0 ? localData.dumpSiteRates[existingIndex].id : crypto.randomUUID(),
      dump_site_id: dumpSiteId,
      waste_type: wasteType,
      estimated_cost_per_load: estimatedCostPerLoad,
      unit,
      created_at: new Date().toISOString()
    }
    if (existingIndex >= 0) {
      localData.dumpSiteRates[existingIndex] = rate
    } else {
      localData.dumpSiteRates.push(rate)
    }
    setLocalData(localData)
    return rate
  },

  // Get rates for a dump site
  async getDumpSiteRates(dumpSiteId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('dump_site_rates')
        .select('*')
        .eq('dump_site_id', dumpSiteId)

      if (error) {
        console.error('Error fetching dump site rates:', error)
        return []
      }
      return data || []
    }
    // Demo mode
    const localData = getLocalData()
    return (localData.dumpSiteRates || []).filter(r => r.dump_site_id === dumpSiteId)
  },

  // Get all haul-offs for a project
  async getHaulOffs(projectId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('haul_offs')
        .select(`
          *,
          dump_sites (name)
        `)
        .eq('project_id', projectId)
        .order('work_date', { ascending: false })

      if (error) {
        console.error('Error fetching haul-offs:', error)
        return []
      }
      return data || []
    }
    // Demo mode
    const localData = getLocalData()
    return (localData.haulOffs || [])
      .filter(h => h.project_id === projectId)
      .sort((a, b) => new Date(b.work_date) - new Date(a.work_date))
  },

  // Create a haul-off event
  async createHaulOff(projectId, data) {
    const haulOff = {
      project_id: projectId,
      dump_site_id: data.dumpSiteId,
      waste_type: data.wasteType,
      loads: data.loads,
      hauling_company: data.haulingCompany || '',
      work_date: data.workDate,
      notes: data.notes || '',
      estimated_cost: data.estimatedCost || 0,
      created_by: data.createdBy || ''
    }

    if (isSupabaseConfigured) {
      const { data: result, error } = await supabase
        .from('haul_offs')
        .insert(haulOff)
        .select()
        .single()

      if (error) {
        console.error('Error creating haul-off:', error)
        throw error
      }
      return result
    }
    // Demo mode
    const localData = getLocalData()
    if (!localData.haulOffs) localData.haulOffs = []
    const newHaulOff = {
      ...haulOff,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString()
    }
    localData.haulOffs.push(newHaulOff)
    setLocalData(localData)
    return newHaulOff
  },

  // Calculate haul-off costs for burn rate
  async calculateHaulOffCosts(projectId) {
    const haulOffs = await this.getHaulOffs(projectId)

    let totalCost = 0
    let totalLoads = 0
    const byWasteType = {}
    const byDate = []

    // Group by date for daily breakdown
    const dateMap = {}

    haulOffs.forEach(h => {
      const cost = parseFloat(h.estimated_cost) || 0
      const loads = parseInt(h.loads) || 0

      totalCost += cost
      totalLoads += loads

      // By waste type
      if (!byWasteType[h.waste_type]) {
        byWasteType[h.waste_type] = { loads: 0, cost: 0 }
      }
      byWasteType[h.waste_type].loads += loads
      byWasteType[h.waste_type].cost += cost

      // By date
      if (!dateMap[h.work_date]) {
        dateMap[h.work_date] = { date: h.work_date, loads: 0, cost: 0 }
      }
      dateMap[h.work_date].loads += loads
      dateMap[h.work_date].cost += cost
    })

    // Convert dateMap to sorted array
    Object.values(dateMap)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .forEach(d => byDate.push(d))

    const daysWithHaulOff = byDate.length

    return {
      totalCost,
      totalLoads,
      byWasteType,
      byDate,
      daysWithHaulOff,
      avgDailyHaulOffCost: daysWithHaulOff > 0 ? totalCost / daysWithHaulOff : 0
    }
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

  // Subscribe to haul-off changes for a project
  subscribeToHaulOffTracking(projectId, callback) {
    if (isSupabaseConfigured) {
      return supabase
        .channel(`haul_offs:${projectId}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'haul_offs', filter: `project_id=eq.${projectId}` },
          callback
        )
        .subscribe()
    }
    return null
  },

  // Subscribe to dump site changes for a company
  subscribeToDumpSites(companyId, callback) {
    if (isSupabaseConfigured) {
      return supabase
        .channel(`dump_sites:${companyId}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'dump_sites', filter: `company_id=eq.${companyId}` },
          callback
        )
        .subscribe()
    }
    return null
  }
}
