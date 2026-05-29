// ==================== PMC OVERVIEW (Dashboard) ====================
// KPIs grouped into Properties / Service Requests / Visitors with their own
// eyebrow headings. Below: Service Request Summary → Service Charge Collection
// (this month) → Units in Arrears → Service Requests Requiring Action.

// The hint used to render as a permanent third line under every tile,
// which added noise to dense building cards. It now lives on the
// title attribute (browser tooltip on hover) so the tile reads as a
// clean label + value pair.
const PMCStat = ({ label, value, color, onClick, hint }) => (
  <div
    onClick={(e) => { if (onClick) { e.stopPropagation(); onClick(); } }}
    title={hint || ''}
    style={{
      padding:'14px 16px',
      background:'var(--bg-surface)',
      borderRadius:6,
      border:'1px solid var(--border-light)',
      cursor: onClick ? 'pointer' : 'default',
      transition:'background 0.15s, border-color 0.15s'
    }}
    onMouseEnter={e => { if (onClick) { e.currentTarget.style.background = 'var(--accent-warm-light)'; e.currentTarget.style.borderColor = 'var(--accent-warm)'; } }}
    onMouseLeave={e => { if (onClick) { e.currentTarget.style.background = 'var(--bg-surface)'; e.currentTarget.style.borderColor = 'var(--border-light)'; } }}
  >
    <div style={{fontSize:11,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:6,fontWeight:500}}>{label}</div>
    <div style={{fontSize:16,fontWeight:600,color:color||'var(--text-dark)',letterSpacing:'-0.015em'}}>{value}</div>
  </div>
);

