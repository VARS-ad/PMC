// ==================== REPORT TEMPLATE (branded PDF + Excel) ====================
// Used by the "Export / Print" button on every PMC and resident page.
// Generic over data type: callers pass {title, columns, rows, metadata, filename}.
//
// Branding lives in REPORT_BRAND below. To change the header (title, subtitle,
// palette, footer), edit this object — the rest of the template picks up the
// new values automatically. Later this object can be loaded from the data
// store / Settings page; for now it's a single source of truth in code.

// Brand tokens — mirror the official VARS brand book ("Final Brand Colors",
// April 2026 / Groto × VARS). Updating these flows to every export surface
// (PDF, Excel, CSV metadata header).
const REPORT_BRAND = {
  title:        'VARS',
  subtitle:     'PROPERTY MANAGEMENT',
  appName:      'VARS Property Management',
  appLabel:     'VARS · Property Management',
  footerText:   'VARS Property Management · Confidential · For authorised personnel only',
  // Accent (slate-deep) — primary brand surface for headers / shield / row hover
  primaryHex:   '#3E4C59', primaryRgb: [ 62,  76,  89],
  // Slate ink — strongest text, table body
  textDarkHex:  '#131F23', textDarkRgb:[ 19,  31,  35],
  // Muted slate — labels, footnotes
  textMuteHex:  '#61707D', textMuteRgb:[ 97, 112, 125],
  // Light slate border
  borderHex:    '#E6EAE9', borderRgb:  [230, 234, 233],
  // Off-white neutral surface (the cream from the brand-book neutrals row)
  surfaceHex:   '#F2F6F5', surfaceRgb: [242, 246, 245],
};

// ---------- shared helpers ----------

const _nowStamp = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) +
         ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
};

const _safeFilename = (base) => {
  const stamp = new Date().toISOString().slice(0, 10);
  return String(base || 'export').replace(/[^a-zA-Z0-9_-]/g, '_') + '_' + stamp;
};

// Build the metadata pairs always shown on every report. Caller-supplied pairs
// merge on top so each page can add domain-specific lines (e.g. "Date Range").
const _buildMetaPairs = (title, rows, extra) => {
  const base = [
    ['Report',        title || 'Export'],
    ['Generated',     _nowStamp()],
    ['Total Records', String(rows.length)],
  ];
  const extraPairs = [];
  if (extra && typeof extra === 'object') {
    Object.keys(extra).forEach(k => { if (extra[k] != null && extra[k] !== '') extraPairs.push([k, String(extra[k])]); });
  }
  return base.concat(extraPairs);
};

// Convert a row + columns array into a 2D value array for the table body.
// Numeric columns (column.numeric === true, or values that already are numbers)
// are coerced to Number so downstream renderers (PDF + Excel) can apply thousand
// separators and right-align. PostgREST returns NUMERIC types as strings, so we
// coerce here rather than asking every caller to wrap with `value: r => Number(...)`.
const _rowsToAOA = (rows, columns) =>
  rows.map(r => columns.map(c => {
    const raw = typeof c.value === 'function' ? c.value(r) : r[c.key];
    if (raw == null || raw === '') return '';
    if (c.numeric) {
      const n = Number(raw);
      return Number.isFinite(n) ? n : raw;
    }
    return raw;
  }));

// Format a numeric value with locale-aware thousand separators. Integer-looking
// numbers stay integers; anything with decimals keeps up to 2 places.
const _formatNumber = (v) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return v == null ? '' : String(v);
  const fractionDigits = Number.isInteger(v) ? 0 : 2;
  return v.toLocaleString('en-US', { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits });
};

// ---------- PDF export ----------

