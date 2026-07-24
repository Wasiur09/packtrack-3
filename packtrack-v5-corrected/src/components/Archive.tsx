/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { Submission, User } from '../types';

interface ArchiveProps {
  user: User;
  submissions: Submission[];
  onOpenDetail: (id: string) => void;
}

export default function Archive({ user, submissions, onOpenDetail }: ArchiveProps) {
  const [q, setQ] = useState('');
  const [outcome, setOutcome] = useState('');
  const [plant, setPlant] = useState('');
  const [purpose, setPurpose] = useState('');
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [selectedDosages, setSelectedDosages] = useState<string[]>([]);
  const [perPage, setPerPage] = useState(50);
  const [page, setPage] = useState(1);

  // Get only closed submissions (Approved or Correction back at IB-CO at step 0)
  const allArchivePool = submissions.filter(s =>
    s.status === 'Approved' || (s.status === 'Correction' && s.stageIndex === 0)
  );

  // Extract dynamically present countries and dosage forms
  const countries = [...new Set(allArchivePool.map(s => s.country))].sort();
  const dosages = [...new Set(allArchivePool.map(s => s.dosageForm).filter(Boolean))].sort();

  const toggleCountry = (c: string) => {
    setSelectedCountries(prev =>
      prev.includes(c) ? prev.filter(item => item !== c) : [...prev, c]
    );
  };

  const toggleDosage = (d: string) => {
    setSelectedDosages(prev =>
      prev.includes(d) ? prev.filter(item => item !== d) : [...prev, d]
    );
  };

  // Filter pool, then order most-recent additions first (oldest at the bottom).
  const filtered = allArchivePool
    .filter(s => {
      if (q && !(s.product.toLowerCase().includes(q.toLowerCase()) || s.id.toLowerCase().includes(q.toLowerCase()) || s.country.toLowerCase().includes(q.toLowerCase()))) return false;
      if (outcome && s.status !== outcome) return false;
      if (plant && s.plant !== plant) return false;
      if (purpose && s.purpose !== purpose) return false;
      if (selectedCountries.length > 0 && !selectedCountries.includes(s.country)) return false;
      if (selectedDosages.length > 0 && !selectedDosages.includes(s.dosageForm)) return false;
      return true;
    })
    .slice()
    .sort((a, b) => b.submittedAt - a.submittedAt);

  // Pagination (recent-first). Reset to first page whenever filters/size change.
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  useEffect(() => { setPage(1); }, [q, outcome, plant, purpose, perPage, selectedCountries, selectedDosages]);
  const pageClamped = Math.min(page, totalPages);
  const pageRows = filtered.slice((pageClamped - 1) * perPage, pageClamped * perPage);

  const clearAllFilters = () => {
    setQ('');
    setOutcome('');
    setPlant('');
    setPurpose('');
    setSelectedCountries([]);
    setSelectedDosages([]);
  };

  // Calculate aggregates
  const totalApproved = filtered.filter(s => s.status === 'Approved').length;
  const totalClosedCorrections = filtered.filter(s => s.status === 'Correction').length;

  // Bar chart calculations for widget blocks
  const getTopFrequencies = (key: 'country' | 'dosageForm' | 'purpose') => {
    const counts: Record<string, number> = {};
    filtered.forEach(s => {
      const val = s[key];
      if (val) counts[val] = (counts[val] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  };

  const topCountries = getTopFrequencies('country');
  const topDosages = getTopFrequencies('dosageForm');
  const topPurposes = getTopFrequencies('purpose');

  const renderMiniChart = (title: string, sub: string, items: Array<[string, number]>, color: string) => {
    const maxVal = Math.max(1, ...items.map(i => i[1]));
    return (
      <div className="bg-surface border border-border p-5 rounded flex-1 min-w-[240px]">
        <div className="font-mono text-[10px] text-text-muted uppercase tracking-wider">{title}</div>
        <div className="font-mono text-[9px] text-text-dim uppercase tracking-wider mt-0.5">{sub}</div>
        <div className="flex flex-col gap-2 mt-4">
          {items.length === 0 ? (
            <div className="text-text-dim text-xs font-mono py-6">No data logs</div>
          ) : (
            items.map(([k, v]) => (
              <div key={k} className="flex items-center gap-3 text-xs">
                <span className="w-20 truncate text-text-muted font-medium">{k}</span>
                <div className="flex-1 h-2 bg-surface-hover rounded overflow-hidden">
                  <div
                    className="h-full rounded"
                    style={{
                      width: `${(v / maxVal) * 100}%`,
                      backgroundColor: color
                    }}
                  />
                </div>
                <span className="font-mono font-semibold text-text-main w-6 text-right">{v}</span>
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="font-sans">
      {/* Archive Header Banner */}
      <div className="bg-gradient-to-br from-brand-blue/5 to-surface border border-border border-l-3 border-l-brand-blue p-5 rounded mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="font-display text-2xl text-text-main tracking-wider">ARCHIVE — ARTWORKS HISTORY DATABASE</div>
          <div className="font-mono text-[10px] text-text-muted mt-1 uppercase tracking-wider">
            Read-only archive of approved presentations and closed correction envelopes
          </div>
        </div>
        <div className="font-mono text-[10px] text-text-muted md:text-right leading-relaxed">
          <div className="text-brand-green font-semibold">{totalApproved} Approved presentations</div>
          <div className="text-brand-red mt-0.5">{totalClosedCorrections} Closed corrections</div>
        </div>
      </div>

      {/* Main Filter Inputs */}
      <div className="bg-surface border border-border p-4 rounded mb-4 flex flex-wrap gap-3 items-center">
        <input
          type="text"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search product, country, ID..."
          className="bg-surface-hover border border-border text-text-main px-3 py-2 rounded text-xs focus:border-accent outline-none flex-1 min-w-[200px]"
        />

        <select
          value={outcome}
          onChange={e => setOutcome(e.target.value)}
          className="bg-surface-hover border border-border text-text-main px-3 py-2 rounded text-xs focus:border-accent outline-none cursor-pointer"
        >
          <option value="">All Outcomes</option>
          <option value="Approved">Approved</option>
          <option value="Correction">Correction (Closed)</option>
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
          value={purpose}
          onChange={e => setPurpose(e.target.value)}
          className="bg-surface-hover border border-border text-text-main px-3 py-2 rounded text-xs focus:border-accent outline-none cursor-pointer"
        >
          <option value="">All Purposes</option>
          <option value="Dossier">Dossier</option>
          <option value="Commercial">Commercial</option>
          <option value="Renewal">Renewal</option>
          <option value="Site Transfer">Site Transfer</option>
          <option value="Variation">Variation</option>
        </select>

        <button
          onClick={clearAllFilters}
          className="ml-auto text-text-muted hover:text-accent font-mono text-[10px] uppercase tracking-wide px-2.5 py-1 border border-border/60 rounded hover:border-accent transition-all"
        >
          Clear filters
        </button>
      </div>

      {/* Chips Filter Blocks (Country & Dosage) */}
      <div className="bg-surface border border-border p-5 rounded mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <div className="font-mono text-[10px] text-text-muted uppercase tracking-wider mb-2">
              Country <span className="text-text-dim text-[8px] tracking-normal font-sans">(Click to toggle Multi-Select)</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {countries.map(c => {
                const isSelected = selectedCountries.includes(c);
                return (
                  <button
                    key={c}
                    onClick={() => toggleCountry(c)}
                    className={`px-2.5 py-1 rounded-full text-[10px] font-mono border transition-all ${
                      isSelected
                        ? 'border-brand-blue bg-brand-blue/15 text-brand-blue font-semibold'
                        : 'border-border bg-surface-hover text-text-muted hover:border-text-dim'
                    }`}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="font-mono text-[10px] text-text-muted uppercase tracking-wider mb-2">
              Dosage Form <span className="text-text-dim text-[8px] tracking-normal font-sans">(Click to toggle Multi-Select)</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {dosages.map(d => {
                const isSelected = selectedDosages.includes(d);
                return (
                  <button
                    key={d}
                    onClick={() => toggleDosage(d)}
                    className={`px-2.5 py-1 rounded-full text-[10px] font-mono border transition-all ${
                      isSelected
                        ? 'border-brand-green bg-brand-green/15 text-brand-green font-semibold'
                        : 'border-border bg-surface-hover text-text-muted hover:border-text-dim'
                    }`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Aggregate Bar charts */}
      <div className="flex flex-wrap gap-4 mb-6">
        {renderMiniChart('Top Countries', 'distribution of archived records', topCountries, 'var(--color-brand-blue)')}
        {renderMiniChart('Top Dosage Forms', 'formulations mix', topDosages, 'var(--color-brand-green)')}
        {renderMiniChart('Filing Purpose', 'regulatory purposes', topPurposes, 'var(--color-brand-purple)')}
      </div>

      {/* Archive Grid table */}
      <div className="bg-surface border border-border rounded overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-16 text-center text-text-dim font-mono text-xs">
            No archived presentations match your active filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-surface-hover text-text-muted font-mono uppercase text-[9px] tracking-wider border-b border-border">
                  <th className="p-3 pl-5">Tracking ID</th>
                  <th className="p-3">Product Name</th>
                  <th className="p-3">Dosage Form</th>
                  <th className="p-3">Country</th>
                  <th className="p-3">Plant</th>
                  <th className="p-3">Filing Type</th>
                  <th className="p-3">Outcome</th>
                  <th className="p-3">Date Closed</th>
                  <th className="p-3 pr-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 text-text-muted">
                {pageRows.map(s => {
                  const statusColor = s.status === 'Approved'
                    ? 'bg-brand-green/10 text-brand-green border border-brand-green/20'
                    : 'bg-brand-red/10 text-brand-red border border-brand-red/20';

                  const label = s.status === 'Approved' ? '✓ Approved' : 'Correction (Closed)';

                  return (
                    <tr key={s.id} className="hover:bg-surface-hover/30 transition-colors">
                      <td className="p-3 pl-5 font-mono">
                        <span className="tid">{s.id}</span>
                      </td>
                      <td className="p-3 font-semibold text-text-main">{s.product}</td>
                      <td className="p-3 font-mono text-[10px]">{s.dosageForm}</td>
                      <td className="p-3 font-semibold">{s.country}</td>
                      <td className="p-3">{s.plant}</td>
                      <td className="p-3 font-mono">{s.purpose}</td>
                      <td className="p-3">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded font-mono ${statusColor}`}>
                          {label}
                        </span>
                      </td>
                      <td className="p-3 font-mono text-text-dim">{new Date(s.submittedAt).toLocaleDateString()}</td>
                      <td className="p-3 pr-5 text-right">
                        <button
                          onClick={() => onOpenDetail(s.id)}
                          className="border border-border hover:border-accent text-text-muted hover:text-accent px-3 py-1.5 rounded font-mono text-[10px] tracking-wide transition-all"
                        >
                          Details
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination footer — recent additions first */}
      {filtered.length > 0 && (
        <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 font-mono text-[10px] text-text-muted">
          <div className="flex items-center gap-2">
            <span className="uppercase tracking-wider">Showing</span>
            <span className="text-text-main font-semibold">
              {(pageClamped - 1) * perPage + 1}&ndash;{Math.min(pageClamped * perPage, filtered.length)}
            </span>
            <span className="uppercase tracking-wider">of {filtered.length} archived</span>
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
                          ? 'border-brand-blue bg-brand-blue/15 text-brand-blue font-bold'
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
