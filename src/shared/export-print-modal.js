// ==================== EXPORT / PRINT MODAL ====================
// Reusable modal mounted by per-page "Export / Print" buttons. Caller passes:
//   isOpen, onClose
//   title          — what's being exported, e.g. "Residents", "Invoices"
//   columns        — [{ key, header, width?, halign?, value?(row) }]
//   rows           — array of plain row objects (already scoped to the page)
//   dateField      — optional. Key on each row used for time-range filtering.
//                    Accepts ISO date strings ("2026-04-05") or epoch numbers.
//                    Omit to disable range filtering.
//   sheetName      — Excel sheet tab name (defaults to title)
//   filenameBase   — defaults to title.toLowerCase()
//   extraMetadata  — optional object of extra label→value pairs to surface in
//                    the metadata block of the rendered report.
//
// The modal owns the format (PDF/Excel) + range selectors. The Export button
// filters rows by range, then hands off to exportReportPDF / exportReportExcel.

const ExportPrintModal = ({ isOpen, onClose, title, columns, rows, dateField, sheetName, filenameBase, extraMetadata }) => {
  if (!isOpen) return null;

  const [format, setFormat]           = React.useState('pdf');
  const [range, setRange]             = React.useState('all');
  const [customStart, setCustomStart] = React.useState('');
  const [customEnd, setCustomEnd]     = React.useState('');

  // --- Range → [start, end] (start inclusive, end exclusive) ---
  const computeRange = () => {
    if (!dateField || range === 'all') return [null, null];
    const now = new Date();
    const startOfDay = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
    if (range === 'today') {
      const s = startOfDay(now);
      const e = new Date(s); e.setDate(e.getDate() + 1);
      return [s, e];
    }
    if (range === 'last7') {
      const e = new Date(startOfDay(now)); e.setDate(e.getDate() + 1);
      const s = new Date(e); s.setDate(s.getDate() - 7);
      return [s, e];
    }
    if (range === 'last30') {
      const e = new Date(startOfDay(now)); e.setDate(e.getDate() + 1);
      const s = new Date(e); s.setDate(s.getDate() - 30);
      return [s, e];
    }
    if (range === 'thisMonth') {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      const e = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      return [s, e];
    }
    if (range === 'thisYear') {
      const s = new Date(now.getFullYear(), 0, 1);
      const e = new Date(now.getFullYear() + 1, 0, 1);
      return [s, e];
    }
    if (range === 'custom') {
      const s = customStart ? new Date(customStart) : null;
      let e = customEnd ? new Date(customEnd) : null;
      if (e) { e = new Date(e); e.setDate(e.getDate() + 1); }   // make end inclusive
      return [s, e];
    }
    return [null, null];
  };

  // --- Filter rows by date range ---
  const filteredRows = React.useMemo(() => {
    if (!rows) return [];
    if (!dateField || range === 'all') return rows;
    const [s, e] = computeRange();
    if (!s && !e) return rows;
    return rows.filter(r => {
      const raw = r[dateField];
      if (!raw) return false;
      const d = typeof raw === 'number' ? new Date(raw) : new Date(raw);
      if (isNaN(d.getTime())) return false;
      if (s && d < s) return false;
      if (e && d >= e) return false;
      return true;
    });
  }, [rows, dateField, range, customStart, customEnd]);

  // --- Build human-readable range label for the report metadata block ---
  const rangeLabel = (() => {
    if (!dateField) return null;
    if (range === 'all')       return 'All time';
    if (range === 'today')     return 'Today';
    if (range === 'last7')     return 'Last 7 days';
    if (range === 'last30')    return 'Last 30 days';
    if (range === 'thisMonth') return 'This month';
    if (range === 'thisYear')  return 'This year';
    if (range === 'custom')    return (customStart || '…') + ' → ' + (customEnd || '…');
    return null;
  })();

  const handleExport = () => {
    const opts = {
      title,
      columns,
      rows: filteredRows,
      metadata: {
        ...(rangeLabel ? { 'Date Range': rangeLabel } : {}),
        ...(extraMetadata || {}),
      },
      filename: filenameBase || (title ? title.toLowerCase().replace(/\s+/g, '_') : 'export'),
      sheetName: sheetName || title,
    };
    try {
      if (format === 'pdf') exportReportPDF(opts);
      else                  exportReportExcel(opts);
      onClose();
    } catch (e) {
      console.error('Export failed:', e);
      alert('Export failed: ' + (e.message || 'unknown error'));
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{maxWidth: 520}}>
        <div className="modal-header">
          <div>
            <h2>Export / Print</h2>
            <div className="modal-sub">{title} — {rows ? rows.length : 0} records available</div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="form-group">
          <label>Format</label>
          <div className="type-selector">
            <button
              className={'type-btn ' + (format === 'pdf' ? 'active' : '')}
              onClick={() => setFormat('pdf')}>
              PDF
            </button>
            <button
              className={'type-btn ' + (format === 'excel' ? 'active' : '')}
              onClick={() => setFormat('excel')}>
              Excel (.xlsx)
            </button>
          </div>
        </div>

        {dateField && (
          <div className="form-group">
            <label>Time range</label>
            <select className="form-input" value={range} onChange={e => setRange(e.target.value)}>
              <option value="all">All time</option>
              <option value="today">Today</option>
              <option value="last7">Last 7 days</option>
              <option value="last30">Last 30 days</option>
              <option value="thisMonth">This month</option>
              <option value="thisYear">This year</option>
              <option value="custom">Custom range…</option>
            </select>
          </div>
        )}

        {dateField && range === 'custom' && (
          <div className="form-group" style={{display:'flex', gap: 8}}>
            <input type="date" className="form-input" value={customStart} onChange={e => setCustomStart(e.target.value)} style={{flex:1}}/>
            <input type="date" className="form-input" value={customEnd}   onChange={e => setCustomEnd(e.target.value)}   style={{flex:1}}/>
          </div>
        )}

        <div style={{marginTop: 12, fontSize: 12, color: '#8a8a8a'}}>
          {filteredRows.length} of {rows ? rows.length : 0} records will be included.
        </div>

        <div className="btn-group" style={{marginTop: 20, justifyContent: 'flex-end'}}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleExport} disabled={filteredRows.length === 0}>
            Export
          </button>
        </div>
      </div>
    </div>
  );
};
