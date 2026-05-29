// ==================== PMC REPORTS PAGE ====================
// Section-grouped landlord reports inspired by vars_landlord_dashboards.md
// (Tier 1 must-haves + Tier 2 operational selections). Reads real data from
// Supabase, scoped to selectedProperties from the top-bar selector.

const PMCReportsPage = () => {
  // Time range now pulls from AppContext for consistency with Overview /
  // Assets / Service Charges. Reports formerly had its own 6m/24m/YTD/All
  // dropdown; the shared TimeRangePicker uses 1m/2m/3m/12m/custom, so
  // users wanting 24m drop into Custom range.
  const { selectedProperties = [], timeRange, customStart, customEnd } = useApp();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  const [section, setSection] = useState('occupancy');
  const [showDownload, setShowDownload] = useState(false);

  // Period bounds from AppContext.
  const _monthsBackMap = { '1m': 1, '2m': 2, '3m': 3, '12m': 12 };
  const monthsBack = timeRange === 'custom' ? null : (_monthsBackMap[timeRange] || 1);
  const periodBounds = (() => {
    if (timeRange === 'custom' && customStart && customEnd) return { start: customStart, end: customEnd };
    const _now = new Date();
    const start = new Date(_now.getFullYear(), _now.getMonth() - (monthsBack || 1) + 1, 1).toISOString().slice(0, 10);
    const end   = _now.toISOString().slice(0, 10);
    return { start, end };
  })();
  const cutoff = periodBounds.start;
  const monthCount = (() => {
    if (timeRange === 'custom') {
      if (!customStart || !customEnd) return 1;
      const s = new Date(customStart); const e = new Date(customEnd);
      return Math.max(1, Math.min(24, (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1));
    }
    return monthsBack || 1;
  })();

  useEffect(() => {
    let mounted = true;
    setLoading(true); setError(null);
    (async () => {
      if (!supabaseClient) { setError('Supabase not initialized'); setLoading(false); return; }
      try {
        const filterB = selectedProperties.length > 0 ? selectedProperties : null;
        const { data: buildings } = await supabaseClient.from('buildings').select('id,name,property_type');
        const { data: units } = await supabaseClient.from('units').select('id,building_id');
        const filteredUnits = (units || []).filter(u => !filterB || filterB.includes(u.building_id));
        const fIds = filteredUnits.map(u => u.id);
        const probeIds = fIds.length ? fIds : ['00000000-0000-0000-0000-000000000000'];
        const bIds = filterB || (buildings || []).map(b => b.id);
        const probeB = bIds.length ? bIds : ['00000000-0000-0000-0000-000000000000'];

        const [
          { data: ras },
          { data: invoices },
          { data: srs },
          { data: visits },
          { data: bookings },
        ] = await Promise.all([
          supabaseClient.from('resident_assignments').select('profile_id,unit_id,tenure,monthly_payment_aed,lease_end').in('unit_id', probeIds),
          // Invoices retained for Compliance scorecard's collection-rate /
          // receivables-ratio metrics. unit_id no longer needed since the
          // building/type rollups (Portfolio section) were removed.
          supabaseClient.from('invoices').select('amount_aed,status,due_date,created_at').in('unit_id', probeIds),
          supabaseClient.from('service_requests').select('category,status,priority,created_at').in('unit_id', probeIds),
          supabaseClient.from('visits').select('type,status,visit_date,created_at').in('unit_id', probeIds),
          supabaseClient.from('amenity_bookings').select('amenity_name,status,booking_date,created_at').in('building_id', probeB),
        ]);
        if (!mounted) return;
        // Apply time-range cutoff to relevant time-bound datasets
        const cutInv = cutoff ? (invoices || []).filter(i => (i.created_at || i.due_date || '').slice(0, 10) >= cutoff) : (invoices || []);
        const cutSRs = cutoff ? (srs || []).filter(s => (s.created_at || '').slice(0, 10) >= cutoff) : (srs || []);
        const cutVisits = cutoff ? (visits || []).filter(v => (v.visit_date || v.created_at || '').slice(0, 10) >= cutoff) : (visits || []);
        const cutBookings = cutoff ? (bookings || []).filter(b => (b.booking_date || b.created_at || '').slice(0, 10) >= cutoff) : (bookings || []);

        const totalUnits = filteredUnits.length;
        const occupiedUnits = new Set((ras || []).map(r => r.unit_id)).size;
        const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;
        const vacant = Math.max(totalUnits - occupiedUnits, 0);
        const owners = (ras || []).filter(r => r.tenure === 'Owner').length;
        const tenants = (ras || []).filter(r => r.tenure === 'Tenant').length;

        // Invoice totals retained for the Compliance scorecard
        // (collection efficiency + receivables ratio).
        const totalInvoiced = cutInv.reduce((s, i) => s + Number(i.amount_aed), 0);
        const collected = cutInv.filter(i => i.status === 'Paid').reduce((s, i) => s + Number(i.amount_aed), 0);
        const pending = cutInv.filter(i => i.status === 'Pending').reduce((s, i) => s + Number(i.amount_aed), 0);
        const overdue = cutInv.filter(i => i.status === 'Overdue').reduce((s, i) => s + Number(i.amount_aed), 0);
        const collectionRate = totalInvoiced > 0 ? Math.round((collected / totalInvoiced) * 100) : 0;

        const today = new Date(); today.setHours(0,0,0,0);
        const in90 = new Date(today); in90.setDate(in90.getDate() + 90);
        const leasesExpSoon = (ras || []).filter(r => r.lease_end && new Date(r.lease_end) <= in90 && new Date(r.lease_end) >= today).length;
        const leasesExpired = (ras || []).filter(r => r.lease_end && new Date(r.lease_end) < today).length;

        const srByStatus = {};
        cutSRs.forEach(s => { srByStatus[s.status] = (srByStatus[s.status] || 0) + 1; });
        const srByCategory = {};
        cutSRs.forEach(s => { srByCategory[s.category] = (srByCategory[s.category] || 0) + 1; });
        const openSRs = ['New','Acknowledged','In Progress'].reduce((acc, k) => acc + (srByStatus[k] || 0), 0);
        const closedSRs = ['Done','Closed'].reduce((acc, k) => acc + (srByStatus[k] || 0), 0);

        const visitsByType = {};
        cutVisits.forEach(v => { visitsByType[v.type] = (visitsByType[v.type] || 0) + 1; });
        const visitsByStatus = {};
        cutVisits.forEach(v => { visitsByStatus[v.status] = (visitsByStatus[v.status] || 0) + 1; });

        const bookingsByAmenity = {};
        cutBookings.forEach(b => { bookingsByAmenity[b.amenity_name] = (bookingsByAmenity[b.amenity_name] || 0) + 1; });

        // ============ Monthly time-series (range from timeRange selector) ============
        // Only the operational series (SRs / visits / bookings) survive —
        // revenue/collection charts moved to Assets → Summary.
        const monthBuckets = buildMonthlyBuckets(monthCount);
        const monthIndex = Object.fromEntries(monthBuckets.map((m, i) => [m.key, i]));
        const pickKey = (s) => (s || '').slice(0, 7);
        const Z = () => new Array(monthCount).fill(0);

        const srSeries = { newAck: Z(), inProgress: Z(), done: Z() };
        cutSRs.forEach(s => {
          const idx = monthIndex[pickKey(s.created_at)];
          if (idx == null) return;
          if (s.status === 'New' || s.status === 'Acknowledged') srSeries.newAck[idx]++;
          else if (s.status === 'In Progress') srSeries.inProgress[idx]++;
          else if (s.status === 'Done' || s.status === 'Closed') srSeries.done[idx]++;
        });

        const visitsSeries = Z();
        cutVisits.forEach(v => {
          const idx = monthIndex[pickKey(v.visit_date || v.created_at)];
          if (idx != null) visitsSeries[idx]++;
        });

        const bookingsSeries = Z();
        cutBookings.forEach(b => {
          const idx = monthIndex[pickKey(b.booking_date || b.created_at)];
          if (idx != null) bookingsSeries[idx]++;
        });

        setStats({
          buildings: filterB ? (buildings || []).filter(b => filterB.includes(b.id)) : (buildings || []),
          totalUnits, occupiedUnits, vacant, occupancyRate, owners, tenants,
          totalInvoiced, collected, pending, overdue, collectionRate,
          leasesExpSoon, leasesExpired,
          srByStatus, srByCategory, openSRs, closedSRs, totalSRs: (srs || []).length,
          visitsByType, visitsByStatus, totalVisits: (visits || []).length,
          bookingsByAmenity, totalBookings: (bookings || []).length,
          // Time-series
          monthLabels: monthBuckets.map(m => m.label),
          srSeries, visitsSeries, bookingsSeries,
        });
        setLoading(false);
      } catch (e) {
        if (mounted) { setError(String(e.message || e)); setLoading(false); }
      }
    })();
    return () => { mounted = false; };
  }, [selectedProperties.join(','), timeRange]);

  const fmt = (n) => 'AED ' + Math.round(n).toLocaleString();
  const fmtShort = (n) => {
    if (n >= 1_000_000) return 'AED ' + (n/1_000_000).toFixed(2) + 'M';
    if (n >= 1_000)     return 'AED ' + (n/1_000).toFixed(1) + 'K';
    return 'AED ' + Math.round(n);
  };

  // Reports now scope to non-financial surfaces only — operating revenue
  // and collections live on Assets → Summary. What remains here is the
  // operational/occupancy/compliance story for the portfolio.
  const sections = [
    { id: 'occupancy',  label: 'Occupancy' },
    { id: 'operations', label: 'Operations' },
    { id: 'compliance', label: 'Compliance' },
  ];

  // Build the Download Data dataTypes array. Each report section is one
  // selectable dataset in the shared ExportPrintModal, so the user gets the
  // same PDF/Excel/CSV/Word pipeline (and brand template) as every other
  // PMC export — no bespoke export code in this file anymore.
  const reportDatasets = (() => {
    if (!stats) return [];
    const scope = selectedProperties.length > 0 ? selectedProperties.length + ' building(s) — top-bar scope' : 'All buildings';
    const baseMeta = { 'Scope': scope, 'Time Range': timeRange === 'all' ? 'All time' : ({ '3m':'Last 3 months','6m':'Last 6 months','12m':'Last 12 months','24m':'Last 24 months','ytd':'Year to date' })[timeRange] };
    const fmtA = (n) => Math.round(Number(n) || 0);

    return [
      {
        id:           'occupancy_snapshot',
        label:        'Occupancy Snapshot',
        title:        'Occupancy Snapshot',
        sheetName:    'Occupancy',
        filenameBase: 'occupancy-snapshot',
        rows: [
          { metric: 'Occupancy Rate', value: stats.occupancyRate + '%' },
          { metric: 'Occupied Units', value: stats.occupiedUnits + ' / ' + stats.totalUnits },
          { metric: 'Vacant Units',   value: String(stats.vacant) },
          { metric: 'Owners',         value: String(stats.owners) },
          { metric: 'Tenants',        value: String(stats.tenants) },
        ],
        columns: [
          { key: 'metric', header: 'Metric', width: 30 },
          { key: 'value',  header: 'Value',  width: 22 },
        ],
        extraMetadata: baseMeta,
      },
      {
        id:           'lease_pipeline',
        label:        'Lease Pipeline',
        title:        'Lease Pipeline',
        sheetName:    'Lease Pipeline',
        filenameBase: 'lease-pipeline',
        rows: [
          { bucket: 'Expiring next 90 days',      count: stats.leasesExpSoon },
          { bucket: 'Already expired (holdover)', count: stats.leasesExpired },
        ],
        columns: [
          { key: 'bucket', header: 'Bucket', width: 28 },
          { key: 'count',  header: 'Count',  width: 12, halign: 'right', numeric: true },
        ],
        extraMetadata: baseMeta,
      },
      {
        id:           'maintenance_by_status',
        label:        'Maintenance — Tickets by Status',
        title:        'Maintenance — Tickets by Status',
        sheetName:    'Tickets by Status',
        filenameBase: 'maintenance-tickets-by-status',
        rows: Object.entries(stats.srByStatus || {}).map(([k, v]) => ({ status: k, count: v })),
        columns: [
          { key: 'status', header: 'Status', width: 22 },
          { key: 'count',  header: 'Count',  width: 12, halign: 'right', numeric: true },
        ],
        extraMetadata: baseMeta,
      },
      {
        id:           'maintenance_by_category',
        label:        'Maintenance — Tickets by Category',
        title:        'Maintenance — Tickets by Category',
        sheetName:    'Tickets by Category',
        filenameBase: 'maintenance-tickets-by-category',
        rows: Object.entries(stats.srByCategory || {}).map(([k, v]) => ({ category: k, count: v })),
        columns: [
          { key: 'category', header: 'Category', width: 22 },
          { key: 'count',    header: 'Count',    width: 12, halign: 'right', numeric: true },
        ],
        extraMetadata: baseMeta,
      },
      {
        id:           'visitors_by_status',
        label:        'Visitor Analytics — by Status',
        title:        'Visitor Analytics — by Status',
        sheetName:    'Visitors by Status',
        filenameBase: 'visitors-by-status',
        rows: Object.entries(stats.visitsByStatus || {}).map(([k, v]) => ({ status: k, count: v })),
        columns: [
          { key: 'status', header: 'Status', width: 22 },
          { key: 'count',  header: 'Count',  width: 12, halign: 'right', numeric: true },
        ],
        extraMetadata: baseMeta,
      },
      {
        id:           'visitors_by_type',
        label:        'Visitor Analytics — by Type',
        title:        'Visitor Analytics — by Type',
        sheetName:    'Visitors by Type',
        filenameBase: 'visitors-by-type',
        rows: Object.entries(stats.visitsByType || {}).map(([k, v]) => ({ type: k, count: v })),
        columns: [
          { key: 'type',  header: 'Type',  width: 22 },
          { key: 'count', header: 'Count', width: 12, halign: 'right', numeric: true },
        ],
        extraMetadata: baseMeta,
      },
      {
        id:           'amenity_usage',
        label:        'Amenity Usage',
        title:        'Amenity Usage',
        sheetName:    'Amenity Usage',
        filenameBase: 'amenity-usage',
        rows: Object.entries(stats.bookingsByAmenity || {}).map(([k, v]) => ({ amenity: k, bookings: v })),
        columns: [
          { key: 'amenity',  header: 'Amenity',  width: 26 },
          { key: 'bookings', header: 'Bookings', width: 12, halign: 'right', numeric: true },
        ],
        extraMetadata: baseMeta,
      },
      {
        id:           'pmc_scorecard',
        label:        'PMC Performance Scorecard',
        title:        'PMC Performance Scorecard',
        sheetName:    'Scorecard',
        filenameBase: 'pmc-performance-scorecard',
        rows: [
          { metric: 'Maintenance resolution rate', value: (stats.totalSRs > 0 ? Math.round(stats.closedSRs / stats.totalSRs * 100) : 0) + '%' },
          { metric: 'Collection efficiency',       value: stats.collectionRate + '%' },
          { metric: 'Open ticket ratio',           value: (stats.totalSRs > 0 ? Math.round(stats.openSRs   / stats.totalSRs * 100) : 0) + '%' },
          { metric: 'Receivables ratio (outstanding / total)', value: (stats.totalInvoiced > 0 ? Math.round((stats.pending + stats.overdue) / stats.totalInvoiced * 100) : 0) + '%' },
        ],
        columns: [
          { key: 'metric', header: 'Metric', width: 30 },
          { key: 'value',  header: 'Value',  width: 14, halign: 'right' },
        ],
        extraMetadata: baseMeta,
      },
    ];
  })();

  if (error) return <div className="page-header"><h1>Reports</h1><div style={{color:'#8b4a42',fontSize:13,marginTop:14}}>{error}</div></div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Reports</h1>
        </div>
        <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
          <TimeRangePicker/>
          <button className="btn" onClick={() => setShowDownload(true)} disabled={!stats}>Download Data</button>
        </div>
      </div>

      <ExportPrintModal
        isOpen={showDownload}
        onClose={() => setShowDownload(false)}
        dataTypes={reportDatasets}
      />

      <div style={{display:'flex',gap:8,marginBottom:24,borderBottom:'1px solid var(--border-light)'}}>
        {sections.map(s => (
          <div key={s.id} onClick={() => setSection(s.id)} style={{padding:'10px 18px',cursor:'pointer',fontSize:13,fontWeight:section===s.id?500:400,color:section===s.id?'var(--text-dark)':'var(--text-secondary)',borderBottom: section===s.id ? '2px solid var(--bg-warm-dark)' : '2px solid transparent',marginBottom:-1,letterSpacing:'-0.01em'}}>
            {s.label}
          </div>
        ))}
      </div>

      {loading || !stats ? (
        <div className="card"><div style={{padding:24,color:'var(--text-muted)',fontSize:13}}>Loading…</div></div>
      ) : section === 'occupancy'  ? <OccupancyReports stats={stats} fmt={fmt}/> :
          section === 'operations' ? <OperationsReports stats={stats}/> :
          <ComplianceReports stats={stats}/>}
    </div>
  );
};

