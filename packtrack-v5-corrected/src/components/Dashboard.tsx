/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { Submission, User, SystemProfile } from '../types';
import { pendingFor } from '../shared/constants';
import { emitToast } from './Toast';

interface DashboardProps {
  user: User;
  submissions: Submission[];
  onOpenReview: (id: string) => void;
  onOpenDetail: (id: string) => void;
  pendingCount: number;
}

interface AnalyticsData {
  system: SystemProfile;
  metrics: Array<{ id: string; timestamp: number; method: string; url: string; status: number; duration: number }>;
  p50: number;
  p90: number;
  p99: number;
  pageHits: { index: number; api: number };
}

export default function Dashboard({
  user,
  submissions,
  onOpenReview,
  onOpenDetail,
  pendingCount
}: DashboardProps) {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [showProfiling, setShowProfiling] = useState(false);

  // Poll analytics from server every 3 seconds for real-time profiling updates
  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const res = await fetch('/api/analytics');
        if (res.ok) {
          const data = await res.json();
          setAnalytics(data);
        }
      } catch (e) {
        console.error('Failed to poll server profiling metrics', e);
      }
    };

    fetchAnalytics();
    const interval = setInterval(fetchAnalytics, 3000);
    return () => clearInterval(interval);
  }, []);

  // Filter tasks belonging to current user
  const myTasks = pendingFor(user, submissions).slice(0, 10); // cap to 10 for dashboard screen density

  // General KPIs
  const totalActive = submissions.filter(s => s.status === 'In Progress' || s.status === 'Correction').length;
  const urgentCount = submissions.filter(s => s.priority === 'Urgent' && (s.status === 'In Progress' || s.status === 'Correction')).length;
  const correctionsCount = submissions.filter(s => s.status === 'Correction' || s.correctionRaised || s.memberFlaggedCorrection).length;
  const approved30Days = submissions.filter(s => s.status === 'Approved' && s.submittedAt > Date.now() - 30 * 24 * 3600000).length;

  // IB-CO dashboard: most recently approved artworks, newest first.
  const recentlyApproved = submissions
    .filter(s => s.status === 'Approved')
    .slice()
    .sort((a, b) => b.submittedAt - a.submittedAt)
    .slice(0, 6);

  // Render a responsive circular gauge
  const renderRingGauge = (percent: number, color: string, label: string, sub: string) => {
    const r = 40;
    const circ = 2 * Math.PI * r;
    const strokeDashoffset = circ - (percent / 100) * circ;

    return (
      <div className="bg-surface border border-border p-5 rounded flex items-center gap-5">
        <svg className="w-20 h-20 transform -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={r} className="stroke-surface-hover fill-none" strokeWidth="8" />
          <circle
            cx="50"
            cy="50"
            r={r}
            className="fill-none transition-all duration-500 ease-out"
            strokeWidth="8"
            stroke={color}
            strokeDasharray={circ}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
          />
          <text
            x="50"
            y="-45"
            transform="rotate(90)"
            textAnchor="middle"
            className="fill-text-main font-display text-2xl font-bold"
          >
            {Math.round(percent)}%
          </text>
        </svg>
        <div>
          <div className="font-mono text-[10px] text-text-muted uppercase tracking-wider">{label}</div>
          <div className="text-text-main text-lg font-semibold mt-1">{sub}</div>
        </div>
      </div>
    );
  };

  // Render SVG area chart representing request logs durations
  const renderLatencyChart = () => {
    if (!analytics || analytics.metrics.length === 0) {
      return <div className="text-text-dim text-xs font-mono p-10 text-center">No telemetry logs available. Send api requests to profile server.</div>;
    }

    const data = analytics.metrics;
    const maxVal = Math.max(...data.map(m => m.duration), 50); // cap floor to 50ms for scaling
    const w = 500;
    const h = 120;
    const padding = 15;

    const points = data.map((m, idx) => {
      const x = padding + (idx / (data.length - 1)) * (w - padding * 2);
      const y = h - padding - (m.duration / maxVal) * (h - padding * 2);
      return `${x},${y}`;
    }).join(' ');

    const fillPoints = `${padding},${h - padding} ${points} ${w - padding},${h - padding}`;

    return (
      <div className="relative">
        <svg className="w-full h-[120px] overflow-visible" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
          <defs>
            <linearGradient id="latencyGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-brand-blue)" stopOpacity="0.3" />
              <stop offset="100%" stopColor="var(--color-brand-blue)" stopOpacity="0.0" />
            </linearGradient>
          </defs>
          {/* Grid lines */}
          <line x1={padding} y1={padding} x2={w - padding} y2={padding} className="stroke-border/30" strokeDasharray="3 3" />
          <line x1={padding} y1={h / 2} x2={w - padding} y2={h / 2} className="stroke-border/30" strokeDasharray="3 3" />
          <line x1={padding} y1={h - padding} x2={w - padding} y2={h - padding} className="stroke-border/50" />

          {/* Area Fill */}
          <polygon points={fillPoints} fill="url(#latencyGrad)" />

          {/* Core Line */}
          <polyline points={points} className="stroke-brand-blue fill-none" strokeWidth="2" strokeLinecap="round" />

          {/* Data Points on Hover */}
          {data.map((m, idx) => {
            const x = padding + (idx / (data.length - 1)) * (w - padding * 2);
            const y = h - padding - (m.duration / maxVal) * (h - padding * 2);
            return (
              <circle
                key={m.id}
                cx={x}
                cy={y}
                r="3"
                className="fill-accent stroke-surface hover:r-5 cursor-pointer"
                strokeWidth="1.5"
              >
                <title>{`${m.method} ${m.url}\nLatency: ${m.duration}ms\nStatus: ${m.status}`}</title>
              </circle>
            );
          })}
        </svg>
        <div className="flex justify-between font-mono text-[9px] text-text-dim px-2 mt-2">
          <span>Oldest Log</span>
          <span>Latency Over Time (Server Telemetry)</span>
          <span>Latest Log</span>
        </div>
      </div>
    );
  };

  return (
    <div className="font-sans">
      {/* Role Banner */}
      <div className="bg-gradient-to-br from-accent/5 to-accent-dark/5 border border-border border-l-3 border-l-accent p-5 rounded mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="font-display text-2xl text-text-main tracking-wider uppercase">{user.role} DASHBOARD</div>
          <div className="font-mono text-[10px] text-text-muted mt-1 uppercase tracking-wider">
            {user.role === 'IB-CO' ? 'Head Office — Global Operations Control' : 'Plant-Level Regional Workflow Node'}
          </div>
        </div>
        <div className="font-mono text-[10px] text-text-muted md:text-right leading-relaxed">
          <div>Logged in as <span className="text-accent font-semibold">{user.name}</span></div>
          <div>All sessions are secured under corporate Google auth</div>
        </div>
      </div>

      {/* Traditional KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-surface border border-border p-5 rounded border-t-2 border-t-accent">
          <div className="font-mono text-[9px] text-text-muted uppercase tracking-widest">Total Active</div>
          <div className="font-display text-4xl text-text-main mt-2 leading-none">{totalActive}</div>
          <div className="font-mono text-[10px] text-text-dim mt-2">in-flight packaging jobs</div>
        </div>
        <div className="bg-surface border border-border p-5 rounded border-t-2 border-t-brand-red">
          <div className="font-mono text-[9px] text-text-muted uppercase tracking-widest">Urgent Open</div>
          <div className="font-display text-4xl text-brand-red mt-2 leading-none">{urgentCount}</div>
          <div className="font-mono text-[10px] text-text-dim mt-2">requires immediate sign-off</div>
        </div>
        <div className="bg-surface border border-border p-5 rounded border-t-2 border-t-brand-blue">
          <div className="font-mono text-[9px] text-text-muted uppercase tracking-widest">Corrections</div>
          <div className="font-display text-4xl text-brand-blue mt-2 leading-none">{correctionsCount}</div>
          <div className="font-mono text-[10px] text-text-dim mt-2">sent back for IB revisions</div>
        </div>
        <div className="bg-surface border border-border p-5 rounded border-t-2 border-t-brand-green">
          <div className="font-mono text-[9px] text-text-muted uppercase tracking-widest">Approved (30d)</div>
          <div className="font-display text-4xl text-brand-green mt-2 leading-none">{approved30Days}</div>
          <div className="font-mono text-[10px] text-text-dim mt-2">permanently archived</div>
        </div>
      </div>

      {/* Server Profiling and Telemetry Panel Toggle */}
      <div className="bg-surface border border-border p-4 rounded mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="font-mono text-[10px] text-accent uppercase tracking-widest font-bold">SERVER PROFILING & REAL-TIME ANALYTICS</div>
          <div className="text-text-muted text-xs mt-1">Live telemetry monitoring CPU, memory load, uptime, and API latency percentiles</div>
        </div>
        <button
          onClick={() => setShowProfiling(!showProfiling)}
          className="bg-surface-hover border border-border hover:border-accent hover:text-accent text-text-main px-4 py-2 rounded text-xs font-mono tracking-wide transition-all"
        >
          {showProfiling ? 'Hide Telemetry Panel' : 'Show Telemetry Panel'}
        </button>
      </div>

      {showProfiling && analytics && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 animate-fade-in">
          {/* Ring Gauges */}
          {renderRingGauge(analytics.system.cpuUsage, 'var(--color-accent)', 'CPU Usage', `Uptime: ${analytics.system.uptime}s`)}
          {renderRingGauge(
            (analytics.system.memoryUsed / analytics.system.memoryTotal) * 100,
            'var(--color-brand-purple)',
            'Memory Allocation',
            `${analytics.system.memoryUsed}MB / ${analytics.system.memoryTotal}MB`
          )}
          <div className="bg-surface border border-border p-5 rounded flex flex-col justify-between">
            <div>
              <div className="font-mono text-[10px] text-text-muted uppercase tracking-wider">API LATENCY PROFILE</div>
              <div className="grid grid-cols-3 gap-2 mt-3">
                <div className="text-center bg-surface-hover p-2 border border-border/30 rounded">
                  <div className="font-mono text-[9px] text-text-dim">P50</div>
                  <div className="text-brand-green font-display text-lg font-bold mt-1">{analytics.p50}ms</div>
                </div>
                <div className="text-center bg-surface-hover p-2 border border-border/30 rounded">
                  <div className="font-mono text-[9px] text-text-dim">P90</div>
                  <div className="text-accent font-display text-lg font-bold mt-1">{analytics.p90}ms</div>
                </div>
                <div className="text-center bg-surface-hover p-2 border border-border/30 rounded">
                  <div className="font-mono text-[9px] text-text-dim">P99</div>
                  <div className="text-brand-red font-display text-lg font-bold mt-1">{analytics.p99}ms</div>
                </div>
              </div>
            </div>
            <div className="font-mono text-[9px] text-text-muted flex justify-between mt-3">
              <span>Active Sessions: {analytics.system.activeSessions}</span>
              <span>Total API Hits: {analytics.system.totalRequests}</span>
            </div>
          </div>

          {/* Latency History Chart */}
          <div className="bg-surface border border-border p-5 rounded md:col-span-3">
            <div className="flex justify-between items-center mb-4">
              <div className="font-mono text-[10px] text-text-muted uppercase tracking-wider">REAL-TIME REQUEST PROFILER</div>
              <span className="text-[10px] font-mono bg-brand-blue/15 text-brand-blue px-2 py-0.5 rounded">LIVE STATS</span>
            </div>
            {renderLatencyChart()}
          </div>
        </div>
      )}

      {/* Recently Approved Artworks — IB-CO only, most recent first */}
      {user.role === 'IB-CO' && (
        <div className="bg-surface border border-border rounded overflow-hidden mb-6 border-t-2 border-t-brand-green">
          <div className="p-5 border-b border-border flex justify-between items-center">
            <div>
              <div className="font-display text-xl text-text-main tracking-wide">RECENTLY APPROVED ARTWORKS</div>
              <div className="font-mono text-[9px] text-text-muted mt-1 uppercase tracking-wider">
                Fully signed-off &amp; archived · newest first
              </div>
            </div>
            <span className="text-[10px] font-mono bg-brand-green/10 text-brand-green border border-brand-green/20 px-2 py-0.5 rounded uppercase tracking-wide">
              {recentlyApproved.length} shown
            </span>
          </div>

          {recentlyApproved.length === 0 ? (
            <div className="p-10 text-center text-text-dim font-mono text-xs">
              No approved artworks yet — completed approvals will surface here.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
              {recentlyApproved.map(s => {
                const days = Math.max(0, Math.round((Date.now() - s.submittedAt) / 86400000));
                const when = days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days}d ago`;
                return (
                  <button
                    key={s.id}
                    onClick={() => onOpenDetail(s.id)}
                    className="text-left bg-surface-hover/40 hover:bg-surface-hover border border-border/60 hover:border-brand-green/50 rounded p-4 transition-all group"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="tid">{s.id}</span>
                      <span className="text-[9px] font-mono text-brand-green border border-brand-green/30 bg-brand-green/10 px-1.5 py-0.5 rounded uppercase">
                        ✓ Approved
                      </span>
                    </div>
                    <div className="text-sm font-semibold text-text-main truncate group-hover:text-brand-green transition-colors" title={s.product}>
                      {s.product}
                    </div>
                    <div className="font-mono text-[10px] text-text-muted mt-1">
                      {s.country} · {s.plant} · {s.purpose}
                    </div>
                    <div className="flex items-center justify-between mt-3 font-mono text-[9px] text-text-dim">
                      <span>{s.annotations?.filter(a => a.type === 'signature').length || 0} signatures</span>
                      <span>{when}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* My Tasks Table */}
      <div className="bg-surface border border-border rounded overflow-hidden">
        <div className="p-5 border-b border-border flex justify-between items-center">
          <div>
            <div className="font-display text-xl text-text-main tracking-wide">MY PENDING TASK QUEUE</div>
            <div className="font-mono text-[9px] text-text-muted mt-1 uppercase tracking-wider">
              {pendingCount} items waiting for your review sign-off
            </div>
          </div>
        </div>

        {myTasks.length === 0 ? (
          <div className="p-12 text-center text-text-dim font-mono text-xs">
            ✓ Excellent! Your department queue is completely clear.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-surface-hover text-text-muted font-mono uppercase text-[9px] tracking-wider border-b border-border">
                  <th className="p-3 pl-5">Tracking ID</th>
                  <th className="p-3">Product Name</th>
                  <th className="p-3">Country</th>
                  <th className="p-3">Plant</th>
                  <th className="p-3">Filing Type</th>
                  <th className="p-3">Priority</th>
                  <th className="p-3">Overall Status</th>
                  <th className="p-3">Age</th>
                  <th className="p-3 pr-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 text-text-muted">
                {myTasks.map(s => {
                  const subAge = Math.max(1, Math.round((Date.now() - s.submittedAt) / 3600000));
                  const ageText = subAge > 24 ? `${Math.round(subAge / 24)}d ago` : `${subAge}h ago`;

                  const priClass = {
                    Urgent: 'bg-brand-red/10 text-brand-red border border-brand-red/20',
                    Medium: 'bg-brand-purple/10 text-brand-purple border border-brand-purple/20',
                    Normal: 'bg-brand-blue/10 text-brand-blue border border-brand-blue/20'
                  }[s.priority];

                  const statusColor = {
                    'In Progress': 'bg-accent/10 text-accent border border-accent/20',
                    Correction: 'bg-brand-red/10 text-brand-red border border-brand-red/20',
                    Approved: 'bg-brand-green/10 text-brand-green border border-brand-green/20'
                  }[s.status];

                  const isReviewer = s.currentStage === user.role && s.status === 'In Progress';

                  return (
                    <tr key={s.id} className="hover:bg-surface-hover/30 transition-colors">
                      <td className="p-3 pl-5 font-mono">
                        <span className="tid">{s.id}</span>
                      </td>
                      <td className="p-3 font-semibold text-text-main">{s.product}</td>
                      <td className="p-3">{s.country}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 font-mono text-[10px] bg-surface-hover border border-border rounded">
                          {s.plant}
                        </span>
                      </td>
                      <td className="p-3 font-semibold">{s.purpose}</td>
                      <td className="p-3">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded font-mono ${priClass}`}>
                          {s.priority}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded font-mono ${statusColor}`}>
                          {s.status}
                        </span>
                        {s.correctionRaised && s.status !== 'Correction' && (
                          <span className="ml-1 text-[9px] font-semibold px-1.5 py-0.5 rounded font-mono bg-brand-red/10 text-brand-red border border-brand-red/30" title="Carries a correction raised upstream; travels forward and returns to IB-CO">
                            ⚠ CORR
                          </span>
                        )}
                        {s.memberFlaggedCorrection && (
                          <span className="ml-1 text-[9px] font-semibold px-1.5 py-0.5 rounded font-mono bg-accent/10 text-accent border border-accent/30" title="Member flagged a correction; awaiting head decision">
                            ✎ FLAG
                          </span>
                        )}
                      </td>
                      <td className="p-3 font-mono text-[10px] text-text-dim">{ageText}</td>
                      <td className="p-3 pr-5 text-right">
                        {isReviewer ? (
                          <button
                            onClick={() => onOpenReview(s.id)}
                            className="bg-accent hover:bg-accent-hover text-black px-3 py-1.5 rounded font-mono text-[10px] tracking-wide font-medium transition-all"
                          >
                            Review
                          </button>
                        ) : (
                          <button
                            onClick={() => onOpenDetail(s.id)}
                            className="border border-border hover:border-accent text-text-muted hover:text-accent px-3 py-1.5 rounded font-mono text-[10px] tracking-wide font-medium transition-all"
                          >
                            Details
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
