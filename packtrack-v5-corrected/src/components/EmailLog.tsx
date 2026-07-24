/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { EmailLogEntry, Submission } from '../types';

interface EmailLogProps {
  submissions: Submission[];
}

export default function EmailLog({ submissions }: EmailLogProps) {
  const [emails, setEmailLogs] = useState<EmailLogEntry[]>([]);

  useEffect(() => {
    const fetchEmails = async () => {
      try {
        const res = await fetch('/api/emails');
        if (res.ok) {
          const data = await res.json();
          setEmailLogs(data);
        }
      } catch (e) {
        console.error('Failed to load email log from server', e);
      }
    };
    fetchEmails();
  }, [submissions]);

  return (
    <div className="font-sans">
      <div className="bg-surface border border-border rounded overflow-hidden">
        <div className="p-5 border-b border-border">
          <div className="font-display text-xl text-text-main tracking-wide">SYSTEM EMAIL LOG</div>
          <div className="font-mono text-[9px] text-text-muted mt-1 uppercase tracking-wider">
            Simulated outbound notification receipts across departments
          </div>
        </div>

        {emails.length === 0 ? (
          <div className="p-16 text-center text-text-dim font-mono text-xs">
            No notification alerts sent yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-surface-hover text-text-muted font-mono uppercase text-[9px] tracking-wider border-b border-border">
                  <th className="p-3 pl-5">#</th>
                  <th className="p-3">Timestamp</th>
                  <th className="p-3">Recipient Mail</th>
                  <th className="p-3">Department</th>
                  <th className="p-3">Subject Header</th>
                  <th className="p-3">Reference ID</th>
                  <th className="p-3 pr-5 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 text-text-muted font-mono text-[11px]">
                {[...emails].reverse().map((e, idx) => (
                  <tr key={e.id} className="hover:bg-surface-hover/30 transition-colors">
                    <td className="p-3 pl-5 text-text-dim">{emails.length - idx}</td>
                    <td className="p-3 text-text-dim text-[10px]">{e.time}</td>
                    <td className="p-3 text-text-main">{e.to}</td>
                    <td className="p-3">
                      <span className="text-[10px] bg-brand-blue/10 border border-brand-blue/20 text-brand-blue px-2 py-0.5 rounded uppercase">
                        {e.dept}
                      </span>
                    </td>
                    <td className="p-3 font-sans text-xs text-text-muted">{e.subject}</td>
                    <td className="p-3">
                      <span className="tid">{e.tid}</span>
                    </td>
                    <td className="p-3 pr-5 text-right">
                      <span className="text-[10px] font-semibold bg-brand-green/10 text-brand-green border border-brand-green/20 px-2 py-0.5 rounded uppercase">
                        ✓ {e.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