const OccupancyReports = ({ stats, fmt }) => {
  const occPct = stats.occupancyRate;
  return (
    <div>
      {/* TIME-SERIES — Tenant collected vs total billed, donut + line trend */}
      <div className="card">
        <div style={{fontSize:13,fontWeight:600,marginBottom:6}}>Occupancy & Pipeline</div>
        <div style={{fontSize:11,color:'var(--text-secondary)',marginBottom:14}}>Donut: occupied vs vacant. Snapshot today.</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 2fr',gap:18,alignItems:'center'}}>
          <ChartCanvas height={240} config={{
            type: 'doughnut',
            data: {
              labels: ['Occupied', 'Vacant'],
              datasets: [{
                data: [stats.occupiedUnits, stats.vacant],
                backgroundColor: ['#3E4C59', '#E6EAE9'],
                borderWidth: 0,
              }],
            },
            options: {
              responsive: true, maintainAspectRatio: false, cutout: '65%',
              plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
                tooltip: { callbacks: { label: (ctx) => ctx.label + ': ' + ctx.parsed + ' units' } },
              },
            },
          }}/>
          <div style={{display:'grid',gridTemplateColumns:'repeat(2, 1fr)',gap:10}}>
            <div style={{padding:14,background:'var(--bg-surface)',borderRadius:8}}>
              <div style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:4}}>Occupancy</div>
              <div style={{fontSize:24,fontWeight:600}}>{stats.occupancyRate}%</div>
            </div>
            <div style={{padding:14,background:'var(--bg-surface)',borderRadius:8}}>
              <div style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:4}}>Total Units</div>
              <div style={{fontSize:24,fontWeight:600}}>{stats.totalUnits}</div>
            </div>
            <div style={{padding:14,background:'var(--bg-surface)',borderRadius:8}}>
              <div style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:4}}>Owners</div>
              <div style={{fontSize:24,fontWeight:600}}>{stats.owners}</div>
            </div>
            <div style={{padding:14,background:'var(--bg-surface)',borderRadius:8}}>
              <div style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:4}}>Tenants</div>
              <div style={{fontSize:24,fontWeight:600}}>{stats.tenants}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div style={{fontSize:13,fontWeight:600,marginBottom:14}}>Occupancy Snapshot</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))',gap:14,marginBottom:18}}>
          <div style={{padding:14,background:'var(--bg-surface)',borderRadius:8}}>
            <div style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:4}}>Total Units</div>
            <div style={{fontSize:22,fontWeight:600}}>{stats.totalUnits}</div>
          </div>
          <div style={{padding:14,background:'var(--bg-surface)',borderRadius:8}}>
            <div style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:4}}>Occupied</div>
            <div style={{fontSize:22,fontWeight:600,color:'#5a6b4f'}}>{stats.occupiedUnits}</div>
          </div>
          <div style={{padding:14,background:'var(--bg-surface)',borderRadius:8}}>
            <div style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:4}}>Vacant</div>
            <div style={{fontSize:22,fontWeight:600,color:'#61707D'}}>{stats.vacant}</div>
          </div>
          <div style={{padding:14,background:'var(--bg-surface)',borderRadius:8}}>
            <div style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:4}}>Occupancy</div>
            <div style={{fontSize:22,fontWeight:600}}>{occPct}%</div>
          </div>
        </div>
        <div style={{height:18,background:'var(--bg-surface)',borderRadius:9,overflow:'hidden',border:'1px solid var(--border-light)'}}>
          <div style={{height:'100%',width:occPct+'%',background:'linear-gradient(90deg, #3E4C59 0%, var(--bg-warm-dark) 100%)'}}/>
        </div>
        <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--text-muted)',marginTop:6}}>
          <span>0%</span><span>50%</span><span>100%</span>
        </div>
      </div>

      <div className="card">
        <div style={{fontSize:13,fontWeight:600,marginBottom:14}}>Tenure Mix</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
          <div style={{padding:14,background:'var(--bg-surface)',borderRadius:8}}>
            <div style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:4}}>Owners</div>
            <div style={{fontSize:22,fontWeight:600}}>{stats.owners}</div>
          </div>
          <div style={{padding:14,background:'var(--bg-surface)',borderRadius:8}}>
            <div style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:4}}>Tenants</div>
            <div style={{fontSize:22,fontWeight:600}}>{stats.tenants}</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div style={{fontSize:13,fontWeight:600,marginBottom:14}}>Lease Expiry Pipeline</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
          <div style={{padding:14,background:'var(--bg-surface)',borderRadius:8}}>
            <div style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:4}}>Expiring in next 90 days</div>
            <div style={{fontSize:22,fontWeight:600,color:'#a07d3c'}}>{stats.leasesExpSoon}</div>
          </div>
          <div style={{padding:14,background:'var(--bg-surface)',borderRadius:8}}>
            <div style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:4}}>Already expired (holdover)</div>
            <div style={{fontSize:22,fontWeight:600,color:'#8b4a42'}}>{stats.leasesExpired}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

