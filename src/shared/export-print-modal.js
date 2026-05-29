// ==================== DOWNLOAD DATA MODAL ====================
// Reusable modal mounted by per-page "Download Data" buttons. Callers can use
// it in one of two modes:
//
// (a) SINGLE-DATASET (legacy, backward-compatible). Pass:
//       isOpen, onClose
//       title          — what's being exported, e.g. "Residents", "Invoices"
//       columns        — [{ key, header, width?, halign?, value?(row) }]
//       rows           — array of plain row objects (already scoped to the page)
//       dateField      — optional. Key on each row used for time-range filtering.
//                        Accepts ISO date strings ("2026-04-05") or epoch numbers.
//                        Omit to disable range filtering.
//       sheetName      — Excel sheet tab name (defaults to title)
//       filenameBase   — defaults to title.toLowerCase()
//       extraMetadata  — optional object of extra label→value pairs to surface in
//                        the metadata block of the rendered report.
//       description    — optional override for the "About this report" paragraph.
//
// (b) MULTI-DATASET (new). Pass `dataTypes` as an array of entries shaped like:
//       {
//         id:           'tenants',           // unique id
//         label:        'Tenants',           // shown in the Type dropdown
//         title:        'Tenants',           // passed to the export functions
//         sheetName:    'Tenants',
//         filenameBase: 'tenants',
//         columns:      [...],               // same shape as single-mode
//         rows:         [...],
//         dateField:    'lease_start',       // optional, per-dataset
//         extraMetadata:{...},               // optional, per-dataset
//         description:  '...'                // optional, per-dataset
//       }
//     The modal then shows a Type dropdown above the time-range/format pickers
//     and switches the underlying dataset when the user changes it.
//
// Field order in the modal: Type (if multi) → Time range → Format → Download.
// Format options: PDF, Excel (.xlsx), CSV, Word (.docx — "Coming soon", disabled).

