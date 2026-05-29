// ==================== SERVICE REQUEST DETAIL MODAL ====================
// Click a row inside BuildingDrillModal's SR view → this opens.
// Mirrors UnitDetailModal's Section / Field language so the whole
// service-request story is laid out the same way the rest of the
// app handles a one-record deep-dive.
//
// What we show:
//   1. Header — Asset / Unit breadcrumb + status pill + priority chip
//   2. Request section — Category / Description (full) / Notes
//   3. Resident section — Name + Phone (WhatsApp link) + Unit / Floor
//   4. Timeline section — Created / Preferred date / Resolved / age
//
// We fetch the resident + unit on mount so the SR row payload we got
// from BuildingDrillModal (which is a join of service_requests with
// some derived fields) doesn't have to carry every detail.
const ServiceRequestDetailModal = ({ sr, building, onClose }) => {
  const [resident, setResident] = useState(null);
  const [unit, setUnit] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    if (!supabaseClient) return;
    setLoading(true);
    (async () => {
      try {
        const [{ data: u }, { data: p }] = await Promise.all([
          sr.unit_id
            ? supabaseClient.from('units').select('id, unit_number, floor, tenant_name, tenant_phone, tenant_email').eq('id', sr.unit_id).maybeSingle()
            : Promise.resolve({ data: null }),
          sr.resident_profile_id
            ? supabaseClient.from('profiles').select('id, full_name, phone, emergency_contact_name, emergency_contact_phone').eq('id', sr.resident_profile_id).maybeSingle()
            : Promise.resolve({ data: null }),
        ]);
        if (!mounted) return;
        setUnit(u || null);
        setResident(p || null);
      } catch (_) {}
      if (mounted) setLoading(false);
    })();
    return () => { mounted = false; };
  }, [sr.id]);

  // Esc closes
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const fmtDate = (s) => {
    if (!s) return '—';
    try {
      const d = new Date(s);
      return d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) + ' · ' + d.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
    } catch (_) { return s; }
  };
  const daysSince = (s) => {
    if (!s) return null;
    const d = new Date(s);
    if (isNaN(d.getTime())) return null;
    return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  };

  const statusPill = ({
    'New':         { bg:'#fdf5e6', fg:'#7a5a1f' },
    'Acknowledged':{ bg:'#E6EAE9', fg:'#3E4C59' },
    'In Progress': { bg:'#fdf2dc', fg:'#a07d3c' },
    'Done':        { bg:'#e6efe1', fg:'#5a6b4f' },
    'Closed':      { bg:'#E6EAE9', fg:'#61707D' },
    'Rejected':    { bg:'#fdf2f1', fg:'#8b4a42' },
  })[sr.status] || { bg:'#E6EAE9', fg:'#61707D' };

  const priorityChip = ({
    'Urgent':{ bg:'#8b4a42', fg:'#fff' },
    'High':  { bg:'#a07d3c', fg:'#fff' },
    'Normal':{ bg:'#3E4C59', fg:'#fff' },
    'Low':   { bg:'#E6EAE9', fg:'#61707D' },
  })[sr.priority] || { bg:'#E6EAE9', fg:'#61707D' };

  // Display tenant info — residential resident if linked, else unit.tenant_*
  const tenantName = resident?.full_name || unit?.tenant_name || (sr.resident_name && sr.resident_name !== '—' ? sr.resident_name : null);
  const tenantPhone = resident?.phone || unit?.tenant_phone || null;
  const waLink = tenantPhone ? 'https://wa.me/' + tenantPhone.replace(/[^0-9]/g, '') : null;
  const unitDisplay = unit ? (unit.unit_number + (unit.floor != null ? ' · Floor ' + unit.floor : '')) : (sr.unit_number || '—');

  const Section = ({ label, children, right }) => (
    <div style={{marginBottom:14}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
        <div style={{fontSize:10,letterSpacing:'0.1em',textTransform:'uppercase',color:'#61707D',fontWeight:600}}>{label}</div>
        {right}
      </div>
      <div style={{background:'#fff',border:'1px solid #E6EAE9',borderRadius:8,padding:'14px 16px'}}>{children}</div>
    </div>
  );
  const Field = ({ label, children }) => (
    <div style={{display:'flex',gap:12,padding:'4px 0',fontSize:13}}>
      <div style={{width:160,color:'#61707D'}}>{label}</div>
      <div style={{flex:1,color:'#131F23',fontWeight:500}}>{children == null || children === '' ? '—' : children}</div>
    </div>
  );

  const ageDays = daysSince(sr.created_at);

  return (
    <div className="modal-overlay" onClick={onClose} style={{zIndex:1200}}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{maxWidth:780,maxHeight:'88vh',padding:0,display:'flex',flexDirection:'column',overflow:'hidden'}}>
        {/* Header */}
        <div className="modal-header" style={{position:'sticky',top:0,background:'#fff',padding:'22px 28px 16px 32px',margin:0,borderBottom:'1px solid var(--border-light)',zIndex:2}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:11,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:4}}>Service Request</div>
            <h2 style={{margin:0,fontSize:22,letterSpacing:'-0.02em',fontWeight:600}}>{sr.category || 'Service request'}</h2>
            <div className="modal-sub" style={{marginTop:4}}>{building?.name || '—'} · Unit {unitDisplay}</div>
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
            <span style={{fontSize:10,fontWeight:700,letterSpacing:'0.06em',textTransform:'uppercase',color:priorityChip.fg,background:priorityChip.bg,padding:'5px 11px',borderRadius:4}}>{sr.priority || 'Normal'}</span>
            <span style={{fontSize:10,fontWeight:700,letterSpacing:'0.06em',textTransform:'uppercase',color:statusPill.fg,background:statusPill.bg,padding:'5px 11px',borderRadius:4}}>{sr.status || 'New'}</span>
            <button className="modal-close" onClick={onClose}>×</button>
          </div>
        </div>

        <div style={{padding:'18px 32px 28px',overflowY:'auto',flex:1,background:'var(--bg-page)'}}>
          {/* Request */}
          <Section label="Request">
            <Field label="Category">{sr.category}</Field>
            <div style={{marginTop:6,padding:'8px 0'}}>
              <div style={{fontSize:11,color:'#61707D',marginBottom:6}}>Description</div>
              <div style={{fontSize:13,color:'#131F23',lineHeight:1.55,whiteSpace:'pre-wrap'}}>{sr.description || '—'}</div>
            </div>
            {sr.notes && (
              <div style={{marginTop:6,padding:'8px 0',borderTop:'1px solid #f0f0f0'}}>
                <div style={{fontSize:11,color:'#61707D',marginBottom:6}}>Internal notes</div>
                <div style={{fontSize:13,color:'#131F23',lineHeight:1.55,whiteSpace:'pre-wrap'}}>{sr.notes}</div>
              </div>
            )}
          </Section>

          {/* Resident */}
          <Section label="Reported by">
            {loading ? (
              <div style={{padding:'8px 0',color:'#61707D',fontSize:13}}>Loading…</div>
            ) : (
              <>
                <Field label="Name">{tenantName || '—'}</Field>
                <Field label="Phone">
                  {tenantPhone ? (
                    waLink ? <a href={waLink} target="_blank" rel="noopener" style={{color:'#5a6b4f',textDecoration:'none'}}>{tenantPhone}</a> : tenantPhone
                  ) : '—'}
                </Field>
                <Field label="Unit">{unitDisplay}</Field>
              </>
            )}
          </Section>

          {/* Timeline */}
          <Section label="Timeline">
            <Field label="Created">{fmtDate(sr.created_at)}{ageDays != null ? ' · ' + ageDays + 'd ago' : ''}</Field>
            <Field label="Preferred date">
              {sr.preferred_date
                ? (sr.preferred_date + (sr.preferred_time ? ' · ' + sr.preferred_time : ''))
                : '—'}
            </Field>
            <Field label="Resolved">{sr.resolved_at ? fmtDate(sr.resolved_at) : (['Done','Closed'].includes(sr.status) ? 'Marked complete (no timestamp)' : 'Not yet')}</Field>
            <Field label="Last update">{fmtDate(sr.updated_at)}</Field>
          </Section>
        </div>
      </div>
    </div>
  );
};
