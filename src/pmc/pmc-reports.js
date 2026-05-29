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
  const [section, setSection] = useState('portfolio');
  const [showDownload, setShowDownload] = useState(false);

  // Cross-filter state — clicking a chart element (a slice / bar / row)
  // sets these to re-scope the rest of the section's content. Reset
  // whenever the user switches sections so filters don't bleed across.
  const [crossFilter, setCrossFilter] = useState({ buildingId: null, propertyType: null, month: null });
  useEffect(() => { setCrossFilter({ buildingId: null, propertyType: null, month: null }); }, [section]);

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
          // unit_id now included so the Portfolio section can roll up by
          // building + property_type for the by-type chart and the top-
          // contributors list.
          supabaseClient.from('invoices').select('unit_id,amount_aed,status,due_date,source_type,created_at').in('unit_id', probeIds),
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

        const monthlyRevenue = (ras || []).filter(r => r.tenure === 'Tenant' && r.monthly_payment_aed).reduce((s, r) => s + Number(r.monthly_payment_aed), 0);
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
        const srByPriority = {};
        cutSRs.forEach(s => { srByPriority[s.priority] = (srByPriority[s.priority] || 0) + 1; });
        const openSRs = ['New','Acknowledged','In Progress'].reduce((acc, k) => acc + (srByStatus[k] || 0), 0);
        const closedSRs = ['Done','Closed'].reduce((acc, k) => acc + (srByStatus[k] || 0), 0);

        const visitsByType = {};
        cutVisits.forEach(v => { visitsByType[v.type] = (visitsByType[v.type] || 0) + 1; });
        const visitsByStatus = {};
        cutVisits.forEach(v => { visitsByStatus[v.status] = (visitsByStatus[v.status] || 0) + 1; });

        const bookingsByAmenity = {};
        cutBookings.forEach(b => { bookingsByAmenity[b.amenity_name] = (bookingsByAmenity[b.amenity_name] || 0) + 1; });

        // Service charge breakdown — approximated from invoice source_type
        const chargeByCategory = {};
        cutInv.forEach(i => {
          const key = ({
            monthly_dues:     'Monthly Dues',
            amenity_booking:  'Amenity',
            service_request:  'Maintenance',
            manual:           'Other / Manual',
          })[i.source_type] || 'Other';
          chargeByCategory[key] = (chargeByCategory[key] || 0) + Number(i.amount_aed);
        });

        // ============ Monthly time-series (range from timeRange selector) ============
        const monthBuckets = buildMonthlyBuckets(monthCount);
        const monthIndex = Object.fromEntries(monthBuckets.map((m, i) => [m.key, i]));
        const pickKey = (s) => (s || '').slice(0, 7);
        const Z = () => new Array(monthCount).fill(0);

        const invSeries = { paid: Z(), pending: Z(), overdue: Z() };
        cutInv.forEach(inv => {
          const k = pickKey(inv.created_at || inv.due_date);
          const idx = monthIndex[k];
          if (idx == null) return;
          const amt = Number(inv.amount_aed) || 0;
          if (inv.status === 'Paid') invSeries.paid[idx] += amt;
          else if (inv.status === 'Pending') invSeries.pending[idx] += amt;
          else if (inv.status === 'Overdue') invSeries.overdue[idx] += amt;
        });

        // Cumulative collected vs invoiced (running total)
        let runCollected = 0, runInvoiced = 0;
        const cumCollected = invSeries.paid.map(v => { runCollected += v; return runCollected; });
        const cumInvoiced = invSeries.paid.map((p, i) => { runInvoiced += p + (invSeries.pending[i] || 0) + (invSeries.overdue[i] || 0); return runInvoiced; });

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

        // Visitor type donut data (top 5)
        const visitTypeSorted = Object.entries(visitsByType).sort((a, b) => b[1] - a[1]).slice(0, 6);

        // ============ Portfolio rollups (Portfolio section) ============
        // Cross-cut money flows by building + by property_type so the
        // Portfolio section can render the Revenue-by-type chart and the
        // Top revenue contributors list (both clickable for cross-filter).
        const unitToBuilding = Object.fromEntries(filteredUnits.map(u => [u.id, u.building_id]));
        const buildingMap = Object.fromEntries((buildings || []).map(b => [b.id, b]));
        // Treat "Pending" + "Overdue" as outstanding here. The Reports page
        // uses the raw invoice.status field (no due-date re-bucketing) so
        // the numbers tie back to the source-of-truth invoices table.
        const isPaid       = (st) => st === 'Paid';
        const isCollectable= (st) => st !== 'Cancelled';
        const invByBuilding = {};
        const revenueByType = {
          'Residential':     { billed: 0, collected: 0, outstanding: 0, count: 0 },
          'Commercial':      { billed: 0, collected: 0, outstanding: 0, count: 0 },
          'Villa':           { billed: 0, collected: 0, outstanding: 0, count: 0 },
          'Commercial Land': { billed: 0, collected: 0, outstanding: 0, count: 0 },
        };
        cutInv.forEach(i => {
          const bId = unitToBuilding[i.unit_id];
          if (!bId) return;
          const amt = Number(i.amount_aed || 0);
          if (!isCollectable(i.status)) return;
          if (!invByBuilding[bId]) invByBuilding[bId] = { billed: 0, collected: 0, outstanding: 0, count: 0 };
          invByBuilding[bId].billed += amt;
          invByBuilding[bId].count++;
          if (isPaid(i.status)) invByBuilding[bId].collected += amt;
          else                  invByBuilding[bId].outstanding += amt;
          const b = buildingMap[bId];
          const t = b && revenueByType[b.property_type];
          if (t) {
            t.billed += amt; t.count++;
            if (isPaid(i.status)) t.collected += amt;
            else                  t.outstanding += amt;
          }
        });
        // Buildings-per-type for the chart's "· N assets" subline
        const buildingsByType = { 'Residential': 0, 'Commercial': 0, 'Villa': 0, 'Commercial Land': 0 };
        (buildings || []).forEach(b => { if (buildingsByType[b.property_type] != null) buildingsByType[b.property_type]++; });
        const topContributors = Object.entries(invByBuilding)
          .map(([bId, v]) => ({ id: bId, name: buildingMap[bId]?.name || '—', property_type: buildingMap[bId]?.property_type || null, ...v }))
          .filter(b => b.billed > 0)
          .sort((a, b) => b.billed - a.billed);

        setStats({
          buildings: filterB ? (buildings || []).filter(b => filterB.includes(b.id)) : (buildings || []),
          unitToBuilding, buildingMap, invByBuilding, revenueByType, buildingsByType, topContributors,
          totalUnits, occupiedUnits, vacant, occupancyRate, owners, tenants,
          monthlyRevenue, totalInvoiced, collected, pending, overdue, collectionRate,
          leasesExpSoon, leasesExpired,
          srByStatus, srByCategory, srByPriority, openSRs, closedSRs, totalSRs: (srs || []).length,
          visitsByType, visitsByStatus, totalVisits: (visits || []).length,
          bookingsByAmenity, totalBookings: (bookings || []).length,
          chargeByCategory,
          // Net Operating Income approximation (collected minus stub 30% operating cost)
          noi: Math.round(collected - 0.3 * collected),
          // Time-series
          monthLabels: monthBuckets.map(m => m.label),
          invSeries, srSeries, visitsSeries, bookingsSeries,
          cumCollected, cumInvoiced,
          visitTypeSorted,
          // Counts (after time-range filter)
          filteredInvoiceCount: cutInv.length,
          filteredSRCount: cutSRs.length,
          filteredVisitCount: cutVisits.length,
          filteredBookingCount: cutBookings.length,
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

  // Restructured Reports sections — Portfolio is the new landing rollup;
  // Finance & Revenue split into Revenue and Collections so the "where
  // money comes from" story is separate from "how well we collect it".
  // Compliance dropped per user direction (rare in landlord use).
  // NB: revenue / collections / occupancy / operations are stubs in this
  // milestone — they keep using the old FinanceReports/Occupancy/Operations
  // components for now. Portfolio is the new template.
  const sections = [
    { id: 'portfolio',   label: 'Portfolio' },
    { id: 'revenue',     label: 'Revenue' },
    { id: 'collections', label: 'Collections' },
    { id: 'occupancy',   label: 'Occupancy' },
    { id: 'operations',  label: 'Operations' },
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
        id:           'portfolio_health',
        label:        'Portfolio Health Summary',
        title:        'Portfolio Health Summary',
        sheetName:    'Portfolio Health',
        filenameBase: 'portfolio-health-summary',
        rows: [
          { metric: 'Occupancy Rate',                value: stats.occupancyRate + '%' },
          { metric: 'Occupied Units',                value: stats.occupiedUnits + ' / ' + stats.totalUnits },
          { metric: 'Owners',                        value: String(stats.owners) },
          { metric: 'Tenants',                       value: String(stats.tenants) },
          { metric: 'Monthly Run-Rate',              value: 'AED ' + fmtA(stats.monthlyRevenue).toLocaleString() },
          { metric: 'Open Maintenance',              value: String(stats.openSRs) },
          { metric: 'Outstanding Receivables',       value: 'AED ' + fmtA(stats.pending + stats.overdue).toLocaleString() },
          { metric: 'Estimated Net Operating Income',value: 'AED ' + fmtA(stats.noi).toLocaleString() },
        ],
        columns: [
          { key: 'metric', header: 'Metric', width: 30 },
          { key: 'value',  header: 'Value',  width: 22 },
        ],
        extraMetadata: baseMeta,
      },
      {
        id:           'rent_collection',
        label:        'Rent Collection Status',
        title:        'Rent Collection Status',
        sheetName:    'Rent Collection',
        filenameBase: 'rent-collection-status',
        rows: [
          { bucket: 'Paid',           amount: fmtA(stats.collected), pct: (stats.totalInvoiced > 0 ? Math.round(stats.collected / stats.totalInvoiced * 100) : 0) + '%' },
          { bucket: 'Pending',        amount: fmtA(stats.pending),   pct: (stats.totalInvoiced > 0 ? Math.round(stats.pending   / stats.totalInvoiced * 100) : 0) + '%' },
          { bucket: 'Overdue',        amount: fmtA(stats.overdue),   pct: (stats.totalInvoiced > 0 ? Math.round(stats.overdue   / stats.totalInvoiced * 100) : 0) + '%' },
          { bucket: 'Total Invoiced', amount: fmtA(stats.totalInvoiced), pct: '100%' },
          { bucket: 'Collection Rate',amount: '',                    pct: stats.collectionRate + '%' },
        ],
        columns: [
          { key: 'bucket', header: 'Bucket',       width: 22 },
          { key: 'amount', header: 'Amount (AED)', width: 18, halign: 'right', numeric: true },
          { key: 'pct',    header: '% of Total',   width: 14, halign: 'right' },
        ],
        extraMetadata: baseMeta,
      },
      {
        id:           'charges_by_source',
        label:        'Service Charges by Source',
        title:        'Service Charges by Source',
        sheetName:    'Charges by Source',
        filenameBase: 'service-charges-by-source',
        rows: Object.entries(stats.chargeByCategory || {}).map(([k, v]) => ({ source: k, amount: fmtA(v) })),
        columns: [
          { key: 'source', header: 'Source',       width: 26 },
          { key: 'amount', header: 'Amount (AED)', width: 18, halign: 'right', numeric: true },
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
      ) : section === 'portfolio' ? <PortfolioReports stats={stats} fmt={fmt} fmtShort={fmtShort} crossFilter={crossFilter} setCrossFilter={setCrossFilter} periodBounds={periodBounds}/> :
          section === 'revenue'    ? <FinanceReports  stats={stats} fmt={fmt} fmtShort={fmtShort}/> :
          section === 'collections'? <FinanceReports  stats={stats} fmt={fmt} fmtShort={fmtShort}/> :
          section === 'occupancy'  ? <OccupancyReports stats={stats} fmt={fmt}/> :
          section === 'operations' ? <OperationsReports stats={stats}/> :
          <ComplianceReports stats={stats}/>}
    </div>
  );
};