const ExportPrintModal = ({
  isOpen, onClose,
  // single-dataset props
  title, columns, rows, dateField, sheetName, filenameBase, extraMetadata, description,
  // multi-dataset prop
  dataTypes,
}) => {
  if (!isOpen) return null;

  const isMulti = Array.isArray(dataTypes) && dataTypes.length > 0;

  // Active dataset id (only used in multi mode). Default to first entry.
  const [activeTypeId, setActiveTypeId] = React.useState(isMulti ? dataTypes[0].id : null);

  // Resolve the "current" dataset config — either the matching multi entry
  // or the flat single-mode props bundled into the same shape.
  const active = isMulti
    ? (dataTypes.find(d => d.id === activeTypeId) || dataTypes[0])
    : { title, columns, rows, dateField, sheetName, filenameBase, extraMetadata, description };

  const [format, setFormat]           = React.useState('excel');
  const [range, setRange]             = React.useState('all');
  const [customStart, setCustomStart] = React.useState('');
  const [customEnd, setCustomEnd]     = React.useState('');

  // If the active dataset has no dateField, force range back to "all" so we
  // don't silently filter rows out when switching from a time-bound dataset
  // (e.g. Tenants with lease_start) to a non-time-bound one (e.g. Buildings).
  React.useEffect(() => {
    if (!active.dateField && range !== 'all') setRange('all');
  }, [active.dateField]);

  // --- Range → [start, end] (start inclusive, end exclusive) ---
  const computeRange = () => {
    if (!active.dateField || range === 'all') return [null, null];
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
    const dsRows = active.rows;
    if (!dsRows) return [];
    if (!active.dateField || range === 'all') return dsRows;
    const [s, e] = computeRange();
    if (!s && !e) return dsRows;
    return dsRows.filter(r => {
      const raw = r[active.dateField];
      if (!raw) return false;
      const d = typeof raw === 'number' ? new Date(raw) : new Date(raw);
      if (isNaN(d.getTime())) return false;
      if (s && d < s) return false;
      if (e && d >= e) return false;
      return true;
    });
  }, [active.rows, active.dateField, range, customStart, customEnd]);

  // --- Build human-readable range label for the report metadata block ---
  const rangeLabel = (() => {
    if (!active.dateField) return null;
    if (range === 'all')       return 'All time';
    if (range === 'today')     return 'Today';
    if (range === 'last7')     return 'Last 7 days';
    if (range === 'last30')    return 'Last 30 days';
    if (range === 'thisMonth') return 'This month';
    if (range === 'thisYear')  return 'This year';
    if (range === 'custom')    return (customStart || '…') + ' → ' + (customEnd || '…');
    return null;
  })();

  const handleExport = async () => {
    const opts = {
      title:       active.title,
      columns:     active.columns,
      rows:        filteredRows,
      description: active.description,
      metadata: {
        ...(rangeLabel ? { 'Date Range': rangeLabel } : {}),
        ...(active.extraMetadata || {}),
      },
      filename:  active.filenameBase || (active.title ? active.title.toLowerCase().replace(/\s+/g, '_') : 'export'),
      sheetName: active.sheetName || active.title,
    };
    try {
      // Per-dataset override — caller renders the file itself (e.g. a
      // bundled multi-page PDF that doesn't map to a single table).
      if (typeof active.customExport === 'function') {
        await active.customExport({ format, opts, filteredRows });
        onClose();
        return;
      }
      if      (format === 'pdf')   exportReportPDF(opts);
      else if (format === 'csv')   exportReportCSV(opts);
      else if (format === 'word')  exportReportWord(opts);
      else                          exportReportExcel(opts);   // 'excel' (default)
      onClose();
    } catch (e) {
      console.error('Export failed:', e);
      alert('Export failed: ' + (e.message || 'unknown error'));
    }
  };

  // Allowed formats for the active dataset. Defaults to all four when
  // unspecified; a dataset can scope it (e.g. PDF-only for the
  // bundled portfolio report).
  const allowedFormats = Array.isArray(active.supportedFormats) && active.supportedFormats.length > 0
    ? active.supportedFormats
    : ['pdf', 'excel', 'csv', 'word'];
  // If the current format isn't allowed for this dataset, snap to the first allowed.
  React.useEffect(() => {
    if (!allowedFormats.includes(format)) setFormat(allowedFormats[0]);
  }, [active.id, allowedFormats.join(',')]);

  const totalRows = active.rows ? active.rows.length : 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{maxWidth: 520}}>
        <div className="modal-header">
          <div>
            <h2>Download Data</h2>
            <div className="modal-sub">{active.title} — {totalRows} records available</div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {isMulti && (
          <div className="form-group">
            <label>Type</label>
            <select className="form-input" value={activeTypeId} onChange={e => setActiveTypeId(e.target.value)}>
              {dataTypes.map(d => (
                <option key={d.id} value={d.id}>{d.label || d.title}</option>
              ))}
            </select>
          </div>
        )}

        {active.dateField && (
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

        {active.dateField && range === 'custom' && (
          <div className="form-group" style={{display:'flex', gap: 8}}>
            <input type="date" className="form-input" value={customStart} onChange={e => setCustomStart(e.target.value)} style={{flex:1}}/>
            <input type="date" className="form-input" value={customEnd}   onChange={e => setCustomEnd(e.target.value)}   style={{flex:1}}/>
          </div>
        )}

        <div className="form-group">
          <label>Format</label>
          <div className="type-selector">
            {allowedFormats.includes('pdf') && (
              <button className={'type-btn ' + (format === 'pdf' ? 'active' : '')} onClick={() => setFormat('pdf')}>PDF</button>
            )}
            {allowedFormats.includes('excel') && (
              <button className={'type-btn ' + (format === 'excel' ? 'active' : '')} onClick={() => setFormat('excel')}>Excel (.xlsx)</button>
            )}
            {allowedFormats.includes('csv') && (
              <button className={'type-btn ' + (format === 'csv' ? 'active' : '')} onClick={() => setFormat('csv')}>CSV</button>
            )}
            {allowedFormats.includes('word') && (
              <button className={'type-btn ' + (format === 'word' ? 'active' : '')} onClick={() => setFormat('word')}>Word (.doc)</button>
            )}
          </div>
        </div>

        <div style={{marginTop: 12, fontSize: 12, color: '#61707D'}}>
          {active.customExport
            ? (active.description || 'Bundled export — content is composed from the live data on the page.')
            : (filteredRows.length + ' of ' + totalRows + ' records will be included.')}
        </div>

        <div className="btn-group" style={{marginTop: 20, justifyContent: 'flex-end'}}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleExport} disabled={!active.customExport && filteredRows.length === 0}>
            Download
          </button>
        </div>
      </div>
    </div>
  );
};
