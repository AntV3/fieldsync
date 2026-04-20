import {
  supabase,
  isSupabaseConfigured,
  observe,
  getConnectionStatus,
  getCachedProjects,
  cacheProjects,
  getCachedAreas,
  cacheAreas,
  updateCachedAreaStatus,
  getLocalData,
  setLocalData,
  escapePostgrestFilter,
  sanitizeFormData,
  getDeviceId,
  getClient,
  getFieldClient,
  setFieldSession,
  addPendingAction,
  ACTION_TYPES
} from './client'

export const projectOps = {
  // Projects
  async getProjects(companyId = null, includeArchived = false) {
    if (isSupabaseConfigured) {
      // If offline, return cached data
      if (!getConnectionStatus()) {
        const cached = await getCachedProjects(companyId)
        if (includeArchived) return cached
        return cached.filter(p => p.status !== 'archived')
      }

      const start = performance.now()
      try {
        let query = supabase
          .from('projects')
          .select('*')
          .order('created_at', { ascending: false })

        if (companyId) {
          query = query.eq('company_id', companyId)
        }

        if (!includeArchived) {
          query = query.eq('status', 'active')
        }

        const { data, error } = await query
        const duration = Math.round(performance.now() - start)
        observe.query('getProjects', { duration, rows: data?.length, company_id: companyId })

        if (error) {
          observe.error('database', { message: error.message, operation: 'getProjects', company_id: companyId })
          // On error, try cache
          const cached = await getCachedProjects(companyId)
          if (cached.length > 0) return cached
          throw error
        }

        // Cache projects for offline use
        if (data?.length > 0) {
          cacheProjects(data).catch(err => console.error('Failed to cache projects:', err))
        }

        return data
      } catch (error) {
        observe.error('database', { message: error.message, operation: 'getProjects', company_id: companyId })
        throw error
      }
    } else {
      const projects = getLocalData().projects
      if (includeArchived) return projects
      return projects.filter(p => p.status !== 'archived')
    }
  },

  // Get projects with pagination for scalability (use for large project lists)
  async getProjectsPaginated(companyId, { page = 0, limit = 25, status = 'active' } = {}) {
    if (isSupabaseConfigured) {
      const start = performance.now()
      try {
        let query = supabase
          .from('projects')
          .select('*', { count: 'exact' })
          .eq('company_id', companyId)
          .order('created_at', { ascending: false })
          .range(page * limit, (page + 1) * limit - 1)

        if (status !== 'all') {
          query = query.eq('status', status)
        }

        const { data, error, count } = await query
        const duration = Math.round(performance.now() - start)
        observe.query('getProjectsPaginated', { duration, rows: data?.length, page, company_id: companyId })

        if (error) throw error

        return {
          projects: data || [],
          totalCount: count || 0,
          hasMore: (page + 1) * limit < (count || 0),
          page,
          limit
        }
      } catch (error) {
        observe.error('database', { message: error.message, operation: 'getProjectsPaginated', company_id: companyId })
        throw error
      }
    }
    // Demo mode fallback
    const projects = getLocalData().projects.filter(p =>
      p.company_id === companyId && (status === 'all' || p.status === status)
    )
    const start = page * limit
    return {
      projects: projects.slice(start, start + limit),
      totalCount: projects.length,
      hasMore: start + limit < projects.length,
      page,
      limit
    }
  },

  // Get projects with lightweight summary counts (optimized for dashboard)
  // This reduces the number of queries from 9 per project to a single batch query
  async getProjectsWithSummary(companyId) {
    if (isSupabaseConfigured) {
      const start = performance.now()
      try {
        // Fetch projects with embedded counts using Supabase's aggregate functions
        const { data, error } = await supabase
          .from('projects')
          .select(`
            *,
            areas:areas(count),
            tickets:t_and_m_tickets(count),
            daily_reports:daily_reports(count)
          `)
          .eq('company_id', companyId)
          .eq('status', 'active')
          .order('created_at', { ascending: false })

        const duration = Math.round(performance.now() - start)
        observe.query('getProjectsWithSummary', { duration, rows: data?.length, company_id: companyId })

        if (error) throw error

        // Transform the response to extract counts
        return (data || []).map(project => ({
          ...project,
          areaCount: project.areas?.[0]?.count || 0,
          ticketCount: project.tickets?.[0]?.count || 0,
          pendingTicketCount: 0, // Loaded on-demand when project is selected
          reportCount: project.daily_reports?.[0]?.count || 0,
          // Remove the raw relation data
          areas: undefined,
          tickets: undefined,
          daily_reports: undefined
        }))
      } catch (error) {
        observe.error('database', { message: error.message, operation: 'getProjectsWithSummary', company_id: companyId })
        // Fall back to regular getProjects on error
        return this.getProjects(companyId)
      }
    }
    return getLocalData().projects.filter(p => p.company_id === companyId && p.status === 'active')
  },

  // Get comprehensive project dashboard summary using server-side aggregation
  // This is the most optimized query - single RPC call returns all project metrics
  async getProjectDashboardSummary(companyId) {
    if (isSupabaseConfigured) {
      const start = performance.now()
      try {
        const { data, error } = await supabase
          .rpc('get_project_dashboard_summary', { p_company_id: companyId })

        const duration = Math.round(performance.now() - start)
        observe.query('getProjectDashboardSummary', { duration, rows: data?.length, company_id: companyId })

        if (error) {
          // Fall back to getProjectsWithSummary if RPC doesn't exist yet
          if (error.message?.includes('function') || error.code === '42883') {
            return this.getProjectsWithSummary(companyId)
          }
          throw error
        }

        // Transform the snake_case response to camelCase for consistency
        return (data || []).map(p => ({
          id: p.project_id,
          name: p.project_name,
          status: p.project_status,
          job_number: p.project_number,
          address: p.project_address,
          pin: p.project_pin,
          created_at: p.created_at,
          start_date: p.start_date,
          end_date: p.end_date,
          // Financial fields
          contract_value: Number(p.contract_value) || 0,
          work_type: p.work_type || 'demolition',
          job_type: p.job_type || 'standard',
          general_contractor: p.general_contractor || '',
          // Metrics
          areaCount: Number(p.total_areas) || 0,
          completedAreas: Number(p.completed_areas) || 0,
          inProgressAreas: Number(p.in_progress_areas) || 0,
          pendingAreas: Number(p.pending_areas) || 0,
          ticketCount: Number(p.total_tickets) || 0,
          pendingTicketCount: Number(p.pending_tickets) || 0,
          submittedTicketCount: Number(p.submitted_tickets) || 0,
          approvedTicketCount: Number(p.approved_tickets) || 0,
          totalLaborHours: Number(p.total_labor_hours) || 0,
          todayLaborHours: Number(p.today_labor_hours) || 0,
          todayWorkerCount: Number(p.today_worker_count) || 0,
          lastActivityAt: p.last_activity_at,
          dailyReportsThisWeek: Number(p.daily_reports_this_week) || 0,
          corCount: Number(p.cor_count) || 0,
          pendingCorCount: Number(p.pending_cor_count) || 0
        }))
      } catch (error) {
        observe.error('database', { message: error.message, operation: 'getProjectDashboardSummary', company_id: companyId })
        // Fall back to getProjectsWithSummary on error
        return this.getProjectsWithSummary(companyId)
      }
    }
    // Demo mode - basic project list
    return getLocalData().projects.filter(p => p.company_id === companyId && p.status === 'active')
  },

  async getArchivedProjects(companyId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('company_id', companyId)
        .eq('status', 'archived')
        .order('archived_at', { ascending: false })
      if (error) throw error
      return data
    } else {
      return getLocalData().projects.filter(p => p.status === 'archived')
    }
  },

  async getProjectCount(companyId) {
    if (isSupabaseConfigured) {
      const { count, error } = await supabase
        .from('projects')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .in('status', ['active', 'archived'])
      if (error) throw error
      return count || 0
    } else {
      const projects = getLocalData().projects
      return projects.filter(p => p.company_id === companyId && p.status !== 'deleted').length
    }
  },

  // Universal Search - searches across projects, T&M tickets, CORs, and workers
  async universalSearch(companyId, query, limit = 10) {
    if (!isSupabaseConfigured || !query?.trim()) {
      return { projects: [], tickets: [], cors: [], workers: [] }
    }

    const searchQuery = escapePostgrestFilter(query.trim().toLowerCase())
    // Keep raw query for client-side matching (escapePostgrestFilter strips chars needed for .includes())
    const rawQuery = query.trim().toLowerCase()
    const results = { projects: [], tickets: [], cors: [], workers: [] }

    try {
      // Run all four searches in parallel for performance
      const [projectsResult, ticketsResult, corsResult, checkinsResult] = await Promise.all([
        // Search projects
        supabase
          .from('projects')
          .select('id, name, job_number, address, status')
          .eq('company_id', companyId)
          .eq('status', 'active')
          .or(`name.ilike.%${searchQuery}%,job_number.ilike.%${searchQuery}%,address.ilike.%${searchQuery}%`)
          .limit(limit),

        // Search T&M tickets
        supabase
          .from('t_and_m_tickets')
          .select(`
            id, notes, work_date, status, project_id,
            projects!inner(id, name, company_id)
          `)
          .eq('projects.company_id', companyId)
          .ilike('notes', `%${searchQuery}%`)
          .order('work_date', { ascending: false })
          .limit(limit),

        // Search Change Orders
        supabase
          .from('change_orders')
          .select(`
            id, cor_number, title, status, project_id,
            projects!inner(id, name, company_id)
          `)
          .eq('projects.company_id', companyId)
          .or(`title.ilike.%${searchQuery}%,cor_number.ilike.%${searchQuery}%`)
          .order('created_at', { ascending: false })
          .limit(limit),

        // Search workers from recent crew check-ins
        supabase
          .from('crew_checkins')
          .select(`
            workers,
            project_id,
            projects!inner(id, name, company_id)
          `)
          .eq('projects.company_id', companyId)
          .order('check_in_date', { ascending: false })
          .limit(50)
      ])

      results.projects = projectsResult.data || []

      results.tickets = (ticketsResult.data || []).map(t => ({
        ...t,
        projectName: t.projects?.name || 'Unknown Project'
      }))

      results.cors = (corsResult.data || []).map(c => ({
        ...c,
        projectName: c.projects?.name || 'Unknown Project'
      }))

      // Extract unique workers matching query (use rawQuery for client-side matching)
      const workerMap = new Map()
      ;(checkinsResult.data || []).forEach(checkin => {
        (checkin.workers || []).forEach(worker => {
          if (worker?.name && worker.name.toLowerCase().includes(rawQuery)) {
            const key = worker.name.toLowerCase()
            if (!workerMap.has(key)) {
              workerMap.set(key, {
                name: worker.name,
                role: worker.role,
                projectName: checkin.projects?.name,
                lastProject: checkin.projects
              })
            }
          }
        })
      })

      results.workers = Array.from(workerMap.values()).slice(0, limit)

      return results
    } catch (error) {
      console.error('Universal search error:', error)
      return results
    }
  },

  async archiveProject(id) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('projects')
        .update({
          status: 'archived',
          archived_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    } else {
      const localData = getLocalData()
      const project = localData.projects.find(p => p.id === id)
      if (project) {
        project.status = 'archived'
        project.archived_at = new Date().toISOString()
        setLocalData(localData)
      }
      return project
    }
  },

  // Get estimated storage usage for a project (photos only - they're 95% of storage)
  async getProjectStorageStats(projectId) {
    if (!isSupabaseConfigured) return { photoCount: 0, estimatedMB: 0 }

    // Get all T&M tickets with photos
    const { data: tickets, error } = await supabase
      .from('t_and_m_tickets')
      .select('photos')
      .eq('project_id', projectId)

    if (error) throw error

    // Count photos across all tickets
    let photoCount = 0
    const photoUrls = []
    tickets?.forEach(ticket => {
      if (ticket.photos && Array.isArray(ticket.photos)) {
        photoCount += ticket.photos.length
        photoUrls.push(...ticket.photos)
      }
    })

    // Estimate: average photo is 1-2MB after compression
    const estimatedMB = photoCount * 1.5

    return { photoCount, estimatedMB, photoUrls }
  },

  // Deep archive: archive project AND delete photos to reclaim storage
  // Call this after user has exported their important documents
  async archiveProjectDeep(projectId, _companyId) {
    if (!isSupabaseConfigured) return null

    // 1. Get all photo URLs for this project
    const { photoUrls } = await this.getProjectStorageStats(projectId)

    // 2. Delete all photos from storage
    if (photoUrls.length > 0) {
      const filePaths = photoUrls
        .map(urlOrPath => {
          if (!urlOrPath) return null
          if (urlOrPath.startsWith('http')) {
            try {
              const urlObj = new URL(urlOrPath)
              const match = urlObj.pathname.match(/\/tm-photos\/(.+)$/)
              return match ? match[1] : null
            } catch { return null }
          }
          return urlOrPath // already a storage path
        })
        .filter(Boolean)

      if (filePaths.length > 0) {
        // Delete in batches of 100
        for (let i = 0; i < filePaths.length; i += 100) {
          const batch = filePaths.slice(i, i + 100)
          await supabase.storage.from('tm-photos').remove(batch)
        }
      }
    }

    // 3. Clear photo arrays in tickets (keep ticket data for records)
    await supabase
      .from('t_and_m_tickets')
      .update({ photos: [] })
      .eq('project_id', projectId)

    // 4. Archive the project with cleanup flag
    const { data, error } = await supabase
      .from('projects')
      .update({
        status: 'archived',
        archived_at: new Date().toISOString(),
        photos: [], // Clear project photos too
        storage_cleaned: true // Flag that photos were removed
      })
      .eq('id', projectId)
      .select()
      .single()

    if (error) throw error
    return { ...data, photosDeleted: photoUrls.length }
  },

  async restoreProject(id) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('projects')
        .update({
          status: 'active',
          archived_at: null
        })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    } else {
      const localData = getLocalData()
      const project = localData.projects.find(p => p.id === id)
      if (project) {
        project.status = 'active'
        project.archived_at = null
        setLocalData(localData)
      }
      return project
    }
  },

  async getProject(id) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', id)
        .single()
      if (error) throw error
      return data
    } else {
      return getLocalData().projects.find(p => p.id === id)
    }
  },

  async createProject(project) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('projects')
        .insert({
          ...sanitizeFormData(project),
          status: 'active'
        })
        .select()
        .single()
      if (error) {
        console.error('Supabase createProject error:', error.message, error.details, error.hint)
        throw error
      }
      return data
    } else {
      const localData = getLocalData()
      const newProject = {
        ...project,
        id: crypto.randomUUID(),
        status: 'active',
        created_at: new Date().toISOString()
      }
      localData.projects.push(newProject)
      setLocalData(localData)
      return newProject
    }
  },

  // Get project by PIN (for foreman access) - only active projects
  // Note: For production, use getProjectByPinSecure which includes rate limiting
  async getProjectByPin(pin) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('pin', pin)
        .eq('status', 'active')
        .single()
      if (error) return null
      return data
    } else {
      const localData = getLocalData()
      return localData.projects.find(p => p.pin === pin && p.status === 'active') || null
    }
  },

  // Get project by PIN within a specific company (secure foreman access)
  async getProjectByPinAndCompany(pin, companyId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('pin', pin)
        .eq('company_id', companyId)
        .eq('status', 'active')
        .single()
      if (error) return null
      return data
    } else {
      const localData = getLocalData()
      return localData.projects.find(p =>
        p.pin === pin &&
        p.company_id === companyId &&
        p.status === 'active'
      ) || null
    }
  },

  // Secure PIN lookup with rate limiting and session creation
  // Returns a session token that must be used for all subsequent requests
  async getProjectByPinSecure(pin, companyCode) {
    if (isSupabaseConfigured) {
      // CLIENT-SIDE RATE LIMITING (defense-in-depth)
      const rateLimitKey = `pin_attempts_${companyCode}`
      const lockoutKey = `pin_lockout_${companyCode}`
      const MAX_ATTEMPTS = 8
      const LOCKOUT_MS = 3 * 60 * 1000 // 3 minutes (short enough to not frustrate foremen)

      // Check if currently locked out
      const lockoutUntil = localStorage.getItem(lockoutKey)
      if (lockoutUntil && Date.now() < parseInt(lockoutUntil)) {
        const remainingMs = parseInt(lockoutUntil) - Date.now()
        const remainingMins = Math.ceil(remainingMs / 60000)
        return {
          success: false,
          rateLimited: true,
          project: null,
          error: `Too many attempts. Please try again in ${remainingMins} minute${remainingMins > 1 ? 's' : ''}.`
        }
      }

      const deviceId = getDeviceId()

      // Try session-based validation first (requires DB migration)
      const { data, error } = await supabase
        .rpc('validate_pin_and_create_session', {
          p_pin: pin,
          p_company_code: companyCode,
          p_device_id: deviceId,
          p_ip_address: null // IP is not available client-side
        })

      if (error) {
        // SECURITY: Do NOT fall back to direct PIN query. The fallback bypasses
        // server-side rate limiting and sends the raw PIN as an unvalidated filter.
        // If the RPC is unavailable, the DB migration must be applied first.
        console.error('[PIN Auth] validate_pin_and_create_session RPC failed:', error.message)
        return {
          success: false,
          rateLimited: false,
          project: null,
          error: 'Field login is temporarily unavailable. Please contact your office administrator.'
        }
      }

      if (!data || data.length === 0) {
        return { success: false, rateLimited: false, project: null }
      }

      const result = data[0]

      // Check error codes
      if (result.error_code === 'RATE_LIMITED') {
        return { success: false, rateLimited: true, project: null }
      }

      if (result.error_code === 'INVALID_COMPANY' || result.error_code === 'INVALID_PIN') {
        // Confirmed bad PIN — only NOW count as a failed attempt
        let attempts = parseInt(localStorage.getItem(rateLimitKey) || '0')
        attempts++
        localStorage.setItem(rateLimitKey, attempts.toString())
        if (attempts >= MAX_ATTEMPTS) {
          localStorage.setItem(lockoutKey, (Date.now() + LOCKOUT_MS).toString())
          return {
            success: false,
            rateLimited: true,
            project: null,
            error: 'Too many failed attempts. Please try again in a few minutes.'
          }
        }
        return { success: false, rateLimited: false, project: null }
      }

      // Check if successful
      if (!result.success || !result.project_id) {
        return { success: false, rateLimited: false, project: null }
      }

      // SUCCESS: Clear rate limit counters
      localStorage.removeItem(`pin_attempts_${companyCode}`)
      localStorage.removeItem(`pin_lockout_${companyCode}`)

      // Store the session for subsequent requests
      setFieldSession({
        token: result.session_token,
        projectId: result.project_id,
        companyId: result.company_id,
        projectName: result.project_name,
        companyName: result.company_name,
        createdAt: new Date().toISOString()
      })

      // Fetch full project details using the new session
      const client = getFieldClient()
      const { data: projectData } = await client
        .from('projects')
        .select('*')
        .eq('id', result.project_id)
        .single()

      return {
        success: true,
        rateLimited: false,
        sessionToken: result.session_token,
        project: projectData || {
          id: result.project_id,
          name: result.project_name,
          company_id: result.company_id,
          status: 'active'
        }
      }
    } else {
      // Demo mode - create mock session
      const localData = getLocalData()
      const companies = localData.companies || []
      const company = companies.find(c => c.code === companyCode)

      if (!company) {
        return { success: false, rateLimited: false, project: null }
      }

      const project = localData.projects.find(
        p => p.pin === pin && p.company_id === company.id && p.status === 'active'
      )

      if (project) {
        // Create mock session for demo mode
        const mockToken = `demo_${Date.now()}_${Math.random().toString(36).slice(2)}`
        setFieldSession({
          token: mockToken,
          projectId: project.id,
          companyId: company.id,
          projectName: project.name,
          companyName: company.name,
          createdAt: new Date().toISOString()
        })
      }

      return {
        success: !!project,
        rateLimited: false,
        project: project || null
      }
    }
  },

  // _pinFallbackDirectQuery removed — SECURITY: Direct PIN queries bypass
  // server-side rate limiting and expose the PIN via unvalidated Supabase filters.
  // The validate_pin_and_create_session RPC must be deployed before field login works.

  // Check if PIN is already in use
  async isPinAvailable(pin, companyId, excludeProjectId = null) {
    if (isSupabaseConfigured) {
      let query = supabase
        .from('projects')
        .select('id')
        .eq('pin', pin)
        .eq('company_id', companyId)

      if (excludeProjectId) {
        query = query.neq('id', excludeProjectId)
      }

      const { data, error } = await query
      if (error) throw error
      return data.length === 0
    } else {
      const localData = getLocalData()
      return !localData.projects.some(p => p.pin === pin && p.company_id === companyId && p.id !== excludeProjectId)
    }
  },

  // Update project PIN
  async updateProjectPin(projectId, pin) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('projects')
        .update({ pin })
        .eq('id', projectId)
        .select()
        .single()
      if (error) throw error
      return data
    } else {
      const localData = getLocalData()
      const project = localData.projects.find(p => p.id === projectId)
      if (project) {
        project.pin = pin
        setLocalData(localData)
      }
      return project
    }
  },

  // Update project - requires companyId for cross-tenant security
  async updateProject(id, updates, companyId = null) {
    if (isSupabaseConfigured) {
      // SECURITY: Require companyId to prevent cross-tenant data access
      if (!companyId) {
        console.error('[Security] updateProject called without companyId - this is a security risk')
        throw new Error('Company ID is required for security verification')
      }

      const { data, error } = await supabase
        .from('projects')
        .update(sanitizeFormData(updates))
        .eq('id', id)
        .eq('company_id', companyId)  // Always enforce cross-tenant security
        .select()
        .single()

      if (error) {
        console.error('Error updating project')
        throw error
      }
      return data
    } else {
      const localData = getLocalData()
      const project = localData.projects.find(p => p.id === id)
      if (project) {
        Object.assign(project, updates)
        setLocalData(localData)
      }
      return project
    }
  },

  // Delete project - requires companyId for cross-tenant security
  async deleteProject(id, companyId = null) {
    if (isSupabaseConfigured) {
      // Explicitly delete child records that may not have CASCADE DELETE set up
      // in the database yet. This ensures a clean delete even on older schemas.

      // 1. Collect photo storage paths from tickets before deleting them
      const photoPathsToDelete = []
      try {
        const { data: tickets } = await supabase
          .from('t_and_m_tickets')
          .select('photos')
          .eq('project_id', id)
        tickets?.forEach(ticket => {
          if (Array.isArray(ticket.photos)) {
            ticket.photos.forEach(urlOrPath => {
              if (!urlOrPath) return
              if (urlOrPath.startsWith('http')) {
                try {
                  const match = new URL(urlOrPath).pathname.match(/\/(?:public\/)?tm-photos\/(.+)$/)
                  if (match) photoPathsToDelete.push(decodeURIComponent(match[1]))
                } catch { /* skip malformed URL */ }
              } else {
                photoPathsToDelete.push(urlOrPath)
              }
            })
          }
        })
      } catch { /* non-fatal — proceed with deletion */ }

      // 2. Delete storage files in batches
      if (photoPathsToDelete.length > 0) {
        try {
          for (let i = 0; i < photoPathsToDelete.length; i += 100) {
            await supabase.storage.from('tm-photos').remove(photoPathsToDelete.slice(i, i + 100))
          }
        } catch { /* non-fatal — DB rows still get deleted */ }
      }

      // 3. Delete T&M tickets (and their workers/items via DB cascade)
      await supabase.from('t_and_m_tickets').delete().eq('project_id', id)

      // 4. Delete daily reports
      await supabase.from('daily_reports').delete().eq('project_id', id)

      // 5. Delete the project row itself
      let query = supabase
        .from('projects')
        .delete({ count: 'exact' })
        .eq('id', id)

      // Add company_id check if provided (prevents cross-tenant access)
      if (companyId) {
        query = query.eq('company_id', companyId)
      }

      const { error, count } = await query
      if (error) throw error
      if (count === 0) throw new Error('Project could not be deleted. You may not have permission (admin or owner role required).')
    } else {
      const localData = getLocalData()
      localData.projects = localData.projects.filter(p => p.id !== id)
      localData.areas = localData.areas.filter(a => a.project_id !== id)
      setLocalData(localData)
    }
  },

  // Areas
  async getAreas(projectId) {
    if (isSupabaseConfigured) {
      // If offline, return cached data
      if (!getConnectionStatus()) {
        return getCachedAreas(projectId)
      }

      const client = getClient()
      const { data, error } = await client
        .from('areas')
        .select('*')
        .eq('project_id', projectId)
        .order('sort_order', { ascending: true })

      if (error) {
        // On error, try cache
        const cached = await getCachedAreas(projectId)
        if (cached.length > 0) return cached
        throw error
      }

      // Cache areas for offline use
      if (data?.length > 0) {
        cacheAreas(data).catch(err => console.error('Failed to cache areas:', err))
      }

      return data
    } else {
      return getLocalData().areas.filter(a => a.project_id === projectId)
    }
  },

  async createArea(area) {
    if (isSupabaseConfigured) {
      const client = getClient()
      const { data, error } = await client
        .from('areas')
        .insert(sanitizeFormData(area))
        .select()
        .single()
      if (error) throw error
      return data
    } else {
      const localData = getLocalData()
      const newArea = {
        ...area,
        id: crypto.randomUUID(),
        created_at: new Date().toISOString()
      }
      localData.areas.push(newArea)
      setLocalData(localData)
      return newArea
    }
  },

  // Update area status - projectId optional for cross-tenant security
  async updateAreaStatus(id, status, projectId = null) {
    if (isSupabaseConfigured) {
      // If offline, update cache and queue action
      if (!getConnectionStatus()) {
        const area = await updateCachedAreaStatus(id, status)
        await addPendingAction(ACTION_TYPES.UPDATE_AREA_STATUS, { areaId: id, status })
        return area
      }

      const client = getClient()
      const now = new Date().toISOString()
      let query = client
        .from('areas')
        .update({ status, updated_at: now })
        .eq('id', id)

      // Add project_id check if provided (prevents cross-tenant access)
      if (projectId) {
        query = query.eq('project_id', projectId)
      }

      const { data, error } = await query.select().single()

      if (error) {
        // If network error, queue for later
        if (error.message?.includes('fetch') || error.message?.includes('network')) {
          const area = await updateCachedAreaStatus(id, status)
          await addPendingAction(ACTION_TYPES.UPDATE_AREA_STATUS, { areaId: id, status })
          return area
        }
        throw error
      }

      // Update cache with server response (awaited to prevent stale reads)
      if (data) {
        await updateCachedAreaStatus(id, status).catch(err => console.error('Failed to update cached area status:', err))
      }

      return data
    } else {
      const localData = getLocalData()
      const area = localData.areas.find(a => a.id === id)
      if (area) {
        area.status = status
        area.updated_at = new Date().toISOString()
      }
      setLocalData(localData)
      return area
    }
  },

  // Update area (name, weight, sort_order) - projectId optional for security
  async updateArea(id, updates, projectId = null) {
    if (isSupabaseConfigured) {
      let query = supabase
        .from('areas')
        .update(updates)
        .eq('id', id)

      // Add project_id check if provided (prevents cross-tenant access)
      if (projectId) {
        query = query.eq('project_id', projectId)
      }

      const { data, error } = await query.select().single()
      if (error) throw error
      return data
    } else {
      const localData = getLocalData()
      const area = localData.areas.find(a => a.id === id)
      if (area) {
        Object.assign(area, updates)
        area.updated_at = new Date().toISOString()
      }
      setLocalData(localData)
      return area
    }
  },

  // Reassign an area (task) to a different phase by updating its group_name.
  // Tasks link to phases by string match on project_phases.name, so this is
  // the only column that needs to change. Pass null/empty to unphase an area.
  async updateAreaPhase(id, groupName, projectId = null) {
    const nextName = groupName || null
    if (isSupabaseConfigured) {
      let query = supabase
        .from('areas')
        .update({ group_name: nextName, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (projectId) query = query.eq('project_id', projectId)
      const { data, error } = await query.select().single()
      if (error) throw error
      return data
    } else {
      const localData = getLocalData()
      const area = localData.areas.find(a => a.id === id)
      if (area) {
        area.group_name = nextName
        area.updated_at = new Date().toISOString()
      }
      setLocalData(localData)
      return area
    }
  },

  // Delete area - projectId optional for cross-tenant security
  async deleteArea(id, projectId = null) {
    if (isSupabaseConfigured) {
      let query = supabase
        .from('areas')
        .delete()
        .eq('id', id)

      // Add project_id check if provided (prevents cross-tenant access)
      if (projectId) {
        query = query.eq('project_id', projectId)
      }

      const { error } = await query
      if (error) throw error
    } else {
      const localData = getLocalData()
      localData.areas = localData.areas.filter(a => a.id !== id)
      setLocalData(localData)
    }
  },

  // ============================================
  // Project Phases
  // ============================================
  // Phases join to areas by string name via (project_id, areas.group_name).
  // Foreman reads flow through the field-session client; office writes use
  // the authenticated client and go through RLS on project_phases.

  async getPhases(projectId) {
    if (isSupabaseConfigured) {
      const client = getClient()
      const { data, error } = await client
        .from('project_phases')
        .select('*')
        .eq('project_id', projectId)
        .order('sort_order', { ascending: true })

      if (error) {
        // Graceful fallback: caller will derive from areas.group_name
        console.warn('getPhases failed, falling back to derived groups:', error.message)
        return []
      }
      return data || []
    } else {
      const localData = getLocalData()
      return (localData.phases || []).filter(p => p.project_id === projectId)
    }
  },

  async createPhase(phase) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('project_phases')
        .insert(sanitizeFormData(phase))
        .select()
        .single()
      if (error) throw error
      return data
    } else {
      const localData = getLocalData()
      if (!localData.phases) localData.phases = []
      const newPhase = {
        ...phase,
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
      localData.phases.push(newPhase)
      setLocalData(localData)
      return newPhase
    }
  },

  // Update phase. When renaming, also update areas.group_name so the
  // string join key stays consistent (areas have no phase_id FK).
  async updatePhase(id, updates, projectId = null) {
    if (isSupabaseConfigured) {
      // Look up the current row first when renaming so we can propagate.
      let previousName = null
      if (updates.name) {
        const { data: current } = await supabase
          .from('project_phases')
          .select('name, project_id')
          .eq('id', id)
          .maybeSingle()
        if (current) {
          previousName = current.name
          if (!projectId) projectId = current.project_id
        }
      }

      let query = supabase
        .from('project_phases')
        .update(updates)
        .eq('id', id)
      if (projectId) query = query.eq('project_id', projectId)

      const { data, error } = await query.select().single()
      if (error) throw error

      if (updates.name && previousName && previousName !== updates.name && projectId) {
        const { error: areaErr } = await supabase
          .from('areas')
          .update({ group_name: updates.name })
          .eq('project_id', projectId)
          .eq('group_name', previousName)
        if (areaErr) console.error('Phase rename: failed to update areas.group_name:', areaErr)
      }

      return data
    } else {
      const localData = getLocalData()
      const phase = (localData.phases || []).find(p => p.id === id)
      if (phase) {
        const previousName = phase.name
        Object.assign(phase, updates)
        phase.updated_at = new Date().toISOString()
        if (updates.name && previousName !== updates.name) {
          localData.areas
            .filter(a => a.project_id === phase.project_id && a.group_name === previousName)
            .forEach(a => { a.group_name = updates.name })
        }
      }
      setLocalData(localData)
      return phase
    }
  },

  async deletePhase(id, projectId = null) {
    if (isSupabaseConfigured) {
      let query = supabase
        .from('project_phases')
        .delete()
        .eq('id', id)
      if (projectId) query = query.eq('project_id', projectId)
      const { error } = await query
      if (error) throw error
    } else {
      const localData = getLocalData()
      localData.phases = (localData.phases || []).filter(p => p.id !== id)
      setLocalData(localData)
    }
  },

  // Persist a new ordering. orderedIds is the phase ids in desired order.
  async reorderPhases(projectId, orderedIds) {
    if (isSupabaseConfigured) {
      const updates = orderedIds.map((id, index) =>
        supabase
          .from('project_phases')
          .update({ sort_order: index })
          .eq('id', id)
          .eq('project_id', projectId)
      )
      const results = await Promise.all(updates)
      const firstError = results.find(r => r.error)
      if (firstError?.error) throw firstError.error
    } else {
      const localData = getLocalData()
      orderedIds.forEach((id, index) => {
        const phase = (localData.phases || []).find(p => p.id === id)
        if (phase) phase.sort_order = index
      })
      setLocalData(localData)
    }
  },

  // Real-time subscriptions (Supabase only)
  subscribeToAreas(projectId, callback) {
    if (isSupabaseConfigured) {
      return supabase
        .channel(`areas:${projectId}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'areas', filter: `project_id=eq.${projectId}` },
          callback
        )
        .subscribe()
    }
    return null
  },

  subscribeToPhases(projectId, callback) {
    if (isSupabaseConfigured) {
      return supabase
        .channel(`project_phases:${projectId}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'project_phases', filter: `project_id=eq.${projectId}` },
          callback
        )
        .subscribe()
    }
    return null
  },

  // Subscribe to messages for a project (for live chat)
  subscribeToMessages(projectId, callback) {
    if (isSupabaseConfigured) {
      return supabase
        .channel(`messages:${projectId}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'messages', filter: `project_id=eq.${projectId}` },
          callback
        )
        .subscribe()
    }
    return null
  },

  // Subscribe to daily reports for a project
  subscribeToDailyReports(projectId, callback) {
    if (isSupabaseConfigured) {
      return supabase
        .channel(`daily_reports:${projectId}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'daily_reports', filter: `project_id=eq.${projectId}` },
          callback
        )
        .subscribe()
    }
    return null
  },

  // Subscribe to crew check-ins for a project
  subscribeToCrewCheckins(projectId, callback) {
    if (isSupabaseConfigured) {
      return supabase
        .channel(`crew_checkins:${projectId}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'crew_checkins', filter: `project_id=eq.${projectId}` },
          callback
        )
        .subscribe()
    }
    return null
  },

  // Subscribe to injury reports for a company (office-wide)
  subscribeToInjuryReports(companyId, callback) {
    if (isSupabaseConfigured) {
      return supabase
        .channel(`injury_reports:${companyId}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'injury_reports', filter: `company_id=eq.${companyId}` },
          callback
        )
        .subscribe()
    }
    return null
  },

  // Subscribe to T&M tickets for a project
  subscribeToTMTickets(projectId, callback) {
    if (isSupabaseConfigured) {
      return supabase
        .channel(`tm_tickets:${projectId}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 't_and_m_tickets', filter: `project_id=eq.${projectId}` },
          callback
        )
        .subscribe()
    }
    return null
  },

  // Subscribe to all company activity (for office notifications)
  subscribeToCompanyActivity(companyId, projectIds, callbacks) {
    if (!isSupabaseConfigured || !projectIds || projectIds.length === 0) return null

    const channel = supabase.channel(`company_activity:${companyId}`)

    // Subscribe to project-level changes
    // Use wildcard event '*' for all entities to capture INSERT, UPDATE, and DELETE
    projectIds.forEach(projectId => {
      // Messages
      channel.on('postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `project_id=eq.${projectId}` },
        (payload) => callbacks.onMessage?.(payload)
      )

      // T&M Tickets
      channel.on('postgres_changes',
        { event: '*', schema: 'public', table: 't_and_m_tickets', filter: `project_id=eq.${projectId}` },
        (payload) => callbacks.onTMTicket?.(payload)
      )

      // Crew check-ins - critical for labor tracking
      channel.on('postgres_changes',
        { event: '*', schema: 'public', table: 'crew_checkins', filter: `project_id=eq.${projectId}` },
        (payload) => callbacks.onCrewCheckin?.(payload)
      )

      // Area progress updates (INSERT, UPDATE, and DELETE)
      channel.on('postgres_changes',
        { event: '*', schema: 'public', table: 'areas', filter: `project_id=eq.${projectId}` },
        (payload) => callbacks.onAreaUpdate?.(payload)
      )

      // Phase changes (office adds/edits/reorders phases)
      channel.on('postgres_changes',
        { event: '*', schema: 'public', table: 'project_phases', filter: `project_id=eq.${projectId}` },
        (payload) => callbacks.onPhaseChange?.(payload)
      )

      // Change orders (CORs)
      channel.on('postgres_changes',
        { event: '*', schema: 'public', table: 'change_orders', filter: `project_id=eq.${projectId}` },
        (payload) => callbacks.onCORChange?.(payload)
      )

      // Project-level changes (name, dates, budget updates from office)
      channel.on('postgres_changes',
        { event: '*', schema: 'public', table: 'projects', filter: `id=eq.${projectId}` },
        (payload) => callbacks.onProjectChange?.(payload)
      )

      // Punch list items (field creates/resolves items)
      channel.on('postgres_changes',
        { event: '*', schema: 'public', table: 'punch_list_items', filter: `project_id=eq.${projectId}` },
        (payload) => callbacks.onPunchListChange?.(payload)
      )

      // Invoices (office creates/updates, both sides see changes)
      channel.on('postgres_changes',
        { event: '*', schema: 'public', table: 'invoices', filter: `project_id=eq.${projectId}` },
        (payload) => callbacks.onInvoiceChange?.(payload)
      )

      // Draw requests / progress billing (office creates, both sides see)
      channel.on('postgres_changes',
        { event: '*', schema: 'public', table: 'draw_requests', filter: `project_id=eq.${projectId}` },
        (payload) => callbacks.onDrawRequestChange?.(payload)
      )

      // Project equipment (field/office adds equipment, both sides see)
      channel.on('postgres_changes',
        { event: '*', schema: 'public', table: 'project_equipment', filter: `project_id=eq.${projectId}` },
        (payload) => callbacks.onProjectEquipmentChange?.(payload)
      )

      // Project costs (custom cost entries)
      channel.on('postgres_changes',
        { event: '*', schema: 'public', table: 'project_costs', filter: `project_id=eq.${projectId}` },
        (payload) => callbacks.onProjectCostChange?.(payload)
      )

      // Daily reports
      channel.on('postgres_changes',
        { event: '*', schema: 'public', table: 'daily_reports', filter: `project_id=eq.${projectId}` },
        (payload) => callbacks.onDailyReportChange?.(payload)
      )
    })

    // Subscribe to COR-ticket associations (junction table) - triggers COR refresh when
    // tickets are linked/unlinked from change orders so totals update in real-time
    channel.on('postgres_changes',
      { event: '*', schema: 'public', table: 'change_order_ticket_associations' },
      (payload) => callbacks.onCORChange?.(payload)
    )

    // Subscribe to injury reports company-wide (INSERT, UPDATE, and DELETE)
    channel.on('postgres_changes',
      { event: '*', schema: 'public', table: 'injury_reports', filter: `company_id=eq.${companyId}` },
      (payload) => callbacks.onInjuryReport?.(payload)
    )

    // Subscribe to materials/equipment pricing changes company-wide
    channel.on('postgres_changes',
      { event: '*', schema: 'public', table: 'materials_equipment', filter: `company_id=eq.${companyId}` },
      (payload) => callbacks.onMaterialsEquipmentChange?.(payload)
    )

    // Subscribe to labor rate changes company-wide
    channel.on('postgres_changes',
      { event: '*', schema: 'public', table: 'labor_rates', filter: `company_id=eq.${companyId}` },
      (payload) => callbacks.onLaborRateChange?.(payload)
    )

    return channel.subscribe()
  },

  unsubscribe(subscription) {
    if (subscription && isSupabaseConfigured) {
      supabase.removeChannel(subscription)
    }
  },

  // ============================================
  // Project Assignments (for foremen)
  // ============================================

  async getAssignedProjects(userId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('project_assignments')
        .select(`
          project_id,
          projects (*)
        `)
        .eq('user_id', userId)
      if (error) throw error
      return data.map(a => a.projects)
    } else {
      const localData = getLocalData()
      const assignments = localData.assignments?.filter(a => a.user_id === userId) || []
      return assignments.map(a => localData.projects.find(p => p.id === a.project_id)).filter(Boolean)
    }
  },

  async assignUserToProject(projectId, userId, assignedBy) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('project_assignments')
        .insert({ project_id: projectId, user_id: userId, assigned_by: assignedBy })
        .select()
        .single()
      if (error) throw error
      return data
    } else {
      const localData = getLocalData()
      if (!localData.assignments) localData.assignments = []
      const assignment = {
        id: crypto.randomUUID(),
        project_id: projectId,
        user_id: userId,
        assigned_by: assignedBy,
        assigned_at: new Date().toISOString()
      }
      localData.assignments.push(assignment)
      setLocalData(localData)
      return assignment
    }
  },

  async removeUserFromProject(projectId, userId) {
    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('project_assignments')
        .delete()
        .eq('project_id', projectId)
        .eq('user_id', userId)
      if (error) throw error
    } else {
      const localData = getLocalData()
      localData.assignments = localData.assignments?.filter(
        a => !(a.project_id === projectId && a.user_id === userId)
      ) || []
      setLocalData(localData)
    }
  },

  async getProjectAssignments(projectId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('project_assignments')
        .select(`
          user_id,
          users (id, email, name, role)
        `)
        .eq('project_id', projectId)
      if (error) throw error
      return data.map(a => a.users)
    } else {
      const localData = getLocalData()
      const assignments = localData.assignments?.filter(a => a.project_id === projectId) || []
      return assignments.map(a => localData.users.find(u => u.id === a.user_id)).filter(Boolean)
    }
  },

  // Get all users (for assignment dropdowns)
  async getAllUsers() {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('name')
      if (error) throw error
      return data
    } else {
      return getLocalData().users || []
    }
  },

  // Get all foremen
  async getForemen() {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('role', 'foreman')
        .order('name')
      if (error) throw error
      return data
    } else {
      return (getLocalData().users || []).filter(u => u.role === 'foreman')
    }
  },

  // ============================================
  // Activity Logging
  // ============================================

  async logActivity(userId, projectId, areaId, action, oldValue, newValue) {
    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('activity_log')
        .insert({
          user_id: userId,
          project_id: projectId,
          area_id: areaId,
          action: sanitizeFormData({ action }).action,
          old_value: oldValue ? sanitizeFormData({ v: oldValue }).v : oldValue,
          new_value: newValue ? sanitizeFormData({ v: newValue }).v : newValue
        })
      if (error) console.error('Error logging activity:', error)
    }
    // In demo mode, we skip logging
  },

  async getProjectActivity(projectId, limit = 50) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('activity_log')
        .select(`
          *,
          users (name, email),
          areas (name)
        `)
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return data
    }
    return []
  }
}
