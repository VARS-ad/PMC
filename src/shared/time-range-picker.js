// ==================== TIME RANGE PICKER ====================
// Shared filter widget used in the header of Overview, Properties and
// Service Charges. Reads the timeRange / customStart / customEnd values
// from AppContext (so the choice persists across pages) and renders:
//
//   [preset dropdown]  [start date]  →  [end date]
//
// The two date inputs are always visible. When a preset is active they
// show the computed start + end for that preset (e.g. picking
// "3 Months" shows 1 March 2026 → 29 May 2026 today). When the user
// edits either date input directly we switch the mode to 'custom' and
// store both values so the filter elsewhere honours them.

const _TRP_MONTHS_BACK = { '1m': 1, '2m': 2, '3m': 3, '12m': 12 };

// Pure helper — given the active mode and the optional custom dates,
// return the start/end yyyy-mm-dd strings the rest of the UI should use.
const computeTimeRangeBounds = (mode, cs, ce) => {
  if (mode === 'custom') return { start: cs || '', end: ce || '' };
  const monthsBack = _TRP_MONTHS_BACK[mode] || 1;
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - monthsBack + 1, 1).toISOString().slice(0, 10);
  const end   = now.toISOString().slice(0, 10);
  return { start, end };
};

const TimeRangePicker = () => {
  const { timeRange, setTimeRange, customStart, setCustomStart, customEnd, setCustomEnd } = useApp();
  const { start: dispStart, end: dispEnd } = computeTimeRangeBounds(timeRange, customStart, customEnd);

  const onPresetChange = (key) => {
    setTimeRange(key);
    // When user picks a preset, leave customStart/customEnd in state so
    // they remain available for a future toggle back to 'custom'. The
    // date inputs show the computed preset bounds via dispStart/dispEnd.
  };

  // Editing either date input flips the mode to custom and stores BOTH
  // bounds — we freeze whatever was showing on the other side so the
  // range stays consistent.
  const onStartChange = (v) => {
    setCustomStart(v);
    if (!customEnd) setCustomEnd(dispEnd);
    setTimeRange('custom');
  };
  const onEndChange = (v) => {
    setCustomEnd(v);
    if (!customStart) setCustomStart(dispStart);
    setTimeRange('custom');
  };

  const inputStyle = {
    padding:'8px 12px',fontSize:13,borderRadius:6,background:'#fff',
    border:'1px solid var(--border-light)',color:'var(--text-dark)',
    fontFamily:'inherit',outline:'none',
  };

  return (
    <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
      <select value={timeRange} onChange={e => onPresetChange(e.target.value)}
        style={{...inputStyle,padding:'8px 14px',fontWeight:500,cursor:'pointer'}}>
        <option value="1m">1 Month (this month)</option>
        <option value="2m">2 Months</option>
        <option value="3m">3 Months</option>
        <option value="12m">12 Months</option>
        <option value="custom">Custom range…</option>
      </select>
      <input type="date" value={dispStart} onChange={e => onStartChange(e.target.value)} style={inputStyle}/>
      <span style={{color:'var(--text-muted)',fontSize:13}}>→</span>
      <input type="date" value={dispEnd} onChange={e => onEndChange(e.target.value)} style={inputStyle}/>
    </div>
  );
};