const OperationsReports = ({ stats }) => {
  const Pill = ({ label, count, total, color }) => {
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    return (
      <div style={{padding:12,background:'var(--bg-surface)',borderRadius:8,border:'1px solid var(--border-light)'}}>
        <div style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:4}}>{label}</div>
        <div style={{display:'flex',alignItems:'baseline',gap:6}}>
          <div style={{fontSize:20,fontWeight:600,color:color||'var(--text-dark)'}}>{count}</div>
          <div style={{fontSize:11,color:'var(--text-muted)'}}>{pct}%</div>
        </div>
      </div>
    );
  };
  return (
    <div>
      {/* TIME-SERIES — Service requests + Visits + Bookings, last 12 months */}
      <div className="card">
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:6}}>
          <div>
            <div style={{fontSize:13,fontWeight:600}}>Service Requests — Last 12 Months</div>
            <div style={{fontSize:11,color:'var(--text-secondary)',marginTop:2}}>Stacked by status. Hover bars for breakdown.</div>
          </div>
        </div>
        <ChartCanvas height={300} config={{
          type: 'bar',
          data: {
            labels: stats.monthLabels,
            datasets: [
              { label: 'New / Acknowledged', data: stats.srSeries.newAck,     backgroundColor: '#3E4C59' },
              { label: 'In Progress',        data: stats.srSeries.inProgress, backgroundColor: '#a07d3c' },
              { label: 'Done / Closed',      data: stats.srSeries.done,       backgroundColor: '#5a6b4f' },
            ],
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } },
            scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } },
          },
        }}/>
      </div>

      <div className="card">
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:6}}>
          <div>
            <div style={{fontSize:13,fontWeight:600}}>Visits & Amenity Bookings — Last 12 Months</div>
            <div style={{fontSize:11,color:'var(--text-secondary)',marginTop:2}}>Two lines, dual-y-axes share the same x. Hover for exact counts.</div>
          </div>
        </div>
        <ChartCanvas height={300} config={{
          type: 'line',
          data: {
            labels: stats.monthLabels,
            datasets: [
              { label: 'Visits', data: stats.visitsSeries, borderColor: '#3E4C59', backgroundColor: 'rgba(146,137,137,0.15)', tension: 0.3, fill: true, pointRadius: 4 },
              { label: 'Amenity Bookings', data: stats.bookingsSeries, borderColor: '#a07d3c', backgroundColor: 'rgba(160,125,60,0.15)', tension: 0.3, fill: true, pointRadius: 4 },
            ],
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } },
            scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 } } },
          },
        }}/>
      </div>

      <div className="card">
        <div style={{fontSize:13,fontWeight:600,marginBottom:14}}>Maintenance Ticket Funnel</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(120px, 1fr))',gap:10}}>
          {['New','Acknowledged','In Progress','Done','Closed','Rejected'].map((status, i) => {
            const colors = ['#3E4C59', '#61707D', '#a07d3c', '#5a6b4f', '#61707D', '#8b4a42'];
            return <Pill key={status} label={status} count={stats.srByStatus[status] || 0} total={stats.totalSRs} color={colors[i]}/>;
          })}
        </div>
        <div style={{fontSize:11,color:'var(--text-muted)',marginTop:10}}>Total tickets: <strong>{stats.totalSRs}</strong> · Open: <strong>{stats.openSRs}</strong> · Resolved: <strong>{stats.closedSRs}</strong></div>
      </div>

      <div className="card">
        <div style={{fontSize:13,fontWeight:600,marginBottom:14}}>Maintenance by Category</div>
        {Object.keys(stats.srByCategory).length === 0 ? (
          <div style={{color:'var(--text-muted)',fontSize:13,padding:20}}>No service requests yet.</div>
        ) : Object.entries(stats.srByCategory).sort((a,b)=>b[1]-a[1]).map(([cat, n]) => {
          const pct = stats.totalSRs > 0 ? Math.round((n / stats.totalSRs) * 100) : 0;
          return (
            <div key={cat} style={{marginBottom:10}}>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:4}}>
                <span style={{fontWeight:500}}>{cat}</span>
                <span style={{color:'var(--text-secondary)'}}>{n} tickets · {pct}%</span>
              </div>
              <div style={{height:6,background:'var(--bg-surface)',borderRadius:3,overflow:'hidden'}}>
                <div style={{height:'100%',width:pct+'%',background:'var(--accent-warm)'}}/>
              </div>
            </div>
          );
        })}
      </div>

      <div className="card">
        <div style={{fontSize:13,fontWeight:600,marginBottom:14}}>Visitor Analytics</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(140px, 1fr))',gap:10,marginBottom:18}}>
          <Pill label="Total Visits" count={stats.totalVisits} total={stats.totalVisits} color="var(--text-dark)"/>
          <Pill label="Pre-Approved" count={stats.visitsByStatus['Pre-Approved']||0} total={stats.totalVisits} color="#61707D"/>
          <Pill label="On-Premise" count={stats.visitsByStatus['On-Premise']||0} total={stats.totalVisits} color="#3E4C59"/>
          <Pill label="Checked-Out" count={stats.visitsByStatus['Checked-Out']||0} total={stats.totalVisits} color="#61707D"/>
        </div>
        <div style={{fontSize:12,fontWeight:600,marginBottom:10}}>By visitor type</div>
        {Object.entries(stats.visitsByType).sort((a,b)=>b[1]-a[1]).map(([type, n]) => (
          <div key={type} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid var(--border-light)',fontSize:12}}>
            <span>{type}</span>
            <span style={{color:'var(--text-secondary)'}}>{n}</span>
          </div>
        ))}
      </div>

      <div className="card">
        <div style={{fontSize:13,fontWeight:600,marginBottom:14}}>Amenity Usage</div>
        {Object.keys(stats.bookingsByAmenity).length === 0 ? (
          <div style={{color:'var(--text-muted)',fontSize:13,padding:20}}>No amenity bookings yet.</div>
        ) : Object.entries(stats.bookingsByAmenity).sort((a,b)=>b[1]-a[1]).map(([amenity, n]) => {
          const pct = stats.totalBookings > 0 ? Math.round((n / stats.totalBookings) * 100) : 0;
          return (
            <div key={amenity} style={{marginBottom:10}}>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:4}}>
                <span style={{fontWeight:500}}>{amenity}</span>
                <span style={{color:'var(--text-secondary)'}}>{n} bookings · {pct}%</span>
              </div>
              <div style={{height:6,background:'var(--bg-surface)',borderRadius:3,overflow:'hidden'}}>
                <div style={{height:'100%',width:pct+'%',background:'#3E4C59'}}/>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const ComplianceReports = ({ stats }) => {
  const items = [
    { label: 'Buildings inspected this quarter', value: 'N/A', note: 'Inspection log not wired yet — placeholder' },
    { label: 'Open compliance findings', value: 0, note: 'No live data source connected' },
    { label: 'SLA breaches (maintenance)', value: 0, note: 'Computed from service_requests resolved_at (not yet populated)' },
    { label: 'Insurance & licences renewed YTD', value: 'N/A', note: 'Will appear when documents are uploaded' },
  ];
  return (
    <div>
      <div className="card">
        <div style={{fontSize:13,fontWeight:600,marginBottom:6}}>Compliance Overview</div>
        <div style={{fontSize:11,color:'var(--text-secondary)',marginBottom:14}}>Compliance signals across the portfolio. Placeholder values until the relevant data sources are connected.</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))',gap:14}}>
          {items.map((it, i) => (
            <div key={i} style={{padding:14,background:'var(--bg-surface)',borderRadius:8,border:'1px solid var(--border-light)'}}>
              <div style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:4}}>{it.label}</div>
              <div style={{fontSize:22,fontWeight:600,marginBottom:6}}>{it.value}</div>
              <div style={{fontSize:11,color:'var(--text-muted)'}}>{it.note}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div style={{fontSize:13,fontWeight:600,marginBottom:6}}>PMC Performance Scorecard</div>
        <div style={{fontSize:11,color:'var(--text-secondary)',marginBottom:14}}>How well the PMC is delivering, derived from live tickets + invoices.</div>
        {[
          { label: 'Maintenance resolution rate', value: stats.totalSRs > 0 ? Math.round((stats.closedSRs / stats.totalSRs) * 100) + '%' : '—' },
          { label: 'Collection efficiency', value: stats.collectionRate + '%' },
          { label: 'Open tickets ratio', value: stats.totalSRs > 0 ? Math.round((stats.openSRs / stats.totalSRs) * 100) + '%' : '—' },
          { label: 'Receivables ratio (outstanding / total)', value: stats.totalInvoiced > 0 ? Math.round(((stats.pending + stats.overdue) / stats.totalInvoiced) * 100) + '%' : '—' },
        ].map((row, i) => (
          <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'10px 0',borderBottom:'1px solid var(--border-light)',fontSize:13}}>
            <span>{row.label}</span>
            <strong>{row.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
};

