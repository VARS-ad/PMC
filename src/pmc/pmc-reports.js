// ==================== PMC REPORTS PAGE ====================
// Section-grouped landlord reports inspired by vars_landlord_dashboards.md
// (Tier 1 must-haves + Tier 2 operational selections). Reads real data from
// Supabase, scoped to selectedProperties from the top-bar selector.

const PMCReportsPage = () => {
  const { selectedProperties = [] } = useApp();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  const [section, setSection] = useState('finance');
  const [showExport, setShowExport] = useState(false);
  const [timeRange, setTimeRange] = useState('12m'); // '3m' | '6m' | '12m' | 'ytd' | '24m'

  // Time-range cutoff for filtering
  const cutoff = (() => {
    const d = new Date();
    if (timeRange === '3m') d.setMonth(d.getMonth() - 3);
    else if (timeRange === '6m') d.setMonth(d.getMonth() - 6);
    else if (timeRange === '12m') d.setMonth(d.getMonth() - 12);
    else if (timeRange === '24m') d.setMonth(d.getMonth() - 24);
    else if (timeRange === 'ytd') { d.setMonth(0); d.setDate(1); }
    else return null;
    return d.toISOString().slice(0, 10);
  })();
  const monthCount = timeRange === '3m' ? 3
                  : timeRange === '6m' ? 6
                  : timeRange === '24m' ? 24
                  : timeRange === 'ytd' ? new Date().getMonth() + 1
                  : 12;

  useEffect(() => {
    let mounted = true;
    setLoading(true); setError(null);
    (async () => {
      if (!supabaseClient) { setError('Supabase not initialized'); setLoading(false); return; }
      try {
        const filterB = selectedProperties.length > 0 ? selectedProperties : null;
        const { data: buildings } = await supabaseClient.from('buildings').select('id,name');
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
          supabaseClient.from('invoices').select('amount_aed,status,due_date,source_type,created_at').in('unit_id', probeIds),
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

        setStats({
          buildings: filterB ? (buildings || []).filter(b => filterB.includes(b.id)) : (buildings || []),
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

  const sections = [
    { id: 'finance',    label: 'Finance & Revenue' },
    { id: 'occupancy',  label: 'Occupancy & Leasing' },
    { id: 'operations', label: 'Operations' },
    { id: 'compliance', label: 'Compliance' },
  ];

  const downloadBlob = (filename, content, mime) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleExport = async (format) => {
    setShowExport(false);
    if (!stats) { alert('Data is still loading — try again in a moment.'); return; }
    const today = new Date().toISOString().slice(0, 10);
    const filename = 'vars-pm-report-' + today;
    const scope = selectedProperties.length > 0 ? selectedProperties.length + ' building(s) — top-bar scope' : 'All buildings';

    const fmtA = (n) => 'AED ' + Math.round(n).toLocaleString();

    // Section definitions: [title, headerRow, dataRows]
    const sections = [
      ['Portfolio Health Summary', ['Metric','Value'], [
        ['Occupancy Rate', stats.occupancyRate + '%'],
        ['Occupied Units', stats.occupiedUnits + ' / ' + stats.totalUnits],
        ['Owners', stats.owners], ['Tenants', stats.tenants],
        ['Monthly Run-Rate', fmtA(stats.monthlyRevenue)],
        ['Open Maintenance', stats.openSRs],
        ['Outstanding Receivables', fmtA(stats.pending + stats.overdue)],
        ['Estimated Net Operating Income', fmtA(stats.noi)],
      ]],
      ['Rent Collection Status', ['Bucket','Amount (AED)','% of Total'], [
        ['Paid',    fmtA(stats.collected), (stats.totalInvoiced > 0 ? Math.round(stats.collected/stats.totalInvoiced*100) : 0) + '%'],
        ['Pending', fmtA(stats.pending),   (stats.totalInvoiced > 0 ? Math.round(stats.pending/stats.totalInvoiced*100)   : 0) + '%'],
        ['Overdue', fmtA(stats.overdue),   (stats.totalInvoiced > 0 ? Math.round(stats.overdue/stats.totalInvoiced*100)   : 0) + '%'],
        ['Total Invoiced', fmtA(stats.totalInvoiced), '100%'],
        ['Collection Rate', stats.collectionRate + '%', ''],
      ]],
      ['Service Charges by Source', ['Source','Amount (AED)'],
        Object.entries(stats.chargeByCategory || {}).map(([k, v]) => [k, fmtA(v)])
      ],
      ['Lease Pipeline', ['Bucket','Count'], [
        ['Expiring next 90 days', stats.leasesExpSoon],
        ['Already expired (holdover)', stats.leasesExpired],
      ]],
      ['Maintenance — Tickets by Status', ['Status','Count'],
        Object.entries(stats.srByStatus || {}).map(([k, v]) => [k, v])
      ],
      ['Maintenance — Tickets by Category', ['Category','Count'],
        Object.entries(stats.srByCategory || {}).map(([k, v]) => [k, v])
      ],
      ['Visitor Analytics — by Status', ['Status','Count'],
        Object.entries(stats.visitsByStatus || {}).map(([k, v]) => [k, v])
      ],
      ['Visitor Analytics — by Type', ['Type','Count'],
        Object.entries(stats.visitsByType || {}).map(([k, v]) => [k, v])
      ],
      ['Amenity Usage', ['Amenity','Bookings'],
        Object.entries(stats.bookingsByAmenity || {}).map(([k, v]) => [k, v])
      ],
      ['PMC Performance Scorecard', ['Metric','Value'], [
        ['Maintenance resolution rate', (stats.totalSRs > 0 ? Math.round(stats.closedSRs/stats.totalSRs*100) : 0) + '%'],
        ['Collection efficiency', stats.collectionRate + '%'],
        ['Open ticket ratio', (stats.totalSRs > 0 ? Math.round(stats.openSRs/stats.totalSRs*100) : 0) + '%'],
        ['Receivables ratio (outstanding / total)', (stats.totalInvoiced > 0 ? Math.round((stats.pending+stats.overdue)/stats.totalInvoiced*100) : 0) + '%'],
      ]],
    ];

    if (format === 'CSV') {
      const escape = (c) => { const s = String(c == null ? '' : c); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
      let csv = 'VARS — PM Report\nGenerated,' + today + '\nScope,' + scope + '\n\n';
      sections.forEach(([title, head, rows]) => {
        csv += title + '\n';
        csv += [head, ...rows].map(r => r.map(escape).join(',')).join('\n');
        csv += '\n\n';
      });
      downloadBlob(filename + '.csv', csv, 'text/csv;charset=utf-8');
      return;
    }

    if (format === 'Excel') {
      const wb = window.XLSX.utils.book_new();
      // Summary sheet — everything in one tab
      const summary = [
        ['VARS — Property Manager Report'],
        ['Generated', today], ['Scope', scope], [],
      ];
      sections.forEach(([title, head, rows]) => {
        summary.push([title]);
        summary.push(head);
        rows.forEach(r => summary.push(r));
        summary.push([]);
      });
      window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(summary), 'Summary');
      // One sheet per section for analysts who want to pivot
      sections.forEach(([title, head, rows]) => {
        const safe = title.replace(/[^A-Za-z0-9 ]/g, '').slice(0, 28) || 'Section';
        window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet([head, ...rows]), safe);
      });
      window.XLSX.writeFile(wb, filename + '.xlsx');
      return;
    }

    if (format === 'PDF') {
      await ensurePdf();
      const { jsPDF } = window.jspdf || {};
      if (!jsPDF) { alert('PDF library failed to load.'); return; }
      const doc = new jsPDF();
      doc.setFontSize(18); doc.setTextColor(26, 26, 26);
      doc.text('VARS — Property Manager Report', 14, 18);
      doc.setFontSize(10); doc.setTextColor(120, 120, 120);
      doc.text('Generated ' + today + ' · Scope: ' + scope, 14, 25);
      let y = 32;
      sections.forEach(([title, head, rows]) => {
        if (y > 250) { doc.addPage(); y = 20; }
        doc.setFontSize(12); doc.setTextColor(26, 26, 26);
        doc.text(title, 14, y);
        doc.autoTable({
          startY: y + 3,
          head: [head], body: rows.length ? rows : [['—','—']],
          theme: 'grid',
          headStyles: { fillColor: [146, 137, 137], textColor: 255, fontSize: 9 },
          bodyStyles: { fontSize: 9, textColor: 30 },
          margin: { left: 14, right: 14 },
        });
        y = (doc.lastAutoTable.finalY || y) + 12;
      });
      doc.save(filename + '.pdf');
      return;
    }

    if (format === 'Word') {
      let html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>VARS PM Report</title>';
      html += '<style>body{font-family:"Segoe UI",Arial,sans-serif;color:#131F23;padding:24pt;}h1{font-size:20pt;margin:0 0 8pt;}h2{font-size:13pt;margin:18pt 0 6pt;color:#6b5d52;border-bottom:1px solid #D0D6D5;padding-bottom:4pt;}table{border-collapse:collapse;width:100%;margin:6pt 0 12pt;}th,td{border:1px solid #D0D6D5;padding:6pt 10pt;text-align:left;font-size:10pt;}th{background:#3E4C59;color:#fff;}</style>';
      html += '</head><body>';
      html += '<h1>VARS — Property Manager Report</h1>';
      html += '<p style="color:#6b5d52;font-size:10pt;">Generated ' + today + ' · Scope: ' + scope + '</p>';
      sections.forEach(([title, head, rows]) => {
        html += '<h2>' + title + '</h2><table>';
        html += '<thead><tr>' + head.map(c => '<th>' + (c == null ? '' : c) + '</th>').join('') + '</tr></thead>';
        html += '<tbody>' + (rows.length ? rows : [['—','—']]).map(r => '<tr>' + r.map(c => '<td>' + (c == null ? '' : c) + '</td>').join('') + '</tr>').join('') + '</tbody>';
        html += '</table>';
      });
      html += '</body></html>';
      downloadBlob(filename + '.doc', html, 'application/msword');
      return;
    }
  };

  if (error) return <div className="page-header"><h1>Reports</h1><div style={{color:'#8b4a42',fontSize:13,marginTop:14}}>{error}</div></div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Reports</h1>
        </div>
        <div style={{display:'flex',gap:10,alignItems:'center'}}>
          <select className="form-input" value={timeRange} onChange={e => setTimeRange(e.target.value)} style={{width:'auto',minWidth:170,padding:'9px 14px',fontSize:13}}>
            <option value="3m">Last 3 months</option>
            <option value="6m">Last 6 months</option>
            <option value="12m">Last 12 months</option>
            <option value="24m">Last 24 months</option>
            <option value="ytd">Year to date</option>
            <option value="all">All time</option>
          </select>
        <div style={{position:'relative'}}>
          <button className="btn btn-primary" onClick={() => setShowExport(!showExport)}>Export ▾</button>
          {showExport && (
            <>
              <div onClick={() => setShowExport(false)} style={{position:'fixed',top:0,left:0,right:0,bottom:0,zIndex:899}}/>
              <div style={{position:'absolute',right:0,top:'100%',marginTop:6,minWidth:220,background:'#fff',border:'1px solid var(--border-light)',borderRadius:8,boxShadow:'0 8px 24px rgba(0,0,0,0.1)',zIndex:900,overflow:'hidden'}}>
                {['PDF','Word','CSV','Excel'].map(f => (
                  <div key={f} onClick={() => handleExport(f)} style={{padding:'12px 16px',cursor:'pointer',fontSize:13,borderBottom:'1px solid var(--border-light)'}} onMouseEnter={e=>e.currentTarget.style.background='var(--bg-page)'} onMouseLeave={e=>e.currentTarget.style.background='#fff'}>
                    Export as {f}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        </div>
      </div>

      <div style={{display:'flex',gap:8,marginBottom:24,borderBottom:'1px solid var(--border-light)'}}>
        {sections.map(s => (
          <div key={s.id} onClick={() => setSection(s.id)} style={{padding:'10px 18px',cursor:'pointer',fontSize:13,fontWeight:section===s.id?500:400,color:section===s.id?'var(--text-dark)':'var(--text-secondary)',borderBottom: section===s.id ? '2px solid var(--bg-warm-dark)' : '2px solid transparent',marginBottom:-1,letterSpacing:'-0.01em'}}>
            {s.label}
          </div>
        ))}
      </div>

      {loading || !stats ? (
        <div className="card"><div style={{padding:24,color:'var(--text-muted)',fontSize:13}}>Loading…</div></div>
      ) : section === 'finance' ? <FinanceReports stats={stats} fmt={fmt} fmtShort={fmtShort}/> :
          section === 'occupancy' ? <OccupancyReports stats={stats} fmt={fmt}/> :
          section === 'operations' ? <OperationsReports stats={stats}/> :
          <ComplianceReports stats={stats}/>}
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

