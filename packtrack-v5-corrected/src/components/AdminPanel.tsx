/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Submission, SystemProfile, User } from '../types';
import { emitToast } from './Toast';

interface AdminPanelProps {
  submissions: Submission[];
  user: User;
}

interface Department {
  code: string;
  label: string;
  email: string;
}

interface Workflow {
  plant: string;
  name: string;
  steps: string[];
}

export default function AdminPanel({ submissions, user }: AdminPanelProps) {
  const [profile, setProfile] = useState<SystemProfile | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'metrics' | 'departments' | 'workflows'>(user.role === 'IB-SH' ? 'workflows' : 'metrics');
  const isWorkflowOnly = user.role === 'IB-SH'; // IB-SH sees only the template builder
  const [confirmAction, setConfirmAction] = useState<{ title: string; message: string; confirmLabel: string; onYes: () => void } | null>(null);

  // Dynamic config loaded from DB
  const [departments, setDepartments] = useState<Department[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);

  // Department Form State
  const [newDeptCode, setNewDeptCode] = useState('');
  const [newDeptLabel, setNewDeptLabel] = useState('');
  const [newDeptEmail, setNewDeptEmail] = useState('');
  const [editingDeptCode, setEditingDeptCode] = useState<string | null>(null);

  // Workflow Form State
  const [newFlowPlant, setNewFlowPlant] = useState<'Shampur' | 'Gachha'>('Shampur');
  const [newFlowName, setNewFlowName] = useState('');
  const [newFlowSteps, setNewFlowSteps] = useState<string[]>([]);
  const [editingFlowIndex, setEditingFlowIndex] = useState<number | null>(null);

  // Load telemetry metrics and configs
  const fetchStats = async () => {
    try {
      const res = await fetch('/api/analytics');
      if (res.ok) {
        const data = await res.json();
        setProfile(data.system);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/config');
      if (res.ok) {
        const data = await res.json();
        setDepartments(data.departments || []);
        setWorkflows(data.workflows || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchConfig();
    const interval = setInterval(fetchStats, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleSaveDepartments = async (newDepts: Department[]) => {
    try {
      const res = await fetch('/api/config/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ departments: newDepts })
      });
      if (res.ok) {
        const data = await res.json();
        setDepartments(data.departments);
        emitToast('Department configuration updated successfully!', 'success');
      }
    } catch (e) {
      emitToast('Failed to update department configurations', 'error');
    }
  };

  const handleSaveWorkflows = async (newFlows: Workflow[]) => {
    try {
      const res = await fetch('/api/config/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflows: newFlows })
      });
      if (res.ok) {
        const data = await res.json();
        setWorkflows(data.workflows);
        emitToast('Workflow templates saved successfully!', 'success');
      }
    } catch (e) {
      emitToast('Failed to update workflow templates', 'error');
    }
  };

  // Compute load distribution per department
  const getDeptLoads = () => {
    const loads: Record<string, { pending: number; correction: number; stored: number }> = {};
    departments.forEach(d => {
      loads[d.code] = { pending: 0, correction: 0, stored: 0 };
    });

    submissions.forEach(s => {
      if (s.status === 'In Progress' && loads[s.currentStage]) {
        loads[s.currentStage].pending++;
      } else if (s.status === 'Correction' && s.currentStage === 'IB-CO') {
        if (loads['IB-CO']) {
          loads['IB-CO'].correction++;
        }
      }
      // "Stored" = approved & archived artworks are attributed to every department
      // that participated in the review chain for that artwork.
      if (s.status === 'Approved') {
        (s.workflow || []).forEach(dep => { if (loads[dep]) loads[dep].stored++; });
      }
    });

    return Object.entries(loads);
  };

  const deptLoads = getDeptLoads();

  // Add a new department
  const onAddDepartment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeptCode.trim() || !newDeptLabel.trim() || !newDeptEmail.trim()) {
      emitToast('All department fields are required', 'error');
      return;
    }

    const upperCode = newDeptCode.trim().toUpperCase();
    if (departments.some(d => d.code === upperCode)) {
      emitToast(`Department code ${upperCode} already exists`, 'error');
      return;
    }

    const updated = [
      ...departments,
      { code: upperCode, label: newDeptLabel.trim(), email: newDeptEmail.trim() }
    ];
    handleSaveDepartments(updated);
    setNewDeptCode('');
    setNewDeptLabel('');
    setNewDeptEmail('');
  };

  // Edit/Save department label & email inline
  const onSaveEditDepartment = (code: string, newLabel: string, newEmail: string) => {
    const updated = departments.map(d => {
      if (d.code === code) {
        return { ...d, label: newLabel, email: newEmail };
      }
      return d;
    });
    handleSaveDepartments(updated);
    setEditingDeptCode(null);
  };

  // Delete department
  const onDeleteDepartment = (code: string) => {
    if (['IB-CO', 'IB-SH'].includes(code)) {
      emitToast('Core management departments (IB-CO, IB-SH) cannot be removed.', 'error');
      return;
    }
    setConfirmAction({
      title: 'Remove department',
      message: `Remove the department "${code}"? Submissions already routed through it are unaffected, but it will no longer be selectable when building workflows.`,
      confirmLabel: 'Remove department',
      onYes: () => handleSaveDepartments(departments.filter(d => d.code !== code)),
    });
  };

  // Add Workflow steps builder helper
  const addStepToFlow = (deptCode: string) => {
    setNewFlowSteps([...newFlowSteps, deptCode]);
  };

  const removeLastStep = () => {
    setNewFlowSteps(newFlowSteps.slice(0, -1));
  };

  const clearFlowSteps = () => {
    setNewFlowSteps([]);
  };

  const onAddWorkflow = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFlowName.trim()) {
      emitToast('Workflow template name is required', 'error');
      return;
    }
    if (newFlowSteps.length < 2) {
      emitToast('Workflow must have at least 2 steps (must begin or end with review nodes)', 'error');
      return;
    }

    const entry = { plant: newFlowPlant, name: newFlowName.trim(), steps: newFlowSteps };
    let updated: Workflow[];
    if (editingFlowIndex != null) {
      updated = workflows.map((w, idx) => (idx === editingFlowIndex ? entry : w));
    } else {
      updated = [...workflows, entry];
    }
    handleSaveWorkflows(updated);
    setNewFlowName('');
    setNewFlowSteps([]);
    setEditingFlowIndex(null);
    emitToast(editingFlowIndex != null ? 'Workflow template updated.' : 'Workflow template created.', 'success');
  };

  // Load an existing template into the builder for editing.
  const onEditWorkflow = (index: number) => {
    const w = workflows[index];
    if (!w) return;
    setNewFlowPlant(w.plant as 'Shampur' | 'Gachha');
    setNewFlowName(w.name);
    setNewFlowSteps([...w.steps]);
    setEditingFlowIndex(index);
  };

  const onCancelEditWorkflow = () => {
    setEditingFlowIndex(null);
    setNewFlowName('');
    setNewFlowSteps([]);
  };

  const onDeleteWorkflow = (index: number) => {
    const tpl = workflows[index];
    setConfirmAction({
      title: 'Delete workflow template',
      message: `Delete the template "${tpl?.name || 'this template'}"? This cannot be undone.`,
      confirmLabel: 'Delete template',
      onYes: () => {
        handleSaveWorkflows(workflows.filter((_, idx) => idx !== index));
        if (editingFlowIndex === index) onCancelEditWorkflow();
      },
    });
  };

  return (
    <div className="font-sans flex flex-col gap-6 animate-fade-in">
      {/* Sub Tabs Selection Bar */}
      <div className="flex border-b border-border/65">
        {!isWorkflowOnly && (
          <>
            <button
              onClick={() => setActiveSubTab('metrics')}
              className={`px-5 py-3 font-mono text-[11px] uppercase tracking-wider border-b-2 transition-all cursor-pointer font-bold ${
                activeSubTab === 'metrics' ? 'border-accent text-accent' : 'border-transparent text-text-muted hover:text-text-main'
              }`}
            >
              Performance Metrics & Queue
            </button>
            <button
              onClick={() => setActiveSubTab('departments')}
              className={`px-5 py-3 font-mono text-[11px] uppercase tracking-wider border-b-2 transition-all cursor-pointer font-bold ${
                activeSubTab === 'departments' ? 'border-accent text-accent' : 'border-transparent text-text-muted hover:text-text-main'
              }`}
            >
              Department & Access Controls
            </button>
          </>
        )}
        <button
          onClick={() => setActiveSubTab('workflows')}
          className={`px-5 py-3 font-mono text-[11px] uppercase tracking-wider border-b-2 transition-all cursor-pointer font-bold ${
            activeSubTab === 'workflows' ? 'border-accent text-accent' : 'border-transparent text-text-muted hover:text-text-main'
          }`}
        >
          Workflow Templates Builder
        </button>
      </div>

      {/* RENDER ACTIVE SUBTAB CONTENT */}
      {activeSubTab === 'metrics' && !isWorkflowOnly && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Hardware Profiling */}
          <div className="bg-surface border border-border p-6 rounded">
            <div className="font-display text-lg text-text-main tracking-wide mb-1">SYSTEM HEALTH PROFILER</div>
            <div className="font-mono text-[9px] text-text-muted uppercase tracking-wider mb-4 border-b border-border pb-2">
              Node Container Hardware Metrics (Express Backend Engine)
            </div>

            {profile ? (
              <div className="flex flex-col gap-4 text-xs font-mono text-text-muted">
                <div className="flex justify-between items-center py-2 border-b border-border/20">
                  <span>CPU Core Load:</span>
                  <span className="text-accent font-semibold">{profile.cpuUsage}%</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-border/20">
                  <span>RAM Heap Utilization:</span>
                  <span className="text-brand-purple font-semibold">
                    {profile.memoryUsed} MB / {profile.memoryTotal} MB
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-border/20">
                  <span>Process Uptime:</span>
                  <span className="text-brand-green font-semibold">{profile.uptime} seconds</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-border/20">
                  <span>Total DB Requests:</span>
                  <span className="text-brand-blue font-semibold">{profile.totalRequests} API calls</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-border/20">
                  <span>Active WebSocket Nodes:</span>
                  <span className="text-accent font-semibold">{profile.activeSessions} online</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span>Average Response Latency:</span>
                  <span className="text-brand-green font-semibold">{profile.averageLatency} ms</span>
                </div>
              </div>
            ) : (
              <div className="text-center font-mono text-text-dim text-xs py-10">
                Loading telemetry metrics…
              </div>
            )}
          </div>

          {/* Queue Analysis */}
          <div className="bg-surface border border-border p-6 rounded overflow-hidden">
            <div className="font-display text-lg text-text-main tracking-wide mb-1">QUEUE DISTRIBUTION ANALYSIS</div>
            <div className="font-mono text-[9px] text-text-muted uppercase tracking-wider mb-4 border-b border-border pb-2">
              Workload balance overview across department channels
            </div>

            <div className="overflow-y-auto max-h-[360px] pr-2">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="text-text-muted font-mono uppercase text-[9px] border-b border-border">
                    <th className="pb-2">Department Name</th>
                    <th className="pb-2 text-center">Pending Review</th>
                    <th className="pb-2 text-center">Corrections</th>
                    <th className="pb-2 text-right pr-2">Stored (Approved)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/25">
                  {deptLoads.map(([deptCode, load]) => {
                    const matchedDept = departments.find(d => d.code === deptCode);
                    const label = matchedDept ? matchedDept.label : deptCode;
                    return (
                      <tr key={deptCode} className="text-text-muted font-semibold">
                        <td className="py-2.5 font-sans text-text-main">{label}</td>
                        <td className="py-2.5 text-center">
                          {load.pending > 0 ? (
                            <span className="text-[10px] bg-accent/10 border border-accent/20 text-accent font-mono font-semibold px-2 py-0.5 rounded">
                              {load.pending} pending
                            </span>
                          ) : (
                            <span className="text-[10px] text-text-dim font-mono">—</span>
                          )}
                        </td>
                        <td className="py-2.5 text-center">
                          {load.correction > 0 ? (
                            <span className="text-[10px] bg-brand-red/10 border border-brand-red/20 text-brand-red font-mono font-semibold px-2 py-0.5 rounded">
                              {load.correction} corrections
                            </span>
                          ) : (
                            <span className="text-[10px] text-text-dim font-mono">—</span>
                          )}
                        </td>
                        <td className="py-2.5 text-right pr-2">
                          {load.stored > 0 ? (
                            <span className="text-[10px] bg-brand-green/10 border border-brand-green/20 text-brand-green font-mono font-semibold px-2 py-0.5 rounded">
                              {load.stored} stored
                            </span>
                          ) : (
                            <span className="text-[10px] text-text-dim font-mono">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeSubTab === 'departments' && !isWorkflowOnly && (
        <div className="flex flex-col gap-6">
          {/* Add department form */}
          <div className="bg-surface border border-border p-5 rounded">
            <div className="font-display text-base text-text-main tracking-wide mb-1">PROVISION NEW REGULATORY DEPARTMENT / ACCESS POINT</div>
            <div className="font-mono text-[9px] text-text-muted uppercase tracking-wider mb-4 border-b border-border pb-2">
              Define a new participant node in the PackTrack routing engine
            </div>

            <form onSubmit={onAddDepartment} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div>
                <label className="block text-[9px] font-mono text-text-dim uppercase mb-1.5">Department Code</label>
                <input
                  type="text"
                  value={newDeptCode}
                  onChange={e => setNewDeptCode(e.target.value)}
                  placeholder="e.g. QC-GA"
                  className="w-full bg-surface-hover border border-border text-xs text-text-main p-2.5 rounded focus:border-accent outline-none font-mono"
                />
              </div>
              <div>
                <label className="block text-[9px] font-mono text-text-dim uppercase mb-1.5">Department Label</label>
                <input
                  type="text"
                  value={newDeptLabel}
                  onChange={e => setNewDeptLabel(e.target.value)}
                  placeholder="e.g. QC Gachha"
                  className="w-full bg-surface-hover border border-border text-xs text-text-main p-2.5 rounded focus:border-accent outline-none"
                />
              </div>
              <div>
                <label className="block text-[9px] font-mono text-text-dim uppercase mb-1.5">Workflow Target Email Address</label>
                <input
                  type="email"
                  value={newDeptEmail}
                  onChange={e => setNewDeptEmail(e.target.value)}
                  placeholder="e.g. qc-ga@aristopharmabd.com"
                  className="w-full bg-surface-hover border border-border text-xs text-text-main p-2.5 rounded focus:border-accent outline-none font-mono"
                />
              </div>
              <div>
                <button
                  type="submit"
                  className="w-full bg-accent text-black hover:bg-accent-hover px-4 py-2.5 rounded text-xs font-mono font-bold tracking-wider transition-all cursor-pointer h-[38px]"
                >
                  ⊕ PROVISION DEPT
                </button>
              </div>
            </form>
          </div>

          {/* Departments list */}
          <div className="bg-surface border border-border p-5 rounded">
            <div className="font-display text-base text-text-main tracking-wide mb-1">CURRENTLY ENROLLED DEPARTMENTS</div>
            <div className="font-mono text-[9px] text-text-muted uppercase tracking-wider mb-4 border-b border-border pb-2">
              Active routing points and access targets
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="text-text-muted font-mono uppercase text-[9px] border-b border-border pb-2">
                    <th className="pb-2.5">Code</th>
                    <th className="pb-2.5">Department Label</th>
                    <th className="pb-2.5">Workflow Target Email</th>
                    <th className="pb-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/25">
                  {departments.map(d => {
                    const isEditing = editingDeptCode === d.code;
                    return (
                      <tr key={d.code} className="hover:bg-surface-hover/20">
                        <td className="py-3.5 font-mono text-accent font-bold">{d.code}</td>
                        <td className="py-3.5 text-text-main">
                          {isEditing ? (
                            <input
                              id={`edit-label-${d.code}`}
                              type="text"
                              defaultValue={d.label}
                              className="bg-surface border border-border text-xs p-1.5 rounded text-text-main"
                            />
                          ) : (
                            d.label
                          )}
                        </td>
                        <td className="py-3.5 font-mono text-text-muted">
                          {isEditing ? (
                            <input
                              id={`edit-email-${d.code}`}
                              type="email"
                              defaultValue={d.email}
                              className="bg-surface border border-border text-xs p-1.5 rounded text-text-main font-mono"
                            />
                          ) : (
                            d.email
                          )}
                        </td>
                        <td className="py-3.5 text-right">
                          {isEditing ? (
                            <div className="flex gap-2 justify-end">
                              <button
                                onClick={() => {
                                  const labelVal = (document.getElementById(`edit-label-${d.code}`) as HTMLInputElement).value;
                                  const emailVal = (document.getElementById(`edit-email-${d.code}`) as HTMLInputElement).value;
                                  onSaveEditDepartment(d.code, labelVal, emailVal);
                                }}
                                className="bg-brand-green/10 text-brand-green border border-brand-green/20 hover:bg-brand-green/15 px-2.5 py-1 rounded text-[10px] font-mono cursor-pointer"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingDeptCode(null)}
                                className="bg-border/40 text-text-muted border border-border hover:bg-border/55 px-2.5 py-1 rounded text-[10px] font-mono cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex gap-2 justify-end">
                              <button
                                onClick={() => setEditingDeptCode(d.code)}
                                className="bg-brand-blue/10 text-brand-blue border border-brand-blue/20 hover:bg-brand-blue/15 px-2.5 py-1 rounded text-[10px] font-mono cursor-pointer"
                              >
                                Edit
                              </button>
                              {!['IB-CO', 'IB-SH'].includes(d.code) && (
                                <button
                                  onClick={() => onDeleteDepartment(d.code)}
                                  className="bg-brand-red/10 text-brand-red border border-brand-red/20 hover:bg-brand-red/15 px-2.5 py-1 rounded text-[10px] font-mono cursor-pointer"
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeSubTab === 'workflows' && (
        <div className="flex flex-col gap-6">
          {/* Create custom workflow template form */}
          <div className="bg-surface border border-border p-5 rounded">
            <div className="font-display text-base text-text-main tracking-wide mb-1">BUILD CUSTOM WORKFLOW TEMPLATE</div>
            <div className="font-mono text-[9px] text-text-muted uppercase tracking-wider mb-4 border-b border-border pb-2">
              Chain departments sequentially to construct modular filing protocols
            </div>

            <form onSubmit={onAddWorkflow} className="flex flex-col gap-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[9px] font-mono text-text-dim uppercase mb-1.5">Filing Plant Target</label>
                  <select
                    value={newFlowPlant}
                    onChange={e => setNewFlowPlant(e.target.value as 'Shampur' | 'Gachha')}
                    className="w-full bg-surface-hover border border-border text-xs text-text-main p-2.5 rounded focus:border-accent outline-none font-semibold"
                  >
                    <option value="Shampur">Shampur Plant</option>
                    <option value="Gachha">Gachha Plant</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[9px] font-mono text-text-dim uppercase mb-1.5">Template Name</label>
                  <input
                    type="text"
                    value={newFlowName}
                    onChange={e => setNewFlowName(e.target.value)}
                    placeholder="e.g. Commercial Custom"
                    className="w-full bg-surface-hover border border-border text-xs text-text-main p-2.5 rounded focus:border-accent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-mono text-text-dim uppercase mb-1.5">Built Sequence Preview</label>
                  <div className="bg-surface-hover border border-border text-xs p-2.5 rounded text-text-main min-h-[38px] flex items-center font-mono font-bold text-accent overflow-x-auto gap-1">
                    {newFlowSteps.length > 0 ? (
                      newFlowSteps.map((s, idx) => (
                        <span key={idx} className="flex items-center gap-1">
                          {idx > 0 && <span className="text-text-dim text-[10px]">➔</span>}
                          <span className="bg-accent/10 border border-accent/20 px-2 py-0.5 rounded text-[10px]">{s}</span>
                        </span>
                      ))
                    ) : (
                      <span className="text-text-dim italic text-[10px] font-sans">No steps chosen yet. Click departments below.</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Click to add buttons */}
              <div>
                <label className="block text-[9px] font-mono text-text-dim uppercase mb-2">Click to Append Department to Sequence</label>
                <div className="flex flex-wrap gap-2">
                  {departments.map(d => (
                    <button
                      key={d.code}
                      type="button"
                      onClick={() => addStepToFlow(d.code)}
                      className="bg-surface hover:bg-surface-active border border-border hover:border-text-dim text-text-main text-[10px] font-mono font-semibold px-2.5 py-1.5 rounded cursor-pointer"
                    >
                      +{d.code}
                    </button>
                  ))}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-3 justify-end border-t border-border/30 pt-3">
                {newFlowSteps.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={removeLastStep}
                      className="bg-transparent hover:bg-surface-hover border border-border text-text-muted text-xs font-mono px-3 py-2 rounded transition-all cursor-pointer"
                    >
                      ↶ Remove Last Step
                    </button>
                    <button
                      type="button"
                      onClick={clearFlowSteps}
                      className="bg-transparent hover:bg-brand-red/10 border border-brand-red/20 text-brand-red text-xs font-mono px-3 py-2 rounded transition-all cursor-pointer"
                    >
                      ✕ Clear Steps
                    </button>
                  </>
                )}
                {editingFlowIndex != null && (
                  <button
                    type="button"
                    onClick={onCancelEditWorkflow}
                    className="bg-transparent hover:bg-surface-hover border border-border text-text-muted text-xs font-mono px-3 py-2 rounded transition-all cursor-pointer"
                  >
                    Cancel Edit
                  </button>
                )}
                <button
                  type="submit"
                  className="bg-accent text-black hover:bg-accent-hover px-5 py-2 rounded text-xs font-mono font-bold tracking-wider transition-all cursor-pointer"
                >
                  {editingFlowIndex != null ? 'UPDATE TEMPLATE' : 'SAVE WORKFLOW TEMPLATE'}
                </button>
              </div>
            </form>
          </div>

          {/* Workflows list */}
          <div className="bg-surface border border-border p-5 rounded">
            <div className="font-display text-base text-text-main tracking-wide mb-1">AVAILABLE WORKFLOW TEMPLATES</div>
            <div className="font-mono text-[9px] text-text-muted uppercase tracking-wider mb-4 border-b border-border pb-2">
              Ready-to-use routing configurations
            </div>

            <div className="flex flex-col gap-3">
              {workflows.map((flow, index) => (
                <div key={index} className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-surface-hover/20 border border-border/55 p-3.5 rounded gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[9px] uppercase tracking-wider bg-brand-blue/10 border border-brand-blue/20 text-brand-blue px-2 py-0.5 rounded font-bold">
                        {flow.plant}
                      </span>
                      <span className="font-sans font-bold text-text-main text-sm">{flow.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-2 overflow-x-auto max-w-[500px] font-mono text-[10px] text-text-muted">
                      {flow.steps.map((st, sidx) => (
                        <span key={sidx} className="flex items-center gap-1.5 flex-shrink-0">
                          {sidx > 0 && <span className="text-text-dim text-[9px]">➔</span>}
                          <span className="bg-surface border border-border px-1.5 py-0.5 rounded">{st}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => onEditWorkflow(index)}
                      className="bg-surface border border-border hover:border-accent text-text-muted hover:text-accent px-3 py-1.5 rounded font-mono text-[10px] cursor-pointer"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => onDeleteWorkflow(index)}
                      className="bg-brand-red/10 text-brand-red border border-brand-red/20 hover:bg-brand-red/15 px-3 py-1.5 rounded font-mono text-[10px] cursor-pointer"
                    >
                      Delete Template
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Themed confirm dialog (replaces native window.confirm) */}
      {confirmAction && (
        <div
          className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={confirmAction.title}
          onClick={() => setConfirmAction(null)}
        >
          <div className="w-full max-w-sm bg-surface border border-border rounded-lg shadow-2xl p-5" onClick={e => e.stopPropagation()}>
            <div className="font-display text-lg text-text-main tracking-wide mb-1.5">{confirmAction.title}</div>
            <p className="text-xs text-text-muted leading-relaxed mb-4">{confirmAction.message}</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmAction(null)}
                className="bg-transparent border border-border hover:border-text-muted text-text-muted hover:text-text-main px-4 py-2 rounded font-mono text-[11px] tracking-wider transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => { confirmAction.onYes(); setConfirmAction(null); }}
                className="bg-brand-red text-white hover:bg-brand-red/90 px-4 py-2 rounded font-mono text-[11px] tracking-wider font-semibold transition-all cursor-pointer"
              >
                {confirmAction.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
