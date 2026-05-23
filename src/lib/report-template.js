// ==================== REPORT TEMPLATE (branded PDF + Excel) ====================
// Used by the "Export / Print" button on every PMC and resident page.
// Generic over data type: callers pass {title, columns, rows, metadata, filename}.
//
// Branding lives in REPORT_BRAND below. To change the header (title, subtitle,
// palette, footer), edit this object — the rest of the template picks up the
// new values automatically. Later this object can be loaded from the data
// store / Settings page; for now it's a single source of truth in code.

const REPORT_BRAND = {
  title:        'VARS',
  subtitle:     'PROPERTY MANAGEMENT SOFTWARE',
  appName:      'VARS Property Management',
  appLabel:     'VARS v1.0 · Property Management',
  footerText:   'VARS Property Management · Confidential · For authorised personnel only',
  // Colours mirror the CSS palette so PDFs and the live UI feel like the same product.
  primaryHex:   '#928989', primaryRgb: [146, 137, 137],
  textDarkHex:  '#1a1a1a', textDarkRgb:[ 26,  26,  26],
  textMuteHex:  '#8a8a8a', textMuteRgb:[138, 138, 138],
  borderHex:    '#ebe7e3', borderRgb:  [235, 231, 227],
  surfaceHex:   '#faf8f6', surfaceRgb: [250, 248, 246],
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

// Convert a row + columns array into a plain text 2D array for the table body.
const _rowsToAOA = (rows, columns) =>
  rows.map(r => columns.map(c => {
    const raw = typeof c.value === 'function' ? c.value(r) : r[c.key];
    if (raw == null) return '';
    return raw;
  }));

// ---------- PDF export ----------

const exportReportPDF = ({ title, subtitle, columns, rows, metadata, filename }) => {
  const jsPDFCtor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
  if (!jsPDFCtor) { alert('PDF library failed to load — please reload the page'); return; }

  const doc = new jsPDFCtor({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 28;
  let y = 28;

  // === Brand header ===
  // V-shield: solid rounded square + bold white "V" wordmark inside
  doc.setFillColor(...REPORT_BRAND.primaryRgb);
  doc.roundedRect(marginX, y, 32, 32, 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  // Anchored at the centre of the 32x32 shield; y-offset puts the baseline
  // slightly below centre so the optical centre of "V" lands in the middle.
  doc.text('V', marginX + 16, y + 23, { align: 'center' });

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
    body: aoa.map(r => r.map(v => v == null ? '' : String(v))),
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
      setCell(r, c, val, {
        font: baseFont,
        alignment: { horizontal: isNumber ? 'right' : 'left', vertical: 'center' },
        border: cellBorder,
        fill: { patternType: 'solid', fgColor: { rgb: isAlt ? C.surface : 'FFFFFF' } },
      });
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