const PMCOverviewPage = ({ setPage }) => {
  const { selectedProperties = [], timeRange, setTimeRange, customStart, setCustomStart, customEnd, setCustomEnd } = useApp();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  // Clicking a row in Unit Payment Activity opens the same UnitDetailModal
  // used everywhere else (full invoice list, resident, docs slots).
  const [openedUnit, setOpenedUnit] = useState(null); // { unit, building }
  // Selected period for the financial KPIs and Operating Income card.
  // Lives in AppContext so navigating to Service Charges keeps the choice.
  const monthsBack = ({ '1m': 1, '2m': 2, '3m': 3, '12m': 12 })[timeRange] || 1;

  useEffect(() => {
    let mounted = true;
    setStats(null); setError(null);
    (async () => {
      if (!supabaseClient) { setError('Supabase not initialized'); return; }
      try {
        const filterB = selectedProperties.length > 0 ? selectedProperties : null;
        const { data: buildings } = await supabaseClient.from('buildings').select('id,name,address,property_type,purchase_price,current_value,acquired_on');
        // Also pull the denormalised tenant_* fields so the Needs-Attention
        // card can spot vacant units and leases ending soon for non-
        // residential property types.
        const { data: units } = await supabaseClient.from('units').select('id,building_id,unit_number,floor,tenant_name,tenant_lease_end,tenant_monthly_payment_aed');
        const filteredUnits = (units || []).filter(u => !filterB || filterB.includes(u.building_id));
        const fIds = filteredUnits.map(u => u.id);
        const probe = fIds.length ? fIds : ['00000000-0000-0000-0000-000000000000'];

        const [{ data: ras }, { data: invoices }, { data: srs }, { data: visits }, { data: attsForAttention }] = await Promise.all([
          supabaseClient.from('resident_assignments').select('profile_id,unit_id,lease_end,tenure,monthly_payment_aed').in('unit_id', probe),
          supabaseClient.from('invoices').select('id,amount_aed,status,due_date,unit_id,created_at,resident_profile_id').in('unit_id', probe),
          supabaseClient.from('service_requests').select('id,category,description,status,priority,created_at,resolved_at,unit_id,resident_profile_id').in('unit_id', probe).order('created_at', { ascending: false }),
          supabaseClient.from('visits').select('id,visit_date,status,visitor_name,type').in('unit_id', probe),
          // For the 'missing title deed' attention row.
          supabaseClient.from('unit_attachments').select('unit_id,kind').eq('kind', 'title_deed'),
        ]);
        if (!mounted) return;

        const today = new Date().toISOString().slice(0,10);
        const now = new Date();
        // Same rule as Service Charges / UnitDetailModal: split DB-Pending into
        // Upcoming (due >30 days out) vs the actually-outstanding ones.
        const dayMs = 24 * 60 * 60 * 1000;
        const effectiveStatusOf = (i) => {
          if (!i) return 'Pending';
          if (i.status === 'Paid' || i.status === 'Cancelled') return i.status;
          if (!i.due_date) return i.status;
          const due = new Date(i.due_date);
          if (isNaN(due.getTime())) return i.status;
          const daysUntilDue = Math.floor((due.getTime() - now.getTime()) / dayMs);
          if (daysUntilDue < 0)  return 'Overdue';
          if (daysUntilDue > 30) return 'Upcoming';
          return 'Pending';
        };
        // Annotate every invoice once so downstream filters can use it.
        (invoices || []).forEach(i => { i._eff = effectiveStatusOf(i); });
        // Period bounds — depend on the user's time-range pick.
        // For custom mode, fall back to "this month" if either bound is empty
        // so the data still loads sensibly while the user types dates.
        let periodStart, periodEnd;
        if (timeRange === 'custom' && customStart && customEnd) {
          periodStart = customStart;
          periodEnd   = customEnd;
        } else {
          periodStart = new Date(now.getFullYear(), now.getMonth() - monthsBack + 1, 1).toISOString().slice(0,10);
          periodEnd   = today;
        }
        const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0,10);
        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0,10);
        const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0,10);

        // -------- Properties group --------
        // Selected count: if filter is null (user picked nothing), treat as "All buildings".
        const realBuildingsCount = (buildings || []).length;
        const selectedPropsCount = filterB ? filterB.length : realBuildingsCount;
        const totalUnits = filteredUnits.length;
        const occupied = new Set((ras || []).map(r => r.unit_id)).size;
        const occupancyRate = totalUnits > 0 ? Math.round((occupied / totalUnits) * 100) : 0;
        const lastMonthCollected = (invoices || [])
          .filter(i => i.status === 'Paid' && i.created_at && i.created_at.slice(0,10) >= lastMonthStart && i.created_at.slice(0,10) <= lastMonthEnd)
          .reduce((s, i) => s + Number(i.amount_aed), 0);
        // Only count things that are truly outstanding (Pending due ≤30d + Overdue).
        // Upcoming cheques (>30 days out) are scheduled cash, not outstanding receivables.
        const pendingSCAmount = (invoices || [])
          .filter(i => i._eff === 'Pending' || i._eff === 'Overdue')
          .reduce((s, i) => s + Number(i.amount_aed), 0);
        const upcomingSCAmount = (invoices || [])
          .filter(i => i._eff === 'Upcoming')
          .reduce((s, i) => s + Number(i.amount_aed), 0);

        // -------- Service Requests group --------
        const todaySRs = (srs || []).filter(s => (s.created_at || '').slice(0,10) === today).length;
        const completedToday = (srs || []).filter(s =>
          ['Done','Closed'].includes(s.status) && s.resolved_at && s.resolved_at.slice(0,10) === today
        ).length;
        const pendingRequests = (srs || []).filter(s => ['New','Acknowledged','In Progress'].includes(s.status)).length;

        // -------- Visitors group --------
        const upcomingVisits = (visits || []).filter(v => v.visit_date > today && v.status === 'Pre-Approved').length;
        const todayVisits = (visits || []).filter(v => v.visit_date === today).length;

        // -------- Service Request Summary (status breakdown bar) --------
        const srStatusCounts = { open: 0, inProgress: 0, scheduled: 0, completed: 0 };
        (srs || []).forEach(s => {
          if (s.status === 'New' || s.status === 'Acknowledged') srStatusCounts.open++;
          else if (s.status === 'In Progress') srStatusCounts.inProgress++;
          else if (s.preferred_date && new Date(s.preferred_date) > new Date()) srStatusCounts.scheduled++;
          else if (s.status === 'Done' || s.status === 'Closed') srStatusCounts.completed++;
          else srStatusCounts.open++;
        });

        // -------- Service Charge Collection (SELECTED PERIOD) --------
        // Three buckets so the card can show Collection / Pending / Outstanding
        // distinctly. periodInvoices honours the user's time-range dropdown.
        const periodInvoices = (invoices || []).filter(i => {
          const d = (i.created_at || '').slice(0,10);
          return d && d >= periodStart && d <= periodEnd;
        });
        const monthBilled = periodInvoices.reduce((s, i) => s + Number(i.amount_aed), 0);
        const monthCollected  = periodInvoices.filter(i => i._eff === 'Paid').reduce((s, i) => s + Number(i.amount_aed), 0);
        const monthPending    = periodInvoices.filter(i => i._eff === 'Pending').reduce((s, i) => s + Number(i.amount_aed), 0);
        const monthOverdue    = periodInvoices.filter(i => i._eff === 'Overdue').reduce((s, i) => s + Number(i.amount_aed), 0);
        const monthUpcoming   = periodInvoices.filter(i => i._eff === 'Upcoming').reduce((s, i) => s + Number(i.amount_aed), 0);
        const monthOutstanding = monthPending + monthOverdue;
        const monthCollectionRate = monthBilled > 0 ? Math.round((monthCollected / monthBilled) * 100) : 0;

        // -------- Per-unit payment activity (SELECTED PERIOD) --------
        const uMap = Object.fromEntries(filteredUnits.map(u => [u.id, u]));
        const bMap = Object.fromEntries((buildings || []).map(b => [b.id, b]));
        const enrich = (u_id, amount, count, oldest_due) => {
          const u = uMap[u_id];
          const b = u && bMap[u.building_id];
          return {
            unit_id: u_id, amount, count, oldest_due,
            unit_number:    u ? u.unit_number : '—',
            floor:          u ? u.floor : null,
            building_name:  b ? b.name : '—',
            building_letter:b ? b.name.slice(0, 1).toUpperCase() : '?',
            // Full unit + building objects so clicking the row can open
            // UnitDetailModal without another round-trip.
            unit:      u || null,
            building:  b || null,
          };
        };

        const paidByUnit = {};
        periodInvoices.filter(i => i.status === 'Paid').forEach(i => {
          if (!paidByUnit[i.unit_id]) paidByUnit[i.unit_id] = { amount: 0, count: 0 };
          paidByUnit[i.unit_id].amount += Number(i.amount_aed);
          paidByUnit[i.unit_id].count++;
        });
        const paidList = Object.entries(paidByUnit)
          .map(([uid, v]) => enrich(uid, v.amount, v.count, null))
          .sort((a, b) => b.amount - a.amount).slice(0, 4);

        const pendingByUnit = {};
        (invoices || []).filter(i => i._eff === 'Pending' || i._eff === 'Overdue').forEach(i => {
          if (!pendingByUnit[i.unit_id]) pendingByUnit[i.unit_id] = { amount: 0, count: 0, oldest_due: null };
          pendingByUnit[i.unit_id].amount += Number(i.amount_aed);
          pendingByUnit[i.unit_id].count++;
          if (!pendingByUnit[i.unit_id].oldest_due || (i.due_date && i.due_date < pendingByUnit[i.unit_id].oldest_due)) {
            pendingByUnit[i.unit_id].oldest_due = i.due_date;
          }
        });
        const pendingList = Object.entries(pendingByUnit)
          .map(([uid, v]) => enrich(uid, v.amount, v.count, v.oldest_due))
          .sort((a, b) => b.amount - a.amount).slice(0, 4);

        // -------- Recent Service Requests (all-status) for the SR section table --------
        const srRecent = (srs || []).slice(0, 10);

        // -------- "Needs your attention" exception list ---------------
        // A ranked watchlist for the landlord — the things they'd want to
        // see first thing on opening the app. Each item carries a
        // severity (red / orange / yellow), a short headline, a detail
        // string, and a `page` route the user can click through to.
        const attention = [];
        const dayMsLocal = 24 * 60 * 60 * 1000;
        const nowLocal = new Date();

        // Overdue invoices = effectiveStatus 'Overdue' (past due AND not paid).
        const overdueInvs = (invoices || []).filter(i => i._eff === 'Overdue');
        if (overdueInvs.length > 0) {
          const overdueTotal = overdueInvs.reduce((s, i) => s + Number(i.amount_aed), 0);
          const overdueUnits = new Set(overdueInvs.map(i => i.unit_id)).size;
          // Worst offender — longest-overdue, biggest-amount.
          const worst = overdueInvs.slice().sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))[0];
          const wU = uMap[worst.unit_id]; const wB = wU ? bMap[wU.building_id] : null;
          const dayLag = worst.due_date ? Math.max(0, Math.floor((nowLocal - new Date(worst.due_date)) / dayMsLocal)) : 0;
          attention.push({
            severity: 'red',
            title: overdueUnits + ' tenant' + (overdueUnits===1?'':'s') + ' overdue · ' + fmt(overdueTotal) + ' at risk',
            detail: 'Worst: ' + (wU ? (wU.unit_number + (wB ? ' · ' + wB.name : '')) : '—') + (dayLag ? ' · ' + dayLag + 'd late' : ''),
            page: 'payment',
          });
        }

        // High-priority service requests still open.
        const urgentSrs = (srs || []).filter(s => ['New','Acknowledged','In Progress'].includes(s.status) && ['High','Urgent'].includes(s.priority));
        if (urgentSrs.length > 0) {
          const top = urgentSrs[0];
          const tU = uMap[top.unit_id]; const tB = tU ? bMap[tU.building_id] : null;
          attention.push({
            severity: urgentSrs.some(s => s.priority === 'Urgent') ? 'red' : 'orange',
            title: urgentSrs.length + ' high-priority service request' + (urgentSrs.length===1?'':'s') + ' open',
            detail: 'Latest: ' + (top.category || 'SR') + (tU ? ' · ' + tU.unit_number + (tB ? ' · ' + tB.name : '') : ''),
            page: 'service',
          });
        }

        // Leases expiring in the next 60 days (residential assignments +
        // non-residential tenant_lease_end). 30 days = orange, ≤30 = red.
        const cutoff60 = new Date(nowLocal.getTime() + 60 * dayMsLocal).toISOString().slice(0, 10);
        const cutoff30 = new Date(nowLocal.getTime() + 30 * dayMsLocal).toISOString().slice(0, 10);
        const today10 = nowLocal.toISOString().slice(0, 10);
        const resLeasesEndingSoon = (ras || []).filter(r => r.lease_end && r.lease_end >= today10 && r.lease_end <= cutoff60 && r.tenure === 'Tenant');
        const tenLeasesEndingSoon = filteredUnits.filter(u => u.tenant_lease_end && u.tenant_lease_end >= today10 && u.tenant_lease_end <= cutoff60);
        const endingSoonCount = resLeasesEndingSoon.length + tenLeasesEndingSoon.length;
        if (endingSoonCount > 0) {
          const within30 = resLeasesEndingSoon.filter(r => r.lease_end <= cutoff30).length
                         + tenLeasesEndingSoon.filter(u => u.tenant_lease_end <= cutoff30).length;
          attention.push({
            severity: within30 > 0 ? 'red' : 'orange',
            title: endingSoonCount + ' lease' + (endingSoonCount===1?'':'s') + ' expiring within 60 days',
            detail: within30 > 0 ? within30 + ' within the next 30 days' : 'All beyond 30 days',
            page: 'reminders',
          });
        }

        // Vacant units = no resident assignment AND no tenant_name. The
        // landlord usually wants to chase a re-let; calling this out so
        // the gap doesn't sit silently.
        const assignedUnitIds = new Set((ras || []).map(r => r.unit_id));
        const vacantUnits = filteredUnits.filter(u => !assignedUnitIds.has(u.id) && !u.tenant_name);
        if (vacantUnits.length > 0) {
          attention.push({
            severity: vacantUnits.length > 5 ? 'orange' : 'yellow',
            title: vacantUnits.length + ' vacant unit' + (vacantUnits.length===1?'':'s'),
            detail: 'Across ' + new Set(vacantUnits.map(u => u.building_id)).size + ' asset(s)',
            page: 'properties',
          });
        }

        // Missing title deed on at least one unit of an asset. Important
        // for compliance / refinancing — landlords should know.
        const unitsWithDeed = new Set((attsForAttention || []).map(a => a.unit_id));
        const assetsMissingDeed = (buildings || []).filter(b => {
          if (filterB && !filterB.includes(b.id)) return false;
          const bUnits = filteredUnits.filter(u => u.building_id === b.id);
          if (bUnits.length === 0) return false;
          return !bUnits.some(u => unitsWithDeed.has(u.id));
        });
        if (assetsMissingDeed.length > 0) {
          attention.push({
            severity: 'yellow',
            title: assetsMissingDeed.length + ' asset' + (assetsMissingDeed.length===1?'':'s') + ' missing title deed',
            detail: assetsMissingDeed.slice(0, 2).map(b => b.name).join(', ') + (assetsMissingDeed.length > 2 ? ' +' + (assetsMissingDeed.length - 2) + ' more' : ''),
            page: 'profileCreation',
          });
        }

        const severityRank = { red: 0, orange: 1, yellow: 2 };
        attention.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

        // -------- Landlord headline: this-month + prev-month + target -----
        // Single-line answer to 'how is this month going for me?'.
        const thisMonthInvoices = (invoices || []).filter(i => (i.created_at || '').slice(0, 10) >= thisMonthStart && (i.created_at || '').slice(0, 10) <= today);
        const lastMonthInvoices = (invoices || []).filter(i => (i.created_at || '').slice(0, 10) >= lastMonthStart && (i.created_at || '').slice(0, 10) <= lastMonthEnd);
        const headlineCollected     = thisMonthInvoices.filter(i => i.status === 'Paid').reduce((s, i) => s + Number(i.amount_aed), 0);
        const headlineLastMonth     = lastMonthInvoices.filter(i => i.status === 'Paid').reduce((s, i) => s + Number(i.amount_aed), 0);
        // Target = total monthly rent across occupied units (residential
        // assignments + non-residential tenants). What we should be
        // bringing in if every tenant paid this month.
        const targetResidential = (ras || []).reduce((s, r) => s + Number(r.monthly_payment_aed || 0), 0);
        const targetNonResid    = filteredUnits.reduce((s, u) => s + Number(u.tenant_monthly_payment_aed || 0), 0);
        const headlineTarget = targetResidential + targetNonResid;
        const headlinePct = headlineTarget > 0 ? Math.round(100 * headlineCollected / headlineTarget) : null;
        const headlineDelta = headlineCollected - headlineLastMonth;

        // -------- Per-asset cards ----------------------------------------
        // One card per selected building so the landlord can compare their
        // 5–15 assets side by side without leaving the Overview. Each
        // card shows: occupancy, this-month collected, annualised gross
        // yield (vs purchase_price), and a colour chip flagging
        // overdue / vacant / expiring exceptions.
        const assetCards = (buildings || [])
          .filter(b => !filterB || filterB.includes(b.id))
          .map(b => {
            const bUnits = filteredUnits.filter(u => u.building_id === b.id);
            const bUnitIds = new Set(bUnits.map(u => u.id));
            const bAssigned = (ras || []).filter(r => bUnitIds.has(r.unit_id));
            const bTenantOccupied = bUnits.filter(u => u.tenant_name).length;
            const occupiedCount = bAssigned.length + bTenantOccupied;
            // This-month collected for THIS asset.
            const thisMonthCollected = thisMonthInvoices.filter(i => bUnitIds.has(i.unit_id) && i.status === 'Paid').reduce((s, i) => s + Number(i.amount_aed), 0);
            // Annualised gross yield = (annual rent at target) / purchase_price.
            const annualTarget = bAssigned.reduce((s, r) => s + Number(r.monthly_payment_aed || 0), 0) * 12
                               + bUnits.reduce((s, u) => s + Number(u.tenant_monthly_payment_aed || 0), 0) * 12;
            const yieldPct = b.purchase_price && Number(b.purchase_price) > 0
              ? (annualTarget / Number(b.purchase_price)) * 100
              : null;
            // Counts for the inline exception chip.
            const overdueCount = (invoices || []).filter(i => bUnitIds.has(i.unit_id) && i._eff === 'Overdue').length;
            const expiringLeasesCount = bAssigned.filter(r => r.lease_end && r.lease_end >= today10 && r.lease_end <= cutoff60).length
                                      + bUnits.filter(u => u.tenant_lease_end && u.tenant_lease_end >= today10 && u.tenant_lease_end <= cutoff60).length;
            const vacantCount = bUnits.length - occupiedCount;
            return {
              id: b.id, name: b.name, property_type: b.property_type, address: b.address,
              purchase_price: b.purchase_price, current_value: b.current_value, acquired_on: b.acquired_on,
              total_units: bUnits.length, occupied_count: occupiedCount, vacant_count: Math.max(0, vacantCount),
              occupancy_pct: bUnits.length > 0 ? Math.round(100 * occupiedCount / bUnits.length) : 0,
              this_month_collected: thisMonthCollected,
              annual_target: annualTarget,
              yield_pct: yieldPct,
              overdue_count: overdueCount,
              expiring_leases_count: expiringLeasesCount,
              raw_building: b,
            };
          })
          .sort((a, b) => (b.yield_pct || 0) - (a.yield_pct || 0));

        setStats({
          // Portfolio Summary KPIs
          selectedPropsCount, totalUnits, occupied, occupancyRate, lastMonthCollected, pendingSCAmount, upcomingSCAmount,
          // Service Requests KPIs
          todaySRs, completedToday, pendingRequests,
          // Visitors KPIs
          upcomingVisits, todayVisits,
          // Financial Summary cards
          monthBilled, monthCollected, monthPending, monthOverdue, monthUpcoming, monthOutstanding, monthCollectionRate,
          paidList, pendingList,
          totalUnitsPaid:    paidList.length    > 0 ? Object.keys(paidByUnit).length    : 0,
          totalUnitsPending: pendingList.length > 0 ? Object.keys(pendingByUnit).length : 0,
          totalArrears:      Object.values(pendingByUnit).reduce((s, a) => s + a.amount, 0),
          // Service Requests table
          srRecent,
          // Landlord watchlist
          attention,
          // Landlord headline + per-asset cards
          headlineCollected, headlineTarget, headlinePct, headlineDelta, headlineLastMonth,
          assetCards,
        });
      } catch (e) {
        if (mounted) setError(String(e.message || e));
      }
    })();
    return () => { mounted = false; };
  }, [selectedProperties.join(','), timeRange, customStart, customEnd]);

  const fmt = (n) => 'AED ' + Math.round(n).toLocaleString();

  // Dynamic current-month label, e.g. "May 2026". Auto-updates when the
  // calendar month changes — the user explicitly asked for this.
  const monthLabel = new Date().toLocaleString('en-GB', { month: 'long', year: 'numeric' });
  // Human label for the selected time-range dropdown (used in KPI captions + card title).
  const periodLabel = timeRange === 'custom'
    ? (customStart && customEnd ? customStart + ' → ' + customEnd : monthLabel)
    : timeRange === '1m'
      ? monthLabel
      : 'Last ' + monthsBack + ' Months';

  // Explicit "1 May – 28 May 2026" range — shows the actual start and end
  // days the KPIs below were filtered against. Sits as a subtitle just
  // under the Overview title so the user always sees the bounds.
  const explicitRange = (() => {
    const fmtDay = (d, withYear) => {
      const day  = d.getDate();
      const mon  = d.toLocaleString('en-GB', { month: 'long' });
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

  if (error) return (<div><div className="page-header"><h1>Overview</h1></div><div className="card"><div style={{color:'#8b4a42',fontSize:13}}>{error}</div></div></div>);

  const statusBadge = (s) => {
    const c = ({
      'New':         { bg: '#E6EAE9', fg: '#61707D' },
      'Acknowledged':{ bg: '#E6EAE9', fg: '#4a4540' },
      'In Progress': { bg: '#a07d3c', fg: '#fff' },
      'Done':        { bg: '#e6efe1', fg: '#5a6b4f' },
      'Closed':      { bg: '#ccc8c1', fg: '#4a4540' },
      'Rejected':    { bg: '#fdf2f1', fg: '#8b4a42' },
    })[s] || { bg: '#E6EAE9', fg: '#888' };
    return <span style={{padding:'3px 10px',borderRadius:4,fontSize:11,fontWeight:500,background:c.bg,color:c.fg}}>{s}</span>;
  };

  const daysOverdue = (d) => {
    if (!d) return 0;
    const diff = Math.floor((Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
  };

  // Eyebrow style shared across the KPI sub-group headers
  const groupEyebrow = { fontSize:11, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--text-secondary)', fontWeight:600, margin:'20px 0 12px' };

  // KPI card — entire surface clickable. We dropped the redundant
  // "View details →" link below the value; the hover lift now carries
  // the "I'm interactive" signal instead.
  const KpiCard = ({ label, value, color, page }) => (
    <div
      className="kpi-card"
      style={{cursor:'pointer'}}
      onClick={() => setPage && setPage(page)}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-medium)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-light)'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; }}
    >
      <div className="label">{label}</div>
      <div className="value" style={color ? {color} : undefined}>{value}</div>
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Overview</h1>
          <div style={{marginTop:6,fontSize:14,color:'var(--text-secondary)',fontWeight:500,letterSpacing:'-0.01em'}}>
            {explicitRange}
          </div>
        </div>
        <TimeRangePicker/>
      </div>

      {!stats ? (
        <div className="card"><div style={{padding:24,color:'var(--text-muted)',fontSize:13}}>Loading…</div></div>
      ) : (<>
        {/* ============ HEADLINE — 'How is this month going?' ============ */}
        {(() => {
          const delta = stats.headlineDelta || 0;
          const deltaAbs = Math.abs(delta);
          const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '·';
          const deltaColor = delta > 0 ? '#5a6b4f' : delta < 0 ? '#8b4a42' : 'var(--text-muted)';
          const pctColor = stats.headlinePct == null ? 'var(--text-muted)'
                         : stats.headlinePct >= 80 ? '#5a6b4f'
                         : stats.headlinePct >= 50 ? '#a07d3c' : '#8b4a42';
          const monthName = new Date().toLocaleString('en-GB', { month: 'long' });
          return (
            <div className="card" style={{padding:'24px 28px',marginBottom:16,background:'linear-gradient(135deg, #fff 0%, #faf7f0 100%)'}}>
              <div style={{fontSize:11,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600,marginBottom:8}}>
                {monthName} {new Date().getFullYear()} · So far
              </div>
              <div style={{display:'flex',alignItems:'baseline',flexWrap:'wrap',gap:18}}>
                <div style={{fontSize:38,fontWeight:600,letterSpacing:'-0.02em',color:'var(--text-dark)',lineHeight:1}}>
                  {fmt(stats.headlineCollected)}
                </div>
                <div style={{fontSize:14,color:'var(--text-muted)',fontWeight:500}}>collected</div>
                {stats.headlinePct != null && (
                  <div style={{fontSize:14,fontWeight:600,color:pctColor}}>
                    {stats.headlinePct}% of target
                  </div>
                )}
                {(stats.headlineLastMonth > 0 || stats.headlineCollected > 0) && (
                  <div style={{fontSize:14,fontWeight:500,color:deltaColor,display:'flex',alignItems:'center',gap:4}}>
                    {arrow} {fmt(deltaAbs)} vs last month
                  </div>
                )}
              </div>
              {stats.headlineTarget > 0 && (
                <div style={{marginTop:14,height:6,background:'#e6eae9',borderRadius:3,overflow:'hidden'}}>
                  <div style={{
                    width: Math.min(100, Math.round(100 * stats.headlineCollected / stats.headlineTarget)) + '%',
                    height:'100%',
                    background: pctColor,
                    transition:'width 0.3s ease',
                  }}/>
                </div>
              )}
              <div style={{fontSize:12,color:'var(--text-muted)',marginTop:10,letterSpacing:'-0.005em'}}>
                Target this month {fmt(stats.headlineTarget)} · last month {fmt(stats.headlineLastMonth)} collected
              </div>
            </div>
          );
        })()}

        {/* ============ NEEDS YOUR ATTENTION ============ */}
        {(() => {
          const items = stats.attention || [];
          const tones = {
            red:    { dot:'#8b4a42', label:'Urgent',     bg:'#fdf2f1', border:'#f0d9d6' },
            orange: { dot:'#a07d3c', label:'Soon',       bg:'#fdf5e6', border:'#efe1be' },
            yellow: { dot:'#7a5a1f', label:'Heads up',   bg:'#fbf6e9', border:'#ebe1c1' },
          };
          return (
            <>
              <div style={groupEyebrow}>Needs Your Attention</div>
              {items.length === 0 ? (
                <div className="card" style={{padding:'18px 22px',display:'flex',alignItems:'center',gap:12,background:'#e6efe1',border:'1px solid #c8d4be',marginBottom:0}}>
                  <span style={{fontSize:18,color:'#5a6b4f'}}>✓</span>
                  <div>
                    <div style={{fontSize:14,fontWeight:600,color:'#5a6b4f'}}>All caught up.</div>
                    <div style={{fontSize:12,color:'#6f7d65',marginTop:2}}>Nothing requires your attention right now across the selected assets.</div>
                  </div>
                </div>
              ) : (
                <div className="card" style={{padding:0,marginBottom:0,overflow:'hidden'}}>
                  {items.map((it, idx) => {
                    const t = tones[it.severity] || tones.yellow;
                    return (
                      <div key={idx}
                        onClick={() => it.page && setPage && setPage(it.page)}
                        style={{display:'flex',alignItems:'center',gap:14,padding:'14px 20px',cursor: it.page ? 'pointer' : 'default',background:'#fff',borderBottom: idx === items.length - 1 ? 'none' : '1px solid var(--border-light)',transition:'background 0.12s'}}
                        onMouseEnter={e => { if (it.page) e.currentTarget.style.background = t.bg; }}
                        onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}>
                        <span style={{width:10,height:10,borderRadius:'50%',background:t.dot,flexShrink:0}}/>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:14,fontWeight:600,color:'var(--text-dark)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{it.title}</div>
                          <div style={{fontSize:12,color:'var(--text-muted)',marginTop:3}}>{it.detail}</div>
                        </div>
                        <span style={{fontSize:10,letterSpacing:'0.05em',textTransform:'uppercase',color:t.dot,fontWeight:700,whiteSpace:'nowrap'}}>{t.label}</span>
                        {it.page && (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8a98a2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          );
        })()}

        {/* ============ YOUR PORTFOLIO — per-asset cards, grouped by type ============ */}
        {(() => {
          const cards = stats.assetCards || [];
          if (cards.length === 0) return null;
          const typeChip = { 'Residential':'#5a6b4f', 'Commercial':'#3E4C59', 'Villa':'#a07d3c', 'Commercial Land':'#61707D' };
          // Section order + display label per property type. Matches the
          // Database / Assets page so the user gets a consistent mental
          // model across the app.
          const TYPE_ORDER = ['Residential', 'Commercial', 'Villa', 'Commercial Land'];
          const TYPE_LABEL = {
            'Residential': 'Residential',
            'Commercial': 'Commercial buildings',
            'Villa': 'Villas',
            'Commercial Land': 'Lands',
          };
          const byType = {};
          TYPE_ORDER.forEach(t => { byType[t] = []; });
          cards.forEach(c => {
            const t = TYPE_ORDER.includes(c.property_type) ? c.property_type : 'Residential';
            byType[t].push(c);
          });
          // Highest-yield in green, lowest in red so the eye finds the
          // underperformer instantly. Threshold based on portfolio median.
          const yieldsSorted = cards.map(c => c.yield_pct).filter(v => v != null).sort((a, b) => a - b);
          const median = yieldsSorted.length > 0 ? yieldsSorted[Math.floor(yieldsSorted.length / 2)] : 0;
          const yieldTone = (y) => y == null ? 'var(--text-muted)' : y >= median + 0.5 ? '#5a6b4f' : y <= median - 0.5 ? '#8b4a42' : 'var(--text-dark)';
          return (
            <>
              <div style={{...groupEyebrow,display:'flex',justifyContent:'space-between',alignItems:'baseline'}}>
                <span>Your Portfolio</span>
                <span style={{fontSize:11,letterSpacing:0,textTransform:'none',color:'var(--text-muted)',fontWeight:400}}>{cards.length} asset{cards.length===1?'':'s'} · grouped by type</span>
              </div>
              {TYPE_ORDER.map(type => {
                const list = byType[type] || [];
                if (list.length === 0) return null;
                // Sort highest yield first within each section.
                list.sort((a, b) => (b.yield_pct || 0) - (a.yield_pct || 0));
                return (
                  <div key={type} style={{marginBottom:18}}>
                    <div style={{display:'flex',alignItems:'baseline',gap:10,marginBottom:10,paddingBottom:6,borderBottom:'1px solid var(--border-light)'}}>
                      <span style={{fontSize:14,fontWeight:600,letterSpacing:'-0.01em',color:'var(--text-dark)'}}>{TYPE_LABEL[type]}</span>
                      <span style={{fontSize:11,color:'var(--text-muted)'}}>· {list.length} asset{list.length===1?'':'s'}</span>
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))',gap:14}}>
                      {list.map(c => {
                        const issues = [];
                        if (c.overdue_count > 0) issues.push({ label: c.overdue_count + ' overdue', color:'#8b4a42' });
                        if (c.vacant_count > 0)  issues.push({ label: c.vacant_count  + ' vacant',  color:'#a07d3c' });
                        if (c.expiring_leases_count > 0) issues.push({ label: c.expiring_leases_count + ' lease end', color:'#7a5a1f' });
                        return (
                          <div key={c.id}
                            onClick={() => setPage && setPage('properties')}
                            style={{background:'#fff',border:'1px solid var(--border-light)',borderRadius:10,padding:'16px 18px',cursor: setPage ? 'pointer' : 'default',transition:'box-shadow 0.15s, transform 0.15s',display:'flex',flexDirection:'column',gap:12}}
                            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 14px rgba(19,31,35,0.06)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                            onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}
                            title="Open Assets page for the deeper view">
                            {/* Header line */}
                            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:10}}>
                              <div style={{minWidth:0,flex:1}}>
                                <div style={{fontSize:15,fontWeight:600,letterSpacing:'-0.01em',color:'var(--text-dark)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{c.name}</div>
                                <div style={{fontSize:11,color:'var(--text-muted)',marginTop:3,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{c.address || '—'}</div>
                              </div>
                              <span style={{fontSize:9,letterSpacing:'0.05em',textTransform:'uppercase',color:'#fff',background:typeChip[c.property_type] || '#61707D',padding:'3px 8px',borderRadius:3,fontWeight:600,whiteSpace:'nowrap',flexShrink:0}}>
                                {c.property_type}
                              </span>
                            </div>
                            {/* Yield + occupancy split */}
                            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                              <div>
                                <div style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600,marginBottom:4}}>Yield</div>
                                <div style={{fontSize:22,fontWeight:600,color:yieldTone(c.yield_pct),lineHeight:1}}>{c.yield_pct == null ? '—' : c.yield_pct.toFixed(1) + '%'}</div>
                                <div style={{fontSize:10,color:'var(--text-muted)',marginTop:3}}>annualised gross</div>
                              </div>
                              <div>
                                <div style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600,marginBottom:4}}>Occupancy</div>
                                <div style={{fontSize:22,fontWeight:600,color:'var(--text-dark)',lineHeight:1}}>{c.occupied_count}<span style={{fontSize:14,color:'var(--text-muted)',fontWeight:400}}> / {c.total_units}</span></div>
                                <div style={{fontSize:10,color:'var(--text-muted)',marginTop:3}}>{c.occupancy_pct}%</div>
                              </div>
                            </div>
                            {/* This-month collected + footer */}
                            <div style={{paddingTop:10,borderTop:'1px solid var(--border-light)',display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:10}}>
                              <div>
                                <div style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600}}>This month</div>
                                <div style={{fontSize:15,fontWeight:600,color:'#5a6b4f',marginTop:2}}>{fmt(c.this_month_collected)}</div>
                              </div>
                              <div style={{textAlign:'right'}}>
                                <div style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600}}>Value</div>
                                <div style={{fontSize:13,fontWeight:600,color:'var(--text-dark)',marginTop:2}}>{c.current_value ? fmt(c.current_value) : '—'}</div>
                              </div>
                            </div>
                            {/* Issue chips */}
                            {issues.length > 0 && (
                              <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                                {issues.map((iss, i) => (
                                  <span key={i} style={{fontSize:10,fontWeight:600,letterSpacing:'0.03em',textTransform:'uppercase',color:iss.color,background:'rgba(0,0,0,0.04)',padding:'3px 8px',borderRadius:3}}>{iss.label}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </>
          );
        })()}

        {/* ============ PORTFOLIO SUMMARY ============ */}
        <div style={groupEyebrow}>Portfolio Summary</div>
        <div className="kpi-row" style={{gridTemplateColumns:'repeat(5, minmax(0, 1fr))',marginBottom:0}}>
          <KpiCard label="Total Assets Selected" value={stats.selectedPropsCount + ' ' + (stats.selectedPropsCount === 1 ? 'asset' : 'assets')} page="properties"/>
          <KpiCard label="Units Occupied"            value={stats.occupied + ' / ' + stats.totalUnits}        page="properties"/>
          <KpiCard label="Occupancy Rate"            value={stats.occupancyRate + '%'}                         page="properties"/>
          <KpiCard label="Operating Income Collected" value={fmt(stats.monthCollected)} color="#5a6b4f" page="payment"/>
          <KpiCard label="Operating Income Pending"   value={fmt(stats.monthOverdue)}  color="#8b4a42" page="payment"/>
        </div>

        {/* ============ FINANCIAL SUMMARY ============ */}
        <div style={groupEyebrow}>Financial Summary</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr',gap:18,marginBottom:8}}>
          {/* Operating Income — Collected / Pending / Upcoming / Future for selected period */}
          <div className="card">
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16}}>
              <div style={{fontSize:15,fontWeight:600,color:'var(--text-dark)',letterSpacing:'-0.015em'}}>Operating Income</div>
              <span onClick={() => setPage && setPage('payment')} style={{fontSize:11,color:'var(--accent-warm-dark)',cursor:'pointer',fontWeight:500}}>View all →</span>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(4, minmax(0, 1fr))',gap:18}}>
              <div title="Paid invoices in the selected period">
                <div style={{fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:7,fontWeight:600}}>Collected</div>
                <div style={{fontSize:22,fontWeight:600,color:'#5a6b4f',letterSpacing:'-0.025em',lineHeight:1.1}}>{fmt(stats.monthCollected)}</div>
              </div>
              <div title="Past due — not yet paid">
                <div style={{fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:7,fontWeight:600}}>Pending</div>
                <div style={{fontSize:22,fontWeight:600,color:'#8b4a42',letterSpacing:'-0.025em',lineHeight:1.1}}>{fmt(stats.monthOverdue)}</div>
              </div>
              <div title="Due within the next 30 days">
                <div style={{fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:7,fontWeight:600}}>Upcoming</div>
                <div style={{fontSize:22,fontWeight:600,color:'#a07d3c',letterSpacing:'-0.025em',lineHeight:1.1}}>{fmt(stats.monthPending)}</div>
              </div>
              <div title="Scheduled cheques due more than 30 days out">
                <div style={{fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:7,fontWeight:600}}>Future</div>
                <div style={{fontSize:22,fontWeight:600,color:'#61707D',letterSpacing:'-0.025em',lineHeight:1.1}}>{fmt(stats.monthUpcoming)}</div>
              </div>
            </div>
          </div>

          {/* Unit Payment Activity — Paid (this month) | Pending (all unpaid).
              Rows lead with the unit number; building-letter avatar is
              gone (it duplicated the line of building text below). */}
          <div className="card">
            <div style={{marginBottom:14}}>
              <div style={{fontSize:15,fontWeight:600,color:'var(--text-dark)',letterSpacing:'-0.015em'}}>Unit Payment Activity</div>
              <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2}}>Top units by activity this period.</div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:24}}>
              {[
                { key:'paid',    label:'Paid',    color:'#5a6b4f', list:stats.paidList,    empty:'No paid invoices this period yet.' },
                { key:'pending', label:'Pending', color:'#8b4a42', list:stats.pendingList, empty:'No pending or overdue invoices ✓' },
              ].map(col => (
                <div key={col.key}>
                  <div style={{fontSize:10,letterSpacing:'0.1em',textTransform:'uppercase',color:col.color,fontWeight:600,marginBottom:10}}>{col.label}</div>
                  {col.list.length === 0 ? (
                    <div style={{color:'var(--text-muted)',fontSize:12,padding:'12px 0'}}>{col.empty}</div>
                  ) : col.list.map((a, i) => {
                    const isLast = i === col.list.length - 1;
                    const clickable = a.unit && a.building;
                    return (
                      <div key={i}
                           onClick={() => clickable && setOpenedUnit({ unit: a.unit, building: a.building })}
                           style={{display:'flex',alignItems:'center',gap:12,padding:'10px 8px',borderRadius:6,borderBottom: isLast ? 'none' : '1px solid var(--border-light)',cursor: clickable ? 'pointer' : 'default',transition:'background 0.15s'}}
                           onMouseEnter={e => { if (clickable) e.currentTarget.style.background = 'var(--bg-page)'; }}
                           onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                           title={clickable ? 'Open unit detail' : ''}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:500,color:'var(--text-dark)',letterSpacing:'-0.01em'}}>{a.unit_number}</div>
                          <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{a.building_name}{a.floor != null ? ' · Floor ' + a.floor : ''}</div>
                        </div>
                        <div style={{textAlign:'right'}}>
                          <div style={{fontSize:13,fontWeight:600,color:col.color,letterSpacing:'-0.015em'}}>{fmt(a.amount)}</div>
                          <div style={{fontSize:10,color:'var(--text-muted)',marginTop:2}}>
                            {col.key === 'paid'
                              ? (a.count + ' invoice' + (a.count===1?'':'s'))
                              : (a.oldest_due ? daysOverdue(a.oldest_due) + 'd overdue' : a.count + ' invoice' + (a.count===1?'':'s'))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ============ SERVICE REQUESTS ============ */}
        <div style={groupEyebrow}>Service Requests</div>
        <div className="kpi-row" style={{gridTemplateColumns:'repeat(3, minmax(0, 1fr))',marginBottom:18}}>
          <KpiCard label="Requests Today"  value={stats.todaySRs}        page="service"/>
          <KpiCard label="Completed Today" value={stats.completedToday}  color="#5a6b4f" page="service"/>
          <KpiCard label="Pending"         value={stats.pendingRequests} color="#a07d3c" page="service"/>
        </div>
        <div className="card">
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:14}}>
            <div>
              <div style={{fontSize:14,fontWeight:600,color:'var(--text-dark)'}}>All Service Requests</div>
              <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2}}>Most recent {stats.srRecent.length} across selected properties</div>
            </div>
            <span onClick={() => setPage && setPage('service')} style={{fontSize:11,color:'var(--accent-warm-dark)',cursor:'pointer'}}>View all →</span>
          </div>
          {stats.srRecent.length === 0 ? (
            <div style={{color:'var(--text-muted)',fontSize:13,padding:24,textAlign:'center'}}>No service requests yet.</div>
          ) : (
            <table className="data-table">
              <thead><tr><th style={{width:'16%'}}>Category</th><th style={{width:'44%'}}>Description</th><th style={{width:'12%'}}>Priority</th><th style={{width:'16%'}}>Status</th><th style={{width:'12%'}}>Created</th></tr></thead>
              <tbody>
                {stats.srRecent.map(s => (
                  <tr key={s.id} style={{cursor:'pointer'}} onClick={() => setPage && setPage('service')}>
                    <td style={{fontWeight:500}}>{s.category}</td>
                    <td style={{maxWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={s.description}>{s.description}</td>
                    <td>{s.priority}</td>
                    <td>{statusBadge(s.status)}</td>
                    <td>{s.created_at ? new Date(s.created_at).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ============ VISITORS ============ */}
        <div style={groupEyebrow}>Visitors</div>
        <div className="kpi-row" style={{gridTemplateColumns:'repeat(2, minmax(0, 1fr))',marginBottom:0}}>
          <KpiCard label="Upcoming Visitors" value={stats.upcomingVisits} page="visitors"/>
          <KpiCard label="Visitors Today"    value={stats.todayVisits}    page="visitors"/>
        </div>
      </>)}
      {openedUnit && (
        <UnitDetailModal
          unit={openedUnit.unit}
          building={openedUnit.building}
          onClose={() => setOpenedUnit(null)}
        />
      )}
    </div>
  );
};