const exportReportPDF = async ({ title, subtitle, columns, rows, metadata, filename }) => {
  await ensurePdf();
  const jsPDFCtor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
  if (!jsPDFCtor) { alert('PDF library failed to load — please reload the page'); return; }

  const doc = new jsPDFCtor({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 28;
  let y = 28;

  // === Brand header ===
  // Dark slate square with the official VARS glyph (asymmetric door shape)
  // in white inside it. Coordinates lifted from the brand book SVG (100x100
  // viewBox), scaled to fit a 32×32 shield.
  doc.setFillColor(...REPORT_BRAND.primaryRgb);
  doc.roundedRect(marginX, y, 32, 32, 3, 3, 'F');
  const SHIELD = 32, SX = SHIELD / 100;
  // Path: M33.3,16.7 L50,16.7 L58.1,25.2 L66.7,33.3 L66.7,83.3 L50,83.3 L33.3,66.7 Z
  const glyphDeltas = [
    [16.7 * SX, 0],
    [ 8.1 * SX, 8.5 * SX],
    [ 8.6 * SX, 8.1 * SX],
    [ 0,       50.0 * SX],
    [-16.7 * SX, 0],
    [-16.7 * SX,-16.6 * SX],
  ];
  doc.setFillColor(255, 255, 255);
  doc.lines(glyphDeltas, marginX + 33.3 * SX, y + 16.7 * SX, [1, 1], 'F', true);

  // VARS wordmark + subtitle (left-aligned)
  doc.setTextColor(...REPORT_BRAND.textDarkRgb);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(22);
  doc.text(REPORT_BRAND.title, marginX + 42, y + 20);

  doc.setFontSize(8);
  doc.setTextColor(90, 90, 90);
  doc.setFont('helvetica', 'bold');
  doc.text((subtitle || REPORT_BRAND.subtitle).toUpperCase(), marginX + 42, y + 32);

  // Right-side: generation stamp + app label
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...REPORT_BRAND.textMuteRgb);
  doc.text('Generated ' + _nowStamp(), pageW - marginX, y + 20, { align: 'right' });
  doc.text(REPORT_BRAND.appLabel, pageW - marginX, y + 32, { align: 'right' });

  // Divider under header
  y += 44;
  doc.setDrawColor(...REPORT_BRAND.primaryRgb);
  doc.setLineWidth(1.2);
  doc.line(marginX, y, pageW - marginX, y);
  y += 12;

  // === Metadata box (2-col grid) ===
  const metaPairs = _buildMetaPairs(title, rows, metadata);
  // Render in rows of 2; box height grows with pair count
  const cellH = 16;
  const innerPadTop = 12;
  const metaRows = Math.ceil(metaPairs.length / 2);
  const metaBoxH = innerPadTop * 2 + metaRows * cellH - 4;

  doc.setFillColor(...REPORT_BRAND.surfaceRgb);
  doc.setDrawColor(...REPORT_BRAND.borderRgb);
  doc.setLineWidth(0.5);
  doc.roundedRect(marginX, y, pageW - marginX*2, metaBoxH, 4, 4, 'FD');

  const colW = (pageW - marginX*2 - 24) / 2;
  metaPairs.forEach((pair, i) => {
    const colIdx = i % 2;
    const rowIdx = Math.floor(i / 2);
    const cellX = marginX + 12 + colIdx * colW;
    const cellY = y + innerPadTop + rowIdx * cellH;
    doc.setFontSize(7);
    doc.setTextColor(...REPORT_BRAND.textMuteRgb);
    doc.setFont('helvetica', 'bold');
    doc.text(String(pair[0]).toUpperCase(), cellX, cellY);
    doc.setFontSize(9);
    doc.setTextColor(...REPORT_BRAND.textDarkRgb);
    doc.setFont('helvetica', 'normal');
    const maxValW = colW - 90;
    const valStr = doc.splitTextToSize(String(pair[1] || ''), maxValW).slice(0, 1).join('');
    doc.text(valStr, cellX + 82, cellY);
  });
  y += metaBoxH + 12;

  // === Data table ===
  if (!doc.autoTable) { alert('PDF table plugin failed to load — please reload the page'); return; }
  const aoa = _rowsToAOA(rows, columns);

  // Treat column `width` as a relative weight and scale so the table fills the
  // page. Without this, autoTable interprets raw widths as points (1pt ≈ 1/72")
  // and the table ends up ~20% of page width with text wrapping per character.
  const usableW = pageW - marginX * 2;
  const totalWeight = columns.reduce((s, c) => s + (c.width || 14), 0);
  const colStyles = columns.reduce((acc, c, idx) => {
    const w = c.width || 14;
    acc[idx] = { cellWidth: (w / totalWeight) * usableW };
    if (c.halign) acc[idx].halign = c.halign;
    return acc;
  }, {});

  doc.autoTable({
    startY: y,
    head: [columns.map(c => c.header)],
    body: aoa.map(r => r.map(v => v == null ? '' : (typeof v === 'number' ? _formatNumber(v) : String(v)))),
    theme: 'grid',
    tableWidth: usableW,
    styles: {
      font: 'helvetica', fontSize: 9, cellPadding: 5,
      textColor: REPORT_BRAND.textDarkRgb, lineColor: REPORT_BRAND.borderRgb,
      lineWidth: 0.3, overflow: 'linebreak', valign: 'top',
    },
    headStyles: {
      fillColor: REPORT_BRAND.primaryRgb, textColor: [255, 255, 255],
      fontSize: 9, fontStyle: 'bold', halign: 'left', cellPadding: 6,
      lineColor: REPORT_BRAND.primaryRgb, valign: 'middle',
    },
    alternateRowStyles: { fillColor: REPORT_BRAND.surfaceRgb },
    columnStyles: colStyles,
    margin: { left: marginX, right: marginX, bottom: 36 },
    didDrawPage: () => {
      const footerY = pageH - 20;
      doc.setDrawColor(...REPORT_BRAND.borderRgb);
      doc.setLineWidth(0.4);
      doc.line(marginX, footerY - 10, pageW - marginX, footerY - 10);
      doc.setFontSize(7);
      doc.setTextColor(...REPORT_BRAND.textMuteRgb);
      doc.setFont('helvetica', 'normal');
      doc.text(REPORT_BRAND.footerText, marginX, footerY);
      doc.text('Page ' + doc.internal.getNumberOfPages() + ' · ' + rows.length + ' records',
               pageW - marginX, footerY, { align: 'right' });
    },
  });

  doc.save(_safeFilename(filename) + '.pdf');
};

// ---------- Tenant statement PDF (one-page account-statement style) ----------
//
// Renders a self-contained per-tenant document: brand header + tenant
// identity + Personal Details panel + Contract panel + payment KPIs
// + a payment-history table. Designed for portrait A4 so it prints
// or attaches cleanly to email.
//
// opts.tenant     — { full_name, building_name, unit_number, floor,
//                     emirates_id, passport_number, date_of_birth,
//                     phone, email, emergency_contact_name,
//                     emergency_contact_phone, employer, occupation,
//                     created_at }
// opts.contract   — { tenure, lease_start, lease_end,
//                     monthly_payment_aed, ownership_start }
// opts.payments   — [{ invoice_number, description, amount_aed,
//                      due_date, status, paid_at, payment_method }]
// opts.filename   — base filename (timestamp + .pdf appended)

const exportTenantStatementPDF = async ({ tenant, contract, payments, filename }) => {
  await ensurePdf();
  const jsPDFCtor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
  if (!jsPDFCtor) { alert('PDF library failed to load — please reload the page'); return; }
  const doc = new jsPDFCtor({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 36;
  let y = 28;

  // --- Brand header (compact: small shield + wordmark + subtitle) ---
  doc.setFillColor(...REPORT_BRAND.primaryRgb);
  doc.roundedRect(marginX, y, 28, 28, 3, 3, 'F');
  // Official VARS glyph (28×28 shield → scale 0.28)
  const TS_SX = 28 / 100;
  const tsGlyphDeltas = [
    [16.7 * TS_SX, 0],
    [ 8.1 * TS_SX, 8.5 * TS_SX],
    [ 8.6 * TS_SX, 8.1 * TS_SX],
    [ 0,         50.0 * TS_SX],
    [-16.7 * TS_SX, 0],
    [-16.7 * TS_SX,-16.6 * TS_SX],
  ];
  doc.setFillColor(255, 255, 255);
  doc.lines(tsGlyphDeltas, marginX + 33.3 * TS_SX, y + 16.7 * TS_SX, [1, 1], 'F', true);

  doc.setTextColor(...REPORT_BRAND.textDarkRgb);
  doc.setFontSize(18);
  doc.text(REPORT_BRAND.title, marginX + 36, y + 16);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(90, 90, 90);
  doc.text('TENANT STATEMENT', marginX + 36, y + 26);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...REPORT_BRAND.textMuteRgb);
  doc.text('Generated ' + _nowStamp(), pageW - marginX, y + 16, { align: 'right' });
  doc.text(REPORT_BRAND.appLabel,        pageW - marginX, y + 26, { align: 'right' });

  y += 38;
  doc.setDrawColor(...REPORT_BRAND.primaryRgb);
  doc.setLineWidth(1.2);
  doc.line(marginX, y, pageW - marginX, y);
  y += 14;

  // --- Tenant identity block ---
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(20);
  doc.setTextColor(...REPORT_BRAND.textDarkRgb);
  doc.text(tenant.full_name || '—', marginX, y + 16);
  doc.setFontSize(10);
  doc.setTextColor(...REPORT_BRAND.textMuteRgb);
  const idLine = [
    tenant.building_name,
    tenant.unit_number ? 'Unit ' + tenant.unit_number : null,
    tenant.floor != null ? 'Floor ' + tenant.floor : null,
    contract && contract.tenure ? contract.tenure : null,
  ].filter(Boolean).join('  ·  ');
  doc.text(idLine, marginX, y + 32);
  y += 46;

  // --- Two-column detail panels ---
  const drawPanel = (x, panelY, w, h, title, rows) => {
    doc.setFillColor(...REPORT_BRAND.surfaceRgb);
    doc.setDrawColor(...REPORT_BRAND.borderRgb);
    doc.setLineWidth(0.5);
    doc.roundedRect(x, panelY, w, h, 4, 4, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...REPORT_BRAND.textMuteRgb);
    doc.text(title.toUpperCase(), x + 12, panelY + 16);

    const labelX = x + 12;
    const valueX = x + 110;
    let ry = panelY + 32;
    rows.forEach(([label, value]) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...REPORT_BRAND.textMuteRgb);
      doc.text(label, labelX, ry);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...REPORT_BRAND.textDarkRgb);
      const maxW = (x + w) - valueX - 8;
      const truncated = doc.splitTextToSize(String(value || '—'), maxW).slice(0, 1).join('');
      doc.text(truncated, valueX, ry);
      ry += 14;
    });
  };

  const personalRows = [
    ['Emirates ID',    tenant.emirates_id],
    ['Passport',       tenant.passport_number],
    ['Date of birth',  tenant.date_of_birth],
    ['Phone',          tenant.phone],
    ['Email',          tenant.email],
    ['Emergency name', tenant.emergency_contact_name],
    ['Emergency phone',tenant.emergency_contact_phone],
    ['Employer',       tenant.employer],
    ['Occupation',     tenant.occupation],
  ];
  const contractRows = contract && contract.tenure === 'Owner' ? [
    ['Tenure',         contract.tenure],
    ['Ownership since',contract.ownership_start],
    ['Building',       tenant.building_name],
    ['Unit',           tenant.unit_number],
    ['Floor',          tenant.floor],
    ['Resident since', tenant.created_at ? new Date(tenant.created_at).toLocaleDateString() : null],
  ] : [
    ['Tenure',         (contract && contract.tenure) || '—'],
    ['Lease start',    contract && contract.lease_start],
    ['Lease end',      contract && contract.lease_end],
    ['Monthly rent',   contract && contract.monthly_payment_aed != null ? 'AED ' + Number(contract.monthly_payment_aed).toLocaleString() : null],
    ['Building',       tenant.building_name],
    ['Unit',           tenant.unit_number],
    ['Floor',          tenant.floor],
    ['Resident since', tenant.created_at ? new Date(tenant.created_at).toLocaleDateString() : null],
  ];
  const colW   = (pageW - marginX * 2 - 12) / 2;
  const panelH = Math.max(24 + 14 * personalRows.length + 10, 24 + 14 * contractRows.length + 10);
  drawPanel(marginX,             y, colW, panelH, 'Personal Details', personalRows);
  drawPanel(marginX + colW + 12, y, colW, panelH, 'Contract & Tenancy', contractRows);
  y += panelH + 14;

  // --- Payment KPI row ---
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const totals = (payments || []).reduce((acc, p) => {
    const amt = Number(p.amount_aed) || 0;
    if (p.status === 'Paid') acc.paid += amt;
    else if (p.status === 'Pending' || p.status === 'Overdue') {
      if (p.due_date && new Date(p.due_date) > today) acc.future += amt;
      else acc.outstanding += amt;
    }
    acc.total += amt;
    return acc;
  }, { paid: 0, outstanding: 0, future: 0, total: 0 });
  const kpiW = (pageW - marginX * 2 - 24) / 4;
  const kpiY = y;
  const drawKpi = (i, label, value, color) => {
    const x = marginX + i * (kpiW + 8);
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...REPORT_BRAND.borderRgb);
    doc.roundedRect(x, kpiY, kpiW, 46, 4, 4, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...REPORT_BRAND.textMuteRgb);
    doc.text(label.toUpperCase(), x + 10, kpiY + 16);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(13);
    doc.setTextColor(...(color || REPORT_BRAND.textDarkRgb));
    doc.text('AED ' + Math.round(value).toLocaleString('en-US'), x + 10, kpiY + 36);
  };
  drawKpi(0, 'Total billed', totals.total);
  drawKpi(1, 'Paid',         totals.paid,        [90, 107, 79]);  // green
  drawKpi(2, 'Outstanding',  totals.outstanding, [139, 74, 66]);  // red
  drawKpi(3, 'Future',       totals.future,      [160, 125, 60]); // amber
  y += 60;

  // --- Payment history table (autoTable) ---
  if (!doc.autoTable) { alert('PDF table plugin failed to load'); return; }
  const sortedPayments = (payments || []).slice().sort((a, b) => {
    const ad = a.due_date || a.created_at || ''; const bd = b.due_date || b.created_at || '';
    return bd.localeCompare(ad);
  });
  const tableBody = sortedPayments.map(p => [
    p.invoice_number || '—',
    p.description || '—',
    p.due_date || '—',
    p.paid_at ? new Date(p.paid_at).toISOString().slice(0, 10) : '—',
    p.payment_method || (p.status === 'Paid' ? '—' : 'unpaid'),
    'AED ' + Math.round(Number(p.amount_aed) || 0).toLocaleString('en-US'),
    p.status || '—',
  ]);

  doc.autoTable({
    startY: y,
    head: [['Invoice #', 'Description', 'Due', 'Paid', 'Method', 'Amount', 'Status']],
    body: tableBody,
    theme: 'grid',
    tableWidth: pageW - marginX * 2,
    styles: {
      font: 'helvetica', fontSize: 8, cellPadding: 5,
      textColor: REPORT_BRAND.textDarkRgb, lineColor: REPORT_BRAND.borderRgb,
      lineWidth: 0.3, overflow: 'linebreak', valign: 'top',
    },
    headStyles: {
      fillColor: REPORT_BRAND.primaryRgb, textColor: [255, 255, 255],
      fontSize: 8, fontStyle: 'bold', halign: 'left', cellPadding: 6,
      lineColor: REPORT_BRAND.primaryRgb,
    },
    alternateRowStyles: { fillColor: REPORT_BRAND.surfaceRgb },
    columnStyles: {
      0: { cellWidth: 60 },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 60 },
      3: { cellWidth: 60 },
      4: { cellWidth: 70 },
      5: { cellWidth: 70, halign: 'right' },
      6: { cellWidth: 60 },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 6) {
        const s = String(data.cell.raw || '');
        if (s === 'Paid')      { data.cell.styles.textColor = [90, 107, 79];  data.cell.styles.fontStyle = 'bold'; }
        else if (s === 'Overdue')  { data.cell.styles.textColor = [139, 74, 66];  data.cell.styles.fontStyle = 'bold'; }
        else if (s === 'Pending')  { data.cell.styles.textColor = [160, 125, 60]; data.cell.styles.fontStyle = 'bold'; }
      }
    },
    margin: { left: marginX, right: marginX, bottom: 36 },
    didDrawPage: () => {
      const footerY = pageH - 20;
      doc.setDrawColor(...REPORT_BRAND.borderRgb);
      doc.setLineWidth(0.4);
      doc.line(marginX, footerY - 10, pageW - marginX, footerY - 10);
      doc.setFontSize(7);
      doc.setTextColor(...REPORT_BRAND.textMuteRgb);
      doc.setFont('helvetica', 'normal');
      doc.text(REPORT_BRAND.footerText, marginX, footerY);
      doc.text('Page ' + doc.internal.getNumberOfPages() + ' · ' + (payments || []).length + ' invoices',
               pageW - marginX, footerY, { align: 'right' });
    },
  });

  if (tableBody.length === 0) {
    // autoTable.didDrawPage won't fire if body is empty — draw a friendly placeholder.
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(...REPORT_BRAND.textMuteRgb);
    doc.text('No invoices on record for this tenant yet.', marginX, y + 24);
    const footerY = pageH - 20;
    doc.setDrawColor(...REPORT_BRAND.borderRgb);
    doc.setLineWidth(0.4);
    doc.line(marginX, footerY - 10, pageW - marginX, footerY - 10);
    doc.setFontSize(7);
    doc.text(REPORT_BRAND.footerText, marginX, footerY);
  }

  doc.save(_safeFilename(filename || 'tenant_statement') + '.pdf');
};

