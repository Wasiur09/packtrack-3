/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { User } from '../types';
import { LayoutDashboard, Upload, ClipboardCheck, Table2, Archive, ScrollText, Mail, Settings, type LucideIcon } from 'lucide-react';

interface SidebarProps {
  user: User;
  activeTab: string;
  onTabChange: (tab: string) => void;
  pendingCount: number;
  archiveCount: number;
  onLogout: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

function avatarInitials(name: string): string {
  if (!name) return '?';
  return name.split(/\s+/).map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

export default function Sidebar({
  user,
  activeTab,
  onTabChange,
  pendingCount,
  archiveCount,
  onLogout,
  isCollapsed,
  onToggleCollapse
}: SidebarProps) {
  const navItems: Array<{ id: string; label: string; icon: LucideIcon; count?: number; countColor?: string; roleFilter?: string; roleFilters?: string[] }> = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, count: pendingCount, countColor: 'bg-accent-dark text-white' },
    { id: 'submit', label: 'Submit Artwork', icon: Upload, roleFilter: 'IB-CO' },
    { id: 'review', label: 'Review Queue', icon: ClipboardCheck, count: pendingCount, countColor: 'bg-accent-dark text-white' },
    { id: 'tracker', label: 'All Submissions', icon: Table2 },
    { id: 'archive', label: 'Archive', icon: Archive, count: archiveCount, countColor: 'bg-surface-active text-text-muted border border-border' },
    { id: 'audit', label: 'Audit Trail', icon: ScrollText },
    { id: 'emaillog', label: 'Email Log', icon: Mail },
    { id: 'admin', label: 'Admin Panel', icon: Settings, roleFilters: ['IB-CO', 'IB-SH'] }
  ];

  return (
    <div className={`fixed left-0 top-0 bottom-0 bg-surface flex flex-col z-40 font-sans transition-all duration-300 ease-in-out ${
      isCollapsed ? 'w-0 opacity-0 pointer-events-none border-r-transparent' : 'w-[220px] opacity-100 border-r border-border'
    } overflow-x-hidden overflow-y-auto`}>
      {/* Sidebar Logo */}
      <div className="p-5 border-b border-border flex justify-between items-center h-[69px] flex-shrink-0">
        <div>
          <div className="font-display text-2xl text-accent tracking-wider leading-none">PACKTRACK</div>
          <div className="font-mono text-[9px] text-text-dim tracking-widest uppercase mt-1">v2.1.0</div>
        </div>
      </div>

      {/* User Badge */}
      <div className="m-3 p-3 bg-surface-hover border border-border rounded flex-shrink-0">
        <div className="text-xs font-semibold text-text-main truncate" title={user.name}>{user.name}</div>
        <div className="font-mono text-[9px] text-accent uppercase tracking-wider mt-1">{user.role}</div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 py-2">
        {navItems.map(item => {
          // Filter by user role if required
          if (item.roleFilter && user.role !== item.roleFilter) return null;
          if (item.roleFilters && !item.roleFilters.includes(user.role)) return null;

          const isActive = activeTab === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`relative w-full flex items-center gap-3 py-2.5 text-left text-xs font-semibold transition-all duration-200 border-l-2 px-5 ${
                isActive
                  ? 'text-accent border-l-accent bg-accent/5'
                  : 'text-text-muted border-l-transparent hover:text-text-main hover:bg-surface-hover'
              }`}
            >
              <Icon size={16} strokeWidth={2} className="w-5 flex-shrink-0" aria-hidden="true" />
              <span className="flex-1 truncate">{item.label}</span>
              {item.count !== undefined && item.count > 0 && (
                <span className={`text-[9px] font-mono font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${item.countColor}`}>
                  {item.count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom Signout */}
      <div className="p-4 border-t border-border flex-shrink-0">
        <button
          onClick={onLogout}
          className="w-full bg-transparent hover:border-accent hover:text-accent border border-border text-text-muted py-2 rounded font-mono text-[10px] tracking-wider transition-all duration-200 cursor-pointer"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