// ==================== PORTFOLIO REPORT (new template) ====================
// Hero KPI strip + Revenue-by-type + Collection trend + Top contributors,
// all cross-filter wired: clicking a type row / a month bar / a contributor
// re-scopes the rest of the section. Visual idiom matches AssetFinancialPanel
// (gradient bars, soft drop shadow, warm palette).

const _PR_TYPE_COLORS = { 'Residential':'#5a6b4f', 'Commercial':'#3E4C59', 'Villa':'#a07d3c', 'Commercial Land':'#61707D' };
const _PR_TYPE_LABELS = { 'Residential':'Residential', 'Commercial':'Commercial', 'Villa':'Villas', 'Commercial Land':'Lands' };

// Inline timeline chart for the Portfolio collection trend. Same idiom
// as AssetFinancialPanel.TimelineChart but trimmed for embedding inside
// a card on the Reports page.
const PortfolioTrendChart = ({ data, selectedMonth, onSelectMonth }) => {
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const W = 1000, H = 260;
  const padTop = 16, padBottom = 46, padLeft = 56, padRight = 16;
  const chartW = W - padLeft - padRight, chartH = H - padTop - padBottom;
  const groupW = chartW / Math.max(1, data.length);
  const barW = Math.min(36, groupW * 0.58);
  const maxStacked = Math.max(1, ...data.map(d => d.collected + d.outstanding));
  const niceStep = (rough) => {
    const exp = Math.pow(10, Math.floor(Math.log10(Math.max(1, rough))));
    const f = rough / exp;
    let r;
    if (f >= 7) r = 10; else if (f >= 3) r = 5; else if (f >= 1.5) r = 2; else r = 1;
    return r * exp;
  };
  const step = niceStep(maxStacked / 4);
  const yMax = Math.ceil(maxStacked / step) * step;
  const ySteps = Math.round(yMax / step);
  const y = (v) => padTop + chartH - (v / yMax) * chartH;
  const fmtTick = (v) => v >= 1000000 ? (v/1000000).toFixed(1) + 'M' : v >= 1000 ? Math.round(v/1000) + 'k' : Math.round(v);
  const showLabel = (i) => data.length <= 18 || i % 2 === 0;
  const tooltipLeftPct = hoveredIdx != null ? ((padLeft + (hoveredIdx + 0.5) * groupW) / W) * 100 : 0;

  return (
    <div style={{position:'relative'}}>
      <svg viewBox={'0 0 ' + W + ' ' + H} preserveAspectRatio="xMidYMid meet" style={{display:'block',width:'100%',height:260,overflow:'visible'}}>
        <defs>
          <linearGradient id="prt-grad-col" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7e8f73"/><stop offset="100%" stopColor="#475641"/></linearGradient>
          <linearGradient id="prt-grad-col-hi" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#9aa78f"/><stop offset="100%" stopColor="#5a6b4f"/></linearGradient>
          <linearGradient id="prt-grad-out" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#b87870"/><stop offset="100%" stopColor="#7e3f36"/></linearGradient>
          <linearGradient id="prt-grad-out-hi" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#c89289"/><stop offset="100%" stopColor="#8b4a42"/></linearGradient>
          <filter id="prt-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="2.2"/>
            <feOffset dx="0" dy="2.5"/>
            <feComponentTransfer><feFuncA type="linear" slope="0.18"/></feComponentTransfer>
            <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        {Array.from({ length: ySteps + 1 }).map((_, i) => {
          const v = i * step, ly = y(v);
          return <g key={i}>
            <line x1={padLeft} x2={W - padRight} y1={ly} y2={ly} stroke="#eef0ec" strokeDasharray={i === 0 ? '0' : '3 4'} strokeWidth="1"/>
            <text x={padLeft - 10} y={ly + 4} fontSize="12" fill="#8a98a2" textAnchor="end" fontFamily="inherit">{fmtTick(v)}</text>
          </g>;
        })}
        {data.map((d, i) => {
          const laneX = padLeft + i * groupW;
          const cx = laneX + (groupW - barW) / 2;
          const colY = y(d.collected), colH = padTop + chartH - colY;
          const outY = y(d.collected + d.outstanding), outH = colY - outY;
          const total = d.collected + d.outstanding;
          const isHovered = hoveredIdx === i;
          const isSelected = selectedMonth && selectedMonth === d.month;
          const dim = (selectedMonth || hoveredIdx != null) && !isHovered && !isSelected;
          const fillCol = isHovered || isSelected ? 'url(#prt-grad-col-hi)' : 'url(#prt-grad-col)';
          const fillOut = isHovered || isSelected ? 'url(#prt-grad-out-hi)' : 'url(#prt-grad-out)';
          return (
            <g key={i} style={{cursor:'pointer'}}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
              onClick={() => onSelectMonth && onSelectMonth(isSelected ? null : d.month)}>
              {(isHovered || isSelected) && <rect x={laneX + 2} y={padTop - 4} width={groupW - 4} height={chartH + 8} fill={isSelected ? '#3E4C59' : '#131F23'} opacity={isSelected ? 0.07 : 0.04} rx="8"/>}
              <rect x={laneX} y={padTop - 4} width={groupW} height={chartH + 32} fill="transparent" pointerEvents="all"/>
              {outH > 0 && <rect x={cx} y={outY} width={barW} height={Math.max(2, outH)} fill={fillOut} opacity={dim ? 0.4 : 0.92} rx="5" ry="5" filter="url(#prt-shadow)" style={{transition:'opacity 0.18s, fill 0.18s'}}/>}
              {colH > 0 && <rect x={cx} y={colY} width={barW} height={Math.max(2, colH)} fill={fillCol} opacity={dim ? 0.45 : 1} rx="5" ry="5" filter="url(#prt-shadow)" style={{transition:'opacity 0.18s, fill 0.18s'}}/>}
              {colH > 4 && <rect x={cx + 1.5} y={colY + 1.5} width={Math.max(0, barW - 3)} height={2} fill="#fff" opacity={dim ? 0.04 : 0.18} rx="1.5" pointerEvents="none"/>}
              {showLabel(i) && <text x={cx + barW/2} y={padTop + chartH + 22} fontSize="12" fill={isSelected ? '#131F23' : '#61707D'} fontWeight={isSelected ? 700 : 500} textAnchor="middle" fontFamily="inherit">{d.label}</text>}
              {total > 0 && !isHovered && (() => {
                const inside = outY < padTop + 18;
                return <text x={cx + barW/2} y={inside ? outY + 14 : outY - 8} fontSize="11" fill={inside ? '#fff' : '#131F23'} textAnchor="middle" fontWeight="700" fontFamily="inherit" opacity={dim ? 0.4 : 1} style={{textShadow: inside ? '0 1px 2px rgba(0,0,0,0.35)' : 'none'}}>{fmtTick(total)}</text>;
              })()}
            </g>
          );
        })}
      </svg>
      {hoveredIdx != null && (
        <div style={{position:'absolute',top:-2,left:tooltipLeftPct + '%',transform:'translateX(-50%)',background:'#131F23',color:'#fff',padding:'10px 14px',borderRadius:8,fontSize:12,pointerEvents:'none',boxShadow:'0 6px 18px rgba(19,31,35,0.20)',whiteSpace:'nowrap',zIndex:5}}>
          <div style={{fontWeight:700,marginBottom:4,letterSpacing:'-0.005em'}}>{data[hoveredIdx].label}</div>
          <div style={{display:'flex',alignItems:'center',gap:8,fontSize:11,color:'#cfd6d4'}}>
            <span style={{width:8,height:8,background:'#5a6b4f',borderRadius:2}}/>
            <span style={{flex:1}}>Collected</span>
            <span style={{fontWeight:600,color:'#fff'}}>AED {Math.round(data[hoveredIdx].collected).toLocaleString()}</span>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8,fontSize:11,color:'#cfd6d4',marginTop:3}}>
            <span style={{width:8,height:8,background:'#8b4a42',borderRadius:2,opacity:0.82}}/>
            <span style={{flex:1}}>Outstanding</span>
            <span style={{fontWeight:600,color:'#fff'}}>AED {Math.round(data[hoveredIdx].outstanding).toLocaleString()}</span>
          </div>
        </div>
      )}
    </div>
  );
};

