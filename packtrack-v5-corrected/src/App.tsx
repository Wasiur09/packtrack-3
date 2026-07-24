/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { User, Submission } from './types';
import { pendingFor } from './shared/constants';
import LoginScreen from './components/LoginScreen';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import SubmitArtwork from './components/SubmitArtwork';
import ReviewQueue from './components/ReviewQueue';
import Tracker from './components/Tracker';
import Archive from './components/Archive';
import AuditTrail from './components/AuditTrail';
import EmailLog from './components/EmailLog';
import AdminPanel from './components/AdminPanel';
import ReviewModal from './components/ReviewModal';
import DetailModal from './components/DetailModal';
import NotificationBell from './components/NotificationBell';
import ToastContainer, { emitToast } from './components/Toast';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [reviewSubId, setReviewSubId] = useState<string | null>(null);
  const [detailSubId, setDetailSubId] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebar_collapsed');
    return saved === 'true';
  });

  useEffect(() => {
    localStorage.setItem('sidebar_collapsed', String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  // Load submissions initially and on login
  const loadSubmissions = async () => {
    try {
      const res = await fetch('/api/submissions');
      if (res.ok) {
        const data = await res.json();
        setSubmissions(data);
      }
    } catch (e) {
      console.error('Failed to connect to backend api', e);
    }
  };

  useEffect(() => {
    if (currentUser) {
      loadSubmissions();
      // Poll submissions every 3 seconds for real-time workflow sync
      const interval = setInterval(loadSubmissions, 3000);
      return () => clearInterval(interval);
    }
  }, [currentUser]);

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    // IB-CO starts on dashboard, other roles can start on Review queue for quick action
    if (user.role !== 'IB-CO') {
      setActiveTab('review');
    } else {
      setActiveTab('dashboard');
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setActiveTab('dashboard');
  };

  if (!currentUser) {
    return (
      <>
        <LoginScreen onLogin={handleLogin} />
        <ToastContainer />
      </>
    );
  }

  // Calculate pending unread items for badge counters
  // Badge/pending count is sub-stage aware: a member only sees items delegated
  // to them, not everything sitting at their department (see pendingFor).
  const getPendingTasks = () => pendingFor(currentUser, submissions);

  const pendingCount = getPendingTasks().length;

  const archiveCount = submissions.filter(s =>
    s.status === 'Approved' || (s.status === 'Correction' && s.stageIndex === 0)
  ).length;

  return (
    <div className="min-h-screen bg-bg text-text-main font-sans flex relative overflow-hidden">
      {/* Sidebar Shell */}
      <Sidebar
        user={currentUser}
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
        }}
        pendingCount={pendingCount}
        archiveCount={archiveCount}
        onLogout={handleLogout}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
      />

      {/* Main Viewport panel */}
      <div className={`flex-1 min-h-screen flex flex-col transition-all duration-300 ${
        isSidebarCollapsed ? 'ml-0' : 'ml-0 md:ml-[220px]'
      }`}>
        {/* Topbar strip */}
        <div className="h-14 bg-surface border-b border-border px-4 md:px-8 flex justify-between items-center sticky top-0 z-10 flex-shrink-0 print:hidden">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className="text-text-muted hover:text-accent font-bold text-xl p-1.5 rounded hover:bg-surface-hover transition-colors flex items-center justify-center h-9 w-9 border border-border/40 hover:border-accent/40 cursor-pointer"
              title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            >
              ☰
            </button>
            <div className="font-display text-lg md:text-xl tracking-wider text-text-main">
              {activeTab === 'emaillog' ? 'EMAIL LOG' : activeTab.toUpperCase().replace('_', ' ')}
            </div>
          </div>
          <div className="flex items-center gap-3 font-mono text-[10px] text-text-muted">
            <span className="hidden sm:inline">{new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'short' })}</span>
            <span className="bg-brand-blue/10 border border-brand-blue/20 text-brand-blue font-mono font-semibold px-2.5 py-0.5 rounded uppercase max-w-[120px] sm:max-w-none truncate">
              {currentUser.role.endsWith('-GA') ? 'Gachha Plant' : currentUser.role === 'IB-CO' ? 'All Plants' : 'Shampur Plant'}
            </span>
            <NotificationBell
              user={currentUser}
              submissions={submissions}
              onOpenReview={setReviewSubId}
              onOpenDetail={setDetailSubId}
            />
          </div>
        </div>

        {/* Content View with Scrolling support */}
        <div className="p-4 md:p-8 flex-1 overflow-auto">
          <div>
            {activeTab === 'dashboard' && (
              <Dashboard
                user={currentUser}
                submissions={submissions}
                onOpenReview={setReviewSubId}
                onOpenDetail={setDetailSubId}
                pendingCount={pendingCount}
              />
            )}

            {activeTab === 'submit' && (
              <SubmitArtwork
                user={currentUser}
                onSubmitSuccess={() => {
                  loadSubmissions();
                  setActiveTab('tracker');
                }}
              />
            )}

            {activeTab === 'review' && (
              <ReviewQueue
                user={currentUser}
                submissions={submissions}
                onOpenReview={setReviewSubId}
                onOpenDetail={setDetailSubId}
              />
            )}

            {activeTab === 'tracker' && (
              <Tracker
                user={currentUser}
                submissions={submissions}
                onOpenDetail={setDetailSubId}
                onOpenReview={setReviewSubId}
              />
            )}

            {activeTab === 'archive' && (
              <Archive
                user={currentUser}
                submissions={submissions}
                onOpenDetail={setDetailSubId}
              />
            )}

            {activeTab === 'audit' && (
              <AuditTrail submissions={submissions} />
            )}

            {activeTab === 'emaillog' && (
              <EmailLog submissions={submissions} />
            )}

            {activeTab === 'admin' && (
              <AdminPanel submissions={submissions} user={currentUser} />
            )}
          </div>
        </div>
      </div>

      {/* Popups Reviewer Modal */}
      {reviewSubId && (
        <ReviewModal
          user={currentUser}
          submissionId={reviewSubId}
          onClose={() => setReviewSubId(null)}
          onUpdateSuccess={loadSubmissions}
        />
      )}

      {/* Popups Detail Modal */}
      {detailSubId && (
        <DetailModal
          user={currentUser}
          submissionId={detailSubId}
          onClose={() => setDetailSubId(null)}
        />
      )}

      <ToastContainer />
    </div>
  );
}
