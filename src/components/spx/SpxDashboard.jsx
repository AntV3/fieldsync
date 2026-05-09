/**
 * SpxDashboard — Screen 1: Main Dashboard
 *
 * Layout (top to bottom):
 *  - NavBar (fixed 56px top)
 *  - StatusBar (date, projects, crews, CORs, alerts)
 *  - KPI card row (4-up: Projects Active, Total SF, Open CORs $, Alerts)
 *  - Project list/table
 *  - Right sidebar: Activity feed + recent updates (desktop)
 *  - MobileTabBar (fixed bottom, mobile only)
 */
import { useState, useEffect } from 'react'
import {
  FileText, Users, HardHat, AlertTriangle, CheckCircle,
  Clock, ArrowUpRight, Plus, Filter
} from 'lucide-react'

import NavBar from './NavBar'
import MobileTabBar from './MobileTabBar'
import StatusBar from './StatusBar'
import KPICard from './KPICard'
import ProjectTable from './ProjectTable'
import Card from './Card'
import ActivityItem from './ActivityItem'
import AlertRow from './AlertRow'
import Button from './Button'

// ── Mock Data ──────────────────────────────────────────────

const MOCK_PROJECTS = [
  { id: '1', name: 'Market Street Tower Demo', gc: 'Turner Construction', phase: 'Demolition', status: 'Active', lastUpdated: '2026-03-10 08:42' },
  { id: '2', name: 'Bayshore Mall Strip-Out', gc: 'Webcor Builders', phase: 'Abatement', status: 'In-Progress', lastUpdated: '2026-03-10 07:15' },
  { id: '3', name: 'Civic Center Renovation', gc: 'Swinerton', phase: 'Pre-Construction', status: 'Pending', lastUpdated: '2026-03-09 16:30' },
  { id: '4', name: 'Oak Park Industrial Demo', gc: 'DPR Construction', phase: 'Closeout', status: 'Complete', lastUpdated: '2026-03-08 14:22' },
  { id: '5', name: 'Marina District Gut Reno', gc: 'Hathaway Dinwiddie', phase: 'Selective Demo', status: 'Active', lastUpdated: '2026-03-10 09:05' },
  { id: '6', name: 'SoMa Office Decommission', gc: 'Plant Construction', phase: 'Planning', status: 'Draft', lastUpdated: '2026-03-07 11:00' },
  { id: '7', name: 'Embarcadero Seismic Retrofit', gc: 'Clark Construction', phase: 'Demolition', status: 'At-Risk', lastUpdated: '2026-03-10 06:48' },
  { id: '8', name: 'Presidio Barracks Abatement', gc: 'Nibbi Brothers', phase: 'Abatement', status: 'Blocked', lastUpdated: '2026-03-09 09:30' },
]

const MOCK_ACTIVITY = [
  { icon: CheckCircle, title: 'Daily report submitted', detail: 'Market Street Tower — Crew A', timestamp: '09:05' },
  { icon: FileText, title: 'COR #0047 approved', detail: 'Bayshore Mall — $12,400 additional demo', timestamp: '08:42' },
  { icon: Users, title: 'Crew B checked in', detail: 'Marina District Gut Reno — 6 workers', timestamp: '08:15' },
  { icon: AlertTriangle, title: 'Safety hold issued', detail: 'Embarcadero Seismic — Structural concern', timestamp: '07:50' },
  { icon: HardHat, title: 'Equipment deployed', detail: 'Oak Park — CAT 336F dispatched', timestamp: '07:30' },
  { icon: Clock, title: 'Schedule updated', detail: 'Civic Center — Phase 2 pushed to April', timestamp: '07:15' },
  { icon: FileText, title: 'Photo log uploaded', detail: 'Market Street Tower — 24 new photos', timestamp: '06:48' },
  { icon: ArrowUpRight, title: 'Budget variance alert', detail: 'Bayshore Mall — 8% over on labor', timestamp: '06:30' },
]

