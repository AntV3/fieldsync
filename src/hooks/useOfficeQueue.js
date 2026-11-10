import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { db } from '../lib/supabase'
import { EMPTY_QUEUE_COUNTS } from '../lib/officeActions'

// A focus-triggered reload is skipped when the counts are fresher than this
const FOCUS_REFRESH_MIN_MS = 10 * 1000

/**
 * useOfficeQueue - What is waiting on the office, per project and in total.
 *
 * Loads db.getOfficeQueueCounts for the company and keeps only the projects
 * in `projects` (the active list the dashboard shows). Reloads when
 * `refreshKey` changes (any value, compared by identity) and when the window
 * regains focus. A failed reload keeps the last good counts; `ready` stays
 * false until one load succeeds, so callers can avoid showing zeros that were
 * never read.
 */
export default function useOfficeQueue({ company, projects = [], refreshKey } = {}) {
  const companyId = company?.id || null
  const [rawCounts, setRawCounts] = useState({})
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)

  const mountedRef = useRef(true)
  const inFlightRef = useRef(false)
  const queuedRef = useRef(false)
  const loadedAtRef = useRef(0)
  const companyIdRef = useRef(companyId)
  companyIdRef.current = companyId

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // One request at a time: a refresh asked for mid-flight runs once afterwards
  const refresh = useCallback(async () => {
    const requestedFor = companyIdRef.current
    if (!requestedFor) return
    if (inFlightRef.current) {
      queuedRef.current = true
      return
    }
    inFlightRef.current = true
    setLoading(true)
    try {
      const counts = await db.getOfficeQueueCounts(requestedFor, { throwOnError: true })
      if (mountedRef.current && companyIdRef.current === requestedFor) {
        setRawCounts(counts || {})
        setReady(true)
        loadedAtRef.current = Date.now()
      }
    } catch (_err) {
      // Logged in queueOps; keep whatever was loaded last
    } finally {
      inFlightRef.current = false
      if (mountedRef.current) {
        setLoading(false)
        if (queuedRef.current) {
          queuedRef.current = false
          refresh()
        }
      }
    }
  }, [])

  // Start clean when the company changes
  useEffect(() => {
    setRawCounts({})
    setReady(false)
    loadedAtRef.current = 0
  }, [companyId])

  const projectIdsKey = projects.map(p => p.id).join(',')
  const hasProjects = projectIdsKey !== ''

  useEffect(() => {
    if (companyId && hasProjects) refresh()
  }, [companyId, hasProjects, refreshKey, refresh])

  useEffect(() => {
    const handleFocus = () => {
      if (document.visibilityState === 'hidden') return
      if (Date.now() - loadedAtRef.current < FOCUS_REFRESH_MIN_MS) return
      refresh()
    }
    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleFocus)
    return () => {
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleFocus)
    }
  }, [refresh])

  const { byProject, totals } = useMemo(() => {
    const scoped = {}
    const sum = { ...EMPTY_QUEUE_COUNTS }
    for (const id of projectIdsKey ? projectIdsKey.split(',') : []) {
      const counts = rawCounts[id]
      if (!counts) continue
      scoped[id] = counts
      sum.readyToApprove += counts.readyToApprove || 0
      sum.awaitingSignature += counts.awaitingSignature || 0
      sum.readyForCOR += counts.readyForCOR || 0
      sum.draftCORs += counts.draftCORs || 0
      sum.returnedCORs += counts.returnedCORs || 0
      sum.withClient += counts.withClient || 0
      if (counts.oldestWithClientAt && (!sum.oldestWithClientAt || new Date(counts.oldestWithClientAt) < new Date(sum.oldestWithClientAt))) {
        sum.oldestWithClientAt = counts.oldestWithClientAt
      }
    }
    return { byProject: scoped, totals: sum }
  }, [rawCounts, projectIdsKey])

  const forProject = useCallback((projectId) => byProject[projectId] || EMPTY_QUEUE_COUNTS, [byProject])

  return { byProject, totals, forProject, loading, ready, refresh }
}
