// ==================== PMC REPORTS PAGE ====================
// 7-tab portfolio report (Portfolio · Financial · Residents · Service Ops ·
// Maintenance Co. · Visitors & Guards · Compliance) backed by live Supabase
// data, scoped to selectedProperties from the top-bar selector.
//
// Header offers TWO downloads:
//   1) "Download Report (PDF)" — one big multi-page branded PDF bundling
//      every section (cover + ToC + per-section pages). Calls
//      renderFullReportPdf().
//   2) "Download Data" — opens the shared ExportPrintModal so each section's
//      tabular data can be exported separately as PDF/Excel/CSV/Word.
//
// Privacy: full PII (resident names + phones + emails, vendor contacts) is
// included intentionally — the PDF cover page carries a
// "CONFIDENTIAL · For authorised personnel only" header.

// ----- Custom Chart.js plugins (inline so they live with their config) -----
// 1) Bar data labels — paints the value on top of each bar so the user can
//    read the exact AED amount without hovering. Replaces the noisy K/M
//    y-axis (the user explicitly asked for it gone).
function _barDataLabelsPlugin(formatter) {
  return {
    id: 'varsBarDataLabels',
    afterDatasetsDraw(chart) {
      const ctx = chart.ctx;
      ctx.save();
      ctx.font = '600 11px "Manrope", -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      chart.data.datasets.forEach((dataset, di) => {
        const meta = chart.getDatasetMeta(di);
        if (!meta || meta.hidden) return;
        // Use the dataset's bar colour for the label so multi-series bars
        // (Billed/Collected) stay distinguishable.
        ctx.fillStyle = (typeof dataset.backgroundColor === 'string') ? dataset.backgroundColor : '#3E4C59';
        // Lighten the data label if the bar fill is too light (e.g. the
        // grey "Billed" bars) — otherwise the label disappears on white.
        if (typeof dataset.backgroundColor === 'string' && /^#e/i.test(dataset.backgroundColor)) {
          ctx.fillStyle = '#61707D';
        }
        meta.data.forEach((bar, idx) => {
          const v = dataset.data[idx];
          if (v == null || v === 0) return;
          const txt = formatter(v);
          if (!txt) return;
          ctx.fillText(txt, bar.x, bar.y - 6);
        });
      });
      ctx.restore();
    }
  };
}

// 2) Doughnut center text — paints a big stacked label (e.g. "248 / Visits")
//    in the empty middle of a doughnut chart.
function _doughnutCenterPlugin(top, bottom) {
  return {
    id: 'varsDoughnutCenter',
    afterDraw(chart) {
      const { ctx, chartArea } = chart;
      if (!chartArea) return;
      const cx = (chartArea.left + chartArea.right) / 2;
      const cy = (chartArea.top + chartArea.bottom) / 2;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#131F23';
      ctx.font = '700 26px "Manrope", -apple-system, sans-serif';
      ctx.fillText(top, cx, cy - 8);
      ctx.fillStyle = '#61707D';
      ctx.font = '500 11px "Manrope", -apple-system, sans-serif';
      ctx.fillText(bottom, cx, cy + 14);
      ctx.restore();
    }
  };
}

// Bar-label formatter — full integer with thousands separators, no K/M
// abbreviation (per user feedback: report consumers want exact figures,
// not 1.14M). The card header still prefixes "AED" for the total chip;
// individual bar labels skip the prefix to fit on narrow bars.
const _fmtBarAed = (n) => {
  const r = Math.round(Number(n) || 0);
  if (r === 0) return '';
  return r.toLocaleString('en-US');
};

