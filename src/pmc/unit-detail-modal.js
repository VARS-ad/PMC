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
  const [invoices, setInvoices]             = useState(null);
  const [showAttachments, setShowAttachments] = useState(false);

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
          .select('profile_id,unit_id,tenure,monthly_payment_aed,lease_start,lease_end,ownership_start')
          .eq('unit_id', unit.id)
          .maybeSingle();
        a = data || null;
      }
      if (!p && a && a.profile_id) {
        const { data } = await supabaseClient
          .from('profiles')
          .select('id,full_name,phone,email')
          .eq('id', a.profile_id)
          .maybeSingle();
        p = data || null;
      }
      if (!mounted) return;
      setAssignment(a);
      setProfile(p);

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

      // Vacant unit + outstanding balance → look up the most recent invoice's
      // resident and present them as the former resident.
      if (!p && (invs || []).length > 0) {
        const sorted = [...invs].sort((x, y) => (y.created_at || '').localeCompare(x.created_at || ''));
        const lastPid = sorted.find(i => i.resident_profile_id)?.resident_profile_id;
        if (lastPid) {
          const { data: fp } = await supabaseClient
            .from('profiles')
            .select('id,full_name,phone,email')
            .eq('id', lastPid)
            .maybeSingle();
          if (mounted) setFormerResident(fp || null);
        }
      }
    })();
    return () => { mounted = false; };
  }, [unit.id]);

  const fmt = (n) => 'AED ' + Math.round(Number(n) || 0).toLocaleString();
  const totalOutstanding = (invoices || []).reduce((s, i) => s + Number(i.amount_aed), 0);

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
      <div className="modal" onClick={e => e.stopPropagation()} style={{maxWidth:620,maxHeight:'88vh',overflowY:'auto'}}>
        <div className="modal-header">
          <div>
            <div style={{fontSize:11,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:4}}>Unit</div>
            <h2>{unit.unit_number}</h2>
            <div className="modal-sub">Floor {unit.floor} · {building.name}{building.address ? ' · ' + building.address : ''}</div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        {invoices === null ? (
          <div style={{padding:18,fontSize:13,color:'var(--text-muted)'}}>Loading…</div>
        ) : (
          <>
            <Section label={profile ? 'Resident' : (formerResident ? 'Former Resident' : 'Resident')}>
              {profile ? (
                <>
                  <Field label="Name">{profile.full_name}</Field>
                  <Field label="Phone">{profile.phone}</Field>
                  <Field label="Email">{profile.email}</Field>
                  <Field label="Tenure">{assignment && assignment.tenure}</Field>
                </>
              ) : formerResident ? (
                <>
                  <div style={{padding:'8px 10px',background:'#fdf2dc',border:'1px solid #f0e2bd',borderRadius:6,fontSize:12,color:'#7a5a1f',marginBottom:12}}>
                    ⚠ Unit is currently vacant. Outstanding balance below was billed to the previous resident.
                  </div>
                  <Field label="Name">{formerResident.full_name}</Field>
                  <Field label="Phone">{formerResident.phone}</Field>
                  <Field label="Email">{formerResident.email}</Field>
                </>
              ) : (
                <div style={{fontSize:13,color:'#61707D',padding:'6px 0'}}>Vacant — no resident assigned to this unit.</div>
              )}
            </Section>

            {assignment && (
              <Section label={assignment.tenure === 'Owner' ? 'Ownership' : 'Lease'}>
                {assignment.tenure === 'Owner' ? (
                  <Field label="Ownership start">{assignment.ownership_start}</Field>
                ) : (
                  <>
                    <Field label="Monthly payment">{assignment.monthly_payment_aed ? fmt(assignment.monthly_payment_aed) : '—'}</Field>
                    <Field label="Lease start">{assignment.lease_start}</Field>
                    <Field label="Lease end">{assignment.lease_end}</Field>
                  </>
                )}
              </Section>
            )}

            <Section label={'Outstanding Invoices' + (invoices.length ? ' · ' + invoices.length : '')}>
              {invoices.length === 0 ? (
                <div style={{fontSize:13,color:'#61707D',padding:'6px 0'}}>No unpaid invoices for this unit ✓</div>
              ) : (
                <>
                  <table className="data-table" style={{fontSize:12}}>
                    <thead>
                      <tr>
                        <th style={{width:'18%'}}>Invoice</th>
                        <th style={{width:'42%'}}>Description</th>
                        <th style={{width:'14%'}}>Due</th>
                        <th style={{width:'12%'}}>Status</th>
                        <th style={{width:'14%',textAlign:'right'}}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map(i => (
                        <tr key={i.id}>
                          <td style={{fontWeight:500}}>{i.invoice_number || '—'}</td>
                          <td style={{maxWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={i.description}>{i.description}</td>
                          <td>{i.due_date || '—'}</td>
                          <td>{i.status}</td>
                          <td style={{textAlign:'right',color:'#8b4a42',fontWeight:600}}>{fmt(i.amount_aed)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{marginTop:10,paddingTop:10,borderTop:'1px solid #E6EAE9',display:'flex',justifyContent:'flex-end',fontSize:13}}>
                    Total outstanding:&nbsp;<strong style={{color:'#8b4a42'}}>{fmt(totalOutstanding)}</strong>
                  </div>
                </>
              )}
            </Section>

            <Section label="Photos & Documents">
              <button className="btn" onClick={() => setShowAttachments(true)}>Manage attachments</button>
            </Section>
          </>
        )}
      </div>
    </div>
    {showAttachments && <UnitAttachmentsModal unit={unit} buildingName={building.name} onClose={() => setShowAttachments(false)}/>}
    </>
  );
};