const MOCK_ALERTS = [
  { severity: 'critical', title: 'Structural concern — immediate hold', detail: 'Load-bearing wall flagged during demo. Engineer review required before proceeding.', project: 'Embarcadero Seismic Retrofit', timestamp: '07:50' },
  { severity: 'warning', title: 'Permit expiration in 3 days', detail: 'Demolition permit expires 03/13. Renewal application not yet submitted.', project: 'Presidio Barracks Abatement', timestamp: '06:30' },
  { severity: 'warning', title: 'Labor budget 8% over projection', detail: 'Current burn rate will exceed approved budget by end of week.', project: 'Bayshore Mall Strip-Out', timestamp: '06:30' },
  { severity: 'info', title: 'Inspection scheduled for tomorrow', detail: 'City inspector confirmed for 03/11 at 10:00 AM.', project: 'Market Street Tower Demo', timestamp: '05:45' },
]

function formatDateTime() {
  const now = new Date()
  return now.toLocaleDateString('en-US', {
    weekday: 'short', year: 'numeric', month: 'short', day: '2-digit',
  }) + ' \u2014 ' + now.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

export default function SpxDashboard() {
  const [dateTime, setDateTime] = useState(formatDateTime())

  useEffect(() => {
    const interval = setInterval(() => setDateTime(formatDateTime()), 60_000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <NavBar activePath="/v2" />

      {/* Push content below fixed navbar */}
      <div className="pt-[56px] pb-[80px] md:pb-0">

        {/* Status Bar */}
        <StatusBar
          projectCount={8}
          activeCrews={12}
          openCORs={5}
          openAlerts={MOCK_ALERTS.filter(a => a.severity === 'critical').length}
          dateTime={dateTime}
        />

        {/* Main Content */}
        <div className="max-w-[1280px] mx-auto px-[24px] py-[32px]">

          {/* KPI Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[16px] mb-[32px]">
            <KPICard
              label="Projects Active"
              value="08"
              delta="+2 this month"
              deltaDirection="up"
              accent="blue"
            />
            <KPICard
              label="Total SF in Progress"
              value="00,284,600"
              delta="+12,400 SF this week"
              deltaDirection="up"
              accent="green"
            />
            <KPICard
              label="Open Change Orders"
              value="$00,847,200"
              delta="5 pending approval"
              accent="amber"
            />
            <KPICard
              label="Alerts"
              value="04"
              delta="1 critical"
              deltaDirection="down"
              accent="red"
            />
          </div>

          {/* Two-column layout: Projects + Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-[24px]">

            {/* Left: Projects */}
            <div>
              {/* Section Header */}
              <div className="flex items-center justify-between mb-[16px]">
                <h2 className="text-spx-h3">Projects</h2>
                <div className="flex items-center gap-[12px]">
                  <Button variant="ghost" className="!py-[8px] !px-[16px] !text-[12px]">
                    <Filter size={14} strokeWidth={1.5} className="mr-[8px]" />
                    Filter
                  </Button>
                  <Button className="!py-[8px] !px-[16px] !text-[12px]">
                    <Plus size={14} strokeWidth={1.5} className="mr-[8px]" />
                    New Project
                  </Button>
                </div>
              </div>

              {/* Project Table */}
              <Card className="!p-0 overflow-hidden">
                <ProjectTable projects={MOCK_PROJECTS} />
              </Card>
            </div>

            {/* Right: Activity Feed + Alerts */}
            <div className="flex flex-col gap-[24px]">

              {/* Activity Feed */}
              <Card>
                <h3 className="text-spx-h3 mb-[16px]">Today's Activity</h3>
                <div className="flex flex-col">
                  {MOCK_ACTIVITY.map((item, i) => (
                    <ActivityItem
                      key={i}
                      icon={item.icon}
                      title={item.title}
                      detail={item.detail}
                      timestamp={item.timestamp}
                    />
                  ))}
                </div>
              </Card>

              {/* Recent Alerts */}
              <Card className="!p-0 overflow-hidden">
                <div className="px-[24px] pt-[24px] pb-[16px]">
                  <h3 className="text-spx-h3">Recent Alerts</h3>
                </div>
                {MOCK_ALERTS.map((alert, i) => (
                  <AlertRow
                    key={i}
                    severity={alert.severity}
                    title={alert.title}
                    detail={alert.detail}
                    project={alert.project}
                    timestamp={alert.timestamp}
                    onDismiss={() => {}}
                  />
                ))}
              </Card>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Bottom Tab Bar */}
      <MobileTabBar activePath="/v2" alertCount={MOCK_ALERTS.filter(a => a.severity === 'critical').length} />
    </div>
  )
}
