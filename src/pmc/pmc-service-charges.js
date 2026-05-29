// ==================== PMC SERVICE CHARGES PAGE (replaces Payment placeholder) ====================

// Display-only status derived from DB status + due_date. The invoices.status
// check constraint accepts only Pending/Paid/Overdue/Cancelled, so we keep the
// DB value as-is but split "Pending" into:
//   - "Upcoming"  → due_date is more than 30 days in the future
//   - "Pending"   → due within the next 30 days (current portion of receivables)
//   - "Overdue"   → due_date already passed (covers stale Pending rows too)
// Outstanding receivables = Pending + Overdue; Upcoming is scheduled cash that
// has not been billed-out yet by accounting convention.
const SC_UPCOMING_THRESHOLD_DAYS = 30;
// Display labels follow the Operating Income naming agreed with the user:
//   Paid (cash received)  → 'Paid'
//   Past due              → 'Pending'
//   Due within next 30d   → 'Upcoming'
//   Due more than 30d out → 'Future'
const effectiveInvoiceStatus = (inv, today = new Date()) => {
  if (!inv) return 'Upcoming';
  if (inv.status === 'Paid' || inv.status === 'Cancelled') return inv.status;
  const due = inv.due_date ? new Date(inv.due_date) : null;
  if (!due || isNaN(due.getTime())) return inv.status;
  const dayMs = 24 * 60 * 60 * 1000;
  const daysUntilDue = Math.floor((due.getTime() - today.getTime()) / dayMs);
  if (daysUntilDue < 0) return 'Pending';                              // past due
  if (daysUntilDue > SC_UPCOMING_THRESHOLD_DAYS) return 'Future';      // beyond 30 days
  return 'Upcoming';                                                    // within next 30 days
};

