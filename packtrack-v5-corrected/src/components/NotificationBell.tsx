/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { Bell, CheckCheck, Info, AlertTriangle, CheckCircle, BellOff } from 'lucide-react';
import { User, Submission } from '../types';

interface NotificationBellProps {
  user: User;
  submissions: Submission[];
  onOpenReview: (id: string) => void;
  onOpenDetail: (id: string) => void;
}

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  ts: number;
  subId: string;
  type: 'info' | 'success' | 'warning' | 'alert';
}

function getNotificationsForUser(user: User, submissions: Submission[]): NotificationItem[] {
  const list: NotificationItem[] = [];

  submissions.forEach(s => {
    const isIBCO = user.role === 'IB-CO';
    const isMemberOfWorkflow = s.workflow.includes(user.role);

    // Filter relevant notifications
    if (!isIBCO && !isMemberOfWorkflow) {
      return;
    }

    // 1. Current review assignment
    if (s.status === 'In Progress' && s.currentStage === user.role) {
      let fromWho = 'IB-CO';
      let prevTs = s.submittedAt;
      if (s.stageIndex > 0) {
        const prevDept = s.workflow[s.stageIndex - 1];
        const lastApproval = [...s.history]
          .reverse()
          .find(h => h.dept === prevDept && h.action.includes('Approved'));
        if (lastApproval) {
          fromWho = `${lastApproval.dept} (${lastApproval.by})`;
          prevTs = lastApproval.ts;
        }
      }

      // If delegated specifically to this user
      if (s.subDeptStage === 'MEMBER_REVIEW' && s.assignedMember === user.name) {
        list.push({
          id: `${s.id}-subdept-assigned-${prevTs}`,
          title: 'Assigned Technical Review',
          message: `Department Head delegated the detailed check of ${s.product} (${s.country}) to you.`,
          ts: prevTs + 1,
          subId: s.id,
          type: 'warning'
        });
      } else {
        list.push({
          id: `${s.id}-assigned-${prevTs}`,
          title: 'New Review Assigned',
          message: `Artwork for ${s.product} (${s.country}) is assigned to your department by ${fromWho}.`,
          ts: s.submittedAt,
          subId: s.id,
          type: 'info'
        });
      }
    }

    // 2. History transitions
    s.history.forEach((h) => {
      // Skip actions performed by the current user themselves
      if (h.by === user.name) {
        return;
      }

      if (h.action === 'Submitted') {
        if (isIBCO) {
          list.push({
            id: `${s.id}-submitted-${h.ts}`,
            title: 'New Artwork Submitted',
            message: `Artwork for ${s.product} (${s.country}) was submitted by ${h.by}.`,
            ts: h.ts,
            subId: s.id,
            type: 'info'
          });
        }
      } else if (h.action.includes('Approved')) {
        const nextDeptIdx = s.workflow.indexOf(h.dept) + 1;
        const nextDept = s.workflow[nextDeptIdx];
        list.push({
          id: `${s.id}-approved-${h.dept}-${h.ts}`,
          title: 'Dossier Step Approved',
          message: `${h.dept} (${h.by}) approved artwork for ${s.product} (${s.country})${nextDept ? ` and forwarded it to ${nextDept}` : ''}.`,
          ts: h.ts,
          subId: s.id,
          type: 'success'
        });
      } else if (h.action.includes('Correction') || h.action.includes('Returned')) {
        list.push({
          id: `${s.id}-correction-${h.dept}-${h.ts}`,
          title: 'Correction Requested',
          message: `${h.dept} (${h.by}) requested correction for ${s.product} (${s.country}): "${h.comment || ''}"`,
          ts: h.ts,
          subId: s.id,
          type: 'warning'
        });
      }
    });

    // 3. Fully Approved final state
    if (s.status === 'Approved') {
      const finalApproval = [...s.history]
        .reverse()
        .find(h => h.action.includes('Approved') && s.workflow.indexOf(h.dept) === s.workflow.length - 1);
      const ts = finalApproval ? finalApproval.ts : s.submittedAt;
      list.push({
        id: `${s.id}-final-approval-${ts}`,
        title: 'Artwork Fully Approved',
        message: `Artwork for ${s.product} (${s.country}) has been fully approved and archived!`,
        ts: ts,
        subId: s.id,
        type: 'success'
      });
    }
  });

  // Unique elements by ID to avoid duplicates, sorted newest first
  const seenIds = new Set<string>();
  const uniqList: NotificationItem[] = [];
  list.forEach(item => {
    if (!seenIds.has(item.id)) {
      seenIds.add(item.id);
      uniqList.push(item);
    }
  });

  return uniqList.sort((a, b) => b.ts - a.ts);
}

