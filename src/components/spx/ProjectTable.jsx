/**
 * ProjectTable — Tabular project list with status badges and actions
 */
import { Eye, MoreHorizontal } from 'lucide-react'
import StatusBadge from './StatusBadge'

const COL_CLASSES = {
  name: 'flex-[2] min-w-0',
  gc: 'flex-1 min-w-0 hidden lg:block',
  phase: 'flex-1 min-w-0 hidden md:block',
  status: 'w-[120px] shrink-0',
  updated: 'w-[140px] shrink-0 hidden md:block',
  actions: 'w-[80px] shrink-0 flex justify-end',
}

function HeaderCell({ children, className }) {
  return (
    <div className={`text-[12px] uppercase tracking-spx-nav text-text-secondary font-normal ${className}`}>
      {children}
    </div>
  )
}

export default function ProjectTable({ projects = [], onView }) {
  const handleRowKeyDown = (e, projectId) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onView?.(projectId)
    }
  }

  return (
    <div className="w-full" role="table" aria-label="Projects">
      {/* Header */}
      <div className="flex items-center px-[24px] py-[12px] border-b border-border-default" role="row">
        <HeaderCell className={COL_CLASSES.name}>Project</HeaderCell>
        <HeaderCell className={COL_CLASSES.gc}>GC</HeaderCell>
        <HeaderCell className={COL_CLASSES.phase}>Phase</HeaderCell>
        <HeaderCell className={COL_CLASSES.status}>Status</HeaderCell>
        <HeaderCell className={COL_CLASSES.updated}>Last Updated</HeaderCell>
        <div className={COL_CLASSES.actions} />
      </div>

      {/* Rows */}
      {projects.map((project) => (
        <div
          key={project.id}
          role="row"
          tabIndex={0}
          aria-label={`Open ${project.name}`}
          className="flex items-center px-[24px] h-[56px] border-b border-border-muted hover:bg-bg-secondary transition-colors duration-100 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue"
          onClick={() => onView?.(project.id)}
          onKeyDown={(e) => handleRowKeyDown(e, project.id)}
        >
          <div className={`${COL_CLASSES.name} text-[14px] font-medium text-text-primary truncate`}>
            {project.name}
          </div>
          <div className={`${COL_CLASSES.gc} text-[13px] text-text-secondary truncate`}>
            {project.gc}
          </div>
          <div className={`${COL_CLASSES.phase} text-[13px] text-text-secondary uppercase tracking-spx-label truncate`}>
            {project.phase}
          </div>
          <div className={COL_CLASSES.status}>
            <StatusBadge status={project.status} />
          </div>
          <div className={`${COL_CLASSES.updated} text-[12px] text-text-secondary tabular-nums`}>
            {project.lastUpdated}
          </div>
          <div className={COL_CLASSES.actions}>
            <button
              type="button"
              aria-label={`View ${project.name}`}
              className="p-[8px] text-text-secondary hover:text-text-primary transition-colors duration-150"
              onClick={(e) => { e.stopPropagation(); onView?.(project.id) }}
            >
              <Eye size={16} strokeWidth={1.5} />
            </button>
            <button
              type="button"
              aria-label={`More options for ${project.name}`}
              className="p-[8px] text-text-secondary hover:text-text-primary transition-colors duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal size={16} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
