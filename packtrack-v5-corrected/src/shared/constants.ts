/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Single source of truth shared by the client and the Express server.
 * Previously these tables were copy-pasted across ReviewModal, Tracker,
 * DetailModal, LoginScreen and server/db.ts; consolidating removes drift.
 */

export interface Personnel {
  name: string;
  dept: string;
  isHead: boolean;
  site: string;
  email: string;
}

export interface ActingUser {
  role: string;
  name: string;
  isHead?: boolean;
}

export const DEPT_LABELS: Record<string, string> = {
  'IB-CO': 'IB Corporate Office', 'IB-SH': 'IB Shampur', 'QC-SH': 'QC Shampur',
  'IRA-SH': 'IRA Shampur', 'QCom-SH': 'QCom Shampur', 'PROD-SH': 'Production SH',
  'RnD-SH': 'R&D Shampur', 'IRA-GA': 'IRA Gachha', 'RnD-GA': 'R&D Gachha',
  'QC-GA': 'QC Gachha', 'QM-GA': 'QM Gachha', 'QCom-GA': 'QCom Gachha'
};

// Departments selectable when IB-SH composes a workflow, per plant.
// IB-CO and IB-SH are the fixed intake/routing prefix and are added automatically.
export const PLANT_DEPARTMENTS: Record<string, string[]> = {
  Shampur: ['IRA-SH', 'QC-SH', 'RnD-SH', 'PROD-SH', 'QCom-SH'],
  Gachha: ['IRA-GA', 'RnD-GA', 'QC-GA', 'QM-GA', 'QCom-GA'],
};

export function plantPrefix(plant: string): string {
  return plant === 'Shampur' ? '[SH]' : plant === 'Gachha' ? '[GA]' : '[--]';
}

