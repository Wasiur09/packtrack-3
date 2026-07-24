/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Submission, User } from '../types';
import { pendingFor } from '../shared/constants';

interface ReviewQueueProps {
  user: User;
  submissions: Submission[];
  onOpenReview: (id: string) => void;
  onOpenDetail: (id: string) => void;
}

export default function ReviewQueue({
  user,
  submissions,
  onOpenReview,
  onOpenDetail
}: ReviewQueueProps) {
  const [q, setQ] = useState('');
  const [country, setCountry] = useState('');
  const [plant, setPlant] = useState('');
  const [priority, setPriority] = useState('');

  // 1. Get base queue pending for current user
  const baseTasks = pendingFor(user, submissions);

  // 2. Identify available filter fields based on user role
  const showPlantSelect = user.role === 'IB-CO' || user.role === 'IB-SH';
  const showCountrySelect = user.role === 'IB-CO' || user.role === 'IB-SH' || user.role === 'IRA-GA';

  // Extract unique countries from available items for selection
  const countries = [...new Set(submissions.map(s => s.country))].sort();

  // 3. Apply active filters
  const filteredTasks = baseTasks.filter(s => {
    if (q && !(s.product.toLowerCase().includes(q.toLowerCase()) || s.id.toLowerCase().includes(q.toLowerCase()))) return false;
    if (country && s.country !== country) return false;
    if (plant && s.plant !== plant) return false;
    if (priority && s.priority !== priority) return false;
    return true;
  });

  const clearFilters = () => {
    setQ('');
    setCountry('');
    setPlant('');
    setPriority('');
  };

  return (
    <div className="font-sans">
      {/* Filter Bar */}
      <div className="bg-surface border border-border p-4 rounded mb-6 flex flex-wrap gap-3 items-center">
        <input
          type="text"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search by ID or product..."
          className="bg-surface-hover border border-border text-text-main px-3 py-2 rounded text-xs focus:border-accent outline-none flex-1 min-w-[200px]"
        />

        {showCountrySelect && (
          <select
            value={country}
            onChange={e => setCountry(e.target.value)}
            className="bg-surface-hover border border-border text-text-main px-3 py-2 rounded text-xs focus:border-accent outline-none cursor-pointer"
          >
            <option value="">All Countries</option>
            {countries.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}

        {showPlantSelect && (
          <select
            value={plant}
            onChange={e => setPlant(e.target.value)}
            className="bg-surface-hover border border-border text-text-main px-3 py-2 rounded text-xs focus:border-accent outline-none cursor-pointer"
          >
            <option value="">All Plants</option>
            <option value="Shampur">Shampur</option>
            <option value="Gachha">Gachha</option>
          </select>
        )}

        <select
          value={priority}
          onChange={e => setPriority(e.target.value)}
          className="bg-surface-hover border border-border text-text-main px-3 py-2 rounded text-xs focus:border-accent outline-none cursor-pointer"
        >
          <option value="">All Priorities</option>
          <option value="Urgent">Urgent</option>
          <option value="Medium">Medium</option>
          <option value="Normal">Normal</option>
        </select>

        <button
          onClick={clearFilters}
          className="ml-auto text-text-muted hover:text-accent font-mono text-[10px] uppercase tracking-wide px-2 py-1 border border-border/60 rounded hover:border-accent transition-all"
        >
          Clear
        </button>
      </div>

      {/* Queue list */}
      {baseTasks.length === 0 ? (
        <div className="bg-surface border border-border rounded p-16 text-center text-text-dim font-mono text-xs">
          ✓ Your review queue is completely empty. Excellent work!
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="bg-surface border border-border rounded p-16 text-center text-text-dim font-mono text-xs">
          No pending tasks match your active filters.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {filteredTasks.map(s => {
            const unreadCount = 0; // standard chat indicators handled inside modal, or pass count in parent
            const lastMsg = s.chat && s.chat.length > 0 ? s.chat[s.chat.length - 1] : null;

            const priClass = {
              Urgent: 'bg-brand-red/10 text-brand-red border border-brand-red/20',
              Medium: 'bg-brand-purple/10 text-brand-purple border border-brand-purple/20',
              Normal: 'bg-brand-blue/10 text-brand-blue border border-brand-blue/20'
            }[s.priority];

            const isMyTurn = s.currentStage === user.role && s.status === 'In Progress';

            return (
              <div
                key={s.id}
                className={`bg-surface border border-border p-6 rounded relative transition-all duration-200 border-l-3 ${
                  s.priority === 'Urgent'
                    ? 'border-l-brand-red'
                    : s.priority === 'Medium'
                    ? 'border-l-brand-purple'
                    : 'border-l-border'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="tid">{s.id}</span>
                    <span className="text-base font-semibold text-text-main">{s.product}</span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded font-mono ${priClass}`}>
                      {s.priority}
                    </span>
                    {s.status === 'Correction' && (
                      <span className="text-[10px] font-mono font-semibold bg-brand-red/15 text-brand-red border border-brand-red/35 px-2 py-0.5 rounded">
                        Correction Note
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {isMyTurn ? (
                      <button
                        onClick={() => onOpenReview(s.id)}
                        className="bg-accent hover:bg-accent-hover text-black px-4 py-2 rounded font-mono text-xs tracking-wider transition-all"
                      >
                        Open Review →
                      </button>
                    ) : (
                      <button
                        onClick={() => onOpenDetail(s.id)}
                        className="border border-border hover:border-accent text-text-muted hover:text-accent px-4 py-2 rounded font-mono text-xs tracking-wider transition-all"
                      >
                        Details
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
                  <div>
                    <div className="font-mono text-[9px] text-text-dim uppercase tracking-wider">Country</div>
                    <div className="text-text-main text-sm font-semibold mt-1">{s.country}</div>
                  </div>
                  <div>
                    <div className="font-mono text-[9px] text-text-dim uppercase tracking-wider">Plant</div>
                    <div className="text-text-main text-sm mt-1">
                      <span className="px-2 py-0.5 font-mono text-[11px] bg-surface-hover border border-border rounded">
                        {s.plant}
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className="font-mono text-[9px] text-text-dim uppercase tracking-wider">Purpose</div>
                    <div className="text-text-main text-sm font-semibold mt-1">{s.purpose}</div>
                  </div>
                  <div>
                    <div className="font-mono text-[9px] text-text-dim uppercase tracking-wider">Components</div>
                    <div className="text-text-muted text-xs mt-1 truncate" title={s.components.join(', ')}>
                      {s.components.join(', ')}
                    </div>
                  </div>
                </div>

                <div className="mt-4 bg-surface-hover/50 p-2.5 rounded text-xs font-mono text-text-dim flex items-center justify-between">
                  <span>File: {s.filename}</span>
                  <span>Submitted {new Date(s.submittedAt).toLocaleDateString()}</span>
                </div>

                {s.correctionNote && (
                  <div className="mt-3 bg-brand-red/5 border border-brand-red/15 rounded p-3 text-xs text-brand-red">
                    <strong>Correction Required:</strong> {s.correctionNote}
                  </div>
                )}

                {lastMsg && (
                  <div className="mt-3 bg-brand-blue/5 border border-brand-blue/15 rounded p-3 text-xs text-text-muted flex items-start gap-3">
                    <span className="w-5 h-5 rounded-full bg-brand-blue/20 text-brand-blue font-mono font-bold flex items-center justify-center text-[10px] flex-shrink-0">
                      {lastMsg.by.charAt(0)}
                    </span>
                    <div>
                      <span className="font-semibold text-text-main">{lastMsg.by}: </span>
                      <span className="italic">"{lastMsg.text}"</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
