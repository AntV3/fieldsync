import { HardHat, Copy, Clock, AlertCircle, Loader2 } from 'lucide-react'
import WorkerRow from './WorkerRow'
import BatchHoursModal from './BatchHoursModal'

/**
 * CrewHoursStep - Step 2: Worker sections, batch hours, crew selection.
 *
 * Props:
 *  - supervision, setSupervision
 *  - operators, setOperators
 *  - laborers, setLaborers
 *  - dynamicWorkers, setDynamicWorkers
 *  - activeLaborClassIds, setActiveLaborClassIds
 *  - laborCategories, laborClasses
 *  - hasCustomLaborClasses, loadingLaborClasses
 *  - todaysCrew
 *  - showBatchHoursModal, setShowBatchHoursModal
 *  - batchHours, setBatchHours
 *  - loadingPreviousCrew
 *  - namedWorkers, workersWithHours, workersNeedingHours
 *  - totalRegHours, totalOTHours
 *  - onLoadPreviousCrew, onApplyBatchHours, onApplyInlinePreset
 *  - onAddCrewWorker: (worker) => void - handles adding a crew member to proper section
 *  - onActivateLaborClass, onDeactivateLaborClass
 *  - addSupervision, updateSupervision, removeSupervision
 *  - addOperator, updateOperator, removeOperator
 *  - addLaborer, updateLaborer, removeLaborer
 *  - addDynamicWorker, updateDynamicWorker, removeDynamicWorker
 *  - getInactiveLaborClasses
 *  - t, lang
 *  - onShowToast
 */
