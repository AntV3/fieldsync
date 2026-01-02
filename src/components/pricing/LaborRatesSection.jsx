import { useState, useEffect } from 'react'
import { supabase, isSupabaseConfigured } from '../../lib/supabase'

const LABOR_ROLES = ['foreman', 'operator', 'laborer']
const WORK_TYPES = ['demolition', 'abatement']
const JOB_TYPES = ['standard', 'pla']

export default function LaborRatesSection({ company, onShowToast }) {
  const [laborRates, setLaborRates] = useState({})
  const [editingRates, setEditingRates] = useState(false)
  const [savingRates, setSavingRates] = useState(false)
  const [activeWorkType, setActiveWorkType] = useState('demolition')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (company?.id) {
      loadLaborRates()
    }
  }, [company?.id])

  const initializeRates = () => {
    const rates = {}
    WORK_TYPES.forEach(workType => {
      rates[workType] = {}
      JOB_TYPES.forEach(jobType => {
        rates[workType][jobType] = {}
        LABOR_ROLES.forEach(role => {
          rates[workType][jobType][role] = { regular: '', overtime: '' }
        })
      })
    })
    return rates
  }

  const loadLaborRates = async () => {
    if (!isSupabaseConfigured) {
      setLaborRates(initializeRates())
      setLoading(false)
      return
    }

    const rates = initializeRates()

    try {
      const { data, error } = await supabase
        .from('labor_rates')
        .select('*')
        .eq('company_id', company.id)

      if (error) {
        setLaborRates(rates)
        setLoading(false)
        return
      }

      if (data && data.length > 0) {
        data.forEach(rate => {
          if (rates[rate.work_type] &&
              rates[rate.work_type][rate.job_type] &&
              rates[rate.work_type][rate.job_type][rate.role]) {
            rates[rate.work_type][rate.job_type][rate.role] = {
              regular: rate.regular_rate || '',
              overtime: rate.overtime_rate || ''
            }
          }
        })
      }
      setLaborRates(rates)
    } catch (error) {
      console.error('Error loading labor rates:', error)
      setLaborRates(rates)
    } finally {
      setLoading(false)
    }
  }

  const saveLaborRates = async () => {
    if (!isSupabaseConfigured) {
      onShowToast('Labor rates require database connection', 'error')
      return
    }

    setSavingRates(true)
    try {
      await supabase
        .from('labor_rates')
        .delete()
        .eq('company_id', company.id)

      const ratesToSave = []

      WORK_TYPES.forEach(workType => {
        JOB_TYPES.forEach(jobType => {
          LABOR_ROLES.forEach(role => {
            const rateData = laborRates[workType]?.[jobType]?.[role] || { regular: 0, overtime: 0 }
            ratesToSave.push({
              company_id: company.id,
              role: role,
              work_type: workType,
              job_type: jobType,
              regular_rate: parseFloat(rateData.regular) || 0,
              overtime_rate: parseFloat(rateData.overtime) || 0
            })
          })
        })
      })

      const { error } = await supabase
        .from('labor_rates')
        .insert(ratesToSave)

      if (error) throw error

      onShowToast('Labor rates saved', 'success')
      setEditingRates(false)
    } catch (error) {
      console.error('Error saving labor rates:', error)
      onShowToast('Error saving rates: ' + (error.message || 'Unknown error'), 'error')
    } finally {
      setSavingRates(false)
    }
  }

  const updateRate = (workType, jobType, role, rateType, value) => {
    setLaborRates(prev => ({
      ...prev,
      [workType]: {
        ...prev[workType],
        [jobType]: {
          ...prev[workType]?.[jobType],
          [role]: {
            ...prev[workType]?.[jobType]?.[role],
            [rateType]: value
          }
        }
      }
    }))
  }

  const formatRole = (role) => role.charAt(0).toUpperCase() + role.slice(1)
  const formatWorkType = (type) => type.charAt(0).toUpperCase() + type.slice(1)
  const formatJobType = (type) => type === 'pla' ? 'PLA (Prevailing Wage)' : 'Standard (Private)'

  if (loading) {
    return <div className="loading">Loading labor rates...</div>
  }

  return (
    <div className="pricing-section">
      <div className="pricing-section-header">
        <div>
          <h2>Labor Rates</h2>
          <p className="section-desc">Configure hourly rates by role, work type, and job classification</p>
        </div>
        {!editingRates ? (
          <button className="btn btn-primary" onClick={() => setEditingRates(true)}>
            Edit Rates
          </button>
        ) : (
          <div className="rate-actions">
            <button className="btn btn-secondary" onClick={() => { setEditingRates(false); loadLaborRates(); }}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={saveLaborRates}
              disabled={savingRates}
            >
              {savingRates ? 'Saving...' : 'Save All Rates'}
            </button>
          </div>
        )}
      </div>

      {/* Work Type Tabs */}
      <div className="work-type-tabs">
        {WORK_TYPES.map(workType => (
          <button
            key={workType}
            className={`work-type-tab ${activeWorkType === workType ? 'active' : ''}`}
            onClick={() => setActiveWorkType(workType)}
          >
            {formatWorkType(workType)}
          </button>
        ))}
      </div>

      {/* Job Type Sections */}
      <div className="labor-rates-container">
        {JOB_TYPES.map(jobType => (
          <div key={jobType} className="job-type-section">
            <h3 className="job-type-header">{formatJobType(jobType)}</h3>

            <div className="rates-table">
              <div className="rates-table-header">
                <div className="rate-cell role-cell">Role</div>
                <div className="rate-cell">Regular</div>
                <div className="rate-cell">Overtime</div>
              </div>

              {LABOR_ROLES.map(role => {
                const rateData = laborRates[activeWorkType]?.[jobType]?.[role] || { regular: '', overtime: '' }

                return (
                  <div key={role} className="rates-table-row">
                    <div className="rate-cell role-cell">{formatRole(role)}</div>
                    <div className="rate-cell">
                      {editingRates ? (
                        <div className="rate-input-inline">
                          <span>$</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={rateData.regular}
                            onChange={(e) => updateRate(activeWorkType, jobType, role, 'regular', e.target.value.replace(/[^0-9.]/g, ''))}
                            placeholder="0"
                          />
                          <span>/hr</span>
                        </div>
                      ) : (
                        <span className="rate-value">${parseFloat(rateData.regular) || 0}/hr</span>
                      )}
                    </div>
                    <div className="rate-cell">
                      {editingRates ? (
                        <div className="rate-input-inline">
                          <span>$</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={rateData.overtime}
                            onChange={(e) => updateRate(activeWorkType, jobType, role, 'overtime', e.target.value.replace(/[^0-9.]/g, ''))}
                            placeholder="0"
                          />
                          <span>/hr</span>
                        </div>
                      ) : (
                        <span className="rate-value ot">${parseFloat(rateData.overtime) || 0}/hr</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