const PMCReportsPage = () => {
  const { selectedProperties = [], timeRange, customStart, customEnd } = useApp();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  const [section, setSection] = useState('portfolio');
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
  const periodEnd = periodBounds.end;
  const monthCount = (() => {
    if (timeRange === 'custom') {
      if (!customStart || !customEnd) return 1;
      const s = new Date(customStart); const e = new Date(customEnd);
      return Math.max(1, Math.min(24, (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1));
    }
    return monthsBack || 1;
  })();
  const periodLabel = (() => {
    if (timeRange === 'custom') return (customStart || '') + ' → ' + (customEnd || '');
    return ({ '1m':'Current month','2m':'Last 2 months','3m':'Last 3 months','12m':'Last 12 months' })[timeRange] || 'Current month';
  })();

  useEffect(() => {
    let mounted = true;
    setLoading(true); setError(null);
    (async () => {
      if (!supabaseClient) { setError('Supabase not initialized'); setLoading(false); return; }
      try {
        const filterB = selectedProperties.length > 0 ? selectedProperties : null;
        const { data: buildings } = await supabaseClient.from('buildings').select('id,name,property_type,address,parking_spots,amenities');
        const { data: units } = await supabaseClient.from('units').select('id,building_id,floor,unit_number,tenant_name,tenant_phone,tenant_tenure,tenant_lease_start,tenant_lease_end,tenant_monthly_payment_aed,tenant_contract_number');
        const filteredUnits = (units || []).filter(u => !filterB || filterB.includes(u.building_id));
        const fIds = filteredUnits.map(u => u.id);
        const probeIds = fIds.length ? fIds : ['00000000-0000-0000-0000-000000000000'];
        const bIds = filterB || (buildings || []).map(b => b.id);
        const probeB = bIds.length ? bIds : ['00000000-0000-0000-0000-000000000000'];

        // Core scoped Promise.all. Each query is fault-tolerant: if a table
        // doesn't exist (or the query errors for any reason) the result
        // falls back to an empty array and the relevant section renders
        // a "No data yet" notice instead of crashing the page.
        const safe = (p) => p.then(r => r.data || []).catch(() => []);
        const [
          ras, invoices, srs, visits, bookings, profiles,
          vendors, vendorPayments, securityShifts,
          unitAttachments,
        ] = await Promise.all([
          safe(supabaseClient.from('resident_assignments').select('profile_id,unit_id,tenure,monthly_payment_aed,lease_start,lease_end,ownership_start,contract_number,cheques_per_year').in('unit_id', probeIds)),
          safe(supabaseClient.from('invoices').select('id,unit_id,invoice_number,description,amount_aed,status,due_date,created_at,source_type').in('unit_id', probeIds)),
          safe(supabaseClient.from('service_requests').select('id,unit_id,category,status,priority,description,resolved_at,created_at').in('unit_id', probeIds)),
          safe(supabaseClient.from('visits').select('id,unit_id,type,status,visitor_name,visit_date,visit_time,created_at,checked_in_at,checked_out_at').in('unit_id', probeIds)),
          safe(supabaseClient.from('amenity_bookings').select('amenity_name,status,booking_date,created_at').in('building_id', probeB)),
          safe(supabaseClient.from('profiles').select('id,full_name,phone,role,created_at')),
          safe(supabaseClient.from('vendors').select('id,name,service_category,contact_person,contact_phone,contact_email,status,contract_start,contract_end,contract_value_aed,trade_license,trn_number')),
          safe(supabaseClient.from('vendor_payments').select('id,vendor_id,invoice_number,description,amount_aed,payment_status,paid_date,invoice_date,category')),
          safe(supabaseClient.from('security_assignments').select('profile_id,building_id,shift').in('building_id', probeB)),
          safe(supabaseClient.from('unit_attachments').select('id,unit_id,kind,filename,created_at').in('unit_id', probeIds)),
        ]);
        if (!mounted) return;

        // --- Time-range cutoffs for time-bound surfaces ---
        const within = (iso) => iso && iso.slice(0,10) >= cutoff && iso.slice(0,10) <= periodEnd;
        const cutInv      = invoices.filter(i => within(i.created_at || i.due_date));
        const cutSRs      = srs.filter(s => within(s.created_at));
        const cutVisits   = visits.filter(v => within(v.visit_date || v.created_at));
        const cutBookings = bookings.filter(b => within(b.booking_date || b.created_at));

        // --- Building lookups ---
        const buildingsScoped = filterB ? buildings.filter(b => filterB.includes(b.id)) : buildings;
        const bldgById = Object.fromEntries(buildingsScoped.map(b => [b.id, b]));
        const unitsScoped = filteredUnits;
        const unitById = Object.fromEntries(unitsScoped.map(u => [u.id, u]));

        // ============ Portfolio ============
        const assetsByType = {};
        buildingsScoped.forEach(b => { assetsByType[b.property_type || 'Other'] = (assetsByType[b.property_type || 'Other'] || 0) + 1; });
        const totalUnits = unitsScoped.length;
        // Occupied = unit has a resident_assignment OR units.tenant_name is set
        // (commercial / villa clients live there). Dedupe by unit_id.
        const occupiedSet = new Set(ras.map(r => r.unit_id));
        for (const u of unitsScoped) if (u.tenant_name) occupiedSet.add(u.id);
        const occupiedUnits = occupiedSet.size;
        const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;
        const vacant = Math.max(totalUnits - occupiedUnits, 0);
        const owners = ras.filter(r => r.tenure === 'Owner').length;
        // Tenants = residential tenants (in ras) + non-residential occupants
        // (units.tenant_name) so the Residents tab reflects all clients.
        const nonResTenants = unitsScoped.filter(u => u.tenant_name && !ras.some(r => r.unit_id === u.id)).length;
        const tenants = ras.filter(r => r.tenure === 'Tenant').length + nonResTenants;
        // Vacancy list — units NOT occupied (by either path).
        const vacancyList = unitsScoped.filter(u => !occupiedSet.has(u.id)).slice(0, 10).map(u => ({
          building: (bldgById[u.building_id] || {}).name || '—',
          floor: u.floor,
          unit: u.unit_number,
        }));

        // ============ Financial ============
        const totalInvoiced = cutInv.reduce((s, i) => s + Number(i.amount_aed), 0);
        const collected = cutInv.filter(i => i.status === 'Paid').reduce((s, i) => s + Number(i.amount_aed), 0);
        const pending = cutInv.filter(i => i.status === 'Pending').reduce((s, i) => s + Number(i.amount_aed), 0);
        const overdue = cutInv.filter(i => i.status === 'Overdue').reduce((s, i) => s + Number(i.amount_aed), 0);
        const collectionRate = totalInvoiced > 0 ? Math.round((collected / totalInvoiced) * 100) : 0;

        // Revenue by construction (property) type
        const revByType = {};
        cutInv.forEach(i => {
          const u = unitById[i.unit_id]; if (!u) return;
          const b = bldgById[u.building_id]; if (!b) return;
          const t = b.property_type || 'Other';
          revByType[t] = (revByType[t] || 0) + Number(i.amount_aed);
        });

        // Top contributors (by collected AED)
        const collectedByUnit = {};
        cutInv.filter(i => i.status === 'Paid').forEach(i => {
          collectedByUnit[i.unit_id] = (collectedByUnit[i.unit_id] || 0) + Number(i.amount_aed);
        });
        const topContributors = Object.entries(collectedByUnit)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([uid, amt]) => {
            const u = unitById[uid] || {};
            const b = bldgById[u.building_id] || {};
            return { building: b.name || '—', unit: u.unit_number || '—', amount: amt };
          });

        // 12-month collection trend (always 12 months for the chart)
        const trendBuckets = buildMonthlyBuckets(12);
        const trendIdx = Object.fromEntries(trendBuckets.map((m, i) => [m.key, i]));
        const collectedTrend = new Array(12).fill(0);
        const billedTrend    = new Array(12).fill(0);
        invoices.forEach(i => {
          const k = (i.created_at || i.due_date || '').slice(0,7);
          const idx = trendIdx[k]; if (idx == null) return;
          billedTrend[idx] += Number(i.amount_aed);
          if (i.status === 'Paid') collectedTrend[idx] += Number(i.amount_aed);
        });

        // Outstanding invoices (Pending + Overdue, sorted by amount desc)
        const outstandingInvoices = invoices
          .filter(i => i.status === 'Pending' || i.status === 'Overdue')
          .sort((a, b) => Number(b.amount_aed) - Number(a.amount_aed))
          .slice(0, 15)
          .map(i => {
            const u = unitById[i.unit_id] || {};
            const b = bldgById[u.building_id] || {};
            return {
              invoice: i.invoice_number || (i.id || '').slice(0, 8),
              building: b.name || '—',
              unit: u.unit_number || '—',
              description: (i.description || '').slice(0, 60),
              amount: Number(i.amount_aed),
              due: i.due_date || '—',
              status: i.status,
            };
          });

        // Future revenue projection (12 months) — from active leases'
        // monthly_payment_aed for months ras.lease_end has not yet passed.
        const futureBuckets = (() => {
          const out = [];
          const now = new Date();
          for (let i = 0; i < 12; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
            out.push({
              key: d.toISOString().slice(0, 7),
              label: d.toLocaleString('default', { month: 'short' }) + ' ' + String(d.getFullYear()).slice(-2),
              ts: d.getTime(),
            });
          }
          return out;
        })();
        const futureRevenue = futureBuckets.map(b => {
          const bucketDate = new Date(b.ts);
          let amt = 0;
          // Residential leases live in resident_assignments.
          ras.forEach(r => {
            const mp = Number(r.monthly_payment_aed) || 0;
            if (!mp) return;
            if (r.lease_end && new Date(r.lease_end) < bucketDate) return;
            amt += mp;
          });
          // Non-residential clients live on units.tenant_*. Include them so
          // Villas + Commercial + Land actually contribute to the chart.
          unitsScoped.forEach(u => {
            const mp = Number(u.tenant_monthly_payment_aed) || 0;
            if (!mp) return;
            if (u.tenant_lease_end && new Date(u.tenant_lease_end) < bucketDate) return;
            amt += mp;
          });
          return amt;
        });

        // ============ Residents ============
        const profilesById = Object.fromEntries(profiles.map(p => [p.id, p]));
        const residentialTenants = ras.map(r => {
          const p = profilesById[r.profile_id] || {};
          const u = unitById[r.unit_id] || {};
          const b = bldgById[u.building_id] || {};
          return {
            name: p.full_name || '—',
            phone: p.phone || '—',
            role: p.role || '—',
            building: b.name || '—',
            unit: u.unit_number || '—',
            tenure: r.tenure || '—',
            leaseStart: r.lease_start || '—',
            leaseEnd: r.lease_end || '—',
            monthly: Number(r.monthly_payment_aed) || 0,
            contractNo: r.contract_number || '—',
          };
        });
        // Non-residential clients live on units.tenant_*. Merge them in so
        // commercial/villa/land tenants appear in the Active Tenants table.
        const raUnitIds = new Set(ras.map(r => r.unit_id));
        const nonResTenantsRows = unitsScoped
          .filter(u => u.tenant_name && !raUnitIds.has(u.id))
          .map(u => {
            const b = bldgById[u.building_id] || {};
            return {
              name: u.tenant_name,
              phone: u.tenant_phone || '—',
              role: '—',
              building: b.name || '—',
              unit: u.unit_number || '—',
              tenure: u.tenant_tenure || 'Tenant',
              leaseStart: u.tenant_lease_start || '—',
              leaseEnd: u.tenant_lease_end || '—',
              monthly: Number(u.tenant_monthly_payment_aed) || 0,
              contractNo: u.tenant_contract_number || '—',
            };
          });
        const activeTenants = residentialTenants.concat(nonResTenantsRows);

        const today = new Date(); today.setHours(0,0,0,0);
        const in60 = new Date(today); in60.setDate(in60.getDate() + 60);
        const in90 = new Date(today); in90.setDate(in90.getDate() + 90);
        // Lease-end union: residential (ras.lease_end) + non-residential
        // (units.tenant_lease_end). Same for lease_start used by move-ins.
        const allLeaseEnds = [
          ...ras.map(r => r.lease_end).filter(Boolean),
          ...unitsScoped.map(u => u.tenant_lease_end).filter(Boolean),
        ];
        const allLeaseStarts = [
          ...ras.map(r => r.lease_start).filter(Boolean),
          ...unitsScoped.map(u => u.tenant_lease_start).filter(Boolean),
        ];
        const leasesExpSoon = allLeaseEnds.filter(d => new Date(d) <= in90 && new Date(d) >= today).length;
        const leasesExpiring60 = activeTenants.filter(r => r.leaseEnd !== '—' && new Date(r.leaseEnd) <= in60 && new Date(r.leaseEnd) >= today);
        const leasesExpired = allLeaseEnds.filter(d => new Date(d) < today).length;

        // Move-ins / move-outs within the period (proxy = lease_start /
        // lease_end falling inside the period window).
        const moveIns  = allLeaseStarts.filter(d => d >= cutoff && d <= periodEnd).length;
        const moveOuts = allLeaseEnds.filter(d => d >= cutoff && d <= periodEnd).length;

        // Top arrears — group outstanding invoices by tenant
        const arrearsByTenant = {};
        invoices.filter(i => i.status === 'Pending' || i.status === 'Overdue').forEach(i => {
          const u = unitById[i.unit_id]; if (!u) return;
          const r = ras.find(x => x.unit_id === i.unit_id);
          const p = r ? profilesById[r.profile_id] : null;
          const key = (p && p.full_name) || (u.unit_number || '—');
          if (!arrearsByTenant[key]) arrearsByTenant[key] = { name: key, building: (bldgById[u.building_id]||{}).name || '—', unit: u.unit_number || '—', phone: p && p.phone || '—', total: 0 };
          arrearsByTenant[key].total += Number(i.amount_aed);
        });
        const topArrears = Object.values(arrearsByTenant).sort((a,b)=>b.total-a.total).slice(0,10);

        // ============ Service Ops ============
        const srByStatus = {};
        cutSRs.forEach(s => { srByStatus[s.status] = (srByStatus[s.status] || 0) + 1; });
        const srByCategory = {};
        cutSRs.forEach(s => { srByCategory[s.category] = (srByCategory[s.category] || 0) + 1; });
        const srByPriority = {};
        cutSRs.forEach(s => { srByPriority[s.priority] = (srByPriority[s.priority] || 0) + 1; });
        const openSRs = ['New','Acknowledged','In Progress'].reduce((acc, k) => acc + (srByStatus[k] || 0), 0);
        const closedSRs = ['Done','Closed'].reduce((acc, k) => acc + (srByStatus[k] || 0), 0);

        // Urgent open list
        const urgentOpen = cutSRs
          .filter(s => (s.priority === 'Urgent' || s.priority === 'High') && (s.status === 'New' || s.status === 'Acknowledged' || s.status === 'In Progress'))
          .slice(0, 15)
          .map(s => {
            const u = unitById[s.unit_id] || {};
            const b = bldgById[u.building_id] || {};
            return { category: s.category, priority: s.priority, status: s.status, description: (s.description || '').slice(0, 70), building: b.name || '—', unit: u.unit_number || '—', created: (s.created_at || '').slice(0, 10) };
          });

        // Resolution time stats — average hours from created_at → resolved_at
        const resolvedDurations = cutSRs
          .filter(s => s.resolved_at && s.created_at)
          .map(s => (new Date(s.resolved_at).getTime() - new Date(s.created_at).getTime()) / 36e5);
        const avgResolutionH = resolvedDurations.length ? Math.round(resolvedDurations.reduce((a,b)=>a+b,0) / resolvedDurations.length) : 0;
        const medianResolutionH = (() => {
          if (!resolvedDurations.length) return 0;
          const arr = resolvedDurations.slice().sort((a,b)=>a-b);
          return Math.round(arr[Math.floor(arr.length / 2)]);
        })();

        // Move in/out SRs (category contains "Move")
        const moveSRs = cutSRs.filter(s => /move/i.test(s.category || '')).length;

        // ============ Maintenance Co. (vendors) ============
        const activeContracts = vendors.filter(v => v.status === 'Active');
        const in90Days = (d) => d && new Date(d) <= in90 && new Date(d) >= today;
        const contractsExp90 = vendors.filter(v => in90Days(v.contract_end));
        const vendorPaid = vendorPayments.filter(p => p.payment_status === 'Paid').reduce((s,p) => s + Number(p.amount_aed), 0);
        const vendorOutstanding = vendorPayments.filter(p => p.payment_status !== 'Paid' && p.payment_status !== 'Cancelled').reduce((s,p) => s + Number(p.amount_aed), 0);
        const vendorById = Object.fromEntries(vendors.map(v => [v.id, v]));
        const spendByVendor = {};
        vendorPayments.forEach(p => { spendByVendor[p.vendor_id] = (spendByVendor[p.vendor_id] || 0) + Number(p.amount_aed); });
        const topVendorSpend = Object.entries(spendByVendor)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([vid, amt]) => ({ name: (vendorById[vid] || {}).name || '—', category: (vendorById[vid] || {}).service_category || '—', amount: amt }));

        // ============ Visitors & Guards ============
        // Daily flow buckets across the period (date string → count)
        const visitDailyMap = {};
        cutVisits.forEach(v => {
          const day = (v.visit_date || v.created_at || '').slice(0, 10);
          if (!day) return;
          visitDailyMap[day] = (visitDailyMap[day] || 0) + 1;
        });
        const visitDailyLabels = Object.keys(visitDailyMap).sort();
        const visitDailyCounts = visitDailyLabels.map(k => visitDailyMap[k]);

        const visitsByType = {};
        cutVisits.forEach(v => { visitsByType[v.type] = (visitsByType[v.type] || 0) + 1; });
        const visitsByStatus = {};
        cutVisits.forEach(v => { visitsByStatus[v.status] = (visitsByStatus[v.status] || 0) + 1; });

        // Guard shifts — security_assignments rows scoped to selected buildings.
        const guardsByBuilding = {};
        securityShifts.forEach(g => {
          const b = bldgById[g.building_id];
          const bn = b ? b.name : '—';
          if (!guardsByBuilding[bn]) guardsByBuilding[bn] = { day: 0, night: 0, full: 0, total: 0 };
          if (g.shift === 'Day') guardsByBuilding[bn].day++;
          else if (g.shift === 'Night') guardsByBuilding[bn].night++;
          else guardsByBuilding[bn].full++;
          guardsByBuilding[bn].total++;
        });

        const bookingsByAmenity = {};
        cutBookings.forEach(b => { bookingsByAmenity[b.amenity_name] = (bookingsByAmenity[b.amenity_name] || 0) + 1; });

        // ============ Compliance ============
        const leasesRegistered = ras.filter(r => r.contract_number && r.contract_number.trim()).length;
        const leasesUnregistered = ras.length - leasesRegistered;
        // Certificate-style attachments (best-effort: kinds starting with cert_)
        const certs = unitAttachments.filter(a => /^cert/i.test(a.kind || ''));
        const hasCerts = certs.length > 0;

        // ============ Monthly time-series ============
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
          // Portfolio
          buildings: buildingsScoped, assetsByType, vacancyList,
          totalUnits, occupiedUnits, vacant, occupancyRate, owners, tenants,
          // Financial
          totalInvoiced, collected, pending, overdue, collectionRate,
          revByType, topContributors, outstandingInvoices, futureRevenue,
          futureLabels: futureBuckets.map(b => b.label),
          collectedTrend, billedTrend, trendLabels: trendBuckets.map(m => m.label),
          // Residents
          activeTenants, moveIns, moveOuts, leasesExpiring60, topArrears,
          leasesExpSoon, leasesExpired,
          // Service Ops
          srByStatus, srByCategory, srByPriority, openSRs, closedSRs,
          totalSRs: srs.length, urgentOpen, avgResolutionH, medianResolutionH, moveSRs,
          // Maintenance Co.
          vendors, activeContracts, contractsExp90, vendorPaid, vendorOutstanding, topVendorSpend,
          // Visitors & Guards
          visitsByType, visitsByStatus, totalVisits: visits.length,
          visitDailyLabels, visitDailyCounts, guardsByBuilding,
          bookingsByAmenity, totalBookings: bookings.length,
          // Compliance
          leasesRegistered, leasesUnregistered, hasCerts, certs,
          // Time-series (period scoped)
          monthLabels: monthBuckets.map(m => m.label),
          srSeries, visitsSeries, bookingsSeries,
          // Meta
          periodLabel, periodStart: cutoff, periodEnd,
        });
        setLoading(false);
      } catch (e) {
        if (mounted) { setError(String(e.message || e)); setLoading(false); }
      }
    })();
    return () => { mounted = false; };
  }, [selectedProperties.join(','), timeRange, customStart, customEnd]);

  const fmt = (n) => 'AED ' + Math.round(Number(n) || 0).toLocaleString('en-US');
  // Full amounts with thousands separators everywhere — no K/M
  // abbreviations. Per user feedback: it's a property report, the user
  // wants exact figures.
  const fmtShort = fmt;

  const sections = [
    { id: 'portfolio',     label: 'Portfolio' },
    { id: 'financial',     label: 'Financial' },
    { id: 'residents',     label: 'Residents' },
    { id: 'serviceOps',    label: 'Service Ops' },
    { id: 'maintenanceCo', label: 'Maintenance Co.' },
    { id: 'visitors',      label: 'Visitors & Guards' },
  ];

  // ============ Download Data datasets (per-section spreadsheets) ============
  const reportDatasets = (() => {
    if (!stats) return [];
    const scope = selectedProperties.length > 0 ? selectedProperties.length + ' building(s) — top-bar scope' : 'All buildings';
    const baseMeta = { 'Scope': scope, 'Period': stats.periodLabel + ' (' + stats.periodStart + ' → ' + stats.periodEnd + ')' };

    return [
      {
        // Bundled multi-page PDF — cover + ToC + every section in one
        // document. Uses customExport to bypass the default per-table
        // PDF renderer and call renderFullReportPdf directly. PDF only.
        id: 'full_portfolio_report', label: 'Full Portfolio Report (PDF)', title: 'Full Portfolio Report',
        description: 'A single multi-page PDF bundling every section (cover · table of contents · portfolio · financial · residents · service ops · maintenance companies · visitors & guards). Branded, CONFIDENTIAL footer.',
        supportedFormats: ['pdf'],
        customExport: async () => {
          await renderFullReportPdf(stats, { selectedProperties }, { label: stats.periodLabel, start: stats.periodStart, end: stats.periodEnd });
        },
        rows: [],
        columns: [],
        extraMetadata: baseMeta,
      },
      {
        id: 'portfolio_summary', label: 'Portfolio — Summary', title: 'Portfolio Summary',
        sheetName: 'Portfolio', filenameBase: 'portfolio-summary',
        rows: [
          { metric: 'Total assets', value: stats.buildings.length },
          { metric: 'Total units', value: stats.totalUnits },
          { metric: 'Occupied units', value: stats.occupiedUnits },
          { metric: 'Vacant units', value: stats.vacant },
          { metric: 'Occupancy rate', value: stats.occupancyRate + '%' },
          { metric: 'Owners', value: stats.owners },
          { metric: 'Tenants', value: stats.tenants },
        ],
        columns: [
          { key: 'metric', header: 'Metric', width: 30 },
          { key: 'value',  header: 'Value',  width: 22 },
        ],
        extraMetadata: baseMeta,
      },
      {
        id: 'financial_summary', label: 'Financial — Summary', title: 'Financial Summary',
        sheetName: 'Financial', filenameBase: 'financial-summary',
        rows: [
          { metric: 'Total billed', value: Math.round(stats.totalInvoiced) },
          { metric: 'Collected', value: Math.round(stats.collected) },
          { metric: 'Pending', value: Math.round(stats.pending) },
          { metric: 'Overdue', value: Math.round(stats.overdue) },
          { metric: 'Collection rate', value: stats.collectionRate + '%' },
        ],
        columns: [
          { key: 'metric', header: 'Metric', width: 30 },
          { key: 'value',  header: 'Value (AED)', width: 22, halign: 'right', numeric: true },
        ],
        extraMetadata: baseMeta,
      },
      {
        id: 'residents_active', label: 'Residents — Active Tenants', title: 'Active Tenants',
        sheetName: 'Tenants', filenameBase: 'active-tenants',
        rows: stats.activeTenants,
        columns: [
          { key: 'name',       header: 'Name',         width: 26 },
          { key: 'phone',      header: 'Phone',        width: 18 },
          { key: 'building',   header: 'Building',     width: 20 },
          { key: 'unit',       header: 'Unit',         width: 10 },
          { key: 'tenure',     header: 'Tenure',       width: 12 },
          { key: 'leaseStart', header: 'Lease Start',  width: 14 },
          { key: 'leaseEnd',   header: 'Lease End',    width: 14 },
          { key: 'monthly',    header: 'Monthly AED',  width: 14, halign: 'right', numeric: true },
        ],
        extraMetadata: baseMeta,
      },
      {
        id: 'residents_arrears', label: 'Residents — Top Arrears', title: 'Top Arrears',
        sheetName: 'Arrears', filenameBase: 'top-arrears',
        rows: stats.topArrears,
        columns: [
          { key: 'name',     header: 'Tenant',   width: 26 },
          { key: 'phone',    header: 'Phone',    width: 18 },
          { key: 'building', header: 'Building', width: 20 },
          { key: 'unit',     header: 'Unit',     width: 10 },
          { key: 'total',    header: 'Outstanding AED', width: 18, halign: 'right', numeric: true },
        ],
        extraMetadata: baseMeta,
      },
      {
        id: 'srs_by_category', label: 'Service Ops — by Category', title: 'Service Requests by Category',
        sheetName: 'SRs Category', filenameBase: 'srs-by-category',
        rows: Object.entries(stats.srByCategory).map(([k, v]) => ({ category: k, count: v })),
        columns: [
          { key: 'category', header: 'Category', width: 22 },
          { key: 'count',    header: 'Count',    width: 12, halign: 'right', numeric: true },
        ],
        extraMetadata: baseMeta,
      },
      {
        id: 'srs_urgent_open', label: 'Service Ops — Urgent Open', title: 'Urgent Open Tickets',
        sheetName: 'Urgent', filenameBase: 'urgent-open',
        rows: stats.urgentOpen,
        columns: [
          { key: 'created',     header: 'Created',     width: 14 },
          { key: 'priority',    header: 'Priority',    width: 12 },
          { key: 'category',    header: 'Category',    width: 18 },
          { key: 'status',      header: 'Status',      width: 14 },
          { key: 'building',    header: 'Building',    width: 20 },
          { key: 'unit',        header: 'Unit',        width: 10 },
          { key: 'description', header: 'Description', width: 40 },
        ],
        extraMetadata: baseMeta,
      },
      {
        id: 'maint_active_contracts', label: 'Maintenance Co. — Active Contracts', title: 'Active Maintenance Contracts',
        sheetName: 'Contracts', filenameBase: 'maintenance-contracts',
        rows: stats.activeContracts.map(v => ({
          name: v.name, category: v.service_category, contact: v.contact_person || '—',
          phone: v.contact_phone || '—', email: v.contact_email || '—',
          start: v.contract_start || '—', end: v.contract_end || '—',
          value: Number(v.contract_value_aed) || 0, status: v.status,
        })),
        columns: [
          { key: 'name',     header: 'Vendor',   width: 24 },
          { key: 'category', header: 'Category', width: 18 },
          { key: 'contact',  header: 'Contact',  width: 18 },
          { key: 'phone',    header: 'Phone',    width: 16 },
          { key: 'email',    header: 'Email',    width: 22 },
          { key: 'start',    header: 'Start',    width: 12 },
          { key: 'end',      header: 'End',      width: 12 },
          { key: 'value',    header: 'Value AED',width: 14, halign: 'right', numeric: true },
          { key: 'status',   header: 'Status',   width: 12 },
        ],
        extraMetadata: baseMeta,
      },
      {
        id: 'visitors_by_type', label: 'Visitors — by Type', title: 'Visitors by Type',
        sheetName: 'Visitors', filenameBase: 'visitors-by-type',
        rows: Object.entries(stats.visitsByType).map(([k, v]) => ({ type: k, count: v })),
        columns: [
          { key: 'type',  header: 'Type',  width: 22 },
          { key: 'count', header: 'Count', width: 12, halign: 'right', numeric: true },
        ],
        extraMetadata: baseMeta,
      },
      {
        id: 'compliance_scorecard', label: 'Compliance — Scorecard', title: 'PMC Compliance Scorecard',
        sheetName: 'Scorecard', filenameBase: 'compliance-scorecard',
        rows: [
          { metric: 'Maintenance resolution rate', value: (stats.totalSRs > 0 ? Math.round(stats.closedSRs / stats.totalSRs * 100) : 0) + '%' },
          { metric: 'Collection efficiency',       value: stats.collectionRate + '%' },
          { metric: 'Open ticket ratio',           value: (stats.totalSRs > 0 ? Math.round(stats.openSRs / stats.totalSRs * 100) : 0) + '%' },
          { metric: 'Receivables ratio (outstanding / total)', value: (stats.totalInvoiced > 0 ? Math.round((stats.pending + stats.overdue) / stats.totalInvoiced * 100) : 0) + '%' },
          { metric: 'Leases with contract number', value: stats.leasesRegistered + ' / ' + (stats.leasesRegistered + stats.leasesUnregistered) },
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
          <div className="subtitle">Portfolio, financial &amp; operational insights for the selected period</div>
          <div style={{fontSize:12,color:'var(--text-muted)',marginTop:4}}>Portfolio, Financial, Residents, Service Ops, Vendors, Visitors &amp; Guards, Compliance — same dataset, sliced 7 ways.</div>
        </div>
        <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
          <TimeRangePicker/>
          {/* Both buttons open the same Download Data modal — the bundled
              "Full Portfolio Report (PDF)" is the first option and the
              per-section spreadsheets follow. Labels split for clarity. */}
          <button className="btn btn-primary" onClick={() => setShowDownload(true)} disabled={!stats}>Branded PDF (all sections)</button>
          <button className="btn" onClick={() => setShowDownload(true)} disabled={!stats}>Spreadsheet (this section)</button>
        </div>
      </div>

      <ExportPrintModal
        isOpen={showDownload}
        onClose={() => setShowDownload(false)}
        dataTypes={reportDatasets}
      />

      <div style={{display:'flex',gap:8,marginBottom:24,borderBottom:'1px solid var(--border-light)',flexWrap:'wrap'}}>
        {sections.map(s => (
          <div key={s.id} onClick={() => setSection(s.id)} style={{padding:'10px 18px',cursor:'pointer',fontSize:13,fontWeight:section===s.id?500:400,color:section===s.id?'var(--text-dark)':'var(--text-secondary)',borderBottom: section===s.id ? '2px solid var(--bg-warm-dark)' : '2px solid transparent',marginBottom:-1,letterSpacing:'-0.01em'}}>
            {s.label}
          </div>
        ))}
      </div>

      {loading || !stats ? (
        <div className="card"><div style={{padding:24,color:'var(--text-muted)',fontSize:13}}>Loading…</div></div>
      ) : section === 'portfolio'     ? <PortfolioReports     stats={stats} fmt={fmt} fmtShort={fmtShort}/> :
          section === 'financial'     ? <FinancialReports     stats={stats} fmt={fmt} fmtShort={fmtShort}/> :
          section === 'residents'     ? <ResidentsReports     stats={stats} fmt={fmt}/> :
          section === 'serviceOps'    ? <ServiceOpsReports    stats={stats}/> :
          section === 'maintenanceCo' ? <MaintenanceCoReports stats={stats} fmt={fmt}/> :
          section === 'visitors'      ? <VisitorsGuardsReports stats={stats}/> :
                                        <ComplianceReports    stats={stats}/>}
    </div>
  );
};

// ==================== SECTION COMPONENTS ====================

// Soft tint + border keyed off the semantic accent colour, so a tile reads
// as its own block on a white card (the old white-on-white had no edge) and
// the row carries a quiet band of colour instead of looking flat.
const _KPI_TINT = {
  '#5a6b4f': { bg:'#f2f6ef', bd:'#dce6d4' }, // green  · positive
  '#8b4a42': { bg:'#fbf2f1', bd:'#f1dbd7' }, // maroon · overdue
  '#a07d3c': { bg:'#fbf5ea', bd:'#ece0c6' }, // tan    · upcoming
  '#61707D': { bg:'#eff2f3', bd:'#dde4e6' }, // slate  · neutral-stat
};
const _kpiCard = (label, value, color) => {
  const accent = color || 'var(--bg-warm-dark)';                 // slate-deep default
  const t = _KPI_TINT[color] || { bg:'#f6f1ea', bd:'#e9e0d2' };  // warm neutral default
  return (
    <div style={{position:'relative',padding:'15px 16px 15px 18px',background:t.bg,border:'1px solid '+t.bd,borderRadius:8,overflow:'hidden'}}>
      {/* colour spine — the pop of colour + a clear left edge */}
      <div style={{position:'absolute',left:0,top:0,bottom:0,width:4,background:accent}}/>
      <div style={{fontSize:10,letterSpacing:'0.07em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:6,fontWeight:600}}>{label}</div>
      <div style={{fontSize:24,fontWeight:600,letterSpacing:'-0.015em',color:color||'var(--text-dark)',lineHeight:1}}>{value}</div>
    </div>
  );
};

const PortfolioReports = ({ stats, fmt, fmtShort }) => (
  <div>
    <div className="card">
      <div style={{fontSize:14,fontWeight:700,letterSpacing:'-0.01em',color:'var(--text-dark)',marginBottom:18,paddingBottom:12,borderBottom:'1px solid var(--border-light)'}}>Portfolio KPIs</div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))',gap:14}}>
        {_kpiCard('Total Assets', stats.buildings.length)}
        {_kpiCard('Total Units', stats.totalUnits)}
        {_kpiCard('Occupancy', stats.occupancyRate + '%')}
        {_kpiCard('Revenue Collected', fmtShort(stats.collected), '#5a6b4f')}
        {_kpiCard('Overdue', fmtShort(stats.overdue), '#8b4a42')}
      </div>
    </div>

    <div className="card">
      <div style={{fontSize:14,fontWeight:700,letterSpacing:'-0.01em',color:'var(--text-dark)',marginBottom:18,paddingBottom:12,borderBottom:'1px solid var(--border-light)'}}>Assets by Type</div>
      {Object.keys(stats.assetsByType).length === 0 ? (
        <div style={{color:'var(--text-muted)',fontSize:13,padding:20}}>No assets in scope.</div>
      ) : (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))',gap:10}}>
          {Object.entries(stats.assetsByType).map(([t, n]) => _kpiCard(t, n))}
        </div>
      )}
    </div>

    <div className="card">
      <div style={{fontSize:14,fontWeight:700,letterSpacing:'-0.01em',color:'var(--text-dark)',marginBottom:18,paddingBottom:12,borderBottom:'1px solid var(--border-light)'}}>Occupancy Mix</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 2fr',gap:18,alignItems:'center'}}>
        <ChartCanvas height={220} config={{
          type: 'doughnut',
          data: { labels: ['Occupied','Vacant'], datasets: [{ data: [stats.occupiedUnits, stats.vacant], backgroundColor: ['#3E4C59','#E6EAE9'], borderWidth: 0 }] },
          options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position:'bottom', labels:{boxWidth:12,font:{size:11}} } } },
        }}/>
        <div style={{display:'grid',gridTemplateColumns:'repeat(2, 1fr)',gap:10}}>
          {_kpiCard('Occupied', stats.occupiedUnits, '#5a6b4f')}
          {_kpiCard('Vacant', stats.vacant, '#61707D')}
          {_kpiCard('Owners', stats.owners)}
          {_kpiCard('Tenants', stats.tenants)}
        </div>
      </div>
    </div>

    <div className="card">
      <div style={{fontSize:14,fontWeight:700,letterSpacing:'-0.01em',color:'var(--text-dark)',marginBottom:18,paddingBottom:12,borderBottom:'1px solid var(--border-light)'}}>Top Vacant Units</div>
      {stats.vacancyList.length === 0 ? (
        <div style={{color:'var(--text-muted)',fontSize:13,padding:20}}>Fully occupied — no vacant units.</div>
      ) : (
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,tableLayout:'fixed'}}>
          <thead><tr style={{textAlign:'left',color:'var(--text-secondary)',fontSize:11}}>
            <th style={{padding:'8px 4px',width:'60%'}}>Building</th>
            <th style={{padding:'8px 4px',width:'20%'}}>Floor</th>
            <th style={{padding:'8px 4px',width:'20%'}}>Unit</th>
          </tr></thead>
          <tbody>{stats.vacancyList.map((v,i) => (
            <tr key={i} style={{borderTop:'1px solid var(--border-light)'}}>
              <td style={{padding:'8px 4px'}}>{v.building}</td>
              <td style={{padding:'8px 4px'}}>{v.floor}</td>
              <td style={{padding:'8px 4px'}}>{v.unit}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </div>
  </div>
);

const FinancialReports = ({ stats, fmt, fmtShort }) => (
  <div>
    <div className="card">
      <div style={{fontSize:14,fontWeight:700,letterSpacing:'-0.01em',color:'var(--text-dark)',marginBottom:18,paddingBottom:12,borderBottom:'1px solid var(--border-light)'}}>Financial KPIs · {stats.periodLabel}</div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))',gap:14}}>
        {_kpiCard('Total Billed', fmtShort(stats.totalInvoiced))}
        {_kpiCard('Collected', fmtShort(stats.collected), '#5a6b4f')}
        {_kpiCard('Overdue', fmtShort(stats.overdue), '#8b4a42')}
        {_kpiCard('Upcoming', fmtShort(stats.pending), '#a07d3c')}
        {_kpiCard('Collection Rate', stats.collectionRate + '%')}
      </div>
    </div>

    <div className="card">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',marginBottom:18,paddingBottom:12,borderBottom:'1px solid var(--border-light)',flexWrap:'wrap',gap:10}}>
        <div style={{fontSize:14,fontWeight:700,letterSpacing:'-0.01em',color:'var(--text-dark)'}}>Revenue by Asset Type</div>
        <div style={{fontSize:13,color:'var(--text-secondary)'}}>
          Total <strong style={{color:'var(--text-dark)',fontSize:15}}>{fmt(Object.values(stats.revByType).reduce((s, v) => s + (Number(v) || 0), 0))}</strong>
        </div>
      </div>
      {Object.keys(stats.revByType).length === 0 ? (
        <div style={{color:'var(--text-muted)',fontSize:13,padding:20}}>No billed revenue in this period.</div>
      ) : (
        <ChartCanvas height={260} config={{
          type: 'bar',
          data: { labels: Object.keys(stats.revByType), datasets: [{ label: 'Revenue AED', data: Object.values(stats.revByType), backgroundColor: '#3E4C59' }] },
          // The custom datalabels plugin paints the full AED amount on top
          // of each bar — replaces the per-tick K/M Y-axis the user found
          // noisy. Keep the X-axis ticks (asset type names) intact.
          options: { responsive:true, maintainAspectRatio:false, layout:{padding:{top:24}}, plugins:{ legend:{ display:false }, tooltip:{ callbacks:{ label:(c)=>fmt(c.parsed.y) } } }, scales:{ x:{grid:{display:false}}, y:{display:false,beginAtZero:true} } },
          plugins: [_barDataLabelsPlugin(_fmtBarAed)],
        }}/>
      )}
    </div>

    <div className="card">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',marginBottom:18,paddingBottom:12,borderBottom:'1px solid var(--border-light)',flexWrap:'wrap',gap:10}}>
        <div style={{fontSize:14,fontWeight:700,letterSpacing:'-0.01em',color:'var(--text-dark)'}}>Collection Trend — Last 12 Months</div>
        <div style={{display:'flex',gap:18,fontSize:12,color:'var(--text-secondary)'}}>
          <div>Billed <strong style={{color:'var(--text-dark)',fontSize:14}}>{fmt((stats.billedTrend || []).reduce((s, v) => s + (Number(v) || 0), 0))}</strong></div>
          <div>Collected <strong style={{color:'#5a6b4f',fontSize:14}}>{fmt((stats.collectedTrend || []).reduce((s, v) => s + (Number(v) || 0), 0))}</strong></div>
        </div>
      </div>
      <ChartCanvas height={280} config={{
        type: 'bar',
        data: { labels: stats.trendLabels, datasets: [
          { label: 'Billed', data: stats.billedTrend, backgroundColor: '#E6EAE9' },
          { label: 'Collected', data: stats.collectedTrend, backgroundColor: '#3E4C59' },
        ] },
        options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom', labels:{boxWidth:12,font:{size:11}} }, tooltip:{ callbacks:{ label:(c)=>c.dataset.label + ': ' + fmt(c.parsed.y) } } }, scales:{ x:{grid:{display:false}}, y:{display:false,beginAtZero:true} } },
      }}/>
    </div>

    <div className="card">
      <div style={{fontSize:14,fontWeight:700,letterSpacing:'-0.01em',color:'var(--text-dark)',marginBottom:18,paddingBottom:12,borderBottom:'1px solid var(--border-light)'}}>Top Contributors</div>
      {stats.topContributors.length === 0 ? (
        <div style={{color:'var(--text-muted)',fontSize:13,padding:20}}>No collected revenue yet.</div>
      ) : (
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,tableLayout:'fixed'}}>
          <thead><tr style={{textAlign:'left',color:'var(--text-secondary)',fontSize:11}}>
            <th style={{padding:'8px 4px',width:'60%'}}>Building</th>
            <th style={{padding:'8px 4px',width:'15%'}}>Unit</th>
            <th style={{padding:'8px 4px',width:'25%',textAlign:'right'}}>Amount</th>
          </tr></thead>
          <tbody>{stats.topContributors.map((c, i) => (
            <tr key={i} style={{borderTop:'1px solid var(--border-light)'}}>
              <td style={{padding:'8px 4px'}}>{c.building}</td>
              <td style={{padding:'8px 4px'}}>{c.unit}</td>
              <td style={{padding:'8px 4px',textAlign:'right'}}>{fmt(c.amount)}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </div>

    <div className="card">
      <div style={{fontSize:14,fontWeight:700,letterSpacing:'-0.01em',color:'var(--text-dark)',marginBottom:18,paddingBottom:12,borderBottom:'1px solid var(--border-light)'}}>Outstanding Invoices</div>
      {stats.outstandingInvoices.length === 0 ? (
        <div style={{color:'var(--text-muted)',fontSize:13,padding:20}}>No outstanding invoices.</div>
      ) : (
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,tableLayout:'fixed'}}>
          <thead><tr style={{textAlign:'left',color:'var(--text-secondary)',fontSize:11}}>
            <th style={{padding:'8px 4px',width:'15%'}}>Invoice</th>
            <th style={{padding:'8px 4px',width:'25%'}}>Building / Unit</th>
            <th style={{padding:'8px 4px',width:'30%'}}>Description</th>
            <th style={{padding:'8px 4px',width:'13%'}}>Due</th>
            <th style={{padding:'8px 4px',width:'10%'}}>Status</th>
            <th style={{padding:'8px 4px',width:'17%',textAlign:'right'}}>Amount</th>
          </tr></thead>
          <tbody>{stats.outstandingInvoices.map((i, idx) => (
            <tr key={idx} style={{borderTop:'1px solid var(--border-light)'}}>
              <td style={{padding:'8px 4px',fontFamily:'monospace',fontSize:11}}>{i.invoice}</td>
              <td style={{padding:'8px 4px'}}>{i.building} · {i.unit}</td>
              <td style={{padding:'8px 4px'}}>{i.description}</td>
              <td style={{padding:'8px 4px'}}>{i.due}</td>
              <td style={{padding:'8px 4px',color:i.status==='Overdue'?'#8b4a42':'#a07d3c'}}>{i.status}</td>
              <td style={{padding:'8px 4px',textAlign:'right'}}>{fmt(i.amount)}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </div>

    <div className="card">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',marginBottom:18,paddingBottom:12,borderBottom:'1px solid var(--border-light)',flexWrap:'wrap',gap:10}}>
        <div style={{fontSize:14,fontWeight:700,letterSpacing:'-0.01em',color:'var(--text-dark)'}}>Future Revenue Projection (12 mo)</div>
        <div style={{fontSize:13,color:'var(--text-secondary)'}}>
          Projected <strong style={{color:'#a07d3c',fontSize:15}}>{fmt((stats.futureRevenue || []).reduce((s, v) => s + (Number(v) || 0), 0))}</strong>
        </div>
      </div>
      <ChartCanvas height={240} config={{
        type: 'bar',
        data: { labels: stats.futureLabels, datasets: [{ label: 'Projected AED', data: stats.futureRevenue, backgroundColor: '#a07d3c' }] },
        options: { responsive:true, maintainAspectRatio:false, layout:{padding:{top:24}}, plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label:(c)=>fmt(c.parsed.y) } } }, scales:{ x:{grid:{display:false}}, y:{display:false,beginAtZero:true} } },
        plugins: [_barDataLabelsPlugin(_fmtBarAed)],
      }}/>
      <div style={{fontSize:11,color:'var(--text-muted)',marginTop:8}}>Based on active leases' monthly rent · stops counting once lease_end has passed.</div>
    </div>
  </div>
);

const ResidentsReports = ({ stats, fmt }) => (
  <div>
    <div className="card">
      <div style={{fontSize:14,fontWeight:700,letterSpacing:'-0.01em',color:'var(--text-dark)',marginBottom:18,paddingBottom:12,borderBottom:'1px solid var(--border-light)'}}>Resident KPIs</div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))',gap:14}}>
        {_kpiCard('Active Tenants', stats.activeTenants.length)}
        {_kpiCard('Move-Ins (period)', stats.moveIns, '#5a6b4f')}
        {_kpiCard('Move-Outs (period)', stats.moveOuts, '#8b4a42')}
        {_kpiCard('Leases Expiring 60d', stats.leasesExpiring60.length, '#a07d3c')}
        {_kpiCard('Owners', stats.owners)}
        {_kpiCard('Tenants', stats.tenants)}
      </div>
    </div>

    <div className="card">
      <div style={{fontSize:14,fontWeight:700,letterSpacing:'-0.01em',color:'var(--text-dark)',marginBottom:18,paddingBottom:12,borderBottom:'1px solid var(--border-light)'}}>Active Tenants</div>
      {stats.activeTenants.length === 0 ? (
        <div style={{color:'var(--text-muted)',fontSize:13,padding:20}}>No active assignments.</div>
      ) : (
        <div style={{maxHeight:480,overflow:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,tableLayout:'fixed'}}>
            <thead><tr style={{textAlign:'left',color:'var(--text-secondary)',fontSize:11,position:'sticky',top:0,background:'var(--bg-elevated, white)'}}>
              <th style={{padding:'8px 4px',width:'20%'}}>Name</th>
              <th style={{padding:'8px 4px',width:'14%'}}>Phone</th>
              <th style={{padding:'8px 4px',width:'20%'}}>Building</th>
              <th style={{padding:'8px 4px',width:'8%'}}>Unit</th>
              <th style={{padding:'8px 4px',width:'10%'}}>Tenure</th>
              <th style={{padding:'8px 4px',width:'12%'}}>Lease Start</th>
              <th style={{padding:'8px 4px',width:'12%'}}>Lease End</th>
              <th style={{padding:'8px 4px',width:'14%',textAlign:'right'}}>Monthly</th>
            </tr></thead>
            <tbody>{stats.activeTenants.slice(0,200).map((t, i) => (
              <tr key={i} style={{borderTop:'1px solid var(--border-light)'}}>
                <td style={{padding:'8px 4px'}}>{t.name}</td>
                <td style={{padding:'8px 4px',fontFamily:'monospace',fontSize:11}}>{t.phone}</td>
                <td style={{padding:'8px 4px'}}>{t.building}</td>
                <td style={{padding:'8px 4px'}}>{t.unit}</td>
                <td style={{padding:'8px 4px'}}>{t.tenure}</td>
                <td style={{padding:'8px 4px'}}>{t.leaseStart}</td>
                <td style={{padding:'8px 4px'}}>{t.leaseEnd}</td>
                <td style={{padding:'8px 4px',textAlign:'right'}}>{t.monthly ? fmt(t.monthly) : '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>

    <div className="card">
      <div style={{fontSize:14,fontWeight:700,letterSpacing:'-0.01em',color:'var(--text-dark)',marginBottom:18,paddingBottom:12,borderBottom:'1px solid var(--border-light)'}}>Leases Expiring in 60 Days</div>
      {stats.leasesExpiring60.length === 0 ? (
        <div style={{color:'var(--text-muted)',fontSize:13,padding:20}}>No leases expiring in the next 60 days.</div>
      ) : (
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,tableLayout:'fixed'}}>
          <thead><tr style={{textAlign:'left',color:'var(--text-secondary)',fontSize:11}}>
            <th style={{padding:'8px 4px',width:'28%'}}>Tenant</th>
            <th style={{padding:'8px 4px',width:'18%'}}>Phone</th>
            <th style={{padding:'8px 4px',width:'24%'}}>Building / Unit</th>
            <th style={{padding:'8px 4px',width:'15%'}}>Lease End</th>
            <th style={{padding:'8px 4px',width:'15%',textAlign:'right'}}>Monthly</th>
          </tr></thead>
          <tbody>{stats.leasesExpiring60.map((t, i) => (
            <tr key={i} style={{borderTop:'1px solid var(--border-light)'}}>
              <td style={{padding:'8px 4px'}}>{t.name}</td>
              <td style={{padding:'8px 4px',fontFamily:'monospace',fontSize:11}}>{t.phone}</td>
              <td style={{padding:'8px 4px'}}>{t.building} · {t.unit}</td>
              <td style={{padding:'8px 4px',color:'#a07d3c'}}>{t.leaseEnd}</td>
              <td style={{padding:'8px 4px',textAlign:'right'}}>{t.monthly ? fmt(t.monthly) : '—'}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </div>

    <div className="card">
      <div style={{fontSize:14,fontWeight:700,letterSpacing:'-0.01em',color:'var(--text-dark)',marginBottom:18,paddingBottom:12,borderBottom:'1px solid var(--border-light)'}}>Top Arrears</div>
      {stats.topArrears.length === 0 ? (
        <div style={{color:'var(--text-muted)',fontSize:13,padding:20}}>No outstanding balances.</div>
      ) : (
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,tableLayout:'fixed'}}>
          <thead><tr style={{textAlign:'left',color:'var(--text-secondary)',fontSize:11}}>
            <th style={{padding:'8px 4px',width:'28%'}}>Tenant</th>
            <th style={{padding:'8px 4px',width:'18%'}}>Phone</th>
            <th style={{padding:'8px 4px',width:'34%'}}>Building / Unit</th>
            <th style={{padding:'8px 4px',width:'20%',textAlign:'right'}}>Outstanding</th>
          </tr></thead>
          <tbody>{stats.topArrears.map((a, i) => (
            <tr key={i} style={{borderTop:'1px solid var(--border-light)'}}>
              <td style={{padding:'8px 4px'}}>{a.name}</td>
              <td style={{padding:'8px 4px',fontFamily:'monospace',fontSize:11}}>{a.phone}</td>
              <td style={{padding:'8px 4px'}}>{a.building} · {a.unit}</td>
              <td style={{padding:'8px 4px',textAlign:'right',color:'#8b4a42'}}>{fmt(a.total)}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </div>
  </div>
);

const ServiceOpsReports = ({ stats }) => {
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
      <div className="card">
        <div style={{fontSize:14,fontWeight:700,letterSpacing:'-0.01em',color:'var(--text-dark)',marginBottom:18,paddingBottom:12,borderBottom:'1px solid var(--border-light)'}}>Service Op KPIs · {stats.periodLabel}</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))',gap:14}}>
          {_kpiCard('Total SRs', stats.totalSRs)}
          {_kpiCard('Open', stats.openSRs, '#a07d3c')}
          {_kpiCard('Resolved', stats.closedSRs, '#5a6b4f')}
          {_kpiCard('Avg resolution (h)', stats.avgResolutionH || '—')}
          {_kpiCard('Median (h)', stats.medianResolutionH || '—')}
          {_kpiCard('Move-in/out SRs', stats.moveSRs)}
        </div>
      </div>

      <div className="card">
        <div style={{fontSize:14,fontWeight:700,letterSpacing:'-0.01em',color:'var(--text-dark)',marginBottom:18,paddingBottom:12,borderBottom:'1px solid var(--border-light)'}}>SR Funnel — By Status</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(120px, 1fr))',gap:10}}>
          {['New','Acknowledged','In Progress','Done','Closed','Rejected'].map((status, i) => {
            const colors = ['#3E4C59','#61707D','#a07d3c','#5a6b4f','#61707D','#8b4a42'];
            return <Pill key={status} label={status} count={stats.srByStatus[status] || 0} total={stats.totalSRs} color={colors[i]}/>;
          })}
        </div>
      </div>

      <div className="card">
        <div style={{fontSize:14,fontWeight:700,letterSpacing:'-0.01em',color:'var(--text-dark)',marginBottom:18,paddingBottom:12,borderBottom:'1px solid var(--border-light)'}}>By Priority</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(120px, 1fr))',gap:10}}>
          {['Urgent','High','Normal','Low'].map((p, i) => {
            const colors = ['#8b4a42','#a07d3c','#3E4C59','#61707D'];
            return <Pill key={p} label={p} count={stats.srByPriority[p] || 0} total={stats.totalSRs} color={colors[i]}/>;
          })}
        </div>
      </div>

      <div className="card">
        <div style={{fontSize:14,fontWeight:700,letterSpacing:'-0.01em',color:'var(--text-dark)',marginBottom:18,paddingBottom:12,borderBottom:'1px solid var(--border-light)'}}>By Category</div>
        {Object.keys(stats.srByCategory).length === 0 ? (
          <div style={{color:'var(--text-muted)',fontSize:13,padding:20}}>No service requests in period.</div>
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
        <div style={{fontSize:14,fontWeight:700,letterSpacing:'-0.01em',color:'var(--text-dark)',marginBottom:18,paddingBottom:12,borderBottom:'1px solid var(--border-light)'}}>Urgent Open Tickets</div>
        {stats.urgentOpen.length === 0 ? (
          <div style={{color:'var(--text-muted)',fontSize:13,padding:20}}>No urgent open tickets.</div>
        ) : (
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,tableLayout:'fixed'}}>
            <thead><tr style={{textAlign:'left',color:'var(--text-secondary)',fontSize:11}}>
              <th style={{padding:'8px 4px',width:'13%'}}>Created</th>
              <th style={{padding:'8px 4px',width:'10%'}}>Priority</th>
              <th style={{padding:'8px 4px',width:'14%'}}>Category</th>
              <th style={{padding:'8px 4px',width:'12%'}}>Status</th>
              <th style={{padding:'8px 4px',width:'23%'}}>Building / Unit</th>
              <th style={{padding:'8px 4px',width:'28%'}}>Description</th>
            </tr></thead>
            <tbody>{stats.urgentOpen.map((s, i) => (
              <tr key={i} style={{borderTop:'1px solid var(--border-light)'}}>
                <td style={{padding:'8px 4px'}}>{s.created}</td>
                <td style={{padding:'8px 4px',color:s.priority==='Urgent'?'#8b4a42':'#a07d3c'}}>{s.priority}</td>
                <td style={{padding:'8px 4px'}}>{s.category}</td>
                <td style={{padding:'8px 4px'}}>{s.status}</td>
                <td style={{padding:'8px 4px'}}>{s.building} · {s.unit}</td>
                <td style={{padding:'8px 4px'}}>{s.description}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
};

const MaintenanceCoReports = ({ stats, fmt }) => (
  <div>
    <div className="card">
      <div style={{fontSize:14,fontWeight:700,letterSpacing:'-0.01em',color:'var(--text-dark)',marginBottom:18,paddingBottom:12,borderBottom:'1px solid var(--border-light)'}}>Maintenance Co. KPIs</div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))',gap:14}}>
        {_kpiCard('Vendors', stats.vendors.length)}
        {_kpiCard('Active Contracts', stats.activeContracts.length, '#5a6b4f')}
        {_kpiCard('Expiring 90d', stats.contractsExp90.length, '#a07d3c')}
        {_kpiCard('Paid (AED)', Math.round(stats.vendorPaid).toLocaleString(), '#5a6b4f')}
        {_kpiCard('Outstanding (AED)', Math.round(stats.vendorOutstanding).toLocaleString(), '#8b4a42')}
      </div>
    </div>

    <div className="card">
      <div style={{fontSize:14,fontWeight:700,letterSpacing:'-0.01em',color:'var(--text-dark)',marginBottom:18,paddingBottom:12,borderBottom:'1px solid var(--border-light)'}}>Active Contracts</div>
      {stats.activeContracts.length === 0 ? (
        <div style={{color:'var(--text-muted)',fontSize:13,padding:20}}>No active contracts.</div>
      ) : (
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,tableLayout:'fixed'}}>
          <thead><tr style={{textAlign:'left',color:'var(--text-secondary)',fontSize:11}}>
            <th style={{padding:'8px 4px',width:'24%'}}>Vendor</th>
            <th style={{padding:'8px 4px',width:'14%'}}>Category</th>
            <th style={{padding:'8px 4px',width:'18%'}}>Contact</th>
            <th style={{padding:'8px 4px',width:'14%'}}>Phone</th>
            <th style={{padding:'8px 4px',width:'14%'}}>Contract End</th>
            <th style={{padding:'8px 4px',width:'16%',textAlign:'right'}}>Value</th>
          </tr></thead>
          <tbody>{stats.activeContracts.map((v, i) => (
            <tr key={i} style={{borderTop:'1px solid var(--border-light)'}}>
              <td style={{padding:'8px 4px'}}>{v.name}</td>
              <td style={{padding:'8px 4px'}}>{v.service_category}</td>
              <td style={{padding:'8px 4px'}}>{v.contact_person || '—'}</td>
              <td style={{padding:'8px 4px',fontFamily:'monospace',fontSize:11}}>{v.contact_phone || '—'}</td>
              <td style={{padding:'8px 4px'}}>{v.contract_end || '—'}</td>
              <td style={{padding:'8px 4px',textAlign:'right'}}>{v.contract_value_aed ? fmt(v.contract_value_aed) : '—'}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </div>

    {stats.contractsExp90.length > 0 && (
      <div className="card">
        <div style={{fontSize:14,fontWeight:700,letterSpacing:'-0.01em',color:'var(--text-dark)',marginBottom:18,paddingBottom:12,borderBottom:'1px solid var(--border-light)'}}>Contracts Expiring in 90 Days</div>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,tableLayout:'fixed'}}>
          <thead><tr style={{textAlign:'left',color:'var(--text-secondary)',fontSize:11}}>
            <th style={{padding:'8px 4px',width:'30%'}}>Vendor</th>
            <th style={{padding:'8px 4px',width:'20%'}}>Category</th>
            <th style={{padding:'8px 4px',width:'20%'}}>Contract End</th>
            <th style={{padding:'8px 4px',width:'30%',textAlign:'right'}}>Value</th>
          </tr></thead>
          <tbody>{stats.contractsExp90.map((v, i) => (
            <tr key={i} style={{borderTop:'1px solid var(--border-light)'}}>
              <td style={{padding:'8px 4px'}}>{v.name}</td>
              <td style={{padding:'8px 4px'}}>{v.service_category}</td>
              <td style={{padding:'8px 4px',color:'#a07d3c'}}>{v.contract_end}</td>
              <td style={{padding:'8px 4px',textAlign:'right'}}>{v.contract_value_aed ? fmt(v.contract_value_aed) : '—'}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    )}

    <div className="card">
      <div style={{fontSize:14,fontWeight:700,letterSpacing:'-0.01em',color:'var(--text-dark)',marginBottom:18,paddingBottom:12,borderBottom:'1px solid var(--border-light)'}}>Top Spend by Vendor</div>
      {stats.topVendorSpend.length === 0 ? (
        <div style={{color:'var(--text-muted)',fontSize:13,padding:20}}>No vendor payments yet.</div>
      ) : (
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,tableLayout:'fixed'}}>
          <thead><tr style={{textAlign:'left',color:'var(--text-secondary)',fontSize:11}}>
            <th style={{padding:'8px 4px',width:'50%'}}>Vendor</th>
            <th style={{padding:'8px 4px',width:'25%'}}>Category</th>
            <th style={{padding:'8px 4px',width:'25%',textAlign:'right'}}>Amount</th>
          </tr></thead>
          <tbody>{stats.topVendorSpend.map((v, i) => (
            <tr key={i} style={{borderTop:'1px solid var(--border-light)'}}>
              <td style={{padding:'8px 4px'}}>{v.name}</td>
              <td style={{padding:'8px 4px'}}>{v.category}</td>
              <td style={{padding:'8px 4px',textAlign:'right'}}>{fmt(v.amount)}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </div>
  </div>
);

const VisitorsGuardsReports = ({ stats }) => (
  <div>
    <div className="card">
      <div style={{fontSize:14,fontWeight:700,letterSpacing:'-0.01em',color:'var(--text-dark)',marginBottom:18,paddingBottom:12,borderBottom:'1px solid var(--border-light)'}}>Visitors & Guards KPIs · {stats.periodLabel}</div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))',gap:14}}>
        {_kpiCard('Total Visits', stats.totalVisits)}
        {_kpiCard('Pre-Approved', stats.visitsByStatus['Pre-Approved'] || 0)}
        {_kpiCard('On-Premise', stats.visitsByStatus['On-Premise'] || 0)}
        {_kpiCard('Checked-Out', stats.visitsByStatus['Checked-Out'] || 0)}
        {_kpiCard('Bookings', stats.totalBookings)}
      </div>
    </div>

    <div className="card">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',marginBottom:18,paddingBottom:12,borderBottom:'1px solid var(--border-light)',flexWrap:'wrap',gap:10}}>
        <div style={{fontSize:14,fontWeight:700,letterSpacing:'-0.01em',color:'var(--text-dark)'}}>Visitor Flow — Daily</div>
        <div style={{display:'flex',gap:18,fontSize:12,color:'var(--text-secondary)'}}>
          <div>Total <strong style={{color:'var(--text-dark)',fontSize:14}}>{(stats.visitDailyCounts || []).reduce((s, v) => s + (Number(v) || 0), 0).toLocaleString()}</strong></div>
          <div>Peak day <strong style={{color:'var(--text-dark)',fontSize:14}}>{(stats.visitDailyCounts || []).reduce((m, v) => Math.max(m, Number(v) || 0), 0).toLocaleString()}</strong></div>
        </div>
      </div>
      {stats.visitDailyLabels.length === 0 ? (
        <div style={{color:'var(--text-muted)',fontSize:13,padding:20}}>No visits in the selected period.</div>
      ) : (
        <ChartCanvas height={260} config={{
          type: 'line',
          data: { labels: stats.visitDailyLabels, datasets: [{ label: 'Visits', data: stats.visitDailyCounts, borderColor:'#3E4C59', backgroundColor:'rgba(62,76,89,0.15)', tension:0.35, fill:true, pointRadius:2, pointHoverRadius:5, pointBackgroundColor:'#3E4C59' }] },
          options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false} }, scales:{ x:{grid:{display:false}}, y:{beginAtZero:true,ticks:{precision:0,color:'#9aa5a3'},grid:{color:'rgba(0,0,0,0.04)',drawBorder:false}} } },
        }}/>
      )}
    </div>

    <div className="card">
      <div style={{fontSize:14,fontWeight:700,letterSpacing:'-0.01em',color:'var(--text-dark)',marginBottom:18,paddingBottom:12,borderBottom:'1px solid var(--border-light)'}}>Visitors by Type</div>
      {Object.keys(stats.visitsByType).length === 0 ? (
        <div style={{color:'var(--text-muted)',fontSize:13,padding:20}}>No visits yet.</div>
      ) : (() => {
        // Donut redesign — large total in the centre, and the legend
        // becomes a side panel of "type · count · share %" rows so the
        // user never has to hover to read the breakdown.
        const entries = Object.entries(stats.visitsByType).sort((a, b) => b[1] - a[1]);
        const total   = entries.reduce((s, [, v]) => s + (Number(v) || 0), 0);
        const palette = ['#3E4C59','#a07d3c','#5a6b4f','#61707D','#8b4a42','#c8a87a','#7a8f88'];
        const colourFor = (i) => palette[i % palette.length];
        return (
          <div style={{display:'grid',gridTemplateColumns:'minmax(220px, 280px) 1fr',gap:24,alignItems:'center'}}>
            <ChartCanvas height={240} config={{
              type: 'doughnut',
              data: { labels: entries.map(([k]) => k), datasets: [{ data: entries.map(([, v]) => v), backgroundColor: entries.map((_, i) => colourFor(i)), borderColor: '#fff', borderWidth: 3, hoverOffset: 8 }] },
              options: { responsive:true, maintainAspectRatio:false, cutout:'70%', plugins:{ legend:{ display:false }, tooltip:{ callbacks:{ label:(c)=>c.label + ': ' + c.parsed + ' (' + Math.round(c.parsed / total * 100) + '%)' } } } },
              plugins: [_doughnutCenterPlugin(total.toLocaleString(), 'Visits')],
            }}/>
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              {entries.map(([label, val], i) => {
                const pct = Math.round((val / total) * 100);
                return (
                  <div key={label} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 12px',background:'var(--bg-surface)',borderRadius:8,border:'1px solid var(--border-light)'}}>
                    <span style={{width:10,height:10,borderRadius:3,background:colourFor(i),flexShrink:0}}/>
                    <div style={{flex:1,minWidth:0,fontSize:13,color:'var(--text-dark)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{label}</div>
                    <div style={{fontSize:13,fontWeight:600,color:'var(--text-dark)',fontVariantNumeric:'tabular-nums'}}>{val}</div>
                    <div style={{fontSize:11,color:'var(--text-muted)',width:36,textAlign:'right',fontVariantNumeric:'tabular-nums'}}>{pct}%</div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>

    <div className="card">
      <div style={{fontSize:14,fontWeight:700,letterSpacing:'-0.01em',color:'var(--text-dark)',marginBottom:18,paddingBottom:12,borderBottom:'1px solid var(--border-light)'}}>Guard Shift Coverage</div>
      {Object.keys(stats.guardsByBuilding).length === 0 ? (
        <div style={{color:'var(--text-muted)',fontSize:13,padding:20}}>No guards assigned in scope.</div>
      ) : (
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,tableLayout:'fixed'}}>
          <thead><tr style={{textAlign:'left',color:'var(--text-secondary)',fontSize:11}}>
            <th style={{padding:'8px 4px',width:'40%'}}>Building</th>
            <th style={{padding:'8px 4px',width:'15%'}}>Day</th>
            <th style={{padding:'8px 4px',width:'15%'}}>Night</th>
            <th style={{padding:'8px 4px',width:'15%'}}>24h</th>
            <th style={{padding:'8px 4px',width:'15%',textAlign:'right'}}>Total</th>
          </tr></thead>
          <tbody>{Object.entries(stats.guardsByBuilding).map(([bn, g], i) => (
            <tr key={i} style={{borderTop:'1px solid var(--border-light)'}}>
              <td style={{padding:'8px 4px'}}>{bn}</td>
              <td style={{padding:'8px 4px'}}>{g.day}</td>
              <td style={{padding:'8px 4px'}}>{g.night}</td>
              <td style={{padding:'8px 4px'}}>{g.full}</td>
              <td style={{padding:'8px 4px',textAlign:'right'}}>{g.total}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </div>

  </div>
);

const ComplianceReports = ({ stats }) => (
  <div>
    <div className="card">
      <div style={{fontSize:14,fontWeight:700,letterSpacing:'-0.01em',color:'var(--text-dark)',marginBottom:18,paddingBottom:12,borderBottom:'1px solid var(--border-light)'}}>Lease Registration</div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))',gap:14}}>
        {_kpiCard('Leases with contract #', stats.leasesRegistered, '#5a6b4f')}
        {_kpiCard('Missing contract #', stats.leasesUnregistered, stats.leasesUnregistered ? '#8b4a42' : '#5a6b4f')}
        {_kpiCard('Expiring 90d', stats.leasesExpSoon, '#a07d3c')}
        {_kpiCard('Expired (holdover)', stats.leasesExpired, '#8b4a42')}
      </div>
    </div>

    <div className="card">
      <div style={{fontSize:14,fontWeight:700,letterSpacing:'-0.01em',color:'var(--text-dark)',marginBottom:18,paddingBottom:12,borderBottom:'1px solid var(--border-light)'}}>Certificates Expiring</div>
      {!stats.hasCerts ? (
        <div style={{color:'var(--text-muted)',fontSize:13,padding:20}}>
          TODO — no certificate attachments (<code>kind = cert_*</code>) found on units. Upload certificates via the unit detail modal to populate this section.
        </div>
      ) : (
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,tableLayout:'fixed'}}>
          <thead><tr style={{textAlign:'left',color:'var(--text-secondary)',fontSize:11}}>
            <th style={{padding:'8px 4px',width:'40%'}}>Kind</th>
            <th style={{padding:'8px 4px',width:'40%'}}>Filename</th>
            <th style={{padding:'8px 4px',width:'20%'}}>Uploaded</th>
          </tr></thead>
          <tbody>{stats.certs.slice(0, 30).map((c, i) => (
            <tr key={i} style={{borderTop:'1px solid var(--border-light)'}}>
              <td style={{padding:'8px 4px'}}>{c.kind}</td>
              <td style={{padding:'8px 4px'}}>{c.filename}</td>
              <td style={{padding:'8px 4px'}}>{(c.created_at || '').slice(0,10)}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </div>

    <div className="card">
      <div style={{fontSize:14,fontWeight:700,letterSpacing:'-0.01em',color:'var(--text-dark)',marginBottom:18,paddingBottom:12,borderBottom:'1px solid var(--border-light)'}}>PMC Performance Scorecard</div>
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

// ==================== BUNDLED PDF GENERATOR ====================
//
// Multi-page branded PDF: cover · table of contents · one (or more)
// pages per section. Uses the same REPORT_BRAND palette as
// src/lib/report-template.js so the visual identity matches every
// other export. autoTable handles table layout + pagination; we add a
// footer ("VARS Property Management · Confidential · Page X of Y") to
// every page via the autoTable didDrawPage hook.

async function renderFullReportPdf(stats, brand, period) {
  await ensurePdf();
  const jsPDFCtor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
  if (!jsPDFCtor) throw new Error('PDF library failed to load');

  const doc = new jsPDFCtor({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 36;

  const fmt = (n) => 'AED ' + Math.round(Number(n) || 0).toLocaleString('en-US');
  // Same in the PDF — keep amounts in full so the printed report doesn't
  // hide the trailing digits behind a K/M abbreviation.
  const fmtShort = fmt;

  // ---------- Cover page ----------
  // Big slate header band with shield + wordmark, then "PORTFOLIO REPORT"
  // title, period range, generated stamp, and a CONFIDENTIAL strip.
  doc.setFillColor(...REPORT_BRAND.primaryRgb);
  doc.rect(0, 0, pageW, 200, 'F');
  // Shield
  const SH = 56, SX = SH / 100;
  doc.setFillColor(255,255,255);
  doc.roundedRect(margin, 56, SH, SH, 4, 4, 'F');
  doc.setFillColor(...REPORT_BRAND.primaryRgb);
  const glyph = [
    [16.7*SX, 0],
    [ 8.1*SX, 8.5*SX],
    [ 8.6*SX, 8.1*SX],
    [ 0,     50.0*SX],
    [-16.7*SX, 0],
    [-16.7*SX,-16.6*SX],
  ];
  doc.lines(glyph, margin + 33.3*SX, 56 + 16.7*SX, [1,1], 'F', true);
  // Wordmark
  doc.setTextColor(255,255,255);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(34);
  doc.text(REPORT_BRAND.title, margin + SH + 18, 92);
  doc.setFontSize(10);
  doc.setFont('helvetica','bold');
  doc.text('PROPERTY MANAGEMENT', margin + SH + 18, 108);

  // Title
  doc.setTextColor(...REPORT_BRAND.textDarkRgb);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(28);
  doc.text('PORTFOLIO REPORT', margin, 260);
  doc.setFontSize(12);
  doc.setTextColor(...REPORT_BRAND.textMuteRgb);
  doc.text(period.label + '  (' + period.start + ' → ' + period.end + ')', margin, 282);

  const portfolioName = (brand.selectedProperties && brand.selectedProperties.length)
    ? brand.selectedProperties.length + ' selected building(s)'
    : 'All buildings · ' + stats.buildings.length + ' assets';
  doc.text(portfolioName, margin, 300);

  doc.setFontSize(10);
  doc.text('Generated ' + _nowStamp(), margin, 320);

  // Summary KPI strip
  const kpiY = 360;
  const kpis = [
    ['Total Assets',  String(stats.buildings.length)],
    ['Total Units',   String(stats.totalUnits)],
    ['Occupancy',     stats.occupancyRate + '%'],
    ['Collected',     fmtShort(stats.collected)],
    ['Overdue',       fmtShort(stats.overdue)],
  ];
  const kpiW = (pageW - margin*2 - 8 * (kpis.length - 1)) / kpis.length;
  kpis.forEach((k, i) => {
    const x = margin + i * (kpiW + 8);
    doc.setFillColor(...REPORT_BRAND.surfaceRgb);
    doc.setDrawColor(...REPORT_BRAND.borderRgb);
    doc.roundedRect(x, kpiY, kpiW, 64, 4, 4, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...REPORT_BRAND.textMuteRgb);
    doc.text(k[0].toUpperCase(), x + 10, kpiY + 16);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(15);
    doc.setTextColor(...REPORT_BRAND.textDarkRgb);
    doc.text(k[1], x + 10, kpiY + 44);
  });

  // CONFIDENTIAL footer band
  doc.setFillColor(...REPORT_BRAND.primaryRgb);
  doc.rect(0, pageH - 60, pageW, 60, 'F');
  doc.setTextColor(255,255,255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('CONFIDENTIAL · For authorised personnel only', pageW/2, pageH - 32, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(REPORT_BRAND.appLabel + ' · Generated ' + _nowStamp(), pageW/2, pageH - 16, { align: 'center' });

  // ---------- Table of contents ----------
  doc.addPage();
  _drawSectionHeader(doc, 'TABLE OF CONTENTS', margin, pageW);
  let tocY = 130;
  const toc = [
    ['1', 'Portfolio',           'Assets, units, occupancy, vacancies'],
    ['2', 'Financial',           'Billed, collected, overdue, contributors'],
    ['3', 'Residents',           'Active tenants, expiring leases, arrears'],
    ['4', 'Service Operations',  'Tickets, urgent open, resolution stats'],
    ['5', 'Maintenance Co.',     'Vendor contracts, payments, spend'],
    ['6', 'Visitors & Guards',   'Visitor flow, types, guard coverage'],
    ['7', 'Compliance',          'Leases, certificates, scorecard'],
  ];
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  toc.forEach(([n, t, sub]) => {
    doc.setTextColor(...REPORT_BRAND.primaryRgb);
    doc.setFont('helvetica', 'bold');
    doc.text(n + '.', margin, tocY);
    doc.setTextColor(...REPORT_BRAND.textDarkRgb);
    doc.text(t, margin + 24, tocY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...REPORT_BRAND.textMuteRgb);
    doc.text(sub, margin + 24, tocY + 14);
    doc.setFontSize(11);
    tocY += 36;
  });

  // ---------- Section 1: Portfolio ----------
  doc.addPage();
  _drawSectionHeader(doc, '1 · PORTFOLIO', margin, pageW);
  let y = 130;
  y = _drawKpiGrid(doc, margin, y, pageW, [
    ['Assets', String(stats.buildings.length)],
    ['Units', String(stats.totalUnits)],
    ['Occupied', String(stats.occupiedUnits)],
    ['Vacant', String(stats.vacant)],
    ['Occupancy', stats.occupancyRate + '%'],
    ['Owners', String(stats.owners)],
    ['Tenants', String(stats.tenants)],
  ]);
  y += 8;
  if (Object.keys(stats.assetsByType).length) {
    y = _autoTable(doc, y, margin, pageW, 'Assets by Type',
      [['Type','Count']],
      Object.entries(stats.assetsByType).map(([k,v]) => [k, String(v)]));
  }
  if (stats.vacancyList.length) {
    y = _autoTable(doc, y, margin, pageW, 'Top Vacant Units',
      [['Building','Floor','Unit']],
      stats.vacancyList.map(v => [v.building, String(v.floor ?? '—'), String(v.unit ?? '—')]));
  }

  // ---------- Section 2: Financial ----------
  doc.addPage();
  _drawSectionHeader(doc, '2 · FINANCIAL', margin, pageW);
  y = 130;
  y = _drawKpiGrid(doc, margin, y, pageW, [
    ['Billed', fmtShort(stats.totalInvoiced)],
    ['Collected', fmtShort(stats.collected)],
    ['Overdue', fmtShort(stats.overdue)],
    ['Pending', fmtShort(stats.pending)],
    ['Collection', stats.collectionRate + '%'],
  ]);
  y += 8;
  if (Object.keys(stats.revByType).length) {
    y = _autoTable(doc, y, margin, pageW, 'Revenue by Asset Type',
      [['Type','Revenue']],
      Object.entries(stats.revByType).map(([k,v]) => [k, fmt(v)]));
  }
  if (stats.topContributors.length) {
    y = _autoTable(doc, y, margin, pageW, 'Top Contributors',
      [['Building','Unit','Amount']],
      stats.topContributors.map(c => [c.building, c.unit, fmt(c.amount)]));
  }
  if (stats.outstandingInvoices.length) {
    y = _autoTable(doc, y, margin, pageW, 'Outstanding Invoices',
      [['Invoice','Building','Unit','Description','Due','Status','Amount']],
      stats.outstandingInvoices.map(i => [i.invoice, i.building, i.unit, i.description, i.due, i.status, fmt(i.amount)]));
  }
  // 12m collection trend (simple table — chart would need html2canvas)
  y = _autoTable(doc, y, margin, pageW, 'Collection Trend (12 mo)',
    [['Month','Billed','Collected']],
    stats.trendLabels.map((m, i) => [m, fmt(stats.billedTrend[i]), fmt(stats.collectedTrend[i])]));

  // ---------- Section 3: Residents ----------
  doc.addPage();
  _drawSectionHeader(doc, '3 · RESIDENTS', margin, pageW);
  y = 130;
  y = _drawKpiGrid(doc, margin, y, pageW, [
    ['Active Tenants', String(stats.activeTenants.length)],
    ['Move-Ins', String(stats.moveIns)],
    ['Move-Outs', String(stats.moveOuts)],
    ['Expiring 60d', String(stats.leasesExpiring60.length)],
  ]);
  y += 8;
  if (stats.activeTenants.length) {
    y = _autoTable(doc, y, margin, pageW, 'Active Tenants',
      [['Name','Phone','Building','Unit','Tenure','Lease Start','Lease End','Monthly']],
      stats.activeTenants.map(t => [t.name, t.phone, t.building, t.unit, t.tenure, t.leaseStart, t.leaseEnd, t.monthly ? fmt(t.monthly) : '—']));
  }
  if (stats.leasesExpiring60.length) {
    y = _autoTable(doc, y, margin, pageW, 'Leases Expiring in 60 Days',
      [['Tenant','Phone','Building','Unit','Lease End','Monthly']],
      stats.leasesExpiring60.map(t => [t.name, t.phone, t.building, t.unit, t.leaseEnd, t.monthly ? fmt(t.monthly) : '—']));
  }
  if (stats.topArrears.length) {
    y = _autoTable(doc, y, margin, pageW, 'Top Arrears',
      [['Tenant','Phone','Building','Unit','Outstanding']],
      stats.topArrears.map(a => [a.name, a.phone, a.building, a.unit, fmt(a.total)]));
  }

  // ---------- Section 4: Service Operations ----------
  doc.addPage();
  _drawSectionHeader(doc, '4 · SERVICE OPERATIONS', margin, pageW);
  y = 130;
  y = _drawKpiGrid(doc, margin, y, pageW, [
    ['Total SRs', String(stats.totalSRs)],
    ['Open', String(stats.openSRs)],
    ['Resolved', String(stats.closedSRs)],
    ['Avg Res (h)', String(stats.avgResolutionH || '—')],
    ['Median (h)', String(stats.medianResolutionH || '—')],
  ]);
  y += 8;
  if (Object.keys(stats.srByStatus).length) {
    y = _autoTable(doc, y, margin, pageW, 'SRs by Status',
      [['Status','Count']],
      Object.entries(stats.srByStatus).map(([k,v]) => [k, String(v)]));
  }
  if (Object.keys(stats.srByCategory).length) {
    y = _autoTable(doc, y, margin, pageW, 'SRs by Category',
      [['Category','Count']],
      Object.entries(stats.srByCategory).sort((a,b)=>b[1]-a[1]).map(([k,v]) => [k, String(v)]));
  }
  if (Object.keys(stats.srByPriority).length) {
    y = _autoTable(doc, y, margin, pageW, 'SRs by Priority',
      [['Priority','Count']],
      ['Urgent','High','Normal','Low'].map(p => [p, String(stats.srByPriority[p] || 0)]));
  }
  if (stats.urgentOpen.length) {
    y = _autoTable(doc, y, margin, pageW, 'Urgent Open Tickets',
      [['Created','Priority','Category','Status','Building','Unit','Description']],
      stats.urgentOpen.map(s => [s.created, s.priority, s.category, s.status, s.building, s.unit, s.description]));
  }

  // ---------- Section 5: Maintenance Co. ----------
  doc.addPage();
  _drawSectionHeader(doc, '5 · MAINTENANCE CO.', margin, pageW);
  y = 130;
  y = _drawKpiGrid(doc, margin, y, pageW, [
    ['Vendors', String(stats.vendors.length)],
    ['Active', String(stats.activeContracts.length)],
    ['Expiring 90d', String(stats.contractsExp90.length)],
    ['Paid', fmtShort(stats.vendorPaid)],
    ['Outstanding', fmtShort(stats.vendorOutstanding)],
  ]);
  y += 8;
  if (stats.activeContracts.length) {
    y = _autoTable(doc, y, margin, pageW, 'Active Contracts',
      [['Vendor','Category','Contact','Phone','Email','Start','End','Value','Status']],
      stats.activeContracts.map(v => [v.name, v.service_category, v.contact_person || '—', v.contact_phone || '—', v.contact_email || '—', v.contract_start || '—', v.contract_end || '—', v.contract_value_aed ? fmt(v.contract_value_aed) : '—', v.status]));
  }
  if (stats.contractsExp90.length) {
    y = _autoTable(doc, y, margin, pageW, 'Contracts Expiring 90d',
      [['Vendor','Category','End','Value']],
      stats.contractsExp90.map(v => [v.name, v.service_category, v.contract_end, v.contract_value_aed ? fmt(v.contract_value_aed) : '—']));
  }
  if (stats.topVendorSpend.length) {
    y = _autoTable(doc, y, margin, pageW, 'Top Spend by Vendor',
      [['Vendor','Category','Amount']],
      stats.topVendorSpend.map(v => [v.name, v.category, fmt(v.amount)]));
  }

  // ---------- Section 6: Visitors & Guards ----------
  doc.addPage();
  _drawSectionHeader(doc, '6 · VISITORS & GUARDS', margin, pageW);
  y = 130;
  y = _drawKpiGrid(doc, margin, y, pageW, [
    ['Visits', String(stats.totalVisits)],
    ['Pre-Approved', String(stats.visitsByStatus['Pre-Approved'] || 0)],
    ['On-Premise', String(stats.visitsByStatus['On-Premise'] || 0)],
    ['Checked-Out', String(stats.visitsByStatus['Checked-Out'] || 0)],
    ['Bookings', String(stats.totalBookings)],
  ]);
  y += 8;
  if (Object.keys(stats.visitsByType).length) {
    y = _autoTable(doc, y, margin, pageW, 'Visitors by Type',
      [['Type','Count']],
      Object.entries(stats.visitsByType).sort((a,b)=>b[1]-a[1]).map(([k,v]) => [k, String(v)]));
  }
  if (Object.keys(stats.guardsByBuilding).length) {
    y = _autoTable(doc, y, margin, pageW, 'Guard Coverage',
      [['Building','Day','Night','24h','Total']],
      Object.entries(stats.guardsByBuilding).map(([bn, g]) => [bn, String(g.day), String(g.night), String(g.full), String(g.total)]));
  } else {
    doc.setFont('helvetica','italic');
    doc.setFontSize(9);
    doc.setTextColor(...REPORT_BRAND.textMuteRgb);
    doc.text('No guards assigned in the selected scope.', margin, y + 18);
    y += 30;
  }
  // ---------- Section 7: Compliance ----------
  doc.addPage();
  _drawSectionHeader(doc, '7 · COMPLIANCE', margin, pageW);
  y = 130;
  y = _drawKpiGrid(doc, margin, y, pageW, [
    ['Registered', String(stats.leasesRegistered)],
    ['Missing #', String(stats.leasesUnregistered)],
    ['Expiring 90d', String(stats.leasesExpSoon)],
    ['Expired', String(stats.leasesExpired)],
  ]);
  y += 8;
  y = _autoTable(doc, y, margin, pageW, 'PMC Performance Scorecard',
    [['Metric','Value']],
    [
      ['Maintenance resolution rate', stats.totalSRs > 0 ? Math.round((stats.closedSRs / stats.totalSRs) * 100) + '%' : '—'],
      ['Collection efficiency', stats.collectionRate + '%'],
      ['Open tickets ratio', stats.totalSRs > 0 ? Math.round((stats.openSRs / stats.totalSRs) * 100) + '%' : '—'],
      ['Receivables ratio', stats.totalInvoiced > 0 ? Math.round(((stats.pending + stats.overdue) / stats.totalInvoiced) * 100) + '%' : '—'],
    ]);
  if (stats.hasCerts) {
    y = _autoTable(doc, y, margin, pageW, 'Certificates on File',
      [['Kind','Filename','Uploaded']],
      stats.certs.slice(0, 50).map(c => [c.kind, c.filename, (c.created_at || '').slice(0,10)]));
  } else {
    doc.setFont('helvetica','italic');
    doc.setFontSize(9);
    doc.setTextColor(...REPORT_BRAND.textMuteRgb);
    doc.text('No certificate attachments (kind = cert_*) on units yet.', margin, y + 18);
  }

  // ---------- Footer on every page (X of Y) ----------
  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    if (p === 1) continue; // cover page has its own confidential band
    const footerY = pageH - 18;
    doc.setDrawColor(...REPORT_BRAND.borderRgb);
    doc.setLineWidth(0.4);
    doc.line(margin, footerY - 10, pageW - margin, footerY - 10);
    doc.setFontSize(7);
    doc.setTextColor(...REPORT_BRAND.textMuteRgb);
    doc.setFont('helvetica','normal');
    doc.text(REPORT_BRAND.footerText, margin, footerY);
    doc.text('Page ' + p + ' of ' + totalPages, pageW - margin, footerY, { align: 'right' });
  }

  doc.save('vars-report-' + period.start + '-to-' + period.end + '.pdf');
}

// ---------- PDF helpers (file-local) ----------

function _drawSectionHeader(doc, title, margin, pageW) {
  doc.setFillColor(...REPORT_BRAND.primaryRgb);
  doc.rect(0, 0, pageW, 64, 'F');
  doc.setTextColor(255,255,255);
  doc.setFont('helvetica','bold');
  doc.setFontSize(7);
  doc.text(REPORT_BRAND.appLabel.toUpperCase(), margin, 26);
  doc.setFont('helvetica','normal');
  doc.setFontSize(18);
  doc.text(title, margin, 50);
  doc.setTextColor(...REPORT_BRAND.textDarkRgb);
}

function _drawKpiGrid(doc, margin, y, pageW, kpis) {
  const perRow = Math.min(kpis.length, 5);
  const w = (pageW - margin*2 - 8 * (perRow - 1)) / perRow;
  const rows = Math.ceil(kpis.length / perRow);
  for (let i = 0; i < kpis.length; i++) {
    const col = i % perRow;
    const row = Math.floor(i / perRow);
    const x = margin + col * (w + 8);
    const yy = y + row * 56;
    doc.setFillColor(...REPORT_BRAND.surfaceRgb);
    doc.setDrawColor(...REPORT_BRAND.borderRgb);
    doc.roundedRect(x, yy, w, 50, 4, 4, 'FD');
    doc.setFont('helvetica','bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...REPORT_BRAND.textMuteRgb);
    doc.text(kpis[i][0].toUpperCase(), x + 8, yy + 14);
    doc.setFont('helvetica','normal');
    doc.setFontSize(13);
    doc.setTextColor(...REPORT_BRAND.textDarkRgb);
    doc.text(String(kpis[i][1]), x + 8, yy + 36);
  }
  return y + rows * 56 + 4;
}

function _autoTable(doc, startY, margin, pageW, title, head, body) {
  // If we're too low on the page, the autoTable plugin will add a page
  // automatically; we still want our title to sit on the same page as
  // the first row, so check available room and addPage proactively.
  const pageH = doc.internal.pageSize.getHeight();
  if (startY > pageH - 120) { doc.addPage(); startY = 60; }

  doc.setFont('helvetica','bold');
  doc.setFontSize(10);
  doc.setTextColor(...REPORT_BRAND.textDarkRgb);
  doc.text(title, margin, startY);
  startY += 8;

  doc.autoTable({
    startY,
    head, body,
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 4, textColor: REPORT_BRAND.textDarkRgb, lineColor: REPORT_BRAND.borderRgb, lineWidth: 0.3, overflow: 'linebreak' },
    headStyles: { fillColor: REPORT_BRAND.primaryRgb, textColor: [255,255,255], fontSize: 8, fontStyle: 'bold', cellPadding: 5, lineColor: REPORT_BRAND.primaryRgb },
    alternateRowStyles: { fillColor: REPORT_BRAND.surfaceRgb },
    margin: { left: margin, right: margin, bottom: 36 },
    pageBreak: 'auto',
    rowPageBreak: 'avoid',
  });
  return doc.lastAutoTable.finalY + 16;
}