// ---------- Excel export ----------

const exportReportExcel = ({ title, subtitle, sheetName, columns, rows, metadata, filename }) => {
  if (!window.XLSX) { alert('Excel library failed to load — please reload the page'); return; }
  const X = window.XLSX;

  // Strip the leading '#' off hex colours — xlsx-js-style wants raw RGB strings
  const C = {
    brand:    REPORT_BRAND.primaryHex.replace('#',  ''),
    textDark: REPORT_BRAND.textDarkHex.replace('#', ''),
    textMute: REPORT_BRAND.textMuteHex.replace('#', ''),
    borderLt: REPORT_BRAND.borderHex.replace('#',   ''),
    surface:  REPORT_BRAND.surfaceHex.replace('#',  ''),
  };
  const FONT = 'Helvetica Neue';
  const nCols = columns.length;

  const ws = {};
  const merges = [];
  const setCell = (r, c, value, style) => {
    const addr = X.utils.encode_cell({ r, c });
    const isNum = typeof value === 'number';
    ws[addr] = { t: isNum ? 'n' : 's', v: value == null ? '' : value, s: style || {} };
  };

  let r = 0;

  // Row 0+1, col A: V-shield logo cell (merged vertically)
  setCell(r, 0, 'V', {
    font: { name: FONT, sz: 36, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { patternType: 'solid', fgColor: { rgb: C.brand } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: {
      top: { style: 'medium', color: { rgb: C.brand } }, bottom: { style: 'medium', color: { rgb: C.brand } },
      left:{ style: 'medium', color: { rgb: C.brand } }, right:  { style: 'medium', color: { rgb: C.brand } },
    },
  });
  setCell(r + 1, 0, '', { fill: { patternType: 'solid', fgColor: { rgb: C.brand } } });
  merges.push({ s: { r: 0, c: 0 }, e: { r: 1, c: 0 } });

  // Row 0, cols B..end: VARS wordmark
  setCell(r, 1, REPORT_BRAND.title, {
    font: { name: FONT, sz: 22, bold: true, color: { rgb: C.textDark } },
    fill: { patternType: 'solid', fgColor: { rgb: C.surface } },
    alignment: { horizontal: 'left', vertical: 'center', indent: 1 },
  });
  for (let c = 2; c < nCols; c++) {
    setCell(r, c, '', { fill: { patternType: 'solid', fgColor: { rgb: C.surface } } });
  }
  if (nCols > 1) merges.push({ s: { r: 0, c: 1 }, e: { r: 0, c: nCols - 1 } });
  r++;

  // Row 1, cols B..end: subtitle
  setCell(r, 1, (subtitle || REPORT_BRAND.subtitle).toUpperCase(), {
    font: { name: FONT, sz: 9, bold: true, color: { rgb: C.textMute } },
    fill: { patternType: 'solid', fgColor: { rgb: C.surface } },
    alignment: { horizontal: 'left', vertical: 'center', indent: 1 },
  });
  for (let c = 2; c < nCols; c++) {
    setCell(r, c, '', { fill: { patternType: 'solid', fgColor: { rgb: C.surface } } });
  }
  if (nCols > 1) merges.push({ s: { r: 1, c: 1 }, e: { r: 1, c: nCols - 1 } });
  r++;
  r++; // blank spacer

  // Metadata pairs (LABEL | value spans rest of cols)
  const metaLabelStyle = {
    font: { name: FONT, sz: 9, bold: true, color: { rgb: C.textMute } },
    alignment: { horizontal: 'left', vertical: 'center', indent: 1 },
  };
  const metaValueStyle = {
    font: { name: FONT, sz: 10, color: { rgb: C.textDark } },
    alignment: { horizontal: 'left', vertical: 'center', indent: 1 },
  };
  _buildMetaPairs(title, rows, metadata).forEach(pair => {
    setCell(r, 0, pair[0].toUpperCase(), metaLabelStyle);
    setCell(r, 1, pair[1], metaValueStyle);
    if (nCols > 1) merges.push({ s: { r, c: 1 }, e: { r, c: nCols - 1 } });
    r++;
  });
  r++; // spacer
  const headerRowIdx = r;

  // Column header row
  const headerStyle = {
    font: { name: FONT, sz: 9, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { patternType: 'solid', fgColor: { rgb: C.brand } },
    alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
    border: { top:{style:'thin',color:{rgb:C.brand}}, bottom:{style:'thin',color:{rgb:C.brand}}, left:{style:'thin',color:{rgb:C.brand}}, right:{style:'thin',color:{rgb:C.brand}} },
  };
  columns.forEach((col, c) => setCell(r, c, col.header, headerStyle));
  r++;

  // Data rows (alternating fills + hair borders)
  const cellBorder = {
    top:    { style: 'hair', color: { rgb: C.borderLt } }, bottom: { style: 'hair', color: { rgb: C.borderLt } },
    left:   { style: 'hair', color: { rgb: C.borderLt } }, right:  { style: 'hair', color: { rgb: C.borderLt } },
  };
  const baseFont = { name: FONT, sz: 9, color: { rgb: C.textDark } };
  const aoa = _rowsToAOA(rows, columns);
  aoa.forEach((row, idx) => {
    const isAlt = idx % 2 === 1;
    row.forEach((val, c) => {
      const isNumber = typeof val === 'number';
      const style = {
        font: baseFont,
        alignment: { horizontal: isNumber ? 'right' : 'left', vertical: 'center' },
        border: cellBorder,
        fill: { patternType: 'solid', fgColor: { rgb: isAlt ? C.surface : 'FFFFFF' } },
      };
      if (isNumber) style.numFmt = Number.isInteger(val) ? '#,##0' : '#,##0.00';
      setCell(r, c, val, style);
    });
    r++;
  });

  r++; // spacer
  setCell(r, 0, '— End of report · ' + rows.length + ' records · Generated by ' + REPORT_BRAND.appName + ' —', {
    font: { name: FONT, sz: 9, italic: true, color: { rgb: C.textMute } },
    alignment: { horizontal: 'left', indent: 1 },
  });
  if (nCols > 1) merges.push({ s: { r, c: 0 }, e: { r, c: nCols - 1 } });
  r++;

  // Sheet config
  ws['!ref'] = X.utils.encode_range({ s: { c: 0, r: 0 }, e: { c: nCols - 1, r: r } });
  ws['!cols'] = columns.map(c => ({ wch: Math.max((c.header || '').length, c.width || 14) }));
  ws['!merges'] = merges;
  ws['!rows'] = [];
  ws['!rows'][0] = { hpt: 32 };
  ws['!rows'][1] = { hpt: 20 };
  ws['!rows'][headerRowIdx] = { hpt: 24 };
  ws['!sheetView'] = [{ showGridLines: false }];
  ws['!views'] = [{ showGridLines: false, state: 'frozen', ySplit: headerRowIdx + 1, topLeftCell: X.utils.encode_cell({ r: headerRowIdx + 1, c: 0 }) }];

  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, ws, (sheetName || title || 'Sheet1').slice(0, 31));
  X.writeFile(wb, _safeFilename(filename) + '.xlsx');
};
