import {
  supabase,
  isSupabaseConfigured,
  observe,
  getClient,
  getConnectionStatus,
  cacheCrewCheckin,
  cacheDailyReport,
  getCachedDailyReport,
  cacheMessage,
  addPendingAction,
  ACTION_TYPES,
  generateTempId,
  getLocalData,
  setLocalData,
  sanitizeFormData,
  sanitize
} from './client'

export const fieldOps = {
  // ============================================
  // Disposal Loads
  // ============================================

  DISPOSAL_LOAD_TYPES: [
    { value: 'concrete', label: 'Concrete' },
    { value: 'trash', label: 'Trash' },
    { value: 'metals', label: 'Metals' },
    { value: 'hazardous_waste', label: 'Hazardous Waste' },
    { value: 'copper', label: 'Copper' },
    { value: 'asphalt', label: 'Asphalt' }
  ],

  // Get disposal loads for a specific date
  async getDisposalLoads(projectId, date) {
    if (!isSupabaseConfigured) return []

    const client = getClient()
    if (!client) return []

    const start = performance.now()
    try {
      const { data, error } = await client
        .from('disposal_loads')
        .select('*')
        .eq('project_id', projectId)
        .eq('work_date', date)
        .order('created_at', { ascending: false })

      const duration = Math.round(performance.now() - start)
      observe.query('getDisposalLoads', { duration, rows: data?.length, project_id: projectId })

      if (error) throw error
      return data || []
    } catch (error) {
      observe.error('database', { message: error.message, operation: 'getDisposalLoads', project_id: projectId })
      throw error
    }
  },

  // Get disposal loads history for the last N days
  async getDisposalLoadsHistory(projectId, days = 14) {
    if (!isSupabaseConfigured) return []

    const client = getClient()
    if (!client) return []

    const start = performance.now()
    try {
      // Calculate date range
      const endDate = new Date()
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - days)

      const { data, error } = await client
        .from('disposal_loads')
        .select('*')
        .eq('project_id', projectId)
        .gte('work_date', startDate.toISOString().split('T')[0])
        .lte('work_date', endDate.toISOString().split('T')[0])
        .order('work_date', { ascending: false })

      const duration = Math.round(performance.now() - start)
      observe.query('getDisposalLoadsHistory', { duration, rows: data?.length, project_id: projectId })

      if (error) throw error
      // Map work_date to load_date for compatibility
      return (data || []).map(d => ({ ...d, load_date: d.work_date }))
    } catch (error) {
      observe.error('database', { message: error.message, operation: 'getDisposalLoadsHistory', project_id: projectId })
      throw error
    }
  },

  // Add a new disposal load entry
  async addDisposalLoad(projectId, userId, workDate, loadType, loadCount, notes = null) {
    if (!isSupabaseConfigured) return null

    const client = getClient()
    if (!client) {
      throw new Error('Database client not available')
    }

    const { data, error } = await client
      .from('disposal_loads')
      .insert({
        project_id: projectId,
        user_id: userId,
        work_date: workDate,
        load_type: loadType,
        load_count: loadCount,
        notes
      })
      .select()
      .single()

    if (error) {
      observe.error('database', { message: error.message, operation: 'addDisposalLoad', project_id: projectId })
      throw error
    }
    return data
  },

  // Update an existing disposal load entry
  async updateDisposalLoad(id, loadType, loadCount, notes = null) {
    if (!isSupabaseConfigured) return null

    const client = getClient()
    if (!client) {
      throw new Error('Database client not available')
    }

    const { data, error } = await client
      .from('disposal_loads')
      .update({
        load_type: loadType,
        load_count: loadCount,
        notes
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      observe.error('database', { message: error.message, operation: 'updateDisposalLoad' })
      throw error
    }
    return data
  },

  // Delete a disposal load entry
  async deleteDisposalLoad(id) {
    if (!isSupabaseConfigured) return false

    const client = getClient()
    if (!client) {
      throw new Error('Database client not available')
    }

    const { error } = await client
      .from('disposal_loads')
      .delete()
      .eq('id', id)

    if (error) {
      observe.error('database', { message: error.message, operation: 'deleteDisposalLoad' })
      throw error
    }
    return true
  },

  // Get disposal summary for burn rate view
  async getDisposalSummary(projectId, startDate = null, endDate = null) {
    if (!isSupabaseConfigured) return []

    const client = getClient()
    if (!client) return []

    const start = performance.now()
    try {
      // Use RPC function for efficient aggregation
      const { data, error } = await client.rpc('get_disposal_summary', {
        p_project_id: projectId,
        p_start_date: startDate,
        p_end_date: endDate
      })

      const duration = Math.round(performance.now() - start)
      observe.query('getDisposalSummary', { duration, rows: data?.length, project_id: projectId })

      if (error) throw error
      return data || []
    } catch (error) {
      observe.error('database', { message: error.message, operation: 'getDisposalSummary', project_id: projectId })
      // Fallback to direct query if RPC doesn't exist
      return this.getDisposalSummaryFallback(projectId, startDate, endDate)
    }
  },

  // Fallback aggregation (if RPC not available)
  async getDisposalSummaryFallback(projectId, startDate, endDate) {
    const client = getClient() || supabase
    let query = client
      .from('disposal_loads')
      .select('load_type, load_count, work_date')
      .eq('project_id', projectId)

    if (startDate) {
      query = query.gte('work_date', startDate)
    }
    if (endDate) {
      query = query.lte('work_date', endDate)
    }

    const { data, error } = await query
    if (error) throw error

    // Aggregate in JS
    const summary = {}
    data?.forEach(row => {
      if (!summary[row.load_type]) {
        summary[row.load_type] = { load_type: row.load_type, total_loads: 0, days: new Set() }
      }
      summary[row.load_type].total_loads += row.load_count
      summary[row.load_type].days.add(row.work_date)
    })

    return Object.values(summary).map(s => ({
      load_type: s.load_type,
      total_loads: s.total_loads,
      days_with_activity: s.days.size
    }))
  },

  // Get weekly disposal summary for charts
  async getWeeklyDisposalSummary(projectId, weeks = 4) {
    if (!isSupabaseConfigured) return []

    const client = getClient()
    if (!client) return []

    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - (weeks * 7))

    const { data, error } = await client
      .from('disposal_loads')
      .select('load_type, load_count, work_date')
      .eq('project_id', projectId)
      .gte('work_date', startDate.toISOString().split('T')[0])
      .lte('work_date', endDate.toISOString().split('T')[0])
      .order('work_date', { ascending: true })

    if (error) throw error

    // Group by week and load type
    const weeklyData = {}
    data?.forEach(row => {
      const date = new Date(row.work_date)
      const weekStart = new Date(date)
      weekStart.setDate(date.getDate() - date.getDay())
      const weekKey = weekStart.toISOString().split('T')[0]

      if (!weeklyData[weekKey]) {
        weeklyData[weekKey] = { week: weekKey, concrete: 0, trash: 0, metals: 0, hazardous_waste: 0 }
      }
      weeklyData[weekKey][row.load_type] += row.load_count
    })

    return Object.values(weeklyData).sort((a, b) => a.week.localeCompare(b.week))
  },

  // ============================================
  // Disposal Truck Counts
  // ============================================

  // Get truck count for a specific date
  async getTruckCount(projectId, date) {
    if (!isSupabaseConfigured) return null

    const client = getClient()
    if (!client) return null

    const { data, error } = await client
      .from('disposal_truck_counts')
      .select('*')
      .eq('project_id', projectId)
      .eq('work_date', date)
      .maybeSingle()

    if (error) {
      console.error('Error fetching truck count:', error)
      return null
    }
    return data
  },

  // Set truck count for a specific date (upsert)
  async setTruckCount(projectId, date, truckCount) {
    if (!isSupabaseConfigured) return null

    const client = getClient()
    if (!client) {
      throw new Error('Database client not available')
    }

    const { data, error } = await client
      .from('disposal_truck_counts')
      .upsert({
        project_id: projectId,
        work_date: date,
        truck_count: truckCount,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'project_id,work_date'
      })
      .select()
      .maybeSingle()

    if (error) {
      observe.error('database', { message: error.message, operation: 'setTruckCount', project_id: projectId })
      throw error
    }
    return data
  },

  // Get truck counts history for the last N days
  async getTruckCountHistory(projectId, days = 14) {
    if (!isSupabaseConfigured) return []

    const client = getClient()
    if (!client) return []

    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    const { data, error } = await client
      .from('disposal_truck_counts')
      .select('*')
      .eq('project_id', projectId)
      .gte('work_date', startDate.toISOString().split('T')[0])
      .lte('work_date', endDate.toISOString().split('T')[0])
      .order('work_date', { ascending: false })

    if (error) {
      console.error('Error fetching truck count history:', error)
      return []
    }
    return data || []
  },

  // Subscribe to truck count changes
  subscribeToTruckCounts(projectId, callback) {
    if (isSupabaseConfigured) {
      return supabase
        .channel(`disposal_truck_counts:${projectId}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'disposal_truck_counts', filter: `project_id=eq.${projectId}` },
          callback
        )
        .subscribe()
    }
    return null
  },

  // ============================================
  // Crew Management
  // ============================================

  async getCrewCheckin(projectId, date = null) {
    if (!isSupabaseConfigured) return null

    const checkDate = date || new Date().toISOString().split('T')[0]
    const client = getClient()

    const { data, error } = await client
      .from('crew_checkins')
      .select('*')
      .eq('project_id', projectId)
      .eq('check_in_date', checkDate)
      .maybeSingle() // Use maybeSingle to return null instead of 406 when no rows

    if (error) {
      console.error('Error fetching crew checkin:', error)
    }
    return data
  },

  // Create or update crew check-in
  async saveCrewCheckin(projectId, workers, createdBy = null, date = null) {
    if (!isSupabaseConfigured) return null

    const checkDate = date || new Date().toISOString().split('T')[0]

    // If offline, cache and queue action
    if (!getConnectionStatus()) {
      const checkin = {
        id: generateTempId(),
        project_id: projectId,
        check_in_date: checkDate,
        workers: workers,
        created_by: createdBy,
        updated_at: new Date().toISOString(),
        _offline: true
      }
      await cacheCrewCheckin(checkin)
      await addPendingAction(ACTION_TYPES.SAVE_CREW_CHECKIN, {
        projectId,
        workers,
        checkInDate: checkDate
      })
      return checkin
    }

    const client = getClient()
    if (!client) {
      // Offline fallback - queue for later
      const checkin = {
        id: generateTempId(),
        project_id: projectId,
        check_in_date: checkDate,
        workers: workers,
        created_by: createdBy,
        updated_at: new Date().toISOString(),
        _offline: true
      }
      await cacheCrewCheckin(checkin)
      await addPendingAction(ACTION_TYPES.SAVE_CREW_CHECKIN, {
        projectId,
        workers,
        checkInDate: checkDate
      })
      return checkin
    }

    const sanitizedWorkers = Array.isArray(workers) ? workers.map(w => {
      // Preserve base64 signature data which exceeds sanitize.text() maxLength
      const sigData = w.signature_data
      const sanitized = sanitize.object({ ...w, signature_data: undefined })
      if (sigData) sanitized.signature_data = sigData
      return sanitized
    }) : workers
    const { data, error } = await client
      .from('crew_checkins')
      .upsert({
        project_id: projectId,
        check_in_date: checkDate,
        workers: sanitizedWorkers,
        created_by: createdBy,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'project_id,check_in_date'
      })
      .select()
      .maybeSingle()

    if (error) {
      // If network error, queue for later
      if (error.message?.includes('fetch') || error.message?.includes('network')) {
        const checkin = {
          id: generateTempId(),
          project_id: projectId,
          check_in_date: checkDate,
          workers: workers,
          _offline: true
        }
        await cacheCrewCheckin(checkin)
        await addPendingAction(ACTION_TYPES.SAVE_CREW_CHECKIN, {
          projectId,
          workers,
          checkInDate: checkDate
        })
        return checkin
      }
      console.error('Error saving crew checkin:', error)
      throw error
    }

    // Update cache with server response
    if (data) {
      cacheCrewCheckin(data).catch(err => console.error('Failed to cache checkin:', err))
    }
    return data
  },

  // Add a worker to today's check-in
  async addCrewMember(projectId, worker, createdBy = null) {
    if (!isSupabaseConfigured) return null

    const existing = await this.getCrewCheckin(projectId)
    const workers = existing?.workers || []

    // Check if already exists
    if (!workers.find(w => w.name.toLowerCase() === worker.name.toLowerCase())) {
      workers.push(worker)
      return await this.saveCrewCheckin(projectId, workers, createdBy)
    }
    return existing
  },

  // Remove a worker from today's check-in
  async removeCrewMember(projectId, workerName) {
    if (!isSupabaseConfigured) return null

    const existing = await this.getCrewCheckin(projectId)
    if (!existing) return null

    const workers = existing.workers.filter(
      w => w.name.toLowerCase() !== workerName.toLowerCase()
    )
    return await this.saveCrewCheckin(projectId, workers, existing.created_by)
  },

  // Get crew check-ins for a project (for office view)
  async getCrewCheckinHistory(projectId, limit = 30) {
    if (!isSupabaseConfigured) return []

    const client = getClient()
    if (!client) return []

    const { data, error } = await client
      .from('crew_checkins')
      .select('*')
      .eq('project_id', projectId)
      .order('check_in_date', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('Error fetching crew history:', error)
      return []
    }
    return data || []
  },

  // Get unique recent workers from past check-ins (for quick-add feature)
  async getRecentWorkers(projectId, limit = 30) {
    if (!isSupabaseConfigured) return []

    const history = await this.getCrewCheckinHistory(projectId, limit)

    // Extract unique workers from all check-ins
    const workerMap = new Map()
    history.forEach(checkin => {
      (checkin.workers || []).forEach(worker => {
        const key = worker.name.toLowerCase()
        if (!workerMap.has(key)) {
          workerMap.set(key, {
            name: worker.name,
            role: worker.role,
            labor_class_id: worker.labor_class_id || null,
            lastSeen: checkin.check_in_date
          })
        }
      })
    })

    // Return as array sorted by name
    return Array.from(workerMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    )
  },

  // Get labor rates for a company (for man day calculations)
  async getLaborRates(companyId, workType = null, jobType = null) {
    if (!isSupabaseConfigured) return []

    let query = supabase
      .from('labor_rates')
      .select('*')
      .eq('company_id', companyId)

    if (workType) query = query.eq('work_type', workType)
    if (jobType) query = query.eq('job_type', jobType)

    const { data, error } = await query

    if (error) {
      console.error('Error fetching labor rates:', error)
      return []
    }
    return data || []
  },

  // Calculate contract labor costs for a project from daily crew check-ins.
  //
  // Each laborer on a daily check-in is auto-captured at 8 hours of contract
  // labor for that date. Workers who appear on a T&M ticket for the same date
  // are excluded — their hours are billed as T&M extra work, so counting them
  // here too would double-count the cost.
  async calculateManDayCosts(projectId, companyId, workType, jobType) {
    if (!isSupabaseConfigured) return { totalCost: 0, totalManDays: 0, breakdown: [] }

    // Each laborer on a daily check-in defaults to 8 hours of contract labor
    // until they're moved to a T&M ticket.
    const HOURS_PER_CHECKIN_DAY = 8

    const client = getClient()

    // Run independent reads in parallel
    const [crewHistory, laborRates, classRatesResult, tmTicketsResult] = await Promise.all([
      this.getCrewCheckinHistory(projectId, 365),
      this.getLaborRates(companyId, workType, jobType),
      client
        .from('labor_class_rates')
        .select('labor_class_id, regular_rate')
        .eq('work_type', workType)
        .eq('job_type', jobType),
      client
        .from('t_and_m_tickets')
        .select('work_date, t_and_m_workers (name)')
        .eq('project_id', projectId),
    ])

    // Build hourly-rate lookup by legacy role name
    const ratesLookup = {}
    laborRates.forEach(rate => {
      ratesLookup[rate.role.toLowerCase()] = parseFloat(rate.regular_rate) || 0
    })

    // Build hourly-rate lookup by labor_class_id (current schema)
    const classRatesLookup = {}
    ;(classRatesResult?.data || []).forEach(r => {
      classRatesLookup[r.labor_class_id] = parseFloat(r.regular_rate) || 0
    })

    // Build date -> Set(lowercased worker names on a T&M ticket that day).
    // Once a laborer is associated with T&M work for a date, their cost is
    // captured via T&M billing, not contract labor.
    const tmWorkersByDate = {}
    ;(tmTicketsResult?.data || []).forEach(ticket => {
      if (!ticket.work_date) return
      if (!tmWorkersByDate[ticket.work_date]) {
        tmWorkersByDate[ticket.work_date] = new Set()
      }
      ;(ticket.t_and_m_workers || []).forEach(w => {
        if (w?.name) tmWorkersByDate[ticket.work_date].add(w.name.toLowerCase().trim())
      })
    })

    let totalCost = 0
    let totalManDays = 0
    let tmWorkersExcluded = 0
    const byRole = {}
    const byDate = []

    crewHistory.forEach(checkin => {
      const workers = checkin.workers || []
      const tmNamesToday = tmWorkersByDate[checkin.check_in_date] || new Set()

      let dayCost = 0
      let dayContractWorkers = 0
      const dayBreakdown = {}

      workers.forEach(worker => {
        // Skip workers already on a T&M ticket for this date — their hours
        // are tracked through T&M and would be double-counted here.
        const nameKey = worker.name?.toLowerCase().trim()
        if (nameKey && tmNamesToday.has(nameKey)) {
          tmWorkersExcluded++
          return
        }

        const role = (worker.role || 'laborer').toLowerCase()
        const hourlyRate =
          (worker.labor_class_id && classRatesLookup[worker.labor_class_id]) ||
          ratesLookup[role] ||
          0
        const dailyCost = hourlyRate * HOURS_PER_CHECKIN_DAY

        if (!dayBreakdown[role]) {
          dayBreakdown[role] = { count: 0, cost: 0 }
        }
        dayBreakdown[role].count++
        dayBreakdown[role].cost += dailyCost
        dayCost += dailyCost
        dayContractWorkers++

        if (!byRole[role]) {
          byRole[role] = { count: 0, cost: 0, rate: dailyCost }
        }
        byRole[role].count++
        byRole[role].cost += dailyCost
      })

      totalCost += dayCost
      totalManDays += dayContractWorkers

      byDate.push({
        date: checkin.check_in_date,
        workers: dayContractWorkers,
        cost: dayCost,
        breakdown: dayBreakdown
      })
    })

    return {
      totalCost,
      totalManDays,
      byRole,
      byDate,
      daysWorked: crewHistory.length,
      hoursPerDay: HOURS_PER_CHECKIN_DAY,
      tmWorkersExcluded
    }
  },

  // ============================================
  // Daily Field Reports
  // ============================================

  // Get or create today's report for a project
  async getDailyReport(projectId, date = null) {
    if (!isSupabaseConfigured) return null

    const reportDate = date || new Date().toISOString().split('T')[0]
    const client = getClient()

    const { data, error } = await client
      .from('daily_reports')
      .select('*')
      .eq('project_id', projectId)
      .eq('report_date', reportDate)
      .maybeSingle() // Use maybeSingle to return null instead of 406 when no report exists

    if (error) {
      console.error('Error fetching daily report:', error)
    }
    return data
  },

  // Compile daily report data from other tables (parallelized for speed)
  async compileDailyReport(projectId, date = null) {
    if (!isSupabaseConfigured) return null

    const reportDate = date || new Date().toISOString().split('T')[0]
    const client = getClient()

    // Run all queries in parallel for faster loading
    const [crew, areasResult, ticketsResult, existingReport] = await Promise.all([
      this.getCrewCheckin(projectId, reportDate),
      client.from('areas').select('*').eq('project_id', projectId),
      client.from('t_and_m_tickets').select('*').eq('project_id', projectId).eq('work_date', reportDate),
      client.from('daily_reports').select('photos').eq('project_id', projectId).eq('report_date', reportDate).maybeSingle()
    ])

    const areas = areasResult?.data || []
    const tickets = ticketsResult?.data || []

    const completedToday = areas.filter(a =>
      a.status === 'done' &&
      a.completed_at?.startsWith(reportDate)
    )

    // Count photos from T&M tickets AND report-level photos
    const tmPhotosCount = tickets.reduce((sum, t) => sum + (t.photos?.length || 0), 0)
    const reportPhotosCount = existingReport?.photos?.length || 0
    const photosCount = tmPhotosCount + reportPhotosCount

    return {
      crew_count: crew?.workers?.length || 0,
      crew_list: crew?.workers || [],
      tasks_completed: completedToday.length,
      tasks_total: areas.length,
      completed_tasks: completedToday.map(a => ({ name: a.name, group: a.group_name })),
      tm_tickets_count: tickets.length,
      photos_count: photosCount
    }
  },

  // Save/update daily report
  async saveDailyReport(projectId, reportData, date = null) {
    if (!isSupabaseConfigured) return null

    const reportDate = date || new Date().toISOString().split('T')[0]

    // If offline, cache and queue action
    if (!getConnectionStatus()) {
      const report = {
        id: generateTempId(),
        project_id: projectId,
        report_date: reportDate,
        ...reportData,
        updated_at: new Date().toISOString(),
        _offline: true
      }
      await cacheDailyReport(report)
      // Note: saveDailyReport alone doesn't queue - submitDailyReport handles the full flow
      return report
    }

    const client = getClient()
    const { data, error } = await client
      .from('daily_reports')
      .upsert({
        project_id: projectId,
        report_date: reportDate,
        ...sanitizeFormData(reportData),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'project_id,report_date'
      })
      .select()
      .maybeSingle()

    if (error) {
      // If network error, cache locally
      if (error.message?.includes('fetch') || error.message?.includes('network')) {
        const report = {
          id: generateTempId(),
          project_id: projectId,
          report_date: reportDate,
          ...reportData,
          _offline: true
        }
        await cacheDailyReport(report)
        return report
      }
      console.error('Error saving daily report:', error)
      throw error
    }

    // Update cache with server response
    if (data) {
      cacheDailyReport(data).catch(err => console.error('Failed to cache report:', err))
    }
    return data
  },

  // Submit daily report
  async submitDailyReport(projectId, submittedBy, date = null) {
    if (!isSupabaseConfigured) return null

    const reportDate = date || new Date().toISOString().split('T')[0]

    // If offline, queue the submission
    if (!getConnectionStatus()) {
      // Try to get cached report data
      const cachedReport = await getCachedDailyReport(projectId, reportDate)
      const report = {
        id: generateTempId(),
        project_id: projectId,
        report_date: reportDate,
        ...(cachedReport || {}),
        status: 'pending_sync',
        submitted_by: submittedBy,
        submitted_at: new Date().toISOString(),
        _offline: true
      }
      await cacheDailyReport(report)
      await addPendingAction(ACTION_TYPES.SUBMIT_DAILY_REPORT, {
        projectId,
        reportData: cachedReport || {},
        submittedBy
      })
      return report
    }

    // First compile latest data
    const compiled = await this.compileDailyReport(projectId, reportDate)

    const client = getClient()
    if (!client) {
      throw new Error('Database client not available')
    }

    // Fetch existing report to preserve photos and notes saved earlier
    const { data: existing } = await client
      .from('daily_reports')
      .select('photos, field_notes, issues')
      .eq('project_id', projectId)
      .eq('report_date', reportDate)
      .maybeSingle()

    // Merge: compiled metrics + preserved report-level data
    const upsertData = {
      project_id: projectId,
      report_date: reportDate,
      ...compiled,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      submitted_by: submittedBy,
      updated_at: new Date().toISOString()
    }

    // Preserve photos and notes from the saved report (if saveDailyReport was called first)
    if (existing) {
      if (existing.photos) upsertData.photos = existing.photos
      if (existing.field_notes && !upsertData.field_notes) upsertData.field_notes = existing.field_notes
      if (existing.issues && !upsertData.issues) upsertData.issues = existing.issues
    }

    const { data, error } = await client
      .from('daily_reports')
      .upsert(upsertData, {
        onConflict: 'project_id,report_date'
      })
      .select()
      .maybeSingle()

    if (error) {
      // If network error, queue for later
      if (error.message?.includes('fetch') || error.message?.includes('network')) {
        const report = {
          id: generateTempId(),
          project_id: projectId,
          report_date: reportDate,
          ...compiled,
          status: 'pending_sync',
          submitted_by: submittedBy,
          _offline: true
        }
        await cacheDailyReport(report)
        await addPendingAction(ACTION_TYPES.SUBMIT_DAILY_REPORT, {
          projectId,
          reportData: compiled,
          submittedBy
        })
        return report
      }
      console.error('Error submitting daily report:', error)
      throw error
    }

    // Update cache
    if (data) {
      cacheDailyReport(data).catch(err => console.error('Failed to cache report:', err))
    }
    return data
  },

  // Get daily reports for office view
  async getDailyReports(projectId, limit = 30) {
    if (!isSupabaseConfigured) return []

    const client = getClient()
    if (!client) return []

    const { data, error } = await client
      .from('daily_reports')
      .select('*')
      .eq('project_id', projectId)
      .order('report_date', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('Error fetching daily reports:', error)
      return []
    }
    return data || []
  },

  // ============================================
  // Messages (Two-way communication)
  // ============================================

  // Send a message
  async sendMessage(projectId, message, senderType, senderName, senderUserId = null, photoUrl = null, messageType = 'general', parentId = null) {
    if (!isSupabaseConfigured) return null

    // If offline, cache and queue message
    if (!getConnectionStatus()) {
      const msg = {
        id: generateTempId(),
        project_id: projectId,
        sender_type: senderType,
        sender_name: senderName,
        sender_user_id: senderUserId,
        message: message,
        photo_url: photoUrl,
        message_type: messageType,
        parent_message_id: parentId,
        created_at: new Date().toISOString(),
        _offline: true
      }
      await cacheMessage(msg)
      await addPendingAction(ACTION_TYPES.SEND_MESSAGE, {
        projectId,
        senderType,
        senderName,
        content: message
      })
      return msg
    }

    const { data, error } = await supabase
      .from('messages')
      .insert({
        project_id: projectId,
        sender_type: senderType,
        sender_name: sanitize.text(senderName),
        sender_user_id: senderUserId,
        message: sanitize.text(message),
        photo_url: photoUrl ? sanitize.url(photoUrl) : null,
        message_type: messageType,
        parent_message_id: parentId
      })
      .select()
      .single()

    if (error) {
      // If network error, queue for later
      if (error.message?.includes('fetch') || error.message?.includes('network')) {
        const msg = {
          id: generateTempId(),
          project_id: projectId,
          sender_type: senderType,
          sender_name: senderName,
          message: message,
          created_at: new Date().toISOString(),
          _offline: true
        }
        await cacheMessage(msg)
        await addPendingAction(ACTION_TYPES.SEND_MESSAGE, {
          projectId,
          senderType,
          senderName,
          content: message
        })
        return msg
      }
      console.error('Error sending message:', error)
      throw error
    }
    return data
  },

  // Get messages for a project
  async getMessages(projectId, limit = 50) {
    if (!isSupabaseConfigured) return []

    const client = getClient()
    const { data, error } = await client
      .from('messages')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      return []
    }
    return data || []
  },

  // Get unread message count
  async getUnreadCount(projectId, viewerType) {
    if (!isSupabaseConfigured) return 0

    const client = getClient()
    // Field sees office messages, office sees field messages
    const senderType = viewerType === 'field' ? 'office' : 'field'

    const { count, error } = await client
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('sender_type', senderType)
      .eq('is_read', false)

    if (error) {
      return 0
    }
    return count || 0
  },

  // Mark messages as read
  async markMessagesRead(projectId, viewerType) {
    if (!isSupabaseConfigured) return

    const client = getClient()
    const senderType = viewerType === 'field' ? 'office' : 'field'

    const { error } = await client
      .from('messages')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('project_id', projectId)
      .eq('sender_type', senderType)
      .eq('is_read', false)

    if (error) {
      console.error('Failed to mark messages as read:', error.message)
    }
  },

  // ============================================
  // Injury Reporting
  // ============================================

  async createInjuryReport(reportData) {
    if (!isSupabaseConfigured) {
      // Demo mode - store in localStorage
      const localData = getLocalData()
      if (!localData.injuryReports) localData.injuryReports = []

      const report = {
        id: crypto.randomUUID(),
        ...reportData,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      localData.injuryReports.push(report)
      setLocalData(localData)
      return report
    }

    const { data, error } = await supabase
      .from('injury_reports')
      .insert(sanitizeFormData(reportData))
      .select()
      .single()

    if (error) {
      console.error('Error creating injury report:', error)
      throw error
    }
    return data
  },

  // Get all injury reports for a project
  async getInjuryReports(projectId) {
    if (!isSupabaseConfigured) {
      const localData = getLocalData()
      if (!localData.injuryReports) return []
      return localData.injuryReports
        .filter(r => r.project_id === projectId)
        .sort((a, b) => new Date(b.incident_date) - new Date(a.incident_date))
    }

    const { data, error } = await supabase
      .from('injury_reports')
      .select('*')
      .eq('project_id', projectId)
      .order('incident_date', { ascending: false })

    if (error) {
      console.error('Error fetching injury reports:', error)
      return []
    }
    return data || []
  },

  // Get all injury reports for a company
  async getCompanyInjuryReports(companyId, status = null) {
    if (!isSupabaseConfigured) {
      const localData = getLocalData()
      if (!localData.injuryReports) return []
      let reports = localData.injuryReports.filter(r => r.company_id === companyId)
      if (status) {
        reports = reports.filter(r => r.status === status)
      }
      return reports.sort((a, b) => new Date(b.incident_date) - new Date(a.incident_date))
    }

    let query = supabase
      .from('injury_reports')
      .select('*, projects(name)')
      .eq('company_id', companyId)
      .order('incident_date', { ascending: false })

    if (status) {
      query = query.eq('status', status)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching company injury reports:', error)
      return []
    }
    return data || []
  },

  // Get a single injury report
  async getInjuryReport(reportId) {
    if (!isSupabaseConfigured) {
      const localData = getLocalData()
      if (!localData.injuryReports) return null
      return localData.injuryReports.find(r => r.id === reportId)
    }

    const { data, error } = await supabase
      .from('injury_reports')
      .select('*, projects(name, pin), users(name, email)')
      .eq('id', reportId)
      .single()

    if (error) {
      console.error('Error fetching injury report:', error)
      return null
    }
    return data
  },

  // Update an injury report
  async updateInjuryReport(reportId, updates) {
    if (!isSupabaseConfigured) {
      const localData = getLocalData()
      if (!localData.injuryReports) return null

      const reportIndex = localData.injuryReports.findIndex(r => r.id === reportId)
      if (reportIndex === -1) return null

      localData.injuryReports[reportIndex] = {
        ...localData.injuryReports[reportIndex],
        ...updates,
        updated_at: new Date().toISOString()
      }
      setLocalData(localData)
      return localData.injuryReports[reportIndex]
    }

    const { data, error } = await supabase
      .from('injury_reports')
      .update(sanitizeFormData(updates))
      .eq('id', reportId)
      .select()
      .single()

    if (error) {
      console.error('Error updating injury report:', error)
      throw error
    }
    return data
  },

  // Close an injury report
  async closeInjuryReport(reportId, userId) {
    return this.updateInjuryReport(reportId, {
      status: 'closed',
      closed_at: new Date().toISOString(),
      closed_by: userId
    })
  },

  // Delete an injury report
  async deleteInjuryReport(reportId) {
    if (!isSupabaseConfigured) {
      const localData = getLocalData()
      if (!localData.injuryReports) return

      localData.injuryReports = localData.injuryReports.filter(r => r.id !== reportId)
      setLocalData(localData)
      return
    }

    const { error } = await supabase
      .from('injury_reports')
      .delete()
      .eq('id', reportId)

    if (error) {
      console.error('Error deleting injury report:', error)
      throw error
    }
  },

  // Get injury statistics for a company
  async getInjuryStatistics(companyId, startDate = null, endDate = null) {
    if (!isSupabaseConfigured) {
      // Demo mode - calculate locally
      const localData = getLocalData()
      if (!localData.injuryReports) {
        return {
          total_incidents: 0,
          minor_injuries: 0,
          serious_injuries: 0,
          critical_injuries: 0,
          near_misses: 0,
          osha_recordable: 0,
          total_days_away: 0,
          total_restricted_days: 0
        }
      }

      let reports = localData.injuryReports.filter(r => r.company_id === companyId)

      if (startDate) {
        reports = reports.filter(r => new Date(r.incident_date) >= new Date(startDate))
      }
      if (endDate) {
        reports = reports.filter(r => new Date(r.incident_date) <= new Date(endDate))
      }

      return {
        total_incidents: reports.length,
        minor_injuries: reports.filter(r => r.injury_type === 'minor').length,
        serious_injuries: reports.filter(r => r.injury_type === 'serious').length,
        critical_injuries: reports.filter(r => r.injury_type === 'critical').length,
        near_misses: reports.filter(r => r.injury_type === 'near_miss').length,
        osha_recordable: reports.filter(r => r.osha_recordable).length,
        total_days_away: reports.reduce((sum, r) => sum + (r.days_away_from_work || 0), 0),
        total_restricted_days: reports.reduce((sum, r) => sum + (r.restricted_work_days || 0), 0)
      }
    }

    const { data, error } = await supabase.rpc('get_injury_statistics', {
      comp_id: companyId,
      start_date: startDate,
      end_date: endDate
    })

    if (error) {
      console.error('Error fetching injury statistics:', error)
      return null
    }
    return data[0] || null
  },

  // Add a witness to an injury report
  async addWitness(reportId, witness) {
    if (!isSupabaseConfigured) {
      const localData = getLocalData()
      if (!localData.injuryReports) return null

      const reportIndex = localData.injuryReports.findIndex(r => r.id === reportId)
      if (reportIndex === -1) return null

      const report = localData.injuryReports[reportIndex]
      const witnesses = report.witnesses || []
      witnesses.push(witness)

      localData.injuryReports[reportIndex] = {
        ...report,
        witnesses,
        updated_at: new Date().toISOString()
      }
      setLocalData(localData)
      return localData.injuryReports[reportIndex]
    }

    const report = await this.getInjuryReport(reportId)
    if (!report) return null

    const witnesses = report.witnesses || []
    witnesses.push(witness)

    return this.updateInjuryReport(reportId, { witnesses })
  },

  // Remove a witness from an injury report
  async removeWitness(reportId, witnessIndex) {
    if (!isSupabaseConfigured) {
      const localData = getLocalData()
      if (!localData.injuryReports) return null

      const reportIndex = localData.injuryReports.findIndex(r => r.id === reportId)
      if (reportIndex === -1) return null

      const report = localData.injuryReports[reportIndex]
      const witnesses = report.witnesses || []
      witnesses.splice(witnessIndex, 1)

      localData.injuryReports[reportIndex] = {
        ...report,
        witnesses,
        updated_at: new Date().toISOString()
      }
      setLocalData(localData)
      return localData.injuryReports[reportIndex]
    }

    const report = await this.getInjuryReport(reportId)
    if (!report) return null

    const witnesses = report.witnesses || []
    witnesses.splice(witnessIndex, 1)

    return this.updateInjuryReport(reportId, { witnesses })
  },

  // ============================================
  // Real-time Subscriptions
  // ============================================

  // Subscribe to disposal loads / haul-offs for a project
  subscribeToHaulOffs(projectId, callback) {
    if (isSupabaseConfigured) {
      return supabase
        .channel(`disposal_loads:${projectId}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'disposal_loads', filter: `project_id=eq.${projectId}` },
          callback
        )
        .subscribe()
    }
    return null
  }
}