const PortfolioKPI = ({ label, value, sub, accent }) => (
  <div style={{position:'relative', padding:'18px 20px', background:'#fff', border:'1px solid var(--border-light)', borderRadius:10, overflow:'hidden', boxShadow:'0 1px 2px rgba(19,31,35,0.04)'}}>
    {accent && <div style={{position:'absolute', left:0, top:0, bottom:0, width:3, background:accent}}/>}
    <div style={{fontSize:10, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--text-muted)', fontWeight:600, marginBottom:8}}>{label}</div>
    <div style={{fontSize:22, fontWeight:700, color:'var(--text-dark)', letterSpacing:'-0.025em', lineHeight:1.05}}>{value}</div>
    {sub && <div style={{fontSize:11, color:'var(--text-muted)', marginTop:6, fontWeight:500}}>{sub}</div>}
  </div>
);

const PortfolioReports = ({ stats, fmt, fmtShort, crossFilter, setCrossFilter, periodBounds }) => {
  // Apply cross-filter — buildingId beats propertyType. The current
  // rollups (revenueByType, topContributors) come pre-cut by period;
  // we just narrow them by the active filter for the dependent visuals.
  const useFiltered = !!(crossFilter.buildingId || crossFilter.propertyType);
  const filteredBuildings = stats.topContributors.filter(b => {
    if (crossFilter.buildingId && b.id !== crossFilter.buildingId) return false;
    if (crossFilter.propertyType && b.property_type !== crossFilter.propertyType) return false;
    return true;
  });
  const filteredTotals = filteredBuildings.reduce((a, b) => ({
    billed: a.billed + b.billed, collected: a.collected + b.collected, outstanding: a.outstanding + b.outstanding, count: a.count + b.count,
  }), { billed: 0, collected: 0, outstanding: 0, count: 0 });
  const billed      = useFiltered ? filteredTotals.billed      : stats.totalInvoiced;
  const collected   = useFiltered ? filteredTotals.collected   : stats.collected;
  const outstanding = useFiltered ? filteredTotals.outstanding : (stats.totalInvoiced - stats.collected);
  const collRate    = billed > 0 ? Math.round((collected / billed) * 100) : 0;
  const invoiceCount = useFiltered ? filteredTotals.count : stats.filteredInvoiceCount;

  // Revenue-by-type rows (always show all 4 — clicking re-filters)
  const byTypeRows = ['Residential','Commercial','Villa','Commercial Land']
    .map(t => ({ key: t, ...stats.revenueByType[t], buildings: stats.buildingsByType[t] || 0 }))
    .filter(t => t.buildings > 0)
    .sort((a, b) => b.billed - a.billed);
  const byTypeMax = Math.max(1, ...byTypeRows.map(t => t.billed));

  // Top contributors — bounded to 8 for readability
  const topShow = (useFiltered ? filteredBuildings : stats.topContributors).slice(0, 8);
  const topMax = Math.max(1, ...topShow.map(b => b.billed));

  // Collection trend — portfolio-wide series (filter scoping is a future
  // milestone once we keep per-month/per-building tallies on stats).
  const trendData = (stats.monthLabels || []).map((label, i) => ({
    label, month: label,
    collected:   stats.invSeries.paid[i] || 0,
    outstanding: (stats.invSeries.pending[i] || 0) + (stats.invSeries.overdue[i] || 0),
  }));

  const chipBg = '#fdf6e6', chipBorder = '#efe1be', chipFg = '#7a5a1f';
  const filterChips = [];
  if (crossFilter.propertyType) filterChips.push({ label: 'Type: ' + _PR_TYPE_LABELS[crossFilter.propertyType], clear: () => setCrossFilter({ ...crossFilter, propertyType: null }) });
  if (crossFilter.buildingId)   filterChips.push({ label: 'Building: ' + (stats.topContributors.find(b => b.id === crossFilter.buildingId)?.name || '—'), clear: () => setCrossFilter({ ...crossFilter, buildingId: null }) });
  if (crossFilter.month)        filterChips.push({ label: 'Month: ' + crossFilter.month, clear: () => setCrossFilter({ ...crossFilter, month: null }) });

  return (
    <div>
      {/* Period subline + filter chips */}
      <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:18, flexWrap:'wrap'}}>
        <div style={{fontSize:13, color:'var(--text-secondary)', fontWeight:500, letterSpacing:'-0.01em'}}>
          {periodBounds.start} → {periodBounds.end} · {invoiceCount} {invoiceCount === 1 ? 'invoice' : 'invoices'}
        </div>
        {filterChips.length > 0 && (
          <div style={{display:'flex', gap:6, alignItems:'center', flexWrap:'wrap'}}>
            {filterChips.map((c, i) => (
              <span key={i} style={{display:'inline-flex', alignItems:'center', gap:6, padding:'4px 8px 4px 10px', background:chipBg, border:'1px solid ' + chipBorder, borderRadius:14, fontSize:11, color:chipFg, fontWeight:600}}>
                {c.label}
                <button onClick={c.clear} style={{background:'transparent', border:'none', color:chipFg, cursor:'pointer', fontSize:14, lineHeight:1, padding:0}}>×</button>
              </span>
            ))}
            <button onClick={() => setCrossFilter({ buildingId: null, propertyType: null, month: null })} style={{padding:'4px 10px', fontSize:11, background:'transparent', border:'1px solid var(--border-light)', borderRadius:14, color:'var(--text-muted)', cursor:'pointer'}}>Clear all</button>
          </div>
        )}
      </div>

      {/* Hero KPI strip */}
      <div style={{display:'grid', gridTemplateColumns:'repeat(4, minmax(0, 1fr))', gap:12, marginBottom:18}}>
        <PortfolioKPI label="Total Revenue Billed" value={fmtShort(billed)}      sub={fmt(billed)}                          accent="#3E4C59"/>
        <PortfolioKPI label="Collected"            value={fmtShort(collected)}   sub={collRate + '% collection rate'}       accent="#5a6b4f"/>
        <PortfolioKPI label="Outstanding"          value={fmtShort(outstanding)} sub={fmt(outstanding)}                     accent="#8b4a42"/>
        <PortfolioKPI label="Avg ticket"           value={invoiceCount > 0 ? fmtShort(billed / invoiceCount) : 'AED 0'} sub={invoiceCount + ' invoices'} accent="#a07d3c"/>
      </div>

      {/* Revenue by construction type */}
      <div className="card" style={{padding:'20px 24px', marginBottom:18}}>
        <div style={{display:'flex', alignItems:'baseline', justifyContent:'space-between', marginBottom:14}}>
          <div style={{fontSize:11, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--text-muted)', fontWeight:600}}>Revenue by construction type</div>
          <div style={{fontSize:11, color:'var(--text-muted)'}}>Click a row to focus the section on that type</div>
        </div>
        {byTypeRows.length === 0 ? (
          <div style={{color:'var(--text-muted)', fontSize:13, padding:'8px 0'}}>No revenue recorded in this period.</div>
        ) : byTypeRows.map(t => {
          const active = crossFilter.propertyType === t.key;
          const dim = crossFilter.propertyType && !active;
          const widthPct = Math.max(2, Math.round((t.billed / byTypeMax) * 100));
          const collWidthPct = t.billed > 0 ? Math.round((t.collected / t.billed) * widthPct) : 0;
          const collRate = t.billed > 0 ? Math.round((t.collected / t.billed) * 100) : 0;
          return (
            <div key={t.key}
              onClick={() => setCrossFilter({ ...crossFilter, propertyType: active ? null : t.key, buildingId: null })}
              style={{display:'grid', gridTemplateColumns:'170px 1fr 130px 100px', gap:14, alignItems:'center', padding:'12px 8px', cursor:'pointer', borderRadius:8, background: active ? 'rgba(19,31,35,0.04)' : 'transparent', opacity: dim ? 0.45 : 1, transition:'background 0.15s, opacity 0.15s'}}>
              <div style={{display:'flex', alignItems:'center', gap:10}}>
                <span style={{width:10, height:10, borderRadius:3, background:_PR_TYPE_COLORS[t.key]}}/>
                <span style={{fontSize:13, fontWeight:600, color:'var(--text-dark)'}}>{_PR_TYPE_LABELS[t.key]}</span>
                <span style={{fontSize:11, color:'var(--text-muted)'}}>· {t.buildings}</span>
              </div>
              <div style={{height:14, background:'#f4f1ec', borderRadius:7, overflow:'hidden', position:'relative'}}>
                {/* Billed (lighter) bar */}
                <div style={{position:'absolute', left:0, top:0, bottom:0, width:widthPct + '%', background:_PR_TYPE_COLORS[t.key], opacity:0.28, borderRadius:7, transition:'width 0.3s'}}/>
                {/* Collected (solid) bar */}
                <div style={{position:'absolute', left:0, top:0, bottom:0, width:collWidthPct + '%', background:_PR_TYPE_COLORS[t.key], borderRadius:7, transition:'width 0.3s', boxShadow:'inset 0 1px 0 rgba(255,255,255,0.18)'}}/>
              </div>
              <div style={{fontSize:13, fontWeight:700, color:'var(--text-dark)', textAlign:'right', letterSpacing:'-0.01em'}}>{fmtShort(t.billed)}</div>
              <div style={{fontSize:11, color:'var(--text-muted)', textAlign:'right', fontWeight:500}}>{collRate}% coll</div>
            </div>
          );
        })}
        {/* Legend */}
        <div style={{display:'flex', gap:14, marginTop:10, paddingTop:10, borderTop:'1px solid #f0f0f0', fontSize:10, color:'var(--text-muted)'}}>
          <span style={{display:'inline-flex', alignItems:'center', gap:6}}><span style={{width:10, height:10, borderRadius:2, background:'#5a6b4f', opacity:0.28}}/>Billed</span>
          <span style={{display:'inline-flex', alignItems:'center', gap:6}}><span style={{width:10, height:10, borderRadius:2, background:'#5a6b4f'}}/>Collected</span>
        </div>
      </div>

      {/* Two-up: trend + top contributors */}
      <div style={{display:'grid', gridTemplateColumns:'minmax(0, 1.5fr) minmax(0, 1fr)', gap:18}}>
        <div className="card" style={{padding:'20px 24px'}}>
          <div style={{display:'flex', alignItems:'baseline', justifyContent:'space-between', marginBottom:14}}>
            <div style={{fontSize:11, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--text-muted)', fontWeight:600}}>Collection trend</div>
            <div style={{fontSize:11, color:'var(--text-muted)'}}>Click a month to focus</div>
          </div>
          <PortfolioTrendChart data={trendData} selectedMonth={crossFilter.month} onSelectMonth={(m) => setCrossFilter({ ...crossFilter, month: m })}/>
        </div>

        <div className="card" style={{padding:'20px 24px'}}>
          <div style={{display:'flex', alignItems:'baseline', justifyContent:'space-between', marginBottom:14}}>
            <div style={{fontSize:11, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--text-muted)', fontWeight:600}}>Top revenue contributors</div>
            <div style={{fontSize:11, color:'var(--text-muted)'}}>{topShow.length}/{stats.topContributors.length}</div>
          </div>
          {topShow.length === 0 ? (
            <div style={{color:'var(--text-muted)', fontSize:13, padding:'8px 0'}}>No billed revenue in this period{useFiltered ? ' for the current filter' : ''}.</div>
          ) : topShow.map(b => {
            const active = crossFilter.buildingId === b.id;
            const dim = crossFilter.buildingId && !active;
            const wPct = Math.max(3, Math.round((b.billed / topMax) * 100));
            const cColor = _PR_TYPE_COLORS[b.property_type] || '#61707D';
            return (
              <div key={b.id}
                onClick={() => setCrossFilter({ ...crossFilter, buildingId: active ? null : b.id, propertyType: null })}
                style={{display:'grid', gridTemplateColumns:'1fr 90px', gap:12, alignItems:'center', padding:'9px 6px', cursor:'pointer', borderRadius:6, background: active ? 'rgba(19,31,35,0.04)' : 'transparent', opacity: dim ? 0.4 : 1, transition:'background 0.15s, opacity 0.15s'}}>
                <div style={{minWidth:0}}>
                  <div style={{fontSize:12, fontWeight:600, color:'var(--text-dark)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{b.name}</div>
                  <div style={{height:5, background:'#f4f1ec', borderRadius:3, overflow:'hidden', marginTop:5}}>
                    <div style={{height:'100%', width:wPct + '%', background:cColor, borderRadius:3}}/>
                  </div>
                </div>
                <div style={{fontSize:12, fontWeight:700, color:'var(--text-dark)', textAlign:'right', letterSpacing:'-0.01em'}}>{fmtShort(b.billed)}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const FinanceReports = ({ stats, fmt, fmtShort }) => {
  const collectionPctOf = (key) => {
    const t = stats.totalInvoiced || 1;
    return Math.round(((stats[key] || 0) / t) * 100);
  };
  return (
    <div>
      {/* 1. Hero KPI strip */}
      <div className="card">
        <div style={{fontSize:13,fontWeight:600,marginBottom:14}}>Portfolio Health Summary</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(6, minmax(0, 1fr))',gap:14}}>
          {[
            { label: 'Occupancy Rate', value: stats.occupancyRate + '%' },
            { label: 'Monthly Revenue (run-rate)', value: fmtShort(stats.monthlyRevenue) },
            { label: 'Collection Rate', value: stats.collectionRate + '%' },
            { label: 'Outstanding Receivables', value: fmtShort(stats.pending + stats.overdue) },
            { label: 'Open Maintenance', value: stats.openSRs },
            { label: 'Net Operating Income (est.)', value: fmtShort(stats.noi) },
          ].map((k, i) => (
            <div key={i} style={{padding:'18px 16px',background:'var(--bg-surface)',borderRadius:10,border:'1px solid var(--border-light)',minWidth:0}}>
              <div style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:6}}>{k.label}</div>
              <div style={{fontSize:22,fontWeight:600,color:'var(--text-dark)',letterSpacing:'-0.025em',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{k.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Rent Collection Status */}
      <div className="card">
        <div style={{fontSize:13,fontWeight:600,marginBottom:6}}>Rent Collection Status</div>
        <div style={{fontSize:11,color:'var(--text-secondary)',marginBottom:14}}>Live breakdown of all invoices across selected properties</div>
        <div style={{display:'flex',height:32,borderRadius:6,overflow:'hidden',border:'1px solid var(--border-light)',marginBottom:14}}>
          <div title={'Paid: ' + fmt(stats.collected)} style={{flex: Math.max(stats.collected, 1), background:'#5a6b4f',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:11,fontWeight:500}}>
            {collectionPctOf('collected') > 8 ? collectionPctOf('collected') + '%' : ''}
          </div>
          <div title={'Pending: ' + fmt(stats.pending)} style={{flex: Math.max(stats.pending, 1), background:'#D0D6D5',display:'flex',alignItems:'center',justifyContent:'center',color:'#4a4540',fontSize:11,fontWeight:500}}>
            {collectionPctOf('pending') > 8 ? collectionPctOf('pending') + '%' : ''}
          </div>
          <div title={'Overdue: ' + fmt(stats.overdue)} style={{flex: Math.max(stats.overdue, 1), background:'#8b4a42',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:11,fontWeight:500}}>
            {collectionPctOf('overdue') > 8 ? collectionPctOf('overdue') + '%' : ''}
          </div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))',gap:12,fontSize:12}}>
          <div><span style={{display:'inline-block',width:10,height:10,borderRadius:2,background:'#5a6b4f',marginRight:6}}/>Paid <strong>{fmt(stats.collected)}</strong></div>
          <div><span style={{display:'inline-block',width:10,height:10,borderRadius:2,background:'#D0D6D5',marginRight:6}}/>Pending <strong>{fmt(stats.pending)}</strong></div>
          <div><span style={{display:'inline-block',width:10,height:10,borderRadius:2,background:'#8b4a42',marginRight:6}}/>Overdue <strong>{fmt(stats.overdue)}</strong></div>
          <div><span style={{color:'var(--text-secondary)'}}>Total invoiced</span> <strong>{fmt(stats.totalInvoiced)}</strong></div>
        </div>
      </div>

      {/* 5. Service Charges Breakdown */}
      <div className="card">
        <div style={{fontSize:13,fontWeight:600,marginBottom:14}}>Service Charges Breakdown (by source)</div>
        {Object.keys(stats.chargeByCategory).length === 0 ? (
          <div style={{color:'var(--text-muted)',fontSize:13,padding:20}}>No charge data yet.</div>
        ) : (
          <div>
            {Object.entries(stats.chargeByCategory).sort((a,b) => b[1]-a[1]).map(([cat, amt]) => {
              const pct = stats.totalInvoiced > 0 ? Math.round((amt / stats.totalInvoiced) * 100) : 0;
              return (
                <div key={cat} style={{marginBottom:10}}>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:4}}>
                    <span style={{fontWeight:500}}>{cat}</span>
                    <span style={{color:'var(--text-secondary)'}}>{fmt(amt)} · {pct}%</span>
                  </div>
                  <div style={{height:6,background:'var(--bg-surface)',borderRadius:3,overflow:'hidden'}}>
                    <div style={{height:'100%',width:pct+'%',background:'var(--bg-warm-dark)'}}/>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Charts stacked full-width */}
      <div style={{display:'grid',gridTemplateColumns:'1fr',gap:18}}>
      <div className="card">
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:6}}>
          <div>
            <div style={{fontSize:13,fontWeight:600}}>Invoice Status by Month</div>
            <div style={{fontSize:11,color:'var(--text-secondary)',marginTop:2}}>Stacked by Paid · Pending · Overdue. Hover bars for exact AED.</div>
          </div>
        </div>
        <ChartCanvas height={300} config={{
          type: 'bar',
          data: {
            labels: stats.monthLabels,
            datasets: [
              { label: 'Paid',    data: stats.invSeries.paid,    backgroundColor: '#5a6b4f' },
              { label: 'Pending', data: stats.invSeries.pending, backgroundColor: '#D0D6D5' },
              { label: 'Overdue', data: stats.invSeries.overdue, backgroundColor: '#8b4a42' },
            ],
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
              legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
              tooltip: {
                callbacks: {
                  label: (ctx) => ctx.dataset.label + ': AED ' + Math.round(ctx.parsed.y).toLocaleString(),
                  footer: (items) => 'Total: AED ' + items.reduce((s, it) => s + it.parsed.y, 0).toLocaleString(),
                },
              },
            },
            scales: {
              x: { stacked: true, grid: { display: false } },
              y: { stacked: true, beginAtZero: true, ticks: { callback: (v) => 'AED ' + Math.round(v/1000) + 'K' } },
            },
          },
        }}/>
      </div>

      <div className="card">
        <div style={{marginBottom:6}}>
          <div style={{fontSize:13,fontWeight:600}}>Cumulative Revenue</div>
          <div style={{fontSize:11,color:'var(--text-secondary)',marginTop:2}}>Running total of collected vs invoiced over the period.</div>
        </div>
        <ChartCanvas height={300} config={{
          type: 'line',
          data: {
            labels: stats.monthLabels,
            datasets: [
              { label: 'Cumulative Invoiced', data: stats.cumInvoiced, borderColor: '#3E4C59', backgroundColor: 'rgba(146,137,137,0.12)', tension: 0.3, fill: true, pointRadius: 3 },
              { label: 'Cumulative Collected', data: stats.cumCollected, borderColor: '#5a6b4f', backgroundColor: 'rgba(90,107,79,0.15)', tension: 0.3, fill: true, pointRadius: 3 },
            ],
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
              legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
              tooltip: { callbacks: { label: (ctx) => ctx.dataset.label + ': AED ' + Math.round(ctx.parsed.y).toLocaleString() } },
            },
            scales: {
              x: { grid: { display: false } },
              y: { beginAtZero: true, ticks: { callback: (v) => 'AED ' + Math.round(v/1000) + 'K' } },
            },
          },
        }}/>
      </div>
      </div>

      {/* Revenue vs Costs — text summary */}
      <div className="card">
        <div style={{fontSize:13,fontWeight:600,marginBottom:14}}>Revenue vs Operating Costs (estimated)</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3, 1fr)',gap:14}}>
          <div style={{padding:14,background:'var(--bg-surface)',borderRadius:8}}>
            <div style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:4}}>Total Revenue (collected)</div>
            <div style={{fontSize:20,fontWeight:600,color:'#5a6b4f'}}>{fmt(stats.collected)}</div>
          </div>
          <div style={{padding:14,background:'var(--bg-surface)',borderRadius:8}}>
            <div style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:4}}>Estimated Expenses (~30%)</div>
            <div style={{fontSize:20,fontWeight:600,color:'#8b4a42'}}>{fmt(stats.collected * 0.3)}</div>
          </div>
          <div style={{padding:14,background:'var(--bg-surface)',borderRadius:8}}>
            <div style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:4}}>Net Operating Income</div>
            <div style={{fontSize:20,fontWeight:600,color:'var(--text-dark)'}}>{fmt(stats.noi)}</div>
          </div>
        </div>
        <div style={{fontSize:11,color:'var(--text-muted)',marginTop:12}}>Expense % is currently a 30% placeholder. Wire to actual expense ledger when integrated.</div>
      </div>
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

