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
const effectiveInvoiceStatus = (inv, today = new Date()) => {
  if (!inv) return 'Pending';
  if (inv.status === 'Paid' || inv.status === 'Cancelled') return inv.status;
  const due = inv.due_date ? new Date(inv.due_date) : null;
  if (!due || isNaN(due.getTime())) return inv.status;
  const dayMs = 24 * 60 * 60 * 1000;
  const daysUntilDue = Math.floor((due.getTime() - today.getTime()) / dayMs);
  if (daysUntilDue < 0) return 'Overdue';
  if (daysUntilDue > SC_UPCOMING_THRESHOLD_DAYS) return 'Upcoming';
  return 'Pending';
};

const PMCServiceChargesPage = () => {
  const { selectedProperties = [] } = useApp();
  const [invoices, setInvoices] = useState(null);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showDownload, setShowDownload] = useState(false);

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

  const filtered = (invoices || []).filter(i => {
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
    pending:  sumWhere(i => i.effective_status === 'Pending'),   // due within next 30 days
    overdue:  sumWhere(i => i.effective_status === 'Overdue'),
    upcoming: sumWhere(i => i.effective_status === 'Upcoming'),  // scheduled, beyond 30 days
  };
  totals.outstanding = totals.pending + totals.overdue;
  const fmt = (n) => 'AED ' + Math.round(n).toLocaleString();

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Service Charges</h1>
        </div>
        <div className="btn-group">
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
              'Status Filter':   statusFilter === 'all' ? 'All' : statusFilter,
              'Search':          search || '—',
              'Property Filter': selectedProperties.length === 0 ? 'All buildings' : (selectedProperties.length + ' selected'),
              'Total Billed':    'AED ' + Math.round(totals.total).toLocaleString(),
              'Collected':       'AED ' + Math.round(totals.paid).toLocaleString(),
              'Pending':         'AED ' + Math.round(totals.pending).toLocaleString(),
              'Overdue':         'AED ' + Math.round(totals.overdue).toLocaleString(),
              'Upcoming':        'AED ' + Math.round(totals.upcoming).toLocaleString(),
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
              (filtered || []).filter(i => i.effective_status === 'Pending' || i.effective_status === 'Overdue').forEach(i => {
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
              'Upcoming (>30 d)':  'AED ' + Math.round(totals.upcoming).toLocaleString(),
            },
          },
        ]}
      />

      <div className="kpi-row" style={{gridTemplateColumns:'repeat(5, minmax(0, 1fr))'}}>
        <div className="kpi-card"><div className="label">Total Billed</div><div className="value">{fmt(totals.total)}</div></div>
        <div className="kpi-card"><div className="label">Collected</div><div className="value" style={{color:'#5a6b4f'}}>{fmt(totals.paid)}</div></div>
        <div className="kpi-card" title="Due within the next 30 days"><div className="label">Pending</div><div className="value" style={{color:'#a07d3c'}}>{fmt(totals.pending)}</div></div>
        <div className="kpi-card"><div className="label">Overdue</div><div className="value" style={{color:'#8b4a42'}}>{fmt(totals.overdue)}</div></div>
        <div className="kpi-card" title="Scheduled cheques due more than 30 days out — not yet outstanding"><div className="label">Upcoming</div><div className="value" style={{color:'#61707D'}}>{fmt(totals.upcoming)}</div></div>
      </div>

      {/* Aging buckets — receivables by days overdue. Excludes Upcoming (scheduled future cheques). */}
      {invoices !== null && filtered.length > 0 && (() => {
        const today = new Date();
        const buckets = { current: 0, b30: 0, b60: 0, b90: 0, b91: 0 };
        filtered.filter(i => i.effective_status === 'Pending' || i.effective_status === 'Overdue').forEach(i => {
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
            <div style={{marginBottom:12}}>
              <div style={{fontSize:13,fontWeight:600}}>Aging — Receivables by Days Overdue</div>
              <div style={{fontSize:11,color:'var(--text-secondary)',marginTop:2}}>Only unpaid invoices (Pending + Overdue). Older buckets = redder.</div>
            </div>
            <div style={{display:'flex',height:18,borderRadius:9,overflow:'hidden',border:'1px solid var(--border-light)',marginBottom:14}}>
              {rows.map((r, i) => r.amt > 0 && <div key={i} title={r.label + ': ' + fmt(r.amt)} style={{flex: r.amt, background: r.color}}/>)}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))',gap:10}}>
              {rows.map((r, i) => (
                <div key={i} style={{padding:'10px 12px',background:'var(--bg-surface)',borderRadius:6,border:'1px solid var(--border-light)'}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                    <span style={{width:8,height:8,borderRadius:4,background:r.color}}/>
                    <div style={{fontSize:10,letterSpacing:'0.04em',textTransform:'uppercase',color:'var(--text-secondary)'}}>{r.label}</div>
                  </div>
                  <div style={{fontSize:14,fontWeight:600,color:'var(--text-dark)'}}>{fmt(r.amt)}</div>
                  <div style={{fontSize:10,color:'var(--text-muted)',marginTop:2}}>{Math.round(r.amt/total*100)}% of unpaid</div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Charts row — 2 col on desktop, stack on narrow */}
      {invoices !== null && filtered.length > 0 && (() => {
        // monthly bucket totals for last 12 months
        const buckets = buildMonthlyBuckets(12);
        const idxMap = Object.fromEntries(buckets.map((m, i) => [m.key, i]));
        const monthly = { paid: new Array(12).fill(0), pending: new Array(12).fill(0), overdue: new Array(12).fill(0), upcoming: new Array(12).fill(0) };
        filtered.forEach(i => {
          const k = (i.created_at || i.due_date || '').slice(0, 7);
          const idx = idxMap[k]; if (idx == null) return;
          const amt = Number(i.amount_aed) || 0;
          const s = i.effective_status;
          if (s === 'Paid') monthly.paid[idx] += amt;
          else if (s === 'Pending') monthly.pending[idx] += amt;
          else if (s === 'Overdue') monthly.overdue[idx] += amt;
          else if (s === 'Upcoming') monthly.upcoming[idx] += amt;
        });
        // by source type
        const bySource = {};
        filtered.forEach(i => {
          const key = ({ monthly_dues:'Monthly Dues', amenity_booking:'Amenity', service_request:'Maintenance', manual:'Other / Manual' })[i.source_type] || 'Other';
          bySource[key] = (bySource[key] || 0) + Number(i.amount_aed);
        });
        return (
          <div style={{display:'grid',gridTemplateColumns:'1fr',gap:18}}>
            <div className="card">
              <div style={{marginBottom:6}}>
                <div style={{fontSize:13,fontWeight:600}}>Invoices by Month</div>
                <div style={{fontSize:11,color:'var(--text-secondary)',marginTop:2}}>Stacked Paid · Pending · Overdue · Upcoming across last 12 months.</div>
              </div>
              <ChartCanvas height={280} config={{
                type: 'bar',
                data: { labels: buckets.map(m => m.label), datasets: [
                  { label: 'Paid',     data: monthly.paid,     backgroundColor: '#5a6b4f' },
                  { label: 'Pending',  data: monthly.pending,  backgroundColor: '#a07d3c' },
                  { label: 'Overdue',  data: monthly.overdue,  backgroundColor: '#8b4a42' },
                  { label: 'Upcoming', data: monthly.upcoming, backgroundColor: '#D0D6D5' },
                ]},
                options: {
                  responsive: true, maintainAspectRatio: false,
                  interaction: { mode: 'index', intersect: false },
                  plugins: {
                    legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
                    tooltip: { callbacks: { label: (ctx) => ctx.dataset.label + ': AED ' + Math.round(ctx.parsed.y).toLocaleString() } },
                  },
                  scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, ticks: { callback: (v) => 'AED ' + Math.round(v/1000) + 'K' } } },
                },
              }}/>
            </div>
            <div className="card">
              <div style={{marginBottom:6}}>
                <div style={{fontSize:13,fontWeight:600}}>Charges by Source</div>
                <div style={{fontSize:11,color:'var(--text-secondary)',marginTop:2}}>Where invoiced amounts come from. Hover slices for AED.</div>
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
        <div style={{display:'flex',gap:14,flexWrap:'wrap',alignItems:'flex-end',marginBottom:14}}>
          <div style={{flex:'1 1 160px'}}>
            <label style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:6,display:'block',fontWeight:500}}>Status</label>
            <select className="form-input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="all">All statuses</option>
              <option>Paid</option>
              <option>Pending</option>
              <option>Overdue</option>
              <option>Upcoming</option>
              <option>Cancelled</option>
            </select>
          </div>
          <div style={{flex:'2 1 200px'}}>
            <label style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:6,display:'block',fontWeight:500}}>Search</label>
            <input type="text" className="form-input" placeholder="Invoice number, description, resident, unit…" value={search} onChange={e => setSearch(e.target.value)}/>
          </div>
          <button className="btn btn-sm" onClick={() => { setStatusFilter('all'); setSearch(''); }}>Clear</button>
        </div>

        {error && <div style={{padding:10,background:'#fdf2f1',color:'#8b4a42',borderRadius:6,fontSize:12,marginBottom:14}}>{error}</div>}
        {invoices === null ? (
          <div style={{padding:24,color:'var(--text-muted)',fontSize:13}}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{padding:32,color:'var(--text-muted)',fontSize:13,textAlign:'center'}}>No invoices match these filters.</div>
        ) : (
          <table className="data-table">
            <thead><tr><th style={{width:'10%'}}>Invoice #</th><th style={{width:'30%'}}>Description</th><th style={{width:'14%'}}>Resident</th><th style={{width:'16%'}}>Building / Unit</th><th style={{width:'10%',textAlign:'right'}}>Amount</th><th style={{width:'10%'}}>Due</th><th style={{width:'10%'}}>Status</th></tr></thead>
            <tbody>
              {filtered.slice(0, 200).map(i => (
                <tr key={i.id}>
                  <td style={{fontWeight:500,fontSize:12}}>{i.invoice_number || '—'}</td>
                  <td style={{maxWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={i.description}>{i.description}</td>
                  <td>{i.resident_name}</td>
                  <td>{i.building_name}<div style={{fontSize:11,color:'var(--text-muted)'}}>Unit {i.unit_number}</div></td>
                  <td style={{textAlign:'right',fontWeight:500}}>{fmt(i.amount_aed)}</td>
                  <td>{i.due_date || '—'}</td>
                  <td>
                    {(() => {
                      const s = i.effective_status;
                      const c = ({
                        'Paid':      { bg: '#e6efe1', fg: '#5a6b4f' },
                        'Pending':   { bg: '#fdf2dc', fg: '#7a5a1f' },
                        'Overdue':   { bg: '#fdf2f1', fg: '#8b4a42' },
                        'Upcoming':  { bg: '#E6EAE9', fg: '#61707D' },
                        'Cancelled': { bg: '#E6EAE9', fg: '#61707D' },
                      })[s] || { bg: '#E6EAE9', fg: '#61707D' };
                      return (
                        <span style={{padding:'3px 10px',borderRadius:4,fontSize:11,fontWeight:500,background:c.bg,color:c.fg}}
                              title={s === 'Upcoming' ? 'Due more than 30 days out — not yet outstanding' : (s === 'Pending' ? 'Due within the next 30 days' : '')}>
                          {s}
                        </span>
                      );
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

