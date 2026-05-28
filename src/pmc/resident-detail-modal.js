// ==================== RESIDENT DETAIL MODAL ====================
// One stop for everything a PMC needs on a single tenant: personal details,
// contract & tenancy, payment history (paid / outstanding / future), and
// documents. Opens from the Profile Creation residents summary and from the
// Properties page drill-downs. The "Download Data" button opens the shared
// ExportPrintModal so the tenant statement uses the same PDF/Excel/CSV
// pipeline (and brand template) as every other PMC export.

const ResidentDetailModal = ({ resident, onClose }) => {
  // The caller passes a profile-shaped object enriched with building / unit
  // / assignment fields. We additionally load:
  //   • profile.emirates_id + emergency contact + employer + occupation
  //     (newly-added columns the caller may not have selected)
  //   • the resident's email via the get_emails_for_profiles RPC
  //   • invoices for the resident (drives the payment history section)
  //   • documents (unchanged)
  const [extra, setExtra] = useState(null);           // { emirates_id, emergency_*, employer, occupation, email }
  const [invoices, setInvoices] = useState(null);
  const [documents, setDocuments] = useState(null);
  const [uploadingKind, setUploadingKind] = useState(null);
  const [error, setError] = useState(null);
  const [showDownload, setShowDownload] = useState(false);

  const reloadDocs = async () => {
    const { data, error: e } = await supabaseClient.from('resident_documents')
      .select('id,kind,filename,storage_path,created_at')
      .eq('profile_id', resident.id)
      .order('created_at', { ascending: false });
    if (e) setError(e.message); else setDocuments(data || []);
  };

  useEffect(() => {
    if (!supabaseClient) return;
    let mounted = true;
    (async () => {
      try {
        const [{ data: prof }, emailRes, { data: invs }] = await Promise.all([
          supabaseClient.from('profiles')
            .select('emirates_id,emergency_contact_name,emergency_contact_phone,employer,occupation')
            .eq('id', resident.id).maybeSingle(),
          supabaseClient.rpc('get_emails_for_profiles', { p_ids: [resident.id] }),
          supabaseClient.from('invoices')
            .select('id,invoice_number,description,amount_aed,due_date,status,source_type,created_at')
            .eq('resident_profile_id', resident.id)
            .order('due_date', { ascending: false, nullsFirst: false }),
        ]);
        if (!mounted) return;
        const emailRow = emailRes && emailRes.data && emailRes.data[0];
        setExtra({ ...(prof || {}), email: emailRow ? emailRow.email : null });
        setInvoices(invs || []);
      } catch (e) { if (mounted) setError(e.message || String(e)); }
      await reloadDocs();
    })();
    return () => { mounted = false; };
  }, [resident.id]);

  // === Upload / delete handlers (unchanged behaviour) ===
  const handleUpload = async (kind, file) => {
    if (!file || !supabaseClient) return;
    setUploadingKind(kind); setError(null);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = resident.id + '/' + kind + '-' + Date.now() + '-' + safeName;
    const { error: upErr } = await supabaseClient.storage.from('resident-documents').upload(path, file);
    if (upErr) { setError('Upload failed: ' + upErr.message); setUploadingKind(null); return; }
    const { error: insErr } = await supabaseClient.from('resident_documents').insert({
      profile_id: resident.id, kind, filename: file.name, storage_path: path,
    });
    if (insErr) setError('Metadata: ' + insErr.message);
    setUploadingKind(null);
    await reloadDocs();
  };
  const handleDelete = async (doc) => {
    if (!supabaseClient) return;
    if (!window.confirm('Delete ' + doc.filename + '?')) return;
    await supabaseClient.storage.from('resident-documents').remove([doc.storage_path]);
    await supabaseClient.from('resident_documents').delete().eq('id', doc.id);
    await reloadDocs();
  };

  const docSections = [
    { kind: 'emirates_id',      label: 'Emirates ID',         accept: '.pdf,image/*', multiple: false },
    { kind: 'passport',         label: 'Passport copy',       accept: '.pdf,image/*', multiple: false },
    { kind: 'tenancy_contract', label: 'Tenancy Contract',    accept: '.pdf',         multiple: false },
    { kind: 'owning_contract',  label: 'Ownership Contract',  accept: '.pdf',         multiple: false },
    { kind: 'title_deed',       label: 'Title Deed (copy)',   accept: '.pdf',         multiple: false },
    { kind: 'other',            label: 'Other Documents',     accept: '*/*',          multiple: true  },
  ];
  const groupedDocs = (documents || []).reduce((acc, d) => { (acc[d.kind] = acc[d.kind] || []).push(d); return acc; }, {});

  // === Split invoices into Paid / Outstanding / Future ===
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const splitInvoices = (invoices || []).reduce((acc, inv) => {
    const amt = Number(inv.amount_aed) || 0;
    acc.total += amt;
    if (inv.status === 'Paid') {
      acc.paid.push(inv); acc.paidTotal += amt;
    } else if (inv.status === 'Pending' || inv.status === 'Overdue') {
      const due = inv.due_date ? new Date(inv.due_date) : null;
      if (due && due > today) { acc.future.push(inv); acc.futureTotal += amt; }
      else                    { acc.outstanding.push(inv); acc.outstandingTotal += amt; }
    }
    return acc;
  }, { paid: [], outstanding: [], future: [], paidTotal: 0, outstandingTotal: 0, futureTotal: 0, total: 0 });

  const fmt = (n) => 'AED ' + Math.round(Number(n) || 0).toLocaleString('en-US');


  // === UI helpers ===
  const InfoCell = ({ label, value }) => (
    <div>
      <div style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:2}}>{label}</div>
      <div style={{fontSize:13,color:'var(--text-dark)'}}>{value || '—'}</div>
    </div>
  );
  const SectionTitle = ({ children, right }) => (
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:18,marginBottom:10}}>
      <div style={{fontSize:11,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:500}}>{children}</div>
      {right}
    </div>
  );

  const PaymentTable = ({ rows, kind }) => {
    if (!rows || rows.length === 0) return null;
    const isPaid = kind === 'paid';
    return (
      <table className="data-table" style={{fontSize: 12, marginBottom: 10}}>
        <thead>
          <tr>
            <th>Invoice #</th>
            <th>Description</th>
            <th>Due</th>
            <th style={{textAlign:'right'}}>Amount</th>
            {!isPaid && <th>Status</th>}
            <th style={{textAlign:'center',width:70}}>Invoice</th>
            <th style={{textAlign:'center',width:90}}>Proof of payment</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(inv => (
            <tr key={inv.id}>
              <td>{inv.invoice_number || '—'}</td>
              <td>{inv.description}</td>
              <td>{inv.due_date || '—'}</td>
              <td style={{textAlign:'right'}}>{fmt(inv.amount_aed)}</td>
              {!isPaid && (
                <td>
                  <span style={{padding:'2px 8px',borderRadius:3,fontSize:10,fontWeight:600,background: inv.status === 'Overdue' ? '#fdf2f1' : '#fdf2dc',color: inv.status === 'Overdue' ? '#8b4a42' : '#a07d3c'}}>
                    {inv.status}
                  </span>
                </td>
              )}
              <InvoiceSlotCell invoice={inv} slot="invoice"/>
              <InvoiceSlotCell invoice={inv} slot="payment_proof"/>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={e => e.stopPropagation()} style={{maxWidth:820,maxHeight:'90vh',overflowY:'auto'}}>
        <div className="modal-header">
          <div>
            <div style={{fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:4}}>Resident</div>
            <h2>{resident.full_name}</h2>
            <div className="modal-sub">{resident.building_name} · Floor {resident.floor} · Unit {resident.unit_number}{resident.tenure ? ' · ' + resident.tenure : ''}</div>
          </div>
          <div className="btn-group">
            <button className="btn" onClick={() => setShowDownload(true)}>Download Data</button>
            <button className="modal-close" onClick={onClose}>×</button>
          </div>
        </div>

        {error && <div style={{padding:10,background:'#fdf2f1',color:'#8b4a42',borderRadius:6,fontSize:12,marginBottom:14}}>{error}</div>}

        {/* === Personal Details === */}
        <SectionTitle>Personal Details</SectionTitle>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3, 1fr)',gap:14,padding:16,background:'var(--bg-surface)',borderRadius:8,border:'1px solid var(--border-light)'}}>
          <InfoCell label="Emirates ID"      value={extra ? extra.emirates_id : '…'}/>
          <InfoCell label="Passport number"  value={resident.passport_number}/>
          <InfoCell label="Date of birth"    value={resident.date_of_birth}/>
          <InfoCell label="Phone"            value={resident.phone}/>
          <InfoCell label="Email"            value={extra ? extra.email : '…'}/>
          <InfoCell label="Resident since"   value={resident.created_at ? new Date(resident.created_at).toLocaleDateString() : null}/>
          <InfoCell label="Emergency name"   value={extra ? extra.emergency_contact_name : '…'}/>
          <InfoCell label="Emergency phone"  value={extra ? extra.emergency_contact_phone : '…'}/>
          <InfoCell label="Occupation"       value={extra ? extra.occupation : '…'}/>
          <InfoCell label="Employer"         value={extra ? extra.employer : '…'}/>
        </div>

        {/* === Contract === */}
        <SectionTitle>Contract & Tenancy</SectionTitle>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3, 1fr)',gap:14,padding:16,background:'var(--bg-surface)',borderRadius:8,border:'1px solid var(--border-light)'}}>
          <InfoCell label="Tenure" value={resident.tenure}/>
          {resident.tenure === 'Tenant' ? (<>
            <InfoCell label="Lease start"     value={resident.lease_start}/>
            <InfoCell label="Lease end"       value={resident.lease_end}/>
            <InfoCell label="Monthly rent"    value={resident.monthly_payment_aed != null ? fmt(resident.monthly_payment_aed) : null}/>
          </>) : resident.tenure === 'Owner' ? (<>
            <InfoCell label="Ownership since" value={resident.ownership_start}/>
            <InfoCell label="Monthly rent"    value="—"/>
            <InfoCell label=""                value=""/>
          </>) : (<>
            <InfoCell label=""                value=""/>
            <InfoCell label=""                value=""/>
            <InfoCell label=""                value=""/>
          </>)}
        </div>

        {/* === Payment History === */}
        <SectionTitle>Payment History</SectionTitle>
        {invoices === null ? (
          <div style={{padding:24,color:'var(--text-muted)',fontSize:13}}>Loading…</div>
        ) : invoices.length === 0 ? (
          <div style={{padding:24,color:'var(--text-muted)',fontSize:13,textAlign:'center',background:'var(--bg-surface)',borderRadius:6}}>
            No invoices on record for this resident yet.
          </div>
        ) : (
          <div>
            <div className="kpi-row" style={{marginBottom:14}}>
              <div className="kpi-card"><div className="label">Total Billed</div><div className="value" style={{fontSize:18}}>{fmt(splitInvoices.total)}</div></div>
              <div className="kpi-card"><div className="label">Paid</div><div className="value" style={{fontSize:18,color:'#5a6b4f'}}>{fmt(splitInvoices.paidTotal)}</div></div>
              <div className="kpi-card"><div className="label">Outstanding</div><div className="value" style={{fontSize:18,color:'#8b4a42'}}>{fmt(splitInvoices.outstandingTotal)}</div></div>
              <div className="kpi-card"><div className="label">Future</div><div className="value" style={{fontSize:18,color:'#a07d3c'}}>{fmt(splitInvoices.futureTotal)}</div></div>
            </div>

            {splitInvoices.outstanding.length > 0 && (
              <>
                <div style={{fontSize:12,fontWeight:600,color:'#8b4a42',marginBottom:6}}>Outstanding — needs collection</div>
                <PaymentTable rows={splitInvoices.outstanding}/>
              </>
            )}
            {splitInvoices.future.length > 0 && (
              <>
                <div style={{fontSize:12,fontWeight:600,color:'#a07d3c',marginBottom:6}}>Future — not yet due</div>
                <PaymentTable rows={splitInvoices.future}/>
              </>
            )}
            {splitInvoices.paid.length > 0 && (
              <>
                <div style={{fontSize:12,fontWeight:600,color:'#5a6b4f',marginBottom:6}}>Paid</div>
                <PaymentTable rows={splitInvoices.paid} kind="paid"/>
              </>
            )}
          </div>
        )}

        {/* === Documents (unchanged) === */}
        <SectionTitle>Documents</SectionTitle>
        {documents === null ? (
          <div style={{padding:24,color:'var(--text-muted)',fontSize:13}}>Loading…</div>
        ) : (
          <div>
            {docSections.map(s => (
              <UnitAttachmentSection key={s.kind} section={s} files={groupedDocs[s.kind] || []} uploading={uploadingKind === s.kind} onUpload={handleUpload} onDelete={handleDelete} bucket="resident-documents"/>
            ))}
          </div>
        )}
      </div>

      <ExportPrintModal
        isOpen={showDownload}
        onClose={() => setShowDownload(false)}
        dataTypes={[
          {
            id:           'payment_history',
            label:        'Payment History',
            title:        'Tenant Statement · ' + (resident.full_name || 'Resident'),
            sheetName:    'Payments',
            filenameBase: 'tenant_statement_' + String(resident.full_name || 'resident').replace(/\s+/g, '_'),
            dateField:    'due_date',
            rows: [
              ...splitInvoices.outstanding.map(i => ({ ...i, bucket: 'Outstanding' })),
              ...splitInvoices.future.map(i      => ({ ...i, bucket: 'Future' })),
              ...splitInvoices.paid.map(i        => ({ ...i, bucket: 'Paid' })),
            ],
            columns: [
              { key: 'invoice_number', header: 'Invoice #',    width: 14 },
              { key: 'description',    header: 'Description',  width: 32 },
              { key: 'bucket',         header: 'Bucket',       width: 12 },
              { key: 'status',         header: 'Status',       width: 12 },
              { key: 'due_date',       header: 'Due Date',     width: 12 },
              { key: 'amount_aed',     header: 'Amount (AED)', width: 14, halign: 'right', numeric: true },
              { key: 'created_at',     header: 'Issued',       width: 12,
                value: (r) => r.created_at ? new Date(r.created_at).toLocaleDateString() : '' },
            ],
            extraMetadata: {
              'Resident':       resident.full_name || '—',
              'Building':       resident.building_name || '—',
              'Unit':           resident.unit_number ? ('Unit ' + resident.unit_number + (resident.floor != null ? ' · Floor ' + resident.floor : '')) : '—',
              'Tenure':         resident.tenure || '—',
              'Phone':          resident.phone || '—',
              'Email':          (extra && extra.email) || '—',
              'Emirates ID':    (extra && extra.emirates_id) || '—',
              'Passport #':     resident.passport_number || '—',
              'Date of birth':  resident.date_of_birth || '—',
              'Lease start':    resident.lease_start || '—',
              'Lease end':      resident.lease_end || '—',
              'Monthly rent':   resident.monthly_payment_aed ? ('AED ' + Math.round(Number(resident.monthly_payment_aed)).toLocaleString()) : '—',
              'Total Billed':   'AED ' + Math.round(splitInvoices.total).toLocaleString(),
              'Paid':           'AED ' + Math.round(splitInvoices.paidTotal).toLocaleString(),
              'Outstanding':    'AED ' + Math.round(splitInvoices.outstandingTotal).toLocaleString(),
              'Future':         'AED ' + Math.round(splitInvoices.futureTotal).toLocaleString(),
            },
          },
        ]}
      />
    </div>
  );
};
