/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { User } from '../types';
import { emitToast } from './Toast';
import { PERSONNEL, type Personnel } from '../shared/constants';

interface LoginScreenProps {
  onLogin: (user: User) => void;
}

// Roster + Personnel type are the single-source list in src/shared; re-export for existing importers.
export { PERSONNEL };
export type { Personnel };

export default function LoginScreen({ onLogin }: LoginScreenProps) {
  const [loginMode, setLoginMode] = useState<'personnel' | 'guest'>('personnel');
  
  // Personnel state
  const [selectedIdx, setSelectedIdx] = useState<string>('0');
  
  // Guest state
  const [role, setRole] = useState('');
  const [name, setName] = useState('');
  const [isHeadGuest, setIsHeadGuest] = useState(false);
  
  const [loading, setLoading] = useState(false);

  const doLogin = async () => {
    let finalUser: User;

    if (loginMode === 'personnel') {
      const idx = parseInt(selectedIdx, 10);
      const person = PERSONNEL[idx];
      if (!person) {
        emitToast('Please select a valid employee', 'error');
        return;
      }
      finalUser = {
        role: person.dept,
        name: person.name,
        email: person.email,
        isHead: person.isHead
      };
    } else {
      if (!role || !name.trim()) {
        emitToast('Please select a role and enter your name', 'error');
        return;
      }
      finalUser = {
        role,
        name: name.trim(),
        email: name.trim().toLowerCase().replace(/\s+/g, '.') + '@aristopharmabd.com',
        isHead: isHeadGuest
      };
    }

    setLoading(true);
    try {
      try {
        await fetch('/api/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(finalUser)
        });
      } catch (sessionErr) {
        console.warn('Failed to persist session to backend, using client state', sessionErr);
      }
      
      onLogin(finalUser);
      emitToast(`Welcome back, ${finalUser.name} (${finalUser.role})`, 'success');
    } catch (e: any) {
      console.error(e);
      emitToast('Authentication failed. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const currentPerson = loginMode === 'personnel' ? PERSONNEL[parseInt(selectedIdx, 10)] : null;

  return (
    <div className="min-h-screen relative flex items-center justify-center bg-bg overflow-hidden font-sans">
      {/* Background design grids */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(245,166,35,0.08)_0%,transparent_70%),radial-gradient(ellipse_40%_30%_at_80%_100%,rgba(232,71,29,0.06)_0%,transparent_60%)] pointer-events-none" />
      <div className="absolute inset-0 bg-[linear-gradient(var(--color-border)_1px,transparent_1px),linear-gradient(90deg,var(--color-border)_1px,transparent_1px)] bg-[size:40px_40px] opacity-20 pointer-events-none" />

      <div className="relative bg-surface border border-border border-t-2 border-t-accent p-8 max-w-md w-full shadow-2xl animate-fade-in">
        <div className="font-display text-4xl text-accent tracking-wider mb-1">PACKTRACK</div>
        <div className="font-mono text-[10px] text-text-muted tracking-[3px] uppercase mb-6">Packaging Approval Automation</div>

        {/* Tab switches */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-surface-hover border border-border/80 rounded mb-6">
          <button
            onClick={() => setLoginMode('personnel')}
            className={`py-1.5 rounded text-[10px] font-mono uppercase tracking-wider transition-all duration-200 ${
              loginMode === 'personnel'
                ? 'bg-accent text-black font-bold'
                : 'text-text-muted hover:text-text-main'
            }`}
          >
            Org Personnel
          </button>
          <button
            onClick={() => setLoginMode('guest')}
            className={`py-1.5 rounded text-[10px] font-mono uppercase tracking-wider transition-all duration-200 ${
              loginMode === 'guest'
                ? 'bg-accent text-black font-bold'
                : 'text-text-muted hover:text-text-main'
            }`}
          >
            Guest / Mock User
          </button>
        </div>

        {loginMode === 'personnel' ? (
          <div className="mb-6">
            <label className="block text-[11px] font-mono text-text-muted uppercase tracking-wider mb-2">Select Employee Profile</label>
            <select
              value={selectedIdx}
              onChange={e => setSelectedIdx(e.target.value)}
              className="w-full bg-surface-hover border border-border text-text-main p-3 rounded text-xs focus:border-accent outline-none"
            >
              {PERSONNEL.map((p, idx) => (
                <option key={idx} value={idx}>
                  [{p.dept}] {p.name} {p.isHead ? '• (Head of Dept)' : '• (Member)'}
                </option>
              ))}
            </select>

            {currentPerson && (
              <div className="mt-4 p-4 border border-border/60 bg-surface-hover/30 rounded font-mono text-[10px] leading-relaxed">
                <div className="text-accent uppercase tracking-wider font-bold mb-1">Employee Credentials</div>
                <div className="grid grid-cols-3 gap-y-1.5 text-text-muted">
                  <span className="text-text-dim">Site:</span>
                  <span className="col-span-2 text-text-main font-semibold">{currentPerson.site}</span>
                  
                  <span className="text-text-dim">Department:</span>
                  <span className="col-span-2 text-text-main font-semibold">{currentPerson.dept}</span>
                  
                  <span className="text-text-dim">Authority:</span>
                  <span className={`col-span-2 font-semibold ${currentPerson.isHead ? 'text-green-400' : 'text-text-muted'}`}>
                    {currentPerson.isHead ? 'Head of Department' : 'Associate / Submitter'}
                  </span>

                  <span className="text-text-dim">Official Email:</span>
                  <span className="col-span-2 text-text-dim text-[9px] lowercase truncate" title={currentPerson.email}>{currentPerson.email}</span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="mb-6">
            <div className="mb-4">
              <label className="block text-[11px] font-mono text-text-muted uppercase tracking-wider mb-2">Select Department Node</label>
              <select
                value={role}
                onChange={e => setRole(e.target.value)}
                className="w-full bg-surface-hover border border-border text-text-main p-3 rounded text-xs focus:border-accent outline-none"
              >
                <option value="">— Choose Department —</option>
                <option value="IB-CO">IB-CO (Corporate Office)</option>
                <option value="IB-SH">IB-SH (Shampur — Intl Business)</option>
                <option value="QC-SH">QC-SH (Shampur — Quality Control)</option>
                <option value="IRA-SH">IRA-SH (Shampur — Intl Regulatory Affairs)</option>
                <option value="QCom-SH">QCom-SH (Shampur — Quality Compliance)</option>
                <option value="PROD-SH">PROD-SH (Shampur — Production)</option>
                <option value="RnD-SH">RnD-SH (Shampur — R&D)</option>
                <option value="IRA-GA">IRA-GA (Gachha — Intl Regulatory Affairs)</option>
                <option value="RnD-GA">RnD-GA (Gachha — R&D)</option>
                <option value="QC-GA">QC-GA (Gachha — Quality Control)</option>
                <option value="QM-GA">QM-GA (Gachha — Quality Management)</option>
                <option value="QCom-GA">QCom-GA (Gachha — Quality Compliance)</option>
              </select>
            </div>

            <div className="mb-4">
              <label className="block text-[11px] font-mono text-text-muted uppercase tracking-wider mb-2">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Wasiur Rahman Khan"
                className="w-full bg-surface-hover border border-border text-text-main p-3 rounded text-xs focus:border-accent outline-none font-mono mb-3"
              />
              
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isHeadGuest}
                  onChange={e => setIsHeadGuest(e.target.checked)}
                  className="rounded bg-surface-hover border-border text-accent focus:ring-accent w-4 h-4"
                />
                <span className="text-[11px] font-mono text-text-muted uppercase tracking-wider">Log in as Department Head</span>
              </label>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <button
            onClick={doLogin}
            disabled={loading}
            className={`w-full bg-accent hover:bg-accent-hover text-black py-3 rounded font-mono text-xs tracking-wider transition-all duration-200 font-bold ${loading ? 'opacity-50 cursor-not-allowed animate-pulse' : ''}`}
          >
            {loading ? 'Authenticating Profile…' : 'Sign In to Dashboard →'}
          </button>
        </div>

        <div className="mt-6 text-[9px] font-mono text-text-dim text-center leading-relaxed">
          Aristopharma Packaging Materials Mockup Portal • Local Sandbox Authorized
        </div>
      </div>
    </div>
  );
}