export default function CrewHoursStep({
  supervision, operators, laborers,
  dynamicWorkers,
  activeLaborClassIds, setActiveLaborClassIds,
  laborCategories, laborClasses,
  hasCustomLaborClasses, loadingLaborClasses,
  todaysCrew,
  showBatchHoursModal, setShowBatchHoursModal,
  batchHours, setBatchHours,
  loadingPreviousCrew,
  namedWorkers, workersNeedingHours,
  totalRegHours, totalOTHours,
  onLoadPreviousCrew, onApplyBatchHours, onApplyInlinePreset,
  onAddCrewWorker,
  onActivateLaborClass, onDeactivateLaborClass,
  addSupervision, updateSupervision, removeSupervision,
  addOperator, updateOperator, removeOperator,
  addLaborer, updateLaborer, removeLaborer,
  addDynamicWorker, updateDynamicWorker, removeDynamicWorker,
  getInactiveLaborClasses,
  t, lang,
  onShowToast
}) {
  const namedWorkerCount = namedWorkers.length

  return (
    <div className="tm-step-content">
      {/* Crew Summary Bar */}
      <div className="tm-crew-summary-bar">
        <div className="tm-summary-left">
          <span className="tm-summary-count">{namedWorkers.length}</span>
          <span className="tm-summary-label">{namedWorkers.length === 1 ? t('worker') : t('workers_plural')}</span>
        </div>
        <div className="tm-summary-middle">
          <span className="tm-summary-hours">{totalRegHours + totalOTHours}h</span>
          <span className="tm-summary-label">{lang === 'en' ? 'total' : 'total'}</span>
        </div>
        {workersNeedingHours > 0 && (
          <div className="tm-summary-warning">
            <AlertCircle size={14} />
            <span>{workersNeedingHours} {lang === 'en' ? 'need hours' : 'sin horas'}</span>
          </div>
        )}
      </div>

      {/* Quick Actions - Same as Yesterday + Time Presets */}
      <div className="tm-quick-actions-row">
        <button
          className="tm-quick-action"
          onClick={onLoadPreviousCrew}
          disabled={loadingPreviousCrew}
        >
          <Copy size={16} />
          <span>{loadingPreviousCrew ? (lang === 'en' ? 'Loading...' : 'Cargando...') : t('sameAsYesterday')}</span>
        </button>
        {namedWorkers.length > 0 && (
          <div className="tm-time-presets-inline">
            <button className="tm-preset-chip" onClick={() => onApplyInlinePreset('8hr')}>8h</button>
            <button className="tm-preset-chip" onClick={() => onApplyInlinePreset('10hr')}>10h</button>
            <button className="tm-preset-chip" onClick={() => onApplyInlinePreset('4hr')}>4h</button>
            <button className="tm-preset-chip more" onClick={() => setShowBatchHoursModal(true)} title={lang === 'en' ? 'Custom hours' : 'Horas personalizadas'}>
              <Clock size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Select from Today's Crew - Prominent */}
      {todaysCrew.length > 0 && (
        <div className="tm-crew-select-section">
          <div className="tm-section-header">
            <h4><HardHat size={16} /> {lang === 'en' ? "Select T&M Workers" : "Seleccionar Trabajadores T&M"}</h4>
            <span className="tm-section-hint">{lang === 'en' ? 'Tap to add' : 'Toca para agregar'}</span>
          </div>
          <div className="tm-crew-grid">
              {todaysCrew.map((worker, index) => {
                // Check if already added (in legacy or dynamic sections)
                const inLegacy =
                  supervision.some(s => s.name.toLowerCase() === worker.name.toLowerCase()) ||
                  operators.some(o => o.name.toLowerCase() === worker.name.toLowerCase()) ||
                  laborers.some(l => l.name.toLowerCase() === worker.name.toLowerCase())
                const inDynamic = Object.values(dynamicWorkers).some(workers =>
                  workers.some(w => w.name.toLowerCase() === worker.name.toLowerCase())
                )
                const isAdded = inLegacy || inDynamic

                return (
                  <button
                    key={index}
                    className={`tm-crew-item ${isAdded ? 'added' : ''}`}
                    onClick={() => {
                      if (!isAdded) {
                        onAddCrewWorker(worker)
                      }
                    }}
                    disabled={isAdded}
                  >
                    <span className="tm-crew-item-name">{worker.name}</span>
                    <span className={`tm-crew-item-role ${(worker.role || 'laborer').toLowerCase()}`}>
                      {worker.role || 'Laborer'}
                    </span>
                    {isAdded && <span className="tm-crew-item-check">{'\u2713'}</span>}
                  </button>
                )
              })}
          </div>
        </div>
      )}

      {/* Dynamic Labor Classes (when company has custom classes) */}
      {/* Only show labor classes that are active (from crew check-in or manually added) */}
      {hasCustomLaborClasses && !loadingLaborClasses && (
        <>
          {/* Render active labor classes grouped by category */}
          {laborCategories.map(category => {
            // Only show classes in this category that are active
            const activeCategoryClasses = laborClasses.filter(
              lc => lc.category_id === category.id && activeLaborClassIds.has(lc.id)
            )
            if (activeCategoryClasses.length === 0) return null
            return (
              <div key={category.id} className="tm-labor-category-section">
                <div className="tm-category-header">{category.name}</div>
                {activeCategoryClasses.map(laborClass => (
                  <div key={laborClass.id} className="tm-field">
                    <div className="tm-field-header">
                      <label>{laborClass.name}</label>
                      <button
                        type="button"
                        className="tm-remove-class-btn"
                        onClick={() => onDeactivateLaborClass(laborClass.id)}
                        title={lang === 'en' ? 'Remove this labor class' : 'Eliminar esta clase'}
                      >
                        {'\u00d7'}
                      </button>
                    </div>
                    <div className="tm-workers-list">
                      {(dynamicWorkers[laborClass.id] || []).map((worker, idx) => (
                        <WorkerRow
                          key={idx}
                          worker={worker}
                          index={idx}
                          onUpdate={(i, field, value) => updateDynamicWorker(laborClass.id, i, field, value)}
                          onRemove={(i) => removeDynamicWorker(laborClass.id, i)}
                          t={t}
                        />
                      ))}
                    </div>
                    <button className="tm-add-btn" onClick={() => addDynamicWorker(laborClass.id)}>
                      + {lang === 'en' ? 'Add' : 'Agregar'} {laborClass.name}
                    </button>
                  </div>
                ))}
              </div>
            )
          })}

          {/* Active classes without category */}
          {laborClasses.filter(lc => !lc.category_id && activeLaborClassIds.has(lc.id)).map(laborClass => (
            <div key={laborClass.id} className="tm-field">
              <div className="tm-field-header">
                <label>{laborClass.name}</label>
                <button
                  type="button"
                  className="tm-remove-class-btn"
                  onClick={() => onDeactivateLaborClass(laborClass.id)}
                  title={lang === 'en' ? 'Remove this labor class' : 'Eliminar esta clase'}
                >
                  {'\u00d7'}
                </button>
              </div>
              <div className="tm-workers-list">
                {(dynamicWorkers[laborClass.id] || []).map((worker, idx) => (
                  <WorkerRow
                    key={idx}
                    worker={worker}
                    index={idx}
                    onUpdate={(i, field, value) => updateDynamicWorker(laborClass.id, i, field, value)}
                    onRemove={(i) => removeDynamicWorker(laborClass.id, i)}
                    t={t}
                  />
                ))}
              </div>
              <button className="tm-add-btn" onClick={() => addDynamicWorker(laborClass.id)}>
                + {lang === 'en' ? 'Add' : 'Agregar'} {laborClass.name}
              </button>
            </div>
          ))}

          {/* Add Labor Class dropdown - shows classes not yet active */}
          {getInactiveLaborClasses().length > 0 && (
            <div className="tm-add-labor-class-section">
              <select
                className="tm-add-labor-class-select"
                value=""
                onChange={(e) => {
                  if (e.target.value) {
                    onActivateLaborClass(e.target.value)
                  }
                }}
              >
                <option value="">
                  + {lang === 'en' ? 'Add Labor Class...' : 'Agregar Clase de Trabajo...'}
                </option>
                {laborCategories.map(category => {
                  const inactiveInCategory = getInactiveLaborClasses().filter(lc => lc.category_id === category.id)
                  if (inactiveInCategory.length === 0) return null
                  return (
                    <optgroup key={category.id} label={category.name}>
                      {inactiveInCategory.map(lc => (
                        <option key={lc.id} value={lc.id}>{lc.name}</option>
                      ))}
                    </optgroup>
                  )
                })}
                {/* Uncategorized classes */}
                {getInactiveLaborClasses().filter(lc => !lc.category_id).length > 0 && (
                  <optgroup label={lang === 'en' ? 'Other' : 'Otros'}>
                    {getInactiveLaborClasses().filter(lc => !lc.category_id).map(lc => (
                      <option key={lc.id} value={lc.id}>{lc.name}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
          )}

          {/* Empty state - no labor classes active yet */}
          {activeLaborClassIds.size === 0 && (
            <div className="tm-no-labor-classes">
              <p>
                {lang === 'en'
                  ? 'No labor classes added yet. Select from crew check-in above or add manually:'
                  : 'No hay clases de trabajo agregadas. Seleccione del check-in o agregue manualmente:'
                }
              </p>
            </div>
          )}
        </>
      )}

      {/* Loading indicator for labor classes */}
      {loadingLaborClasses && (
        <div className="tm-loading-labor-classes">
          <Loader2 size={20} className="tm-spinner" />
          <span>{lang === 'en' ? 'Loading labor classes...' : 'Cargando clases de trabajo...'}</span>
        </div>
      )}

      {/* Hardcoded Worker Sections (fallback when no custom classes) */}
      {!hasCustomLaborClasses && !loadingLaborClasses && (
        <>
          {/* Supervision Section */}
          <div className="tm-field">
            <label>{t('supervision')}</label>
            <div className="tm-workers-list">
              {supervision.map((sup, index) => (
                <WorkerRow
                  key={index}
                  worker={sup}
                  index={index}
                  onUpdate={updateSupervision}
                  onRemove={removeSupervision}
                  t={t}
                  roleSelect={
                    <div className="tm-role-select">
                      <select
                        value={sup.role}
                        onChange={(e) => updateSupervision(index, 'role', e.target.value)}
                      >
                        <option value="Foreman">{t('foreman')}</option>
                        <option value="Superintendent">{t('superintendent')}</option>
                      </select>
                    </div>
                  }
                />
              ))}
            </div>
            <button className="tm-add-btn" onClick={addSupervision}>
              {t('addSupervision')}
            </button>
          </div>

          {/* Operators Section */}
          <div className="tm-field">
            <label>{t('operators')}</label>
            <div className="tm-workers-list">
              {operators.map((operator, index) => (
                <WorkerRow
                  key={index}
                  worker={operator}
                  index={index}
                  onUpdate={updateOperator}
                  onRemove={removeOperator}
                  t={t}
                />
              ))}
            </div>
            <button className="tm-add-btn" onClick={addOperator}>
              {t('addOperator')}
            </button>
          </div>

          {/* Laborers Section */}
          <div className="tm-field">
            <label>{t('laborers')}</label>
            <div className="tm-workers-list">
              {laborers.map((laborer, index) => (
                <WorkerRow
                  key={index}
                  worker={laborer}
                  index={index}
                  onUpdate={updateLaborer}
                  onRemove={removeLaborer}
                  t={t}
                />
              ))}
            </div>
            <button className="tm-add-btn" onClick={addLaborer}>
              {t('addLaborer')}
            </button>
          </div>
        </>
      )}

      {/* Batch Hours Modal */}
      {showBatchHoursModal && (
        <BatchHoursModal
          batchHours={batchHours}
          setBatchHours={setBatchHours}
          namedWorkerCount={namedWorkerCount}
          onApply={onApplyBatchHours}
          onClose={() => setShowBatchHoursModal(false)}
          t={t}
        />
      )}
    </div>
  )
}
