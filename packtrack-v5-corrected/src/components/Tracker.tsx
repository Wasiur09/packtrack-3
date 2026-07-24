/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { Submission, User } from '../types';

interface TrackerProps {
  user: User;
  submissions: Submission[];
  onOpenDetail: (id: string) => void;
  onOpenReview: (id: string) => void;
}

const DEPT_LABELS: Record<string, string> = {
  'IB-CO': 'IB Corporate Office', 'IB-SH': 'IB Shampur', 'QC-SH': 'QC Shampur',
  'IRA-SH': 'IRA Shampur', 'QCom-SH': 'QCom Shampur', 'PROD-SH': 'Production SH',
  'RnD-SH': 'R&D Shampur', 'IRA-GA': 'IRA Gachha', 'RnD-GA': 'R&D Gachha',
  'QC-GA': 'QC Gachha', 'QM-GA': 'QM Gachha', 'QCom-GA': 'QCom Gachha',
  'APPROVED': 'Approved'
};

export default function Tracker({
  user,
  submissions,
  onOpenDetail,
  onOpenReview
}: TrackerProps) {
  const [q, setQ] = useState('');
  const [country, setCountry] = useState('');
  const [plant, setPlant] = useState('');
  const [status, setStatus] = useState('');
  const [perPage, setPerPage] = useState(50);
  const [page, setPage] = useState(1);

  // Extract unique countries
  const countries = [...new Set(submissions.map(s => s.country))].sort();

  // Apply filters, then order most-recent first (newest submissions on top).
  const filtered = submissions
    .filter(s => {
      if (q && !(s.product.toLowerCase().includes(q.toLowerCase()) || s.id.toLowerCase().includes(q.toLowerCase()))) return false;
      if (country && s.country !== country) return false;
      if (plant && s.plant !== plant) return false;
      if (status && s.status !== status) return false;
      return true;
    })
    .slice()
    .sort((a, b) => b.submittedAt - a.submittedAt);

  // Pagination — recompute pages whenever the filtered set or page size changes.
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  useEffect(() => { setPage(1); }, [q, country, plant, status, perPage]);
  const pageClamped = Math.min(page, totalPages);
  const pageRows = filtered.slice((pageClamped - 1) * perPage, pageClamped * perPage);

  const clearFilters = () => {
    setQ('');
    setCountry('');
    setPlant('');
    setStatus('');
  };

  return (
    <div className="font-sans">
      {/* Filter Bar */}
      <div className="bg-surface border border-border p-4 rounded mb-6 flex flex-wrap gap-3 items-center">
        <input
          type="text"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search by product name, ID..."
          className="bg-surface-hover border border-border text-text-main px-3 py-2 rounded text-xs focus:border-accent outline-none flex-1 min-w-[200px]"
        />

        <select
          value={country}
          onChange={e => setCountry(e.target.value)}
          className="bg-surface-hover border border-border text-text-main px-3 py-2 rounded text-xs focus:border-accent outline-none cursor-pointer"
        >
          <option value="">All Countries</option>
          {countries.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <select
          value={plant}
          onChange={e => setPlant(e.target.value)}
          className="bg-surface-hover border border-border text-text-main px-3 py-2 rounded text-xs focus:border-accent outline-none cursor-pointer"
        >
          <option value="">All Plants</option>
          <option value="Shampur">Shampur</option>
          <option value="Gachha">Gachha</option>
        </select>

        <select
          value={status}
          onChange={e => setStatus(e.target.value)}
          className="bg-surface-hover border border-border text-text-main px-3 py-2 rounded text-xs focus:border-accent outline-none cursor-pointer"
        >
          <option value="">All Statuses</option>
          <option value="In Progress">Pending</option>
          <option value="Correction">Correction</option>
          <option value="Approved">Approved</option>
        </select>

        <button
          onClick={clearFilters}
          className="ml-auto text-text-muted hover:text-accent font-mono text-[10px] uppercase tracking-wide px-2 py-1 border border-border/60 rounded hover:border-accent transition-all"
        >
          Clear
        </button>
      </div>

      {/* Tracker Grid */}
      <div className="bg-surface border border-border rounded overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-16 text-center text-text-dim font-mono text-xs">
            No submissions matched your search criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-surface-hover text-text-muted font-mono uppercase text-[9px] tracking-wider border-b border-border">
                  <th className="p-3 pl-5">Tracking ID</th>
                  <th className="p-3">Product</th>
                  <th className="p-3">Dosage</th>
                  <th className="p-3">Country</th>
                  <th className="p-3">Plant</th>
                  <th className="p-3">Flow Purpose</th>
                  <th className="p-3">Components</th>
                  <th className="p-3">Priority</th>
                  <th className="p-3">Current Stage</th>
                  <th className="p-3">Overall Status</th>
                  <th className="p-3 text-right pr-5">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 text-text-muted">
                {pageRows.map(s => {
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
                      <td className="p-3 font-mono text-[10px]">{s.dosageForm}</td>
                      <td className="p-3 font-semibold">{s.country}</td>
                      <td className="p-3">{s.plant}</td>
                      <td className="p-3">
                        <div>{s.purpose}</div>
                        {s.flowKey !== s.purpose && (
                          <div className="font-mono text-[9px] text-text-dim mt-0.5">{s.flowKey}</div>
                        )}
                      </td>
                      <td className="p-3 text-text-dim max-w-[150px] truncate" title={s.components.join(', ')}>
                        {s.components.join(', ')}
                      </td>
                      <td className="p-3">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded font-mono ${priClass}`}>
                          {s.priority}
                        </span>
                      </td>
                      <td className="p-3 font-mono text-text-muted">
                        {DEPT_LABELS[s.currentStage] || s.currentStage}
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
                      <td className="p-3 pr-5 text-right flex gap-1 justify-end">
                        {isReviewer ? (
                          <button
                            onClick={() => onOpenReview(s.id)}
                            className="bg-accent hover:bg-accent-hover text-black px-2.5 py-1.5 rounded font-mono text-[10px] tracking-wide transition-all"
                          >
                            Review
                          </button>
                        ) : (
                          <button
                            onClick={() => onOpenDetail(s.id)}
                            className="border border-border hover:border-accent text-text-muted hover:text-accent px-2.5 py-1.5 rounded font-mono text-[10px] tracking-wide transition-all"
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

      {/* Pagination footer — page size + generated page buttons */}
      {filtered.length > 0 && (
        <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 font-mono text-[10px] text-text-muted">
          <div className="flex items-center gap-2">
            <span className="uppercase tracking-wider">Showing</span>
            <span className="text-text-main font-semibold">
              {(pageClamped - 1) * perPage + 1}&ndash;{Math.min(pageClamped * perPage, filtered.length)}
            </span>
            <span className="uppercase tracking-wider">of {filtered.length}</span>
            <span className="text-text-dim">·</span>
            <span className="uppercase tracking-wider">Rows</span>
            <select
              value={perPage}
              onChange={e => setPerPage(Number(e.target.value))}
              className="bg-surface-hover border border-border text-text-main px-2 py-1 rounded focus:border-accent outline-none cursor-pointer"
            >
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={pageClamped <= 1}
                className="px-2 py-1 border border-border rounded hover:border-accent disabled:opacity-30 disabled:hover:border-border transition-all"
              >
                ◀ Prev
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(n => n === 1 || n === totalPages || Math.abs(n - pageClamped) <= 2)
                .map((n, idx, arr) => (
                  <span key={n} className="flex items-center">
                    {idx > 0 && arr[idx - 1] !== n - 1 && <span className="px-1 text-text-dim">…</span>}
                    <button
                      onClick={() => setPage(n)}
                      className={`min-w-[26px] px-2 py-1 rounded border transition-all ${
                        n === pageClamped
                          ? 'border-accent bg-accent/15 text-accent font-bold'
                          : 'border-border text-text-muted hover:border-accent'
                      }`}
                    >
                      {n}
                    </button>
                  </span>
                ))}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={pageClamped >= totalPages}
                className="px-2 py-1 border border-border rounded hover:border-accent disabled:opacity-30 disabled:hover:border-border transition-all"
              >
                Next ▶
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
