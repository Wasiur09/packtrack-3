/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { AuditLogEntry, Submission } from '../types';
import { emitToast } from './Toast';

interface AuditTrailProps {
  submissions: Submission[];
}

const generateTimelineOptions = () => {
  const options = [{ value: 'ALL', label: 'All Historic Records' }];
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const endYear = 2026;
  const endMonth = 6; // July (0-indexed)
  for (let year = endYear; year >= 2024; year--) {
    const startM = year === endYear ? endMonth : 11;
    for (let m = startM; m >= 0; m--) {
      const yearStr = year.toString();
      const monthStr = (m + 1).toString().padStart(2, '0');
      options.push({
        value: `${yearStr}-${monthStr}`,
        label: `Since ${months[m]} ${yearStr}`
      });
    }
  }
  return options;
};

export default function AuditTrail({ submissions }: AuditTrailProps) {
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [q, setQ] = useState('');
  
  // Segregated & Bulk Report fields
  const [selectedProduct, setSelectedProduct] = useState('ALL');
  const [selectedCountry, setSelectedCountry] = useState('ALL');
  const [selectedPlant, setSelectedPlant] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [selectedTimeline, setSelectedTimeline] = useState('ALL');

  // Preview State
  const [compiledSubs, setCompiledSubs] = useState<Submission[]>([]);
  const [compiledLogs, setCompiledLogs] = useState<AuditLogEntry[]>([]);
  const [showPreview, setShowPreview] = useState(false);

  // Poll Audit Logs initially
  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await fetch('/api/audit');
        if (res.ok) {
          const data = await res.json();
          setAuditLogs(data);
        }
      } catch (e) {
        console.error('Failed to load audit trail logs from backend', e);
      }
    };
    fetchLogs();
  }, [submissions]);

  // Unique lists for report dropdown filters
  const products = [...new Set(submissions.map(s => s.product))].sort();
  const countries = [...new Set(submissions.map(s => s.country))].sort();

  // Core compiler logic used by preview and export
  const compileReport = () => {
    let filteredSubs = [...submissions];

    // 1. Filter by Product
    if (selectedProduct && selectedProduct !== 'ALL') {
      filteredSubs = filteredSubs.filter(s => s.product === selectedProduct);
    }

    // 2. Filter by Country
    if (selectedCountry && selectedCountry !== 'ALL') {
      filteredSubs = filteredSubs.filter(s => s.country === selectedCountry);
    }

    // 2b. Filter by Plant
    if (selectedPlant && selectedPlant !== 'ALL') {
      filteredSubs = filteredSubs.filter(s => s.plant === selectedPlant);
    }

    // 3. Filter by Status
    if (selectedStatus === 'COMPLETED') {
      filteredSubs = filteredSubs.filter(s => s.status === 'Approved');
    } else if (selectedStatus === 'PENDING') {
      filteredSubs = filteredSubs.filter(s => s.status === 'In Progress');
    } else if (selectedStatus === 'CORRECTION') {
      filteredSubs = filteredSubs.filter(s => s.status === 'Correction');
    }

    // 4. Filter by Timeline
    if (selectedTimeline && selectedTimeline !== 'ALL') {
      const [yr, mn] = selectedTimeline.split('-').map(Number);
      const ms = new Date(yr, mn - 1, 1).getTime();
      filteredSubs = filteredSubs.filter(s => s.submittedAt >= ms);
    }

    // Gather corresponding audit logs for these filtered submissions
    const subIds = new Set(filteredSubs.map(s => s.id));
    const matchedLogs = auditLogs.filter(l => l.submissionId && subIds.has(l.submissionId));

    return {
      filteredSubs,
      matchedLogs
    };
  };

  const handleGeneratePreview = () => {
    const { filteredSubs, matchedLogs } = compileReport();
    setCompiledSubs(filteredSubs);
    setCompiledLogs(matchedLogs);
    setShowPreview(true);
    emitToast(`Successfully compiled ${filteredSubs.length} records!`, 'success');
  };

  const handleExportPDF = () => {
    const { filteredSubs, matchedLogs } = compileReport();

    if (filteredSubs.length === 0) {
      emitToast('No matching records found for the selected filters to export.', 'error');
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      emitToast('Popup blocked! Please allow popups to export the PDF.', 'error');
      return;
    }

    // Construct print-ready document with high-quality A4 layout styling
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Aristopharma Ltd. - Compliance Audit Report</title>
        <style>
          body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            color: #1a1a1a;
            padding: 30px;
            line-height: 1.5;
            background-color: #ffffff;
            font-size: 11px;
          }
          @media print {
            body { padding: 0; }
            .no-print { display: none; }
          }
          .header-container {
            border-bottom: 3px double #1e293b;
            padding-bottom: 12px;
            margin-bottom: 20px;
          }
          .company-title {
            font-size: 18px;
            font-weight: bold;
            letter-spacing: 0.5px;
            color: #000;
          }
          .doc-title {
            font-size: 10px;
            font-family: monospace;
            text-transform: uppercase;
            letter-spacing: 1.5px;
            color: #475569;
            margin-top: 5px;
          }
          .meta-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            padding: 12px;
            border-radius: 4px;
            margin-bottom: 20px;
          }
          .meta-item span {
            font-size: 8px;
            text-transform: uppercase;
            color: #64748b;
            font-family: monospace;
            display: block;
          }
          .meta-item strong {
            font-size: 11px;
            color: #0f172a;
          }
          .section-title {
            font-size: 10px;
            font-family: monospace;
            font-weight: bold;
            color: #1e293b;
            text-transform: uppercase;
            border-bottom: 2px solid #94a3b8;
            padding-bottom: 4px;
            margin-top: 25px;
            margin-bottom: 12px;
            letter-spacing: 1px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
          }
          th, td {
            text-align: left;
            padding: 6px 8px;
            border-bottom: 1px solid #e2e8f0;
          }
          th {
            background-color: #f1f5f9;
            color: #334155;
            font-size: 9px;
            text-transform: uppercase;
            font-family: monospace;
          }
          td {
            font-size: 10px;
          }
          .status-badge {
            display: inline-block;
            font-size: 8px;
            font-family: monospace;
            font-weight: bold;
            text-transform: uppercase;
            padding: 1px 4px;
            border-radius: 3px;
          }
          .status-approved { background: #dcfce7; color: #15803d; }
          .status-pending { background: #dbeafe; color: #1d4ed8; }
          .status-correction { background: #fee2e2; color: #b91c1c; }
          .log-item {
            font-family: monospace;
            font-size: 9px;
            border-bottom: 1px dashed #e2e8f0;
            padding: 6px 0;
          }
          .log-time {
            color: #64748b;
          }
          .log-text {
            color: #0f172a;
            margin-top: 1px;
          }
          .sign-section {
            margin-top: 50px;
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 30px;
            text-align: center;
          }
          .sign-line {
            border-top: 1px solid #94a3b8;
            margin-top: 40px;
            padding-top: 6px;
            font-size: 9px;
            font-family: monospace;
            color: #475569;
          }
          .stamp {
            border: 2px solid #16a34a;
            color: #16a34a;
            font-family: monospace;
            font-size: 9px;
            font-weight: bold;
            text-transform: uppercase;
            padding: 3px 8px;
            display: inline-block;
            transform: rotate(-2deg);
            border-radius: 4px;
            opacity: 0.8;
            margin-bottom: 10px;
          }
          .print-btn-bar {
            margin-bottom: 15px;
            text-align: right;
          }
          .btn {
            background-color: #0f172a;
            color: #ffffff;
            border: none;
            padding: 8px 14px;
            font-size: 10px;
            font-family: monospace;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            cursor: pointer;
            border-radius: 4px;
            font-weight: bold;
          }
          .btn:hover {
            background-color: #000000;
          }
        </style>
      </head>
      <body>
        <div class="print-btn-bar no-print">
          <button class="btn" onclick="window.print()">Print / Save as PDF</button>
        </div>

        <div style="text-align: right; margin-bottom: 5px;">
          <div class="stamp">OFFICIAL COMPLIANCE BUNDLE</div>
        </div>

        <div class="header-container">
          <div class="company-title">ARISTOPHARMA LIMITED</div>
          <div class="doc-title">OFFICIAL PACKAGE WORKFLOW AUDIT REPORT</div>
        </div>

        <div class="meta-grid">
          <div class="meta-item">
            <span>Product Filter</span>
            <strong>${selectedProduct === 'ALL' ? 'ALL PRODUCTS (BULK)' : selectedProduct}</strong>
          </div>
          <div class="meta-item">
            <span>Filing Country</span>
            <strong>${selectedCountry === 'ALL' ? 'ALL COUNTRIES (BULK)' : selectedCountry}</strong>
          </div>
          <div class="meta-item">
            <span>Plant Site</span>
            <strong>${selectedPlant === 'ALL' ? 'ALL PLANTS' : selectedPlant.toUpperCase()}</strong>
          </div>
          <div class="meta-item">
            <span>Workflow Status</span>
            <strong>${
              selectedStatus === 'COMPLETED' ? 'APPROVED WORKFLOWS' :
              selectedStatus === 'PENDING' ? 'PENDING WORKFLOWS' :
              selectedStatus === 'CORRECTION' ? 'CORRECTIONS ONLY' :
              'ALL STATUSES'
            }</strong>
          </div>
          <div class="meta-item">
            <span>Timeline Threshold</span>
            <strong>${
              selectedTimeline === 'ALL' ? 'ALL TIME RECORD' :
              (generateTimelineOptions().find(o => o.value === selectedTimeline)?.label || selectedTimeline).toUpperCase()
            }</strong>
          </div>
          <div class="meta-item">
            <span>Records Compiled</span>
            <strong>${filteredSubs.length} Workflows Found</strong>
          </div>
          <div class="meta-item">
            <span>Report Generated At</span>
            <strong>${new Date().toLocaleString()}</strong>
          </div>
        </div>

        <div class="section-title">Workflow Execution Register</div>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Product Specification</th>
              <th>Target Country</th>
              <th>Plant Site</th>
              <th>Workflow Route</th>
              <th>Current Stage</th>
              <th>Date Filed</th>
              <th>Current Status</th>
            </tr>
          </thead>
          <tbody>
            ${filteredSubs.map(sub => `
              <tr>
                <td style="font-family: monospace; font-weight: bold;">${sub.id}</td>
                <td><strong>${sub.product}</strong> (${sub.dosageForm})</td>
                <td>${sub.country}</td>
                <td>${sub.plant}</td>
                <td>${sub.flowKey}</td>
                <td style="font-family: monospace;">${sub.status === 'Approved' ? 'APPROVED' : sub.currentStage}</td>
                <td>${new Date(sub.submittedAt).toLocaleDateString()}</td>
                <td>
                  <span class="status-badge ${
                    sub.status === 'Approved' ? 'status-approved' :
                    sub.status === 'Correction' ? 'status-correction' :
                    'status-pending'
                  }">${sub.status}</span>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="section-title">Workflow Progress & Signature Log Details</div>
        ${filteredSubs.map(sub => `
          <div style="margin-bottom: 20px; border: 1px solid #e2e8f0; padding: 10px; border-radius: 4px; background: #fff;">
            <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #f1f5f9; padding-bottom: 4px; margin-bottom: 6px;">
              <strong style="font-family: monospace; font-size: 11px;">Workflow Envelope: ${sub.id}</strong>
              <span class="status-badge ${
                sub.status === 'Approved' ? 'status-approved' :
                sub.status === 'Correction' ? 'status-correction' :
                'status-pending'
              }">${sub.status}</span>
            </div>
            <div style="font-size: 10px; margin-bottom: 8px; color: #475569;">
              Product: <strong>${sub.product}</strong> | Country: <strong>${sub.country}</strong> | Plant: <strong>${sub.plant}</strong> | Submitted By: <strong>${sub.submittedBy}</strong>
            </div>
            <div style="font-size: 9px; font-family: monospace; background: #f8fafc; padding: 8px; border-radius: 3px;">
              <div style="font-weight: bold; margin-bottom: 4px; color: #64748b; font-size: 8px; text-transform: uppercase;">Digital Signature Log:</div>
              ${sub.history.map(h => `
                <div style="display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px dashed #e2e8f0;">
                  <span><strong>${h.dept}</strong> (${h.by || 'System Authorized'}) - ${h.action}</span>
                  <span style="color: #64748b;">${new Date(h.ts).toLocaleString()}</span>
                </div>
                ${h.comment ? `<div style="padding: 2px 0 2px 10px; color: #475569; font-style: italic;">Note: "${h.comment}"</div>` : ''}
              `).join('')}
            </div>
          </div>
        `).join('')}

        <div class="section-title">Chronological Activity Audit Log</div>
        <div style="border: 1px solid #e2e8f0; padding: 10px; border-radius: 4px; background: #fcfcfc;">
          ${matchedLogs.length === 0 ? `
            <div style="text-align: center; color: #94a3b8; font-family: monospace; padding: 10px;">No matching chronological actions captured.</div>
          ` : matchedLogs.map(l => `
            <div class="log-item">
              <span class="log-time">[${l.time}]</span>
              <div class="log-text">${l.text.replace(/<\/?[^>]+(>|$)/g, "")}</div>
            </div>
          `).join('')}
        </div>

        <div class="sign-section">
          <div class="meta-item">
            <div class="sign-line">Quality Assurance Officer</div>
          </div>
          <div class="meta-item">
            <div class="sign-line">IB Division Head</div>
          </div>
          <div class="meta-item">
            <div class="sign-line">IT Systems Compliance Auditor</div>
          </div>
        </div>

        <script>
          // Automatic printing invocation after render
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 600);
          }
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    emitToast('PDF Document Export triggered!', 'success');
  };

  // Build a genuine multi-sheet Excel workbook (Office SpreadsheetML, opens
  // natively in Excel) capturing the audit log, the full annotation ledger,
  // and a submission summary — no external dependency required.
  const handleExportExcel = () => {
    const { filteredSubs, matchedLogs } = compileReport();
    if (filteredSubs.length === 0) {
      emitToast('No matching records found for the selected filters to export.', 'error');
      return;
    }

    const esc = (v: any) =>
      String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const cell = (v: any, type: 'String' | 'Number' = 'String') =>
      `<Cell><Data ss:Type="${type}">${type === 'Number' ? (Number(v) || 0) : esc(v)}</Data></Cell>`;
    const headerRow = (cols: string[]) =>
      `<Row>${cols.map(c => `<Cell ss:StyleID="hdr"><Data ss:Type="String">${esc(c)}</Data></Cell>`).join('')}</Row>`;
    const sheet = (name: string, header: string[], rows: string) =>
      `<Worksheet ss:Name="${esc(name).slice(0, 31)}"><Table>${headerRow(header)}${rows}</Table></Worksheet>`;

    // Sheet 1 — Audit Log
    const logRows = matchedLogs
      .slice()
      .sort((a, b) => a.ts - b.ts)
      .map(l =>
        `<Row>${cell(l.time)}${cell(l.submissionId || '')}${cell((l.product || '') + (l.country ? ` / ${l.country}` : ''))}${cell(l.dot === 'green' ? 'Approval' : l.dot === 'red' ? 'Correction' : l.dot === 'orange' ? 'Removal' : 'Action')}${cell(l.text.replace(/<\/?[^>]+(>|$)/g, '').replace(/&nbsp;/g, ' '))}</Row>`
      ).join('');

    // Sheet 2 — Annotation ledger (every annotation recorded during review)
    const annRows = filteredSubs.flatMap(s =>
      (s.annotations || []).slice().sort((a, b) => a.ts - b.ts).map(a =>
        `<Row>${cell(s.id)}${cell(s.product)}${cell(s.country)}${cell(s.plant || '')}${cell(a.type)}${cell(a.by)}${cell(a.role)}${cell(a.page || 1, 'Number')}${cell(a.text || '')}${cell(a.lengthMm ?? '', a.lengthMm != null ? 'Number' : 'String')}${cell(new Date(a.ts).toLocaleString())}</Row>`
      )
    ).join('');
    const totalAnn = filteredSubs.reduce((n, s) => n + (s.annotations?.length || 0), 0);

    // Sheet 3 — Submission summary
    const subRows = filteredSubs.map(s =>
      `<Row>${cell(s.id)}${cell(s.product)}${cell(s.country)}${cell(s.plant || '')}${cell(s.status)}${cell(s.submittedBy || '')}${cell(new Date(s.submittedAt).toLocaleString())}${cell(s.currentStage || '')}${cell(s.annotations?.length || 0, 'Number')}${cell(s.driveFileId ? 'Yes' : 'No')}${cell(s.approvedFileId ? 'Yes' : 'No')}</Row>`
    ).join('');

    const workbook =
      `<?xml version="1.0"?>\n<?mso-application progid="Excel.Sheet"?>\n` +
      `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" xmlns:html="http://www.w3.org/TR/REC-html40">` +
      `<Styles><Style ss:ID="hdr"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#0B5CAD" ss:Pattern="Solid"/></Style></Styles>` +
      sheet('Audit Log', ['Timestamp', 'Submission', 'Product / Country', 'Category', 'Event'], logRows) +
      sheet('Annotations', ['Submission', 'Product', 'Country', 'Plant', 'Type', 'By', 'Role', 'Page', 'Note / Comment', 'Length (mm)', 'Timestamp'],
        annRows || `<Row>${cell('No annotations recorded for the selected filters')}</Row>`) +
      sheet('Submissions', ['ID', 'Product', 'Country', 'Plant', 'Status', 'Submitted By', 'Submitted At', 'Current Stage', 'Annotations', 'Archived (Initial)', 'Archived (Approved)'], subRows) +
      `</Workbook>`;

    const blob = new Blob([workbook], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    const scope = selectedProduct !== 'ALL' ? selectedProduct.replace(/\s+/g, '_') : 'All_Products';
    a.href = url;
    a.download = `PackTrack_Audit_${scope}_${stamp}.xls`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    emitToast(`Excel workbook exported — ${matchedLogs.length} log entries, ${totalAnn} annotations`, 'success');
  };

  const filteredLogs = auditLogs.filter(l => {
    if (q) {
      return (
        l.text.toLowerCase().includes(q.toLowerCase()) ||
        (l.submissionId && l.submissionId.toLowerCase().includes(q.toLowerCase())) ||
        (l.product && l.product.toLowerCase().includes(q.toLowerCase()))
      );
    }
    return true;
  });

  const getDotColorClass = (dot: string) => {
    return {
      orange: 'bg-accent',
      green: 'bg-brand-green',
      blue: 'bg-brand-blue',
      red: 'bg-brand-red'
    }[dot] || 'bg-border';
  };

  return (
    <div className="font-sans grid grid-cols-1 xl:grid-cols-12 gap-6">
      {/* LEFT: Live Chronological Audit Log (7 cols) */}
      <div className="xl:col-span-6 bg-surface border border-border rounded overflow-hidden">
        <div className="p-5 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="font-display text-xl text-text-main tracking-wide">CHRONOLOGICAL AUDIT TRAIL</div>
            <div className="font-mono text-[9px] text-text-muted mt-1 uppercase tracking-wider">
              Immutable logging of all dossier submissions and transitions
            </div>
          </div>
          <input
            type="text"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Filter audit events..."
            className="bg-surface-hover border border-border text-text-main px-3 py-2 rounded text-xs focus:border-accent outline-none min-w-[180px]"
          />
        </div>

        <div className="p-5 max-h-[640px] overflow-y-auto flex flex-col gap-3">
          {filteredLogs.length === 0 ? (
            <div className="text-center text-text-dim font-mono text-xs py-10">
              No audit logs captured yet.
            </div>
          ) : (
            [...filteredLogs].reverse().map(l => (
              <div key={l.id} className="flex gap-4 items-start border-b border-border/20 pb-3 last:border-0 last:pb-0">
                <span className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${getDotColorClass(l.dot)}`} />
                <div className="flex-1">
                  <div
                    className="text-text-muted text-xs font-sans leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: l.text }}
                  />
                  <div className="flex items-center gap-3 mt-1.5 font-mono text-[9px] text-text-dim">
                    <span>{l.time}</span>
                    {l.submissionId && <span className="tid text-[8px]">{l.submissionId}</span>}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* RIGHT: Segregated & Bulk Compliance PDF/Report Generator (6 cols) */}
      <div className="xl:col-span-6 flex flex-col gap-4">
        <div className="bg-surface border border-border p-5 rounded">
          <div className="font-mono text-[10px] text-accent uppercase tracking-widest font-bold mb-1">
            COMPLIANCE REPORT GENERATOR & EXPORTER
          </div>
          <div className="text-text-muted text-xs mb-4">
            Compile formal offline compliance logs sorted by workflows, products, target countries, and timeline criteria.
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[9px] font-mono text-text-muted uppercase tracking-wider mb-1.5">
                Product Selection
              </label>
              <select
                value={selectedProduct}
                onChange={e => setSelectedProduct(e.target.value)}
                className="w-full bg-surface-hover border border-border text-text-main p-2.5 rounded text-xs focus:border-accent outline-none"
              >
                <option value="ALL">All Products (Bulk)</option>
                {products.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-[9px] font-mono text-text-muted uppercase tracking-wider mb-1.5">
                Country Selection
              </label>
              <select
                value={selectedCountry}
                onChange={e => setSelectedCountry(e.target.value)}
                className="w-full bg-surface-hover border border-border text-text-main p-2.5 rounded text-xs focus:border-accent outline-none"
              >
                <option value="ALL">All Countries (Bulk)</option>
                {countries.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-[9px] font-mono text-text-muted uppercase tracking-wider mb-1.5">
                Plant Selection
              </label>
              <select
                value={selectedPlant}
                onChange={e => setSelectedPlant(e.target.value)}
                className="w-full bg-surface-hover border border-border text-text-main p-2.5 rounded text-xs focus:border-accent outline-none"
              >
                <option value="ALL">All Plants</option>
                <option value="Shampur">Shampur</option>
                <option value="Gachha">Gachha</option>
              </select>
            </div>

            <div>
              <label className="block text-[9px] font-mono text-text-muted uppercase tracking-wider mb-1.5">
                Workflow Status Filter
              </label>
              <select
                value={selectedStatus}
                onChange={e => setSelectedStatus(e.target.value)}
                className="w-full bg-surface-hover border border-border text-text-main p-2.5 rounded text-xs focus:border-accent outline-none"
              >
                <option value="ALL">All Statuses (Pending & Approved)</option>
                <option value="COMPLETED">Completed / Approved Workflows Only</option>
                <option value="PENDING">Pending / In Progress Workflows Only</option>
                <option value="CORRECTION">Correction Required / Stopped Only</option>
              </select>
            </div>

            <div>
              <label className="block text-[9px] font-mono text-text-muted uppercase tracking-wider mb-1.5">
                Timeline Threshold
              </label>
              <select
                value={selectedTimeline}
                onChange={e => setSelectedTimeline(e.target.value)}
                className="w-full bg-surface-hover border border-border text-text-main p-2.5 rounded text-xs focus:border-accent outline-none"
              >
                {generateTimelineOptions().map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mt-4">
            <button
              onClick={handleGeneratePreview}
              className="bg-transparent border border-border hover:border-text-muted text-text-main py-2.5 rounded font-mono text-xs tracking-wider transition-all"
            >
              Preview
            </button>
            <button
              onClick={handleExportExcel}
              className="bg-brand-green/90 hover:bg-brand-green text-black py-2.5 rounded font-mono text-xs tracking-wider font-semibold transition-all"
            >
              Export Excel
            </button>
            <button
              onClick={handleExportPDF}
              className="bg-accent hover:bg-accent-hover text-black py-2.5 rounded font-mono text-xs tracking-wider font-semibold transition-all"
            >
              Export PDF
            </button>
          </div>
        </div>

        {/* Dynamic Report Preview Block */}
        {showPreview ? (
          <div className="bg-white text-slate-900 border border-slate-300 p-6 rounded shadow-xl font-sans relative animate-fade-in max-h-[440px] overflow-y-auto">
            {/* Header */}
            <div className="border-b-2 border-slate-900 pb-3 mb-4">
              <div className="text-base font-extrabold tracking-wide text-slate-900">
                ARISTOPHARMA LTD. — PACKAGING DIVISION
              </div>
              <div className="text-[9px] font-mono text-slate-500 uppercase tracking-widest mt-1">
                Preview Mode • Compliance Dossier Audit trail
              </div>
            </div>

            {/* Filter tags */}
            <div className="grid grid-cols-2 gap-2 text-[10px] mb-4 bg-slate-50 p-3 rounded border border-slate-200 font-mono text-slate-600">
              <div>PRODUCT: <span className="text-slate-900 font-bold">{selectedProduct === 'ALL' ? 'ALL' : selectedProduct}</span></div>
              <div>COUNTRY: <span className="text-slate-900 font-bold">{selectedCountry === 'ALL' ? 'ALL' : selectedCountry}</span></div>
              <div>STATUS: <span className="text-slate-900 font-bold">{selectedStatus}</span></div>
              <div>TIMELINE: <span className="text-slate-900 font-bold">{selectedTimeline === 'ALL' ? 'ALL' : (generateTimelineOptions().find(o => o.value === selectedTimeline)?.label || selectedTimeline)}</span></div>
              <div className="col-span-2 border-t border-slate-200 pt-1.5 mt-1 font-sans text-xs">
                Matches found: <strong>{compiledSubs.length} workflows</strong>
              </div>
            </div>

            {/* Submissions Register */}
            {compiledSubs.length === 0 ? (
              <div className="text-center font-mono text-xs text-slate-400 py-6">
                No matching workflows discovered.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {compiledSubs.map(sub => (
                  <div key={sub.id} className="border border-slate-200 rounded p-3 text-[11px] bg-slate-50/50">
                    <div className="flex justify-between items-center border-b border-slate-200 pb-1.5 mb-2">
                      <span className="font-mono font-bold text-slate-900">{sub.id}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[8px] font-mono uppercase font-bold ${
                        sub.status === 'Approved' ? 'bg-green-100 text-green-800' :
                        sub.status === 'Correction' ? 'bg-red-100 text-red-800' :
                        'bg-blue-100 text-blue-800'
                      }`}>
                        {sub.status}
                      </span>
                    </div>
                    <div>Product: <strong className="text-slate-800">{sub.product}</strong></div>
                    <div>Filing Country: <span className="text-slate-700">{sub.country}</span></div>
                    <div>Plant Site: <span className="text-slate-700">{sub.plant}</span></div>
                    
                    {/* Signatures List */}
                    <div className="mt-2 border-t border-slate-200 pt-2 text-[9px] text-slate-500 font-mono">
                      <div>Signatures Stamps:</div>
                      {sub.history.map((h, i) => (
                        <div key={i} className="flex justify-between mt-1 border-b border-slate-100 pb-1 last:border-0">
                          <span>{h.by} ({h.dept})</span>
                          <span>{h.action} · {new Date(h.ts).toLocaleDateString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-surface border border-border p-8 rounded text-center text-text-dim font-mono text-xs flex-1 flex items-center justify-center">
            No active report preview compiled. Adjust the parameters above and click "Preview Live Report" to inspect, or click "Export PDF" directly to print.
          </div>
        )}
      </div>
    </div>
  );
}