const PMCServiceChargesPage = () => {
  const { selectedProperties = [], timeRange, setTimeRange, customStart, setCustomStart, customEnd, setCustomEnd } = useApp();
  const [invoices, setInvoices] = useState(null);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showDownload, setShowDownload] = useState(false);
  // Sort state for the invoice table. Default = most-recent issue date
  // first (created_at desc) — the user can switch to Status / Building /
  // Unit / Resident via the four sortable headers. Status sorts past-due
  // to paid first; the three text columns sort A→Z first.
  const [sortBy, setSortBy] = useState({ column: 'created_at', dir: 'desc' });
  const toggleSort = (col) => {
    setSortBy(prev => prev.column === col
      ? { column: col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { column: col, dir: col === 'effective_status' ? 'asc' : 'asc' });
  };
  const monthsBack = ({ '1m': 1, '2m': 2, '3m': 3, '12m': 12 })[timeRange] || 1;

  // Compute the period bounds the same way Overview does, so the shared
  // dropdown means exactly the same thing on both pages.
  const periodBounds = (() => {
    if (timeRange === 'custom' && customStart && customEnd) {
      return { start: customStart, end: customEnd };
    }
    const _now = new Date();
    const start = new Date(_now.getFullYear(), _now.getMonth() - monthsBack + 1, 1).toISOString().slice(0, 10);
    const end   = _now.toISOString().slice(0, 10);
    return { start, end };
  })();

  // Explicit "1 May – 28 May 2026" subtitle so the user always sees the
  // bounds the KPIs below are honouring.
  const explicitRange = (() => {
    const fmtDay = (d, withYear) => {
      const day = d.getDate();
      const mon = d.toLocaleString('en-GB', { month: 'long' });
      return withYear ? (day + ' ' + mon + ' ' + d.getFullYear()) : (day + ' ' + mon);
    };
    let start, end;
    if (timeRange === 'custom') {
      if (!customStart || !customEnd) return 'Pick start and end dates';
      start = new Date(customStart);
      end   = new Date(customEnd);
    } else {
      const _now = new Date();
      start = new Date(_now.getFullYear(), _now.getMonth() - monthsBack + 1, 1);
      end   = _now;
    }
    const sameYear = start.getFullYear() === end.getFullYear();
    return fmtDay(start, !sameYear) + ' – ' + fmtDay(end, true);
  })();

  useEffect(() => {
    let mounted = true;
    setInvoices(null);
    (async () => {
      if (!supabaseClient) { setError('Supabase not initialized'); return; }
      try {
        const filterB = selectedProperties.length > 0 ? selectedProperties : null;
        const { data: units } = await supabaseClient.from('units').select('id,building_id,unit_number,floor');
        const filteredUnits = (units || []).filter(u => !filterB || filterB.includes(u.building_id));
        const fIds = filteredUnits.map(u => u.id);
        const probe = fIds.length ? fIds : ['00000000-0000-0000-0000-000000000000'];
        const [{ data: invs }, { data: bs }] = await Promise.all([
          supabaseClient.from('invoices').select('id,invoice_number,description,amount_aed,due_date,status,source_type,unit_id,resident_profile_id,created_at').in('unit_id', probe).order('created_at', { ascending: false }),
          supabaseClient.from('buildings').select('id,name'),
        ]);
        if (!mounted) return;
        // Resolve every resident referenced on the loaded invoices, ignoring
        // role tags so seeded / re-classified tenants always appear.
        const residentIds = Array.from(new Set((invs || []).map(r => r.resident_profile_id).filter(Boolean)));
        let profs = [];
        if (residentIds.length) {
          const { data } = await supabaseClient.from('profiles').select('id,full_name').in('id', residentIds);
          profs = data || [];
        }
        const uMap = Object.fromEntries(filteredUnits.map(u => [u.id, u]));
        const bMap = Object.fromEntries((bs || []).map(b => [b.id, b]));
        const pMap = Object.fromEntries(profs.map(p => [p.id, p]));
        const today = new Date();
        setInvoices((invs || []).map(i => {
          const u = uMap[i.unit_id];
          return {
            ...i,
            unit_number: u ? u.unit_number : '—',
            floor: u ? u.floor : null,
            building_name: u && bMap[u.building_id] ? bMap[u.building_id].name : '—',
            resident_name: i.resident_profile_id && pMap[i.resident_profile_id] ? pMap[i.resident_profile_id].full_name : '—',
            effective_status: effectiveInvoiceStatus(i, today),
          };
        }));
      } catch (e) { if (mounted) setError(String(e.message || e)); }
    })();
    return () => { mounted = false; };
  }, [selectedProperties.join(',')]);

  // Listen for in-app status flips (Mark-as-Paid from the slot modal) so
  // the pill + bucket update without a round-trip.
  useEffect(() => {
    const handler = (e) => {
      const { invoice_id, new_status } = (e && e.detail) || {};
      if (!invoice_id) return;
      const today = new Date();
      setInvoices(prev => (prev || []).map(i => i.id === invoice_id
        ? { ...i, status: new_status, effective_status: effectiveInvoiceStatus({ ...i, status: new_status }, today) }
        : i));
    };
    window.addEventListener('vars:invoice-status-changed', handler);
    return () => window.removeEventListener('vars:invoice-status-changed', handler);
  }, []);

  const filtered = (invoices || []).filter(i => {
    // Honour the shared time range. Same rule as Overview: invoices
    // whose created_at falls inside [periodStart, periodEnd].
    const issued = (i.created_at || '').slice(0, 10);
    if (!issued || issued < periodBounds.start || issued > periodBounds.end) return false;
    if (statusFilter !== 'all' && i.effective_status !== statusFilter) return false;
    if (search) {
      const hay = ((i.invoice_number || '') + ' ' + i.description + ' ' + i.resident_name + ' ' + i.unit_number).toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const sumWhere = (pred) => filtered.filter(pred).reduce((s, i) => s + Number(i.amount_aed), 0);
  const totals = {
    total:    filtered.reduce((s, i) => s + Number(i.amount_aed), 0),
    paid:     sumWhere(i => i.effective_status === 'Paid'),
    pending:  sumWhere(i => i.effective_status === 'Pending'),   // past due
    upcoming: sumWhere(i => i.effective_status === 'Upcoming'),  // within next 30 days
    future:   sumWhere(i => i.effective_status === 'Future'),    // beyond 30 days
  };
  totals.outstanding = totals.pending + totals.upcoming;
  const fmt = (n) => 'AED ' + Math.round(n).toLocaleString();

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Operating Revenue</h1>
          <div style={{marginTop:6,fontSize:14,color:'var(--text-secondary)',fontWeight:500,letterSpacing:'-0.01em'}}>
            {explicitRange}
          </div>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
          <TimeRangePicker/>
          <button className="btn" onClick={() => setShowDownload(true)} disabled={!invoices || invoices.length === 0}>Download Data</button>
        </div>
      </div>

      <ExportPrintModal
        isOpen={showDownload}
        onClose={() => setShowDownload(false)}
        dataTypes={[
          {
            id:           'invoices',
            label:        'Invoices',
            title:        'Invoices',
            sheetName:    'Invoices',
            filenameBase: 'invoices',
            dateField:    'created_at',
            rows:         filtered,
            columns: [
              { key: 'invoice_number',   header: 'Invoice #',    width: 14 },
              { key: 'resident_name',    header: 'Resident',     width: 24 },
              { key: 'unit_number',      header: 'Unit',         width: 10 },
              { key: 'building_name',    header: 'Building',     width: 24 },
              { key: 'description',      header: 'Description',  width: 30 },
              { key: 'amount_aed',       header: 'Amount (AED)', width: 14, halign: 'right', numeric: true },
              { key: 'effective_status', header: 'Status',       width: 12 },
              { key: 'due_date',         header: 'Due Date',     width: 12 },
              { key: 'created_at',       header: 'Issued',       width: 18,
                value: (r) => r.created_at ? new Date(r.created_at).toLocaleDateString() : '' },
            ],
            extraMetadata: {
              'Period':          explicitRange,
              'Status Filter':   statusFilter === 'all' ? 'All' : statusFilter,
              'Search':          search || '—',
              'Property Filter': selectedProperties.length === 0 ? 'All buildings' : (selectedProperties.length + ' selected'),
              'Total Billed':    'AED ' + Math.round(totals.total).toLocaleString(),
              'Collected':       'AED ' + Math.round(totals.paid).toLocaleString(),
              'Pending':         'AED ' + Math.round(totals.pending).toLocaleString(),
              'Upcoming':        'AED ' + Math.round(totals.upcoming).toLocaleString(),
              'Future':          'AED ' + Math.round(totals.future).toLocaleString(),
              'Outstanding':     'AED ' + Math.round(totals.outstanding).toLocaleString(),
            },
          },
          {
            id:           'aging',
            label:        'Aging Summary',
            title:        'Aging — Receivables by Days Overdue',
            sheetName:    'Aging',
            filenameBase: 'receivables-aging',
            rows: (() => {
              const today = new Date();
              const buckets = { current: 0, b30: 0, b60: 0, b90: 0, b91: 0 };
              (filtered || []).filter(i => i.effective_status === 'Pending' || i.effective_status === 'Upcoming').forEach(i => {
                if (!i.due_date) { buckets.current += Number(i.amount_aed); return; }
                const days = Math.floor((today.getTime() - new Date(i.due_date).getTime()) / (1000 * 60 * 60 * 24));
                if (days <= 0) buckets.current += Number(i.amount_aed);
                else if (days <= 30) buckets.b30 += Number(i.amount_aed);
                else if (days <= 60) buckets.b60 += Number(i.amount_aed);
                else if (days <= 90) buckets.b90 += Number(i.amount_aed);
                else buckets.b91 += Number(i.amount_aed);
              });
              const total = buckets.current + buckets.b30 + buckets.b60 + buckets.b90 + buckets.b91;
              const safe = Math.max(total, 1);
              return [
                { bucket: 'Not yet due', amount: buckets.current, pct: Math.round(buckets.current / safe * 100) },
                { bucket: '1–30 days',    amount: buckets.b30,    pct: Math.round(buckets.b30    / safe * 100) },
                { bucket: '31–60 days',   amount: buckets.b60,    pct: Math.round(buckets.b60    / safe * 100) },
                { bucket: '61–90 days',   amount: buckets.b90,    pct: Math.round(buckets.b90    / safe * 100) },
                { bucket: '90+ days',     amount: buckets.b91,    pct: Math.round(buckets.b91    / safe * 100) },
              ];
            })(),
            columns: [
              { key: 'bucket', header: 'Bucket',           width: 18 },
              { key: 'amount', header: 'Amount (AED)',     width: 16, halign: 'right', numeric: true,
                value: (r) => Math.round(r.amount || 0) },
              { key: 'pct',    header: '% of Outstanding', width: 16, halign: 'right', numeric: true,
                value: (r) => (r.pct || 0) + '%' },
            ],
            extraMetadata: {
              'Property Filter':   selectedProperties.length === 0 ? 'All buildings' : (selectedProperties.length + ' selected'),
              'Status Filter':     statusFilter === 'all' ? 'All' : statusFilter,
              'Total Outstanding': 'AED ' + Math.round(totals.outstanding).toLocaleString(),
              'Future (>30 d)':    'AED ' + Math.round(totals.future).toLocaleString(),
            },
          },
        ]}
      />

      <div className="kpi-row" style={{gridTemplateColumns:'repeat(5, minmax(0, 1fr))'}}>
        <div className="kpi-card"><div className="label">Total Billed</div><div className="value">{fmt(totals.total)}</div></div>
        <div className="kpi-card"><div className="label">Collected</div><div className="value" style={{color:'#5a6b4f'}}>{fmt(totals.paid)}</div></div>
        <div className="kpi-card" title="Past due — not yet paid"><div className="label">Pending</div><div className="value" style={{color:'#8b4a42'}}>{fmt(totals.pending)}</div></div>
        <div className="kpi-card" title="Due within the next 30 days"><div className="label">Upcoming</div><div className="value" style={{color:'#a07d3c'}}>{fmt(totals.upcoming)}</div></div>
        <div className="kpi-card" title="Scheduled cheques due more than 30 days out"><div className="label">Future</div><div className="value" style={{color:'#61707D'}}>{fmt(totals.future)}</div></div>
      </div>

      {/* Aging buckets — receivables by days overdue. Excludes Future (scheduled cheques >30 days out). */}
      {invoices !== null && filtered.length > 0 && (() => {
        const today = new Date();
        const buckets = { current: 0, b30: 0, b60: 0, b90: 0, b91: 0 };
        filtered.filter(i => i.effective_status === 'Pending' || i.effective_status === 'Upcoming').forEach(i => {
          if (!i.due_date) { buckets.current += Number(i.amount_aed); return; }
          const days = Math.floor((today.getTime() - new Date(i.due_date).getTime()) / (1000 * 60 * 60 * 24));
          if (days <= 0) buckets.current += Number(i.amount_aed);
          else if (days <= 30) buckets.b30 += Number(i.amount_aed);
          else if (days <= 60) buckets.b60 += Number(i.amount_aed);
          else if (days <= 90) buckets.b90 += Number(i.amount_aed);
          else buckets.b91 += Number(i.amount_aed);
        });
        const total = Math.max(buckets.current + buckets.b30 + buckets.b60 + buckets.b90 + buckets.b91, 1);
        const rows = [
          { label: 'Not yet due',  amt: buckets.current, color: '#D0D6D5' },
          { label: '1–30 days',     amt: buckets.b30,     color: '#a07d3c' },
          { label: '31–60 days',    amt: buckets.b60,     color: '#8b6a3c' },
          { label: '61–90 days',    amt: buckets.b90,     color: '#8b4a42' },
          { label: '90+ days',      amt: buckets.b91,     color: '#6b2a22' },
        ];
        return (
          <div className="card">
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',marginBottom:18,gap:14,flexWrap:'wrap'}}>
              <div>
                <div style={{fontSize:15,fontWeight:600,color:'var(--text-dark)',letterSpacing:'-0.015em'}}>Aging — Receivables by Days Overdue</div>
                <div style={{fontSize:11,color:'var(--text-muted)',marginTop:3}}>Unpaid invoices · older = redder</div>
              </div>
              <div style={{textAlign:'right'}}>
                <div style={{fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600}}>Total unpaid</div>
                <div style={{fontSize:18,fontWeight:600,color:'var(--text-dark)',letterSpacing:'-0.02em'}}>{fmt(total)}</div>
              </div>
            </div>
            {/* Match the headline KPI row style at the top of the page —
                each bucket is now a kpi-card with bucket name as the
                .label, AED amount as the tinted .value, and the
                percentage on a small subtitle line. */}
            <div className="kpi-row" style={{gridTemplateColumns:'repeat(5, minmax(0, 1fr))',marginBottom:0}}>
              {rows.map((r, i) => {
                const pct = Math.round(r.amt / total * 100);
                const valueColor = r.color === '#D0D6D5' ? 'var(--text-dark)' : r.color;
                return (
                  <div key={i} className="kpi-card">
                    <div className="label">{r.label}</div>
                    <div className="value" style={{color: valueColor}}>{fmt(r.amt)}</div>
                    <div style={{fontSize:11,color:'var(--text-muted)',marginTop:6}}>{pct}% of unpaid</div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Charts row — 2 col on desktop, stack on narrow */}
      {invoices !== null && filtered.length > 0 && (() => {
        // monthly bucket totals for last 12 months
        const buckets = buildMonthlyBuckets(12);
        const idxMap = Object.fromEntries(buckets.map((m, i) => [m.key, i]));
        const monthly = { paid: new Array(12).fill(0), pending: new Array(12).fill(0), upcoming: new Array(12).fill(0), future: new Array(12).fill(0) };
        filtered.forEach(i => {
          const k = (i.created_at || i.due_date || '').slice(0, 7);
          const idx = idxMap[k]; if (idx == null) return;
          const amt = Number(i.amount_aed) || 0;
          const s = i.effective_status;
          if (s === 'Paid') monthly.paid[idx] += amt;
          else if (s === 'Pending')  monthly.pending[idx]  += amt;
          else if (s === 'Upcoming') monthly.upcoming[idx] += amt;
          else if (s === 'Future')   monthly.future[idx]   += amt;
        });
        // by source type
        const bySource = {};
        filtered.forEach(i => {
          const key = ({ monthly_dues:'Monthly Dues', amenity_booking:'Amenity', service_request:'Maintenance', manual:'Other / Manual' })[i.source_type] || 'Other';
          bySource[key] = (bySource[key] || 0) + Number(i.amount_aed);
        });
        // Per-month totals used by the column-top labels.
        const monthlyTotals = monthly.paid.map((_, i) =>
          monthly.paid[i] + monthly.pending[i] + monthly.upcoming[i] + monthly.future[i]
        );
        const grandTotal = monthlyTotals.reduce((s, v) => s + v, 0);
        const fmtAed = (n) => 'AED ' + Math.round(n).toLocaleString();
        return (
          <div style={{display:'grid',gridTemplateColumns:'1fr',gap:18}}>
            <div className="card">
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10,gap:14,flexWrap:'wrap'}}>
                <div>
                  <div style={{fontSize:15,fontWeight:600,color:'var(--text-dark)',letterSpacing:'-0.015em'}}>Invoices by Month</div>
                  <div style={{fontSize:11,color:'var(--text-muted)',marginTop:3}}>Last 12 months · stacked by status</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600}}>Total billed</div>
                  <div style={{fontSize:18,fontWeight:600,color:'var(--text-dark)',letterSpacing:'-0.02em'}}>{fmtAed(grandTotal)}</div>
                </div>
              </div>
              <ChartCanvas height={300} config={{
                type: 'bar',
                data: { labels: buckets.map(m => m.label), datasets: [
                  { label: 'Paid',     data: monthly.paid,     backgroundColor: '#5a6b4f' },
                  { label: 'Pending',  data: monthly.pending,  backgroundColor: '#8b4a42' },
                  { label: 'Upcoming', data: monthly.upcoming, backgroundColor: '#a07d3c' },
                  { label: 'Future',   data: monthly.future,   backgroundColor: '#D0D6D5' },
                ]},
                options: {
                  responsive: true, maintainAspectRatio: false,
                  // Grow the top padding so the per-bar total labels never
                  // clip against the chart border.
                  layout: { padding: { top: 24 } },
                  interaction: { mode: 'index', intersect: false },
                  plugins: {
                    legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
                    tooltip: {
                      callbacks: {
                        label: (ctx) => ctx.dataset.label + ': ' + fmtAed(ctx.parsed.y),
                        // Footer shows the column total when you hover.
                        footer: (items) => {
                          const sum = items.reduce((s, it) => s + (it.parsed.y || 0), 0);
                          return 'Total: ' + fmtAed(sum);
                        },
                      },
                    },
                  },
                  scales: {
                    x: { stacked: true, grid: { display: false } },
                    // Y-axis labels removed — the per-column total drawn
                    // on top of each bar (and the tooltip on hover) make
                    // the scale ticks redundant.
                    y: {
                      stacked: true, beginAtZero: true,
                      display: false,
                      grid: { display: false },
                    },
                  },
                  // Custom plugin: draw the column total on top of each bar.
                  animation: {
                    onComplete: function() {
                      const chart = this;
                      const ctx = chart.ctx;
                      ctx.save();
                      ctx.font = '600 11px Inter, system-ui, sans-serif';
                      ctx.fillStyle = '#131F23';
                      ctx.textAlign = 'center';
                      ctx.textBaseline = 'bottom';
                      const lastDataset = chart.data.datasets.length - 1;
                      const meta = chart.getDatasetMeta(lastDataset);
                      meta.data.forEach((bar, i) => {
                        const total = monthlyTotals[i];
                        if (!total || total <= 0) return;
                        ctx.fillText(fmtAed(total), bar.x, bar.y - 6);
                      });
                      ctx.restore();
                    },
                  },
                },
              }}/>
            </div>
            <div className="card">
              <div style={{marginBottom:10}}>
                <div style={{fontSize:15,fontWeight:600,color:'var(--text-dark)',letterSpacing:'-0.015em'}}>Charges by Source</div>
                <div style={{fontSize:11,color:'var(--text-muted)',marginTop:3}}>Hover a slice to see the AED amount</div>
              </div>
              <ChartCanvas height={280} config={{
                type: 'doughnut',
                data: { labels: Object.keys(bySource), datasets: [{
                  data: Object.values(bySource),
                  backgroundColor: ['#3E4C59','#a07d3c','#5a6b4f','#D0D6D5','#8b4a42','#61707D'],
                  borderWidth: 0,
                }]},
                options: {
                  responsive: true, maintainAspectRatio: false, cutout: '60%',
                  plugins: {
                    legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
                    tooltip: { callbacks: { label: (ctx) => ctx.label + ': AED ' + Math.round(ctx.parsed).toLocaleString() } },
                  },
                },
              }}/>
            </div>
          </div>
        );
      })()}

      <div className="card">
        <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center',marginBottom:16}}>
          <select className="form-input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{flex:'0 1 180px',width:'auto'}}>
            <option value="all">All statuses</option>
            <option>Paid</option>
            <option>Pending</option>
            <option>Upcoming</option>
            <option>Future</option>
            <option>Cancelled</option>
          </select>
          <input type="text" className="form-input" placeholder="Search invoice, description, resident, unit…" value={search} onChange={e => setSearch(e.target.value)} style={{flex:'1 1 260px'}}/>
          {(statusFilter !== 'all' || search) && (
            <button className="btn btn-sm" onClick={() => { setStatusFilter('all'); setSearch(''); }}>Clear</button>
          )}
        </div>

        {error && <div style={{padding:10,background:'#fdf2f1',color:'#8b4a42',borderRadius:6,fontSize:12,marginBottom:14}}>{error}</div>}
        {invoices === null ? (
          <div style={{padding:24,color:'var(--text-muted)',fontSize:13}}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{padding:32,color:'var(--text-muted)',fontSize:13,textAlign:'center'}}>No invoices match these filters.</div>
        ) : (() => {
          // Apply the selected sort. String columns compare locale-aware;
          // dates compare lexically (ISO YYYY-MM-DD); status uses a
          // priority order from past-due to paid so visually sorting feels
          // intuitive instead of alphabetical.
          // Only four columns are sortable: Status, Building, Unit, Resident.
          // Everything else (Invoice / Description / Amount / Due) shows a
          // plain non-clickable header — the user asked to keep the table
          // focused on grouping by who/where, not by recency or value.
          const statusPriority = { Pending: 0, Upcoming: 1, Future: 2, Paid: 3, Cancelled: 4 };
          const sorted = [...filtered].sort((a, b) => {
            const col = sortBy.column;
            let av, bv;
            if (col === 'resident_name')         { av = a.resident_name || ''; bv = b.resident_name || ''; }
            else if (col === 'building_name')    { av = a.building_name  || ''; bv = b.building_name  || ''; }
            else if (col === 'unit_number')      { av = a.unit_number    || ''; bv = b.unit_number    || ''; }
            else if (col === 'effective_status') { av = statusPriority[a.effective_status] ?? 99; bv = statusPriority[b.effective_status] ?? 99; }
            else                                  { av = a.created_at || ''; bv = b.created_at || ''; }
            const cmp = typeof av === 'number' && typeof bv === 'number'
              ? av - bv
              : String(av).localeCompare(String(bv));
            return sortBy.dir === 'asc' ? cmp : -cmp;
          });
          const arrow = (col) => sortBy.column !== col ? '' : (sortBy.dir === 'asc' ? ' ↑' : ' ↓');
          const sortableTh = (col, label, extra) => (
            <th
              onClick={() => toggleSort(col)}
              style={{cursor:'pointer',userSelect:'none',color: sortBy.column === col ? 'var(--text-dark)' : undefined, ...(extra || {})}}
              title={'Sort by ' + label.toLowerCase()}
            >{label}<span style={{fontSize:10,opacity: sortBy.column === col ? 1 : 0.3}}>{arrow(col) || ' ↕'}</span></th>
          );
          return (
          <table className="data-table">
            <thead><tr>
              <th style={{width:'9%'}}>Invoice #</th>
              <th style={{width:'19%'}}>Description</th>
              {sortableTh('resident_name',    'Resident',  {width:'12%'})}
              {sortableTh('building_name',    'Building',  {width:'12%'})}
              {sortableTh('unit_number',      'Unit',      {width:'7%'})}
              <th style={{width:'9%',textAlign:'right'}}>Amount</th>
              <th style={{width:'8%'}}>Due</th>
              {sortableTh('effective_status', 'Status',    {width:'8%'})}
              <th style={{width:'7%',textAlign:'center'}}>Invoice</th>
              <th style={{width:'9%',textAlign:'center'}}>Proof of payment</th>
            </tr></thead>
            <tbody>
              {sorted.slice(0, 200).map(i => (
                <tr key={i.id}>
                  <td style={{fontWeight:500,fontSize:12}}>{i.invoice_number || '—'}</td>
                  <td style={{maxWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={i.description}>{i.description}</td>
                  <td>{i.resident_name}</td>
                  <td>{i.building_name}</td>
                  <td>{i.unit_number}</td>
                  <td style={{textAlign:'right',fontWeight:500}}>{fmt(i.amount_aed)}</td>
                  <td>{i.due_date || '—'}</td>
                  <td>
                    {(() => {
                      const s = i.effective_status;
                      const c = ({
                        'Paid':      { bg: '#e6efe1', fg: '#5a6b4f' },
                        'Pending':   { bg: '#fdf2f1', fg: '#8b4a42' },  // past due
                        'Upcoming':  { bg: '#fdf2dc', fg: '#7a5a1f' },  // within 30 days
                        'Future':    { bg: '#E6EAE9', fg: '#61707D' },  // beyond 30 days
                        'Cancelled': { bg: '#E6EAE9', fg: '#61707D' },
                      })[s] || { bg: '#E6EAE9', fg: '#61707D' };
                      return (
                        <span style={{padding:'3px 10px',borderRadius:4,fontSize:11,fontWeight:500,background:c.bg,color:c.fg}}
                              title={s === 'Future' ? 'Due more than 30 days out' : (s === 'Upcoming' ? 'Due within the next 30 days' : (s === 'Pending' ? 'Past due — not paid yet' : ''))}>
                          {s}
                        </span>
                      );
                    })()}
                  </td>
                  <InvoiceSlotCell invoice={i} slot="invoice"/>
                  <InvoiceSlotCell invoice={i} slot="payment_proof"/>
                </tr>
              ))}
            </tbody>
          </table>
          );
        })()}
      </div>
    </div>
  );
};