export default function NotificationBell({
  user,
  submissions,
  onOpenReview,
  onOpenDetail
}: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string>('All');
  const [readIds, setReadIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(`read_notifications_${user.email}`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync read state to localStorage
  useEffect(() => {
    localStorage.setItem(`read_notifications_${user.email}`, JSON.stringify(readIds));
  }, [readIds, user.email]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const notifications = getNotificationsForUser(user, submissions);

  // Extract list of months from notifications for the monthly segregation filter
  const uniqueMonths = Array.from(new Set(notifications.map(n => {
    const d = new Date(n.ts);
    return d.toLocaleString('default', { month: 'long', year: 'numeric' });
  })));

  // Filter notifications by selected month
  const filteredNotifications = selectedMonth === 'All' 
    ? notifications 
    : notifications.filter(n => {
        const monthLabel = new Date(n.ts).toLocaleString('default', { month: 'long', year: 'numeric' });
        return monthLabel === selectedMonth;
      });

  const unreadCount = notifications.filter(n => !readIds.includes(n.id)).length;

  const handleMarkAllRead = () => {
    const allIds = notifications.map(n => n.id);
    setReadIds(allIds);
  };

  const handleNotificationClick = (item: NotificationItem) => {
    if (!readIds.includes(item.id)) {
      setReadIds(prev => [...prev, item.id]);
    }
    setIsOpen(false);

    // Open appropriate view modal
    const s = submissions.find(sub => sub.id === item.subId);
    if (s && s.status === 'In Progress' && s.currentStage === user.role) {
      onOpenReview(s.id);
    } else {
      onOpenDetail(item.subId);
    }
  };

  const formatTime = (ts: number) => {
    const diff = Date.now() - ts;
    if (diff < 60000) return 'Just now';
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getIcon = (type: NotificationItem['type']) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-4 h-4 text-brand-green" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-accent" />;
      case 'alert':
        return <AlertTriangle className="w-4 h-4 text-brand-red" />;
      default:
        return <Info className="w-4 h-4 text-brand-blue" />;
    }
  };

  // Group filtered notifications by month
  const groupedByMonth: Record<string, NotificationItem[]> = {};
  filteredNotifications.forEach(n => {
    const key = new Date(n.ts).toLocaleString('default', { month: 'long', year: 'numeric' });
    if (!groupedByMonth[key]) groupedByMonth[key] = [];
    groupedByMonth[key].push(n);
  });

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-full border border-border bg-surface-hover/50 hover:bg-surface-hover hover:border-accent/40 text-text-muted hover:text-text-main transition-all cursor-pointer flex items-center justify-center"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-haspopup="true"
        aria-expanded={isOpen}
        title="Notifications"
      >
        <Bell className={`w-4 h-4 ${unreadCount > 0 ? 'animate-bounce text-accent' : ''}`} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-accent text-black font-mono font-bold text-[9px] w-4.5 h-4.5 rounded-full flex items-center justify-center border-2 border-surface">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Card */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-surface border border-border shadow-2xl rounded overflow-hidden z-50 animate-fade-in font-sans">
          {/* Header */}
          <div className="px-4 py-3 border-b border-border bg-surface-hover/40 flex justify-between items-center flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-accent" />
              <span className="font-mono text-xs uppercase tracking-wider font-bold text-text-main">Notifications</span>
              {unreadCount > 0 && (
                <span className="bg-accent/10 border border-accent/20 text-accent font-mono text-[9px] px-1.5 rounded font-semibold">
                  {unreadCount} NEW
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="flex items-center gap-1 text-[10px] font-mono text-text-muted hover:text-accent transition-colors cursor-pointer"
                title="Mark all as read"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Mark all read</span>
              </button>
            )}
          </div>

          {/* Monthly Segregation Filtering Bar */}
          <div className="px-4 py-2 border-b border-border bg-surface-hover/20 flex items-center justify-between text-[11px] gap-2 font-mono">
            <span className="text-text-muted uppercase">Timeline Filter:</span>
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              className="bg-surface border border-border rounded text-[10px] px-2 py-1 text-text-main font-bold focus:border-accent outline-none cursor-pointer"
            >
              <option value="All">All Months ({notifications.length})</option>
              {uniqueMonths.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* List grouped by month */}
          <div className="max-h-80 overflow-y-auto divide-y divide-border/40 scrollbar-thin">
            {filteredNotifications.length === 0 ? (
              <div className="p-8 text-center flex flex-col items-center justify-center gap-2 text-text-muted">
                <BellOff className="w-6 h-6 text-text-dim" />
                <span className="font-mono text-[10px] uppercase tracking-wider">No notifications in selected month</span>
              </div>
            ) : (
              Object.keys(groupedByMonth).map(monthName => (
                <div key={monthName}>
                  {/* Sticky Month Section Header */}
                  <div className="bg-surface-hover/80 backdrop-blur sticky top-0 px-4 py-1.5 border-y border-border/30 text-[9px] font-mono font-extrabold tracking-widest text-accent uppercase">
                    ◆ {monthName}
                  </div>
                  <div className="divide-y divide-border/20">
                    {groupedByMonth[monthName].map(item => {
                      const isUnread = !readIds.includes(item.id);
                      return (
                        <div
                          key={item.id}
                          onClick={() => handleNotificationClick(item)}
                          className={`p-3.5 flex gap-3 items-start cursor-pointer hover:bg-surface-hover/60 transition-colors ${
                            isUnread ? 'bg-accent/[0.03] border-l-2 border-l-accent' : 'border-l-2 border-l-transparent'
                          }`}
                        >
                          <div className="mt-0.5 flex-shrink-0">{getIcon(item.type)}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start gap-1">
                              <span className={`text-xs font-semibold text-text-main leading-tight truncate ${isUnread ? 'font-bold text-accent' : ''}`}>
                                {item.title}
                              </span>
                              <span className="font-mono text-[9px] text-text-dim whitespace-nowrap">{formatTime(item.ts)}</span>
                            </div>
                            <p className="text-[11px] text-text-muted leading-snug mt-1 break-words">{item.message}</p>
                            <div className="mt-2 flex items-center gap-1.5">
                              <span className="font-mono text-[9px] bg-surface-hover border border-border px-1.5 py-0.5 rounded text-text-main font-bold">
                                {item.subId}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-border bg-surface-hover/20 text-center">
            <span className="font-mono text-[8px] text-text-dim uppercase tracking-wider">
              Role: {user.role} • Security Context Enabled
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
