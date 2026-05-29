// ==================== UNIT DETAIL MODAL ====================
// Opens when you click a unit chip inside BuildingDetailModal. Shows:
//   - Where the unit is (Floor X · Building name · Address)
//   - Resident (linked from profile-creation/resident_assignments)
//   - Lease or Ownership terms
//   - Any Pending / Overdue invoices for this unit
//   - A button into the existing UnitAttachmentsModal (photos / docs)
//
// Caller may pass `assignment` + `profile` so we don't refetch when the
// parent (BuildingDetailModal) already has them. Otherwise we fetch on
// mount.

const UnitDetailModal = ({ unit, building, assignment: passedAssignment, profile: passedProfile, onClose }) => {
  const [assignment, setAssignment]         = useState(passedAssignment || null);
  const [profile, setProfile]               = useState(passedProfile || null);
  // When the unit is vacant but unpaid invoices remain, we resolve the
  // most-recent invoice's resident_profile_id into a profile and show
  // them as the "former resident" responsible for the outstanding balance.
  const [formerResident, setFormerResident] = useState(null);
  // Owner record on the unit itself (separate from resident assignment).
  // Always shown at the top of the modal; if owner_is_resident is true we
  // render a 'Same as resident' chip rather than duplicating the fields.
  const [ownerInfo, setOwnerInfo] = useState(null);
  const [invoices, setInvoices]             = useState(null);
  // Map of resident_profile_id -> { full_name, phone } so each invoice row
  // can show who it was billed to (covers both current and former tenants).
  const [invoiceResidents, setInvoiceResidents] = useState({});
  const [showAttachments, setShowAttachments] = useState(false);
  // Clicking the resident's name opens the full ResidentDetailModal.
  const [showResidentDetail, setShowResidentDetail] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (!supabaseClient) { setInvoices([]); return; }
    (async () => {
      // Fetch current assignment + profile if caller didn't pass them
      let a = passedAssignment;
      let p = passedProfile;
      if (!a) {
        const { data } = await supabaseClient
          .from('resident_assignments')
          .select('profile_id,unit_id,tenure,monthly_payment_aed,lease_start,lease_end,ownership_start,cheques_per_year,contract_number')
          .eq('unit_id', unit.id)
          .maybeSingle();
        a = data || null;
      }
      if (!p && a && a.profile_id) {
        const { data } = await supabaseClient
          .from('profiles')
          .select('id,full_name,phone')
          .eq('id', a.profile_id)
          .maybeSingle();
        p = data || null;
      }
      if (!mounted) return;
      setAssignment(a);
      setProfile(p);

      // Fetch owner record for this unit (separate from resident).
      const { data: u } = await supabaseClient
        .from('units')
        .select('owner_name,owner_phone,owner_email,owner_passport_number,owner_emirates_id,purchase_date,owner_is_resident')
        .eq('id', unit.id)
        .maybeSingle();
      if (!mounted) return;
      setOwnerInfo(u || null);

      // Unpaid invoices for this unit — include resident_profile_id so we
      // can surface the historical resident when the unit is vacant.
      const { data: invs } = await supabaseClient
        .from('invoices')
        .select('id,invoice_number,description,amount_aed,due_date,status,resident_profile_id,created_at')
        .eq('unit_id', unit.id)
        .in('status', ['Pending', 'Overdue'])
        .order('due_date', { ascending: true });
      if (!mounted) return;
      setInvoices(invs || []);

      // Resolve every distinct resident_profile_id on these invoices so the
      // table can show a "Billed to" name on each row — even invoices billed
      // to a previous tenant when the unit is currently vacant or re-let.
      const ids = Array.from(new Set((invs || [])
        .map(i => i.resident_profile_id)
        .filter(Boolean)));
      if (ids.length > 0) {
        const { data: people } = await supabaseClient
          .from('profiles')
          .select('id,full_name,phone')
          .in('id', ids);
        if (mounted) {
          const map = {};
          (people || []).forEach(pr => { map[pr.id] = pr; });
          setInvoiceResidents(map);

          // If the unit has no current resident, show the most recent
          // invoice's resident as the "former resident" card.
          if (!p && (invs || []).length > 0) {
            const sorted = [...invs].sort((x, y) => (y.created_at || '').localeCompare(x.created_at || ''));
            const lastPid = sorted.find(i => i.resident_profile_id)?.resident_profile_id;
            if (lastPid && map[lastPid]) setFormerResident(map[lastPid]);
          }
        }
      }
    })();
    return () => { mounted = false; };
  }, [unit.id]);

  // Listen for status changes fired by the InvoiceSlotModal so the row
  // re-buckets without a full reload.
  useEffect(() => {
    const handler = (e) => {
      const { invoice_id, new_status } = (e && e.detail) || {};
      if (!invoice_id) return;
      setInvoices(prev => (prev || []).map(i => i.id === invoice_id ? { ...i, status: new_status } : i));
    };
    window.addEventListener('vars:invoice-status-changed', handler);
    return () => window.removeEventListener('vars:invoice-status-changed', handler);
  }, []);

  const fmt = (n) => 'AED ' + Math.round(Number(n) || 0).toLocaleString();
  // Same rule as Service Charges: split "Pending" into Upcoming (>30 days out)
  // and the actually-outstanding ones (due within 30 days, or already overdue).
  const _now = new Date();
  const _eff = (i) => {
    if (!i) return 'Pending';
    if (i.status === 'Paid' || i.status === 'Cancelled') return i.status;
    if (!i.due_date) return i.status;
    const due = new Date(i.due_date);
    if (isNaN(due.getTime())) return i.status;
    const daysUntilDue = Math.floor((due.getTime() - _now.getTime()) / (24*60*60*1000));
    if (daysUntilDue < 0)  return 'Pending';   // past due
    if (daysUntilDue > 30) return 'Future';    // >30 days out
    return 'Upcoming';                          // due within next 30 days
  };
  const annotatedInvoices = (invoices || []).map(i => ({ ...i, effective_status: _eff(i) }));
  const outstandingInvoices = annotatedInvoices.filter(i => i.effective_status === 'Upcoming' || i.effective_status === 'Pending');
  const upcomingInvoices    = annotatedInvoices.filter(i => i.effective_status === 'Future');
  const totalOutstanding    = outstandingInvoices.reduce((s, i) => s + Number(i.amount_aed), 0);
  const totalUpcoming       = upcomingInvoices.reduce((s, i) => s + Number(i.amount_aed), 0);

  const Section = ({ label, children }) => (
    <div style={{marginBottom:14}}>
      <div style={{fontSize:10,letterSpacing:'0.1em',textTransform:'uppercase',color:'#61707D',fontWeight:600,marginBottom:8}}>{label}</div>
      <div style={{background:'#fff',border:'1px solid #E6EAE9',borderRadius:8,padding:'14px 16px'}}>{children}</div>
    </div>
  );
  const Field = ({ label, children }) => (
    <div style={{display:'flex',gap:12,padding:'4px 0',fontSize:13}}>
      <div style={{width:140,color:'#61707D'}}>{label}</div>
      <div style={{flex:1,color:'#131F23',fontWeight:500}}>{children == null || children === '' ? '—' : children}</div>
    </div>
  );

  return (
    <>
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{maxWidth:1000,maxHeight:'90vh',padding:0,display:'flex',flexDirection:'column',overflow:'hidden'}}>
        <div className="modal-header" style={{position:'sticky',top:0,background:'#fff',padding:'24px 28px 18px 32px',margin:0,borderBottom:'1px solid var(--border-light)',zIndex:2}}>
          <div>
            <div style={{fontSize:11,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:4}}>Unit</div>
            <h2>{unit.unit_number}</h2>
            <div className="modal-sub">Floor {unit.floor} · {building.name}{building.address ? ' · ' + building.address : ''}</div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div style={{padding:'20px 32px 32px',overflowY:'auto',flex:1}}>
        {invoices === null ? (
          <div style={{padding:18,fontSize:13,color:'var(--text-muted)'}}>Loading…</div>
        ) : (
          <>
            {/* OWNER SECTION — owns the asset, may or may not also be the
                resident. Sits above Resident because the user said this is
                the most important record per unit. */}
            <Section label="Owner">
              {ownerInfo && ownerInfo.owner_is_resident && profile ? (
                <>
                  <div style={{padding:'8px 10px',background:'#e6efe1',border:'1px solid #c8d4be',borderRadius:6,fontSize:12,color:'#5a6b4f',marginBottom:12}}>
                    Owner is the same as the resident below.
                  </div>
                  <Field label="Name">{profile.full_name}</Field>
                  <Field label="Phone">{profile.phone}</Field>
                </>
              ) : ownerInfo && (ownerInfo.owner_name || ownerInfo.owner_phone || ownerInfo.owner_email) ? (
                <>
                  <Field label="Name">{ownerInfo.owner_name}</Field>
                  <Field label="Phone">{ownerInfo.owner_phone}</Field>
                  <Field label="Email">{ownerInfo.owner_email}</Field>
                  <Field label="Passport">{ownerInfo.owner_passport_number}</Field>
                  <Field label="Emirates ID">{ownerInfo.owner_emirates_id}</Field>
                  <Field label="Purchase date">{ownerInfo.purchase_date}</Field>
                </>
              ) : (
                <div style={{fontSize:13,color:'#61707D',padding:'6px 0'}}>No owner record yet — add via the unit edit form or bulk upload.</div>
              )}
            </Section>

            <Section label={profile ? 'Resident' : (formerResident ? 'Former Resident' : 'Resident')}>
              {profile ? (
                <>
                  <Field label="Name">
                    <span
                      onClick={() => setShowResidentDetail(true)}
                      style={{color:'#3E4C59',cursor:'pointer',textDecoration:'underline',textDecorationColor:'#E6EAE9',textDecorationThickness:1,textUnderlineOffset:3}}
                      onMouseEnter={e => { e.currentTarget.style.textDecorationColor = '#3E4C59'; }}
                      onMouseLeave={e => { e.currentTarget.style.textDecorationColor = '#E6EAE9'; }}
                      title="Open full resident profile"
                    >
                      {profile.full_name}
                    </span>
                  </Field>
                  <Field label="Phone">{profile.phone}</Field>
                  <Field label="Tenure">{assignment && assignment.tenure}</Field>
                </>
              ) : formerResident ? (
                <>
                  <div style={{padding:'8px 10px',background:'#fdf2dc',border:'1px solid #f0e2bd',borderRadius:6,fontSize:12,color:'#7a5a1f',marginBottom:12}}>
                    Unit is currently vacant. Outstanding balance below was billed to the previous resident.
                  </div>
                  <Field label="Name">{formerResident.full_name}</Field>
                  <Field label="Phone">{formerResident.phone}</Field>
                </>
              ) : (
                <div style={{fontSize:13,color:'#61707D',padding:'6px 0'}}>Vacant — no resident assigned to this unit.</div>
              )}
            </Section>

            {assignment && (
              <Section label={assignment.tenure === 'Owner' ? 'Ownership' : 'Annual Contract'}>
                {assignment.tenure === 'Owner' ? (
                  <Field label="Ownership start">{assignment.ownership_start}</Field>
                ) : (() => {
                  const monthly = Number(assignment.monthly_payment_aed) || 0;
                  const cheques = Number(assignment.cheques_per_year) || 1;
                  const annual  = monthly * 12;
                  const perCheque = cheques > 0 ? Math.round(annual / cheques) : annual;
                  return (
                    <>
                      <Field label="Annual rent">{annual ? fmt(annual) : '—'}</Field>
                      <Field label="Cheques per year">{cheques}</Field>
                      <Field label="Per cheque">{annual ? fmt(perCheque) : '—'}</Field>
                      <Field label="Contract #">{assignment.contract_number || '—'}</Field>
                      <Field label="Lease start">{assignment.lease_start}</Field>
                      <Field label="Lease end">{assignment.lease_end}</Field>
                    </>
                  );
                })()}
              </Section>
            )}

            {(() => {
              const InvoiceRow = ({ i, accentColor }) => {
                const billedTo = i.resident_profile_id ? invoiceResidents[i.resident_profile_id] : null;
                const currentMatch = assignment && i.resident_profile_id && i.resident_profile_id === assignment.profile_id;
                const statusStyle = ({
                  'Paid':     { bg: '#e6efe1', fg: '#5a6b4f' },
                  'Pending':  { bg: '#fdf2f1', fg: '#8b4a42' },  // past due
                  'Upcoming': { bg: '#fdf2dc', fg: '#7a5a1f' },  // within 30 days
                  'Future':   { bg: '#E6EAE9', fg: '#61707D' },  // >30 days
                })[i.effective_status] || { bg: '#E6EAE9', fg: '#61707D' };
                return (
                  <tr key={i.id}>
                    <td style={{fontWeight:500}}>{i.invoice_number || '—'}</td>
                    <td style={{maxWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={i.description}>{i.description}</td>
                    <td title={billedTo ? (billedTo.full_name + (billedTo.phone ? ' · ' + billedTo.phone : '')) : ''}>
                      {billedTo ? (
                        <span>
                          {billedTo.full_name}
                          {!currentMatch && profile && (
                            <span style={{marginLeft:6,fontSize:10,padding:'1px 6px',borderRadius:4,background:'#fdf2dc',color:'#7a5a1f',border:'1px solid #f0e2bd'}}>previous</span>
                          )}
                          {!currentMatch && !profile && formerResident && (
                            <span style={{marginLeft:6,fontSize:10,padding:'1px 6px',borderRadius:4,background:'#fdf2dc',color:'#7a5a1f',border:'1px solid #f0e2bd'}}>former</span>
                          )}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{i.due_date || '—'}</td>
                    <td style={{whiteSpace:'nowrap',overflow:'hidden'}}>
                      <span style={{display:'inline-block',padding:'2px 8px',borderRadius:4,fontSize:10,fontWeight:500,background:statusStyle.bg,color:statusStyle.fg,whiteSpace:'nowrap'}}>
                        {i.effective_status}
                      </span>
                    </td>
                    <InvoiceSlotCell invoice={i} slot="invoice"/>
                    <InvoiceSlotCell invoice={i} slot="payment_proof"/>
                    <td style={{textAlign:'right',color:accentColor,fontWeight:600,whiteSpace:'nowrap'}}>{fmt(i.amount_aed)}</td>
                  </tr>
                );
              };
              const InvoiceTableHeader = () => (
                <thead>
                  <tr>
                    <th style={{width:'11%'}}>Invoice</th>
                    <th style={{width:'14%'}}>Description</th>
                    <th style={{width:'13%'}}>Billed to</th>
                    <th style={{width:'12%'}}>Due</th>
                    <th style={{width:'12%'}}>Status</th>
                    <th style={{width:'9%',textAlign:'center'}}>Invoice</th>
                    <th style={{width:'12%',textAlign:'center'}}>Proof of payment</th>
                    <th style={{width:'17%',textAlign:'right'}}>Amount</th>
                  </tr>
                </thead>
              );
              return (
                <>
                  <Section label={'Outstanding Invoices' + (outstandingInvoices.length ? ' · ' + outstandingInvoices.length : '')}>
                    {outstandingInvoices.length === 0 ? (
                      <div style={{fontSize:13,color:'#61707D',padding:'6px 0'}}>No outstanding invoices for this unit ✓</div>
                    ) : (
                      <>
                        <table className="data-table" style={{fontSize:12}}>
                          <InvoiceTableHeader/>
                          <tbody>
                            {outstandingInvoices.map(i => <InvoiceRow key={i.id} i={i} accentColor="#8b4a42"/>)}
                          </tbody>
                        </table>
                        <div style={{marginTop:10,paddingTop:10,borderTop:'1px solid #E6EAE9',display:'flex',justifyContent:'flex-end',fontSize:13}}>
                          Total outstanding:&nbsp;<strong style={{color:'#8b4a42'}}>{fmt(totalOutstanding)}</strong>
                        </div>
                      </>
                    )}
                  </Section>

                  {upcomingInvoices.length > 0 && (
                    <Section label={'Future Cheques · ' + upcomingInvoices.length}>
                      <div style={{fontSize:11,color:'#61707D',marginBottom:8}}>
                        Scheduled cheques due more than 30 days out — not yet outstanding.
                      </div>
                      <table className="data-table" style={{fontSize:12}}>
                        <InvoiceTableHeader/>
                        <tbody>
                          {upcomingInvoices.map(i => <InvoiceRow key={i.id} i={i} accentColor="#131F23"/>)}
                        </tbody>
                      </table>
                      <div style={{marginTop:10,paddingTop:10,borderTop:'1px solid #E6EAE9',display:'flex',justifyContent:'flex-end',fontSize:13}}>
                        Upcoming total:&nbsp;<strong style={{color:'#131F23'}}>{fmt(totalUpcoming)}</strong>
                      </div>
                    </Section>
                  )}
                </>
              );
            })()}

            <Section label="Photos & Documents">
              <button className="btn" onClick={() => setShowAttachments(true)}>Manage attachments</button>
            </Section>
          </>
        )}
        </div>
      </div>
    </div>
    {showAttachments && <UnitAttachmentsModal unit={unit} buildingName={building.name} onClose={() => setShowAttachments(false)}/>}
    {showResidentDetail && profile && (
      <ResidentDetailModal
        onClose={() => setShowResidentDetail(false)}
        resident={{
          id:                  profile.id,
          full_name:           profile.full_name,
          phone:               profile.phone,
          building_name:       building.name,
          unit_number:         unit.unit_number,
          floor:               unit.floor,
          tenure:              assignment ? assignment.tenure              : null,
          lease_start:         assignment ? assignment.lease_start         : null,
          lease_end:           assignment ? assignment.lease_end           : null,
          monthly_payment_aed: assignment ? assignment.monthly_payment_aed : null,
          ownership_start:     assignment ? assignment.ownership_start     : null,
        }}
      />
    )}
    </>
  );
};