export const PERSONNEL: Personnel[] = [
  { name: 'Wasiur Rahman Khan', dept: 'IB-CO', isHead: false, site: 'Corporate Office', email: 'wasiur.khan@aristopharmabd.com' },
  { name: 'Raihanul Islam Eshad', dept: 'IB-CO', isHead: false, site: 'Corporate Office', email: 'raihanul.islam@aristopharmabd.com' },
  { name: 'Tanjib Hussain Chowdhury', dept: 'IB-CO', isHead: false, site: 'Corporate Office', email: 'tanjib.hussain@aristopharmabd.com' },
  { name: 'Sunny Debnath', dept: 'IB-CO', isHead: false, site: 'Corporate Office', email: 'sunny.debnath@aristopharmabd.com' },

  { name: 'Mahmud Chowdhury Sumon', dept: 'IB-SH', isHead: true, site: 'Shampur', email: 'mahmud.sumon@aristopharmabd.com' },
  { name: 'Washim Imran', dept: 'IB-SH', isHead: false, site: 'Shampur', email: 'washim.imran@aristopharmabd.com' },
  { name: 'Hasan Mujtaba', dept: 'IB-SH', isHead: false, site: 'Shampur', email: 'hasan.mujtaba@aristopharmabd.com' },

  { name: 'MM Kamrul Hasan', dept: 'IRA-SH', isHead: true, site: 'Shampur', email: 'kamrul.hasan@aristopharmabd.com' },
  { name: 'Saiful Islam', dept: 'IRA-SH', isHead: false, site: 'Shampur', email: 'saiful.islam@aristopharmabd.com' },

  { name: 'Khalilur Rahman Rokon', dept: 'QC-SH', isHead: true, site: 'Shampur', email: 'khalilur.rokon@aristopharmabd.com' },
  { name: 'Mock_QC-SH_P1', dept: 'QC-SH', isHead: false, site: 'Shampur', email: 'qcsh.member1@aristopharmabd.com' },
  { name: 'Mock_QC-SH_P2', dept: 'QC-SH', isHead: false, site: 'Shampur', email: 'qcsh.member2@aristopharmabd.com' },

  { name: 'Mock_PROD-SH_H', dept: 'PROD-SH', isHead: true, site: 'Shampur', email: 'prodsh.head@aristopharmabd.com' },
  { name: 'Mock_PROD-SH_P1', dept: 'PROD-SH', isHead: false, site: 'Shampur', email: 'prodsh.member1@aristopharmabd.com' },

  { name: 'Mock_RnD-SH_H', dept: 'RnD-SH', isHead: true, site: 'Shampur', email: 'rndsh.head@aristopharmabd.com' },
  { name: 'Mock_RnD-SH_P1', dept: 'RnD-SH', isHead: false, site: 'Shampur', email: 'rndsh.member1@aristopharmabd.com' },
  { name: 'Mock_RnD-SH_P2', dept: 'RnD-SH', isHead: false, site: 'Shampur', email: 'rndsh.member2@aristopharmabd.com' },

  { name: 'Mock_QCom-SH_H', dept: 'QCom-SH', isHead: true, site: 'Shampur', email: 'qcomsh.head@aristopharmabd.com' },
  { name: 'Mock_QCom-SH_P1', dept: 'QCom-SH', isHead: false, site: 'Shampur', email: 'qcomsh.member1@aristopharmabd.com' },

  { name: 'Arifur Rahman Rahul', dept: 'IRA-GA', isHead: true, site: 'Gachha', email: 'arifur.rahul@aristopharmabd.com' },
  { name: 'Tanvin Jahan Asha', dept: 'IRA-GA', isHead: false, site: 'Gachha', email: 'tanvin.asha@aristopharmabd.com' },
  { name: 'Symun Musa', dept: 'IRA-GA', isHead: false, site: 'Gachha', email: 'symun.musa@aristopharmabd.com' },

  { name: 'Mock_QC-GA_H', dept: 'QC-GA', isHead: true, site: 'Gachha', email: 'qcga.head@aristopharmabd.com' },
  { name: 'Mock_QC-GA_P1', dept: 'QC-GA', isHead: false, site: 'Gachha', email: 'qcga.member1@aristopharmabd.com' },

  { name: 'Mock_QM-GA_H', dept: 'QM-GA', isHead: true, site: 'Gachha', email: 'qmga.head@aristopharmabd.com' },
  { name: 'Mock_QM-GA_P1', dept: 'QM-GA', isHead: false, site: 'Gachha', email: 'qmga.member1@aristopharmabd.com' },

  { name: 'Mock_RnD-GA_H', dept: 'RnD-GA', isHead: true, site: 'Gachha', email: 'rndga.head@aristopharmabd.com' },
  { name: 'Mock_RnD-GA_P1', dept: 'RnD-GA', isHead: false, site: 'Gachha', email: 'rndga.member1@aristopharmabd.com' },

  { name: 'Mock_QCom-GA_H', dept: 'QCom-GA', isHead: true, site: 'Gachha', email: 'qcomga.head@aristopharmabd.com' },
  { name: 'Mock_QCom-GA_P1', dept: 'QCom-GA', isHead: false, site: 'Gachha', email: 'qcomga.member1@aristopharmabd.com' }
];

/**
 * The set of submissions that require the given user's action, honoring the
 * head -> member -> head sub-stage. Used for badge counts and queues so a
 * member only sees items actually delegated to them.
 */
export function pendingFor<T extends {
  currentStage: string; status: string;
  subDeptStage?: string; assignedMember?: string | null;
}>(user: ActingUser, submissions: T[]): T[] {
  if (user.role === 'IB-CO') {
    return submissions.filter(s => s.status === 'In Progress' || s.status === 'Correction');
  }
  return submissions.filter(s => {
    if (s.currentStage !== user.role || s.status !== 'In Progress') return false;
    const stage = s.subDeptStage || 'HEAD_ASSIGN';
    if (user.isHead) return stage === 'HEAD_ASSIGN' || stage === 'HEAD_FINAL';
    return stage === 'MEMBER_REVIEW' && s.assignedMember === user.name;
  });
}
