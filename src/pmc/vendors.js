// ==================== VENDORS / MAINTENANCE COMPANIES ====================
// Master list of maintenance / service companies the PMC has contracts with.
// Backed by public.vendors + vendor_buildings (M2M) + vendor_payments
// + vendor_documents. Document files live in the private storage bucket
// `maintenance-documents`. RLS allows PMC-only access. See
// supabase/migrations/0007_vendors.sql for the schema.

const VENDOR_CATEGORIES = [
  'Plumbing', 'Electrical', 'HVAC', 'Cleaning', 'Security', 'Gardening',
  'Pest Control', 'Lift Maintenance', 'General Handyman', 'Other',
];
const VENDOR_STATUSES   = ['Active', 'Expiring Soon', 'Expired', 'Terminated'];
const PAYMENT_STATUSES  = ['Pending', 'Paid', 'Overdue', 'Cancelled'];
const PAYMENT_METHODS   = ['Bank Transfer', 'Cheque', 'Cash', 'Credit Card', 'Other'];

const VENDOR_DOC_KINDS = [
  { kind: 'contract',         label: 'Contracts',                              accept: '.pdf,image/*,.doc,.docx', multiple: true },
  { kind: 'payment_receipt',  label: 'Payment Receipts',                       accept: '.pdf,image/*',            multiple: true },
  { kind: 'invoice',          label: 'Invoices',                               accept: '.pdf,image/*',            multiple: true },
  { kind: 'other',            label: 'Trade License / Certificates / Other',   accept: '*/*',                     multiple: true },
];

// Derive effective status from contract_end (overrides DB status unless terminated).
// Pure function — used by both the list view and the detail badges.
const deriveVendorStatus = (v) => {
  if (!v) return 'Active';
  if (v.status === 'Terminated') return 'Terminated';
  if (!v.contract_end) return v.status || 'Active';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const end = new Date(v.contract_end);
  const daysLeft = Math.ceil((end - today) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0)   return 'Expired';
  if (daysLeft <= 60) return 'Expiring Soon';
  return v.status || 'Active';
};

const vendorStatusBadge = (s) => {
  const c = ({
    'Active':         { bg: '#e6efe1', fg: '#5a6b4f' },
    'Expiring Soon':  { bg: '#fdf2dc', fg: '#a07d3c' },
    'Expired':        { bg: '#fdf2f1', fg: '#8b4a42' },
    'Terminated':     { bg: '#f5f3f0', fg: '#8a7e72' },
  })[s] || { bg: '#f5f3f0', fg: '#888' };
  return <span style={{padding:'3px 10px',borderRadius:4,fontSize:11,fontWeight:500,background:c.bg,color:c.fg}}>{s}</span>;
};

const paymentStatusBadge = (s) => {
  const c = ({
    'Paid':       { bg: '#e6efe1', fg: '#5a6b4f' },
    'Pending':    { bg: '#fdf2dc', fg: '#a07d3c' },
    'Overdue':    { bg: '#fdf2f1', fg: '#8b4a42' },
    'Cancelled':  { bg: '#f5f3f0', fg: '#8a7e72' },
  })[s] || { bg: '#f5f3f0', fg: '#888' };
  return <span style={{padding:'2px 8px',borderRadius:3,fontSize:10,fontWeight:600,background:c.bg,color:c.fg}}>{s}</span>;
};

const fmtAED = (n) => 'AED ' + (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });

// =====================================================================
// VendorEditModal — create or edit a vendor record + sync buildings M2M
// =====================================================================
const VendorEditModal = ({ vendor, buildings, vendorBuildingIds, onSaved, onClose }) => {
  const isNew = !vendor || !vendor.id;
  const [form, setForm] = useState(() => ({
    name:               vendor?.name               || '',
    service_category:   vendor?.service_category   || 'Plumbing',
    contact_person:     vendor?.contact_person     || '',
    contact_phone:      vendor?.contact_phone      || '',
    contact_email:      vendor?.contact_email      || '',
    address:            vendor?.address            || '',
    contract_start:     vendor?.contract_start     || '',
    contract_end:       vendor?.contract_end       || '',
    contract_value_aed: vendor?.contract_value_aed || '',
    trade_license:      vendor?.trade_license      || '',
    trn_number:         vendor?.trn_number         || '',
    status:             vendor?.status             || 'Active',
    notes:              vendor?.notes              || '',
  }));
  const [selectedBuildings, setSelectedBuildings] = useState(() => new Set(vendorBuildingIds || []));
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);

  const toggleBuilding = (id) => {
    const next = new Set(selectedBuildings);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedBuildings(next);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Name is required'); return; }
    setSaving(true); setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        service_category: form.service_category,
        contact_person: form.contact_person.trim() || null,
        contact_phone:  form.contact_phone.trim()  || null,
        contact_email:  form.contact_email.trim()  || null,
        address:        form.address.trim()        || null,
        contract_start: form.contract_start || null,
        contract_end:   form.contract_end   || null,
        contract_value_aed: form.contract_value_aed === '' ? null : Number(form.contract_value_aed),
        trade_license:  form.trade_license.trim()  || null,
        trn_number:     form.trn_number.trim()     || null,
        status:         form.status,
        notes:          form.notes.trim()          || null,
        updated_at:     new Date().toISOString(),
      };
      let vendorId = vendor?.id;
      if (isNew) {
        const { data, error: e } = await supabaseClient.from('vendors').insert(payload).select('id').single();
        if (e) throw e;
        vendorId = data.id;
      } else {
        const { error: e } = await supabaseClient.from('vendors').update(payload).eq('id', vendorId);
        if (e) throw e;
      }
      // Sync buildings M2M: delete-all + insert
      await supabaseClient.from('vendor_buildings').delete().eq('vendor_id', vendorId);
      const rows = [...selectedBuildings].map(b => ({ vendor_id: vendorId, building_id: b }));
      if (rows.length) {
        const { error: ie } = await supabaseClient.from('vendor_buildings').insert(rows);
        if (ie) throw ie;
      }
      onSaved(vendorId);
    } catch (e) {
      setError(e.message || String(e));
    }
    setSaving(false);
  };

  const F = ({label, children, required}) => (
    <div className="form-group">
      <label>{label}{required && <span style={{color:'#8b4a42'}}> *</span>}</label>
      {children}
    </div>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={e => e.stopPropagation()} style={{maxWidth: 720, maxHeight: '90vh', overflowY: 'auto'}}>
        <div className="modal-header">
          <div>
            <h2>{isNew ? 'Add Vendor' : 'Edit Vendor'}</h2>
            <div className="modal-sub">{isNew ? 'Create a new maintenance company record.' : vendor.name}</div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap: 14}}>
          <F label="Company Name" required>
            <input className="form-input" value={form.name} onChange={e => setForm({...form, name: e.target.value})}/>
          </F>
          <F label="Service Category" required>
            <select className="form-input" value={form.service_category} onChange={e => setForm({...form, service_category: e.target.value})}>
              {VENDOR_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </F>

          <F label="Contact Person">
            <input className="form-input" value={form.contact_person} onChange={e => setForm({...form, contact_person: e.target.value})}/>
          </F>
          <F label="Status">
            <select className="form-input" value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
              {VENDOR_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </F>

          <F label="Phone">
            <input className="form-input" value={form.contact_phone} onChange={e => setForm({...form, contact_phone: e.target.value})} placeholder="+971 ..."/>
          </F>
          <F label="Email">
            <input type="email" className="form-input" value={form.contact_email} onChange={e => setForm({...form, contact_email: e.target.value})}/>
          </F>

          <div className="form-group" style={{gridColumn: 'span 2'}}>
            <label>Address</label>
            <input className="form-input" value={form.address} onChange={e => setForm({...form, address: e.target.value})}/>
          </div>

          <F label="Contract Start">
            <input type="date" className="form-input" value={form.contract_start} onChange={e => setForm({...form, contract_start: e.target.value})}/>
          </F>
          <F label="Contract End">
            <input type="date" className="form-input" value={form.contract_end} onChange={e => setForm({...form, contract_end: e.target.value})}/>
          </F>

          <F label="Contract Value (AED)">
            <input type="number" className="form-input" value={form.contract_value_aed} onChange={e => setForm({...form, contract_value_aed: e.target.value})} min="0" step="100"/>
          </F>
          <F label="Trade License #">
            <input className="form-input" value={form.trade_license} onChange={e => setForm({...form, trade_license: e.target.value})}/>
          </F>

          <F label="TRN (Tax Reg. Number)">
            <input className="form-input" value={form.trn_number} onChange={e => setForm({...form, trn_number: e.target.value})}/>
          </F>
          <div/>

          <div className="form-group" style={{gridColumn: 'span 2'}}>
            <label>Buildings Covered</label>
            {buildings.length === 0 ? (
              <div style={{fontSize: 12, color: 'var(--text-muted)', padding: 8, background: 'var(--bg-surface)', borderRadius: 4}}>
                No buildings on file. Add buildings under Profile Creation first.
              </div>
            ) : (
              <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(180px, 1fr))', gap: 6}}>
                {buildings.map(b => (
                  <label key={b.id} style={{display:'flex', alignItems:'center', gap: 8, padding:'6px 10px', background: selectedBuildings.has(b.id) ? 'var(--accent-warm-light)' : 'var(--bg-surface)', border:'1px solid var(--border-light)', borderRadius:4, fontSize:12, cursor:'pointer'}}>
                    <input type="checkbox" checked={selectedBuildings.has(b.id)} onChange={() => toggleBuilding(b.id)}/>
                    <span>{b.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="form-group" style={{gridColumn: 'span 2'}}>
            <label>Notes</label>
            <textarea className="form-input" rows={3} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})}/>
          </div>
        </div>

        {error && <div style={{color:'#8b4a42', fontSize: 12, marginTop: 12}}>{error}</div>}

        <div className="btn-group" style={{marginTop: 20, justifyContent: 'flex-end'}}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : (isNew ? 'Create Vendor' : 'Save Changes')}
          </button>
        </div>
      </div>
    </div>
  );
};

// =====================================================================
// VendorPaymentEditModal — add or edit a single payment / invoice record
// =====================================================================
const VendorPaymentEditModal = ({ vendorId, payment, onSaved, onClose }) => {
  const isNew = !payment || !payment.id;
  const [form, setForm] = useState(() => ({
    invoice_number:    payment?.invoice_number    || '',
    invoice_date:      payment?.invoice_date      || '',
    description:       payment?.description       || '',
    category:          payment?.category          || '',
    amount_aed:        payment?.amount_aed        || '',
    payment_status:    payment?.payment_status    || 'Pending',
    paid_date:         payment?.paid_date         || '',
    payment_method:    payment?.payment_method    || '',
    payment_reference: payment?.payment_reference || '',
    notes:             payment?.notes             || '',
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);

  const handleSave = async () => {
    if (!form.description.trim()) { setError('Description is required'); return; }
    if (form.amount_aed === '' || Number(form.amount_aed) < 0) { setError('Amount must be 0 or more'); return; }
    setSaving(true); setError(null);
    try {
      const payload = {
        vendor_id:         vendorId,
        invoice_number:    form.invoice_number.trim()    || null,
        invoice_date:      form.invoice_date              || null,
        description:       form.description.trim(),
        category:          form.category.trim()           || null,
        amount_aed:        Number(form.amount_aed),
        payment_status:    form.payment_status,
        paid_date:         form.paid_date                 || null,
        payment_method:    form.payment_method            || null,
        payment_reference: form.payment_reference.trim()  || null,
        notes:             form.notes.trim()              || null,
      };
      if (isNew) {
        const { error: e } = await supabaseClient.from('vendor_payments').insert(payload);
        if (e) throw e;
      } else {
        const { error: e } = await supabaseClient.from('vendor_payments').update(payload).eq('id', payment.id);
        if (e) throw e;
      }
      onSaved();
    } catch (e) { setError(e.message || String(e)); }
    setSaving(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{maxWidth: 560}}>
        <div className="modal-header">
          <h2>{isNew ? 'Add Payment / Invoice' : 'Edit Payment'}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap: 14}}>
          <div className="form-group">
            <label>Invoice #</label>
            <input className="form-input" value={form.invoice_number} onChange={e => setForm({...form, invoice_number: e.target.value})}/>
          </div>
          <div className="form-group">
            <label>Invoice Date</label>
            <input type="date" className="form-input" value={form.invoice_date} onChange={e => setForm({...form, invoice_date: e.target.value})}/>
          </div>
          <div className="form-group" style={{gridColumn: 'span 2'}}>
            <label>Description <span style={{color:'#8b4a42'}}>*</span></label>
            <input className="form-input" value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Quarterly AC servicing"/>
          </div>
          <div className="form-group">
            <label>Category</label>
            <input className="form-input" value={form.category} onChange={e => setForm({...form, category: e.target.value})} placeholder="Routine, One-off, Emergency..."/>
          </div>
          <div className="form-group">
            <label>Amount (AED) <span style={{color:'#8b4a42'}}>*</span></label>
            <input type="number" className="form-input" value={form.amount_aed} onChange={e => setForm({...form, amount_aed: e.target.value})} min="0" step="0.01"/>
          </div>
          <div className="form-group">
            <label>Status</label>
            <select className="form-input" value={form.payment_status} onChange={e => setForm({...form, payment_status: e.target.value})}>
              {PAYMENT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Paid Date</label>
            <input type="date" className="form-input" value={form.paid_date} onChange={e => setForm({...form, paid_date: e.target.value})}/>
          </div>
          <div className="form-group">
            <label>Payment Method</label>
            <select className="form-input" value={form.payment_method} onChange={e => setForm({...form, payment_method: e.target.value})}>
              <option value="">—</option>
              {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Reference #</label>
            <input className="form-input" value={form.payment_reference} onChange={e => setForm({...form, payment_reference: e.target.value})} placeholder="Cheque / transaction #"/>
          </div>
          <div className="form-group" style={{gridColumn: 'span 2'}}>
            <label>Notes</label>
            <textarea className="form-input" rows={2} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})}/>
          </div>
        </div>

        {error && <div style={{color:'#8b4a42', fontSize: 12, marginTop: 12}}>{error}</div>}

        <div className="btn-group" style={{marginTop: 16, justifyContent: 'flex-end'}}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};

// =====================================================================
// VendorDetailModal — Details / Documents / Payments tabs
// =====================================================================
const VendorDetailModal = ({ vendor, buildings, vendorBuildingIds, onClose, onEdit, onDeleted, onChanged }) => {
  const [tab, setTab] = useState('details');
  const [documents, setDocuments] = useState(null);
  const [uploadingKind, setUploadingKind] = useState(null);
  const [payments, setPayments] = useState(null);
  const [editingPayment, setEditingPayment] = useState(null);
  const [error, setError] = useState(null);

  const loadDocs = async () => {
    const { data, error: e } = await supabaseClient.from('vendor_documents')
      .select('id,kind,filename,storage_path,created_at')
      .eq('vendor_id', vendor.id)
      .order('created_at', { ascending: false });
    if (e) setError(e.message); else setDocuments(data || []);
  };
  const loadPayments = async () => {
    const { data, error: e } = await supabaseClient.from('vendor_payments')
      .select('*')
      .eq('vendor_id', vendor.id)
      .order('invoice_date', { ascending: false, nullsFirst: false });
    if (e) setError(e.message); else setPayments(data || []);
  };

  useEffect(() => { loadDocs(); loadPayments(); }, [vendor.id]);

  const handleUploadDoc = async (kind, file) => {
    if (!file) return;
    setUploadingKind(kind); setError(null);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = vendor.id + '/' + kind + '-' + Date.now() + '-' + safeName;
    const { error: upErr } = await supabaseClient.storage.from('maintenance-documents').upload(path, file);
    if (upErr) { setError('Upload failed: ' + upErr.message); setUploadingKind(null); return; }
    const { error: insErr } = await supabaseClient.from('vendor_documents').insert({
      vendor_id: vendor.id, kind, filename: file.name, storage_path: path,
    });
    if (insErr) setError('Metadata insert failed: ' + insErr.message);
    setUploadingKind(null);
    await loadDocs();
  };

  const handleDeleteDoc = async (doc) => {
    if (!window.confirm('Delete ' + doc.filename + '?')) return;
    await supabaseClient.storage.from('maintenance-documents').remove([doc.storage_path]);
    await supabaseClient.from('vendor_documents').delete().eq('id', doc.id);
    await loadDocs();
  };

  const handleDeletePayment = async (p) => {
    if (!window.confirm('Delete this payment record?')) return;
    await supabaseClient.from('vendor_payments').delete().eq('id', p.id);
    await loadPayments();
    if (onChanged) onChanged();
  };

  const handleDeleteVendor = async () => {
    if (!window.confirm('Delete vendor "' + vendor.name + '" and all its documents and payments? This cannot be undone.')) return;
    // Delete files from Storage first (the metadata cascades, but bucket objects don't)
    const { data: docs } = await supabaseClient.from('vendor_documents').select('storage_path').eq('vendor_id', vendor.id);
    if (docs && docs.length) {
      await supabaseClient.storage.from('maintenance-documents').remove(docs.map(d => d.storage_path));
    }
    await supabaseClient.from('vendors').delete().eq('id', vendor.id);
    onDeleted();
  };

  const buildingNames = (vendorBuildingIds || [])
    .map(id => buildings.find(b => b.id === id)?.name)
    .filter(Boolean);

  const totals = (payments || []).reduce((acc, p) => {
    const amt = Number(p.amount_aed) || 0;
    if (p.payment_status === 'Paid')      acc.paid    += amt;
    if (p.payment_status === 'Pending')   acc.pending += amt;
    if (p.payment_status === 'Overdue')   acc.overdue += amt;
    acc.total += amt;
    return acc;
  }, { total: 0, paid: 0, pending: 0, overdue: 0 });

  const TabBtn = ({ id, label, count }) => (
    <button
      onClick={() => setTab(id)}
      style={{
        padding: '8px 14px',
        background: tab === id ? 'var(--bg-warm-dark)' : '#fff',
        color: tab === id ? '#fff' : 'var(--text-secondary)',
        border: '1px solid ' + (tab === id ? 'var(--bg-warm-dark)' : 'var(--border-light)'),
        borderRadius: 4,
        fontSize: 12,
        fontWeight: 500,
        cursor: 'pointer',
      }}>
      {label}{count != null ? ' (' + count + ')' : ''}
    </button>
  );

  const Field = ({label, value}) => (
    <div>
      <div style={{fontSize:10, letterSpacing:'0.06em', textTransform:'uppercase', color:'var(--text-muted)', marginBottom: 4}}>{label}</div>
      <div style={{fontSize:13, color:'var(--text-dark)'}}>{value || '—'}</div>
    </div>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={e => e.stopPropagation()} style={{maxWidth: 820, maxHeight: '90vh', overflowY: 'auto'}}>
        <div className="modal-header">
          <div>
            <div style={{fontSize:10, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--text-muted)', marginBottom: 4}}>{vendor.service_category}</div>
            <h2>{vendor.name}</h2>
            <div style={{marginTop: 6}}>{vendorStatusBadge(deriveVendorStatus(vendor))}</div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div style={{display:'flex', gap: 8, marginBottom: 18}}>
          <TabBtn id="details" label="Details"/>
          <TabBtn id="documents" label="Documents" count={documents ? documents.length : null}/>
          <TabBtn id="payments" label="Payments" count={payments ? payments.length : null}/>
        </div>

        {error && <div style={{color:'#8b4a42', fontSize: 12, marginBottom: 12}}>{error}</div>}

        {tab === 'details' && (
          <div>
            <div style={{display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap: 16, marginBottom: 18}}>
              <Field label="Contact Person"     value={vendor.contact_person}/>
              <Field label="Phone"              value={vendor.contact_phone}/>
              <Field label="Email"              value={vendor.contact_email}/>
              <Field label="Address"            value={vendor.address}/>
              <Field label="Contract Start"     value={vendor.contract_start}/>
              <Field label="Contract End"       value={vendor.contract_end}/>
              <Field label="Contract Value"     value={vendor.contract_value_aed != null ? fmtAED(vendor.contract_value_aed) : null}/>
              <Field label="Trade License"      value={vendor.trade_license}/>
              <Field label="TRN"                value={vendor.trn_number}/>
              <Field label="Buildings Covered"  value={buildingNames.length ? buildingNames.join(', ') : null}/>
            </div>
            {vendor.notes && (
              <div style={{padding:'12px 14px', background:'var(--bg-surface)', borderRadius: 6, fontSize: 13, lineHeight: 1.55, marginBottom: 18}}>
                {vendor.notes}
              </div>
            )}
            <div className="btn-group" style={{justifyContent: 'space-between'}}>
              <button className="btn btn-danger btn-sm" onClick={handleDeleteVendor}>Delete Vendor</button>
              <button className="btn btn-primary" onClick={onEdit}>Edit</button>
            </div>
          </div>
        )}

        {tab === 'documents' && (
          <div>
            {VENDOR_DOC_KINDS.map(section => {
              const files = (documents || []).filter(d => d.kind === section.kind);
              return (
                <UnitAttachmentSection
                  key={section.kind}
                  section={section}
                  files={files}
                  uploading={uploadingKind === section.kind}
                  onUpload={handleUploadDoc}
                  onDelete={handleDeleteDoc}
                  bucket="maintenance-documents"
                />
              );
            })}
          </div>
        )}

        {tab === 'payments' && (
          <div>
            {payments !== null && payments.length > 0 && (
              <div className="kpi-row" style={{marginBottom: 14}}>
                <div className="kpi-card"><div className="label">Total Billed</div><div className="value" style={{fontSize:18}}>{fmtAED(totals.total)}</div></div>
                <div className="kpi-card"><div className="label">Paid</div><div className="value" style={{fontSize:18, color:'#5a6b4f'}}>{fmtAED(totals.paid)}</div></div>
                <div className="kpi-card"><div className="label">Pending</div><div className="value" style={{fontSize:18, color:'#a07d3c'}}>{fmtAED(totals.pending)}</div></div>
                <div className="kpi-card"><div className="label">Overdue</div><div className="value" style={{fontSize:18, color:'#8b4a42'}}>{fmtAED(totals.overdue)}</div></div>
              </div>
            )}
            <div style={{display:'flex', justifyContent:'flex-end', marginBottom: 10}}>
              <button className="btn btn-primary btn-sm" onClick={() => setEditingPayment({})}>+ Add Payment</button>
            </div>
            {payments === null ? (
              <div style={{fontSize: 12, color: 'var(--text-muted)', padding: 12}}>Loading…</div>
            ) : payments.length === 0 ? (
              <div style={{fontSize: 12, color: 'var(--text-muted)', padding: 24, textAlign: 'center', background:'var(--bg-surface)', borderRadius: 6}}>
                No payments recorded for this vendor yet.
              </div>
            ) : (
              <table className="data-table" style={{fontSize: 12}}>
                <thead>
                  <tr>
                    <th>Invoice #</th><th>Date</th><th>Description</th><th style={{textAlign:'right'}}>Amount</th><th>Status</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map(p => (
                    <tr key={p.id} style={{cursor:'pointer'}} onClick={() => setEditingPayment(p)}>
                      <td>{p.invoice_number || '—'}</td>
                      <td>{p.invoice_date || '—'}</td>
                      <td>{p.description}</td>
                      <td style={{textAlign:'right'}}>{fmtAED(p.amount_aed)}</td>
                      <td>{paymentStatusBadge(p.payment_status)}</td>
                      <td style={{textAlign:'right'}}><button onClick={(e) => { e.stopPropagation(); handleDeletePayment(p); }} style={{background:'none', border:'none', color:'#8b4a42', cursor:'pointer', fontSize: 11}}>×</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {editingPayment && (
              <VendorPaymentEditModal
                vendorId={vendor.id}
                payment={editingPayment}
                onSaved={() => { setEditingPayment(null); loadPayments(); if (onChanged) onChanged(); }}
                onClose={() => setEditingPayment(null)}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// =====================================================================
// PMCVendorsPage — main list page
// =====================================================================
const PMCVendorsPage = () => {
  const [vendors, setVendors] = useState(null);
  const [buildings, setBuildings] = useState([]);
  const [vendorBuildings, setVendorBuildings] = useState({}); // id -> [building_id]
  const [paymentTotalsByVendor, setPaymentTotalsByVendor] = useState({}); // id -> {paid, outstanding}
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [editingVendor, setEditingVendor] = useState(null);     // null | {} | vendor
  const [detailVendor, setDetailVendor] = useState(null);
  const [showExport, setShowExport] = useState(false);

  const load = async () => {
    setError(null);
    if (!supabaseClient) { setError('Supabase not initialized'); return; }
    try {
      const [{ data: vs, error: e1 }, { data: bs }, { data: vbs }, { data: vpays }] = await Promise.all([
        supabaseClient.from('vendors').select('*').order('name'),
        supabaseClient.from('buildings').select('id,name').order('name'),
        supabaseClient.from('vendor_buildings').select('vendor_id,building_id'),
        supabaseClient.from('vendor_payments').select('vendor_id,amount_aed,payment_status'),
      ]);
      if (e1) throw e1;
      const vbMap = {};
      (vbs || []).forEach(vb => {
        (vbMap[vb.vendor_id] = vbMap[vb.vendor_id] || []).push(vb.building_id);
      });
      const totMap = {};
      (vpays || []).forEach(p => {
        const t = totMap[p.vendor_id] = totMap[p.vendor_id] || { paid: 0, outstanding: 0, total: 0 };
        const amt = Number(p.amount_aed) || 0;
        t.total += amt;
        if (p.payment_status === 'Paid') t.paid += amt;
        if (p.payment_status === 'Pending' || p.payment_status === 'Overdue') t.outstanding += amt;
      });
      setVendors((vs || []).map(v => ({ ...v, _effectiveStatus: deriveVendorStatus(v) })));
      setBuildings(bs || []);
      setVendorBuildings(vbMap);
      setPaymentTotalsByVendor(totMap);
    } catch (e) { setError(e.message || String(e)); }
  };
  useEffect(() => { load(); }, []);

  const filtered = (vendors || []).filter(v => {
    if (categoryFilter !== 'all' && v.service_category !== categoryFilter) return false;
    if (statusFilter   !== 'all' && v._effectiveStatus  !== statusFilter)   return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = (v.name + ' ' + (v.contact_person || '') + ' ' + (v.contact_phone || '') + ' ' + (v.contact_email || '') + ' ' + v.service_category).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const counts = {
    total:      filtered.length,
    active:     filtered.filter(v => v._effectiveStatus === 'Active').length,
    expiring:   filtered.filter(v => v._effectiveStatus === 'Expiring Soon').length,
    expired:    filtered.filter(v => v._effectiveStatus === 'Expired').length,
  };

  // Rows enriched for Export / Print (buildings + payment totals merged in)
  const exportRows = filtered.map(v => ({
    ...v,
    buildings_covered: (vendorBuildings[v.id] || [])
                         .map(bid => buildings.find(b => b.id === bid)?.name)
                         .filter(Boolean).join(', '),
    paid_total:        paymentTotalsByVendor[v.id]?.paid || 0,
    outstanding_total: paymentTotalsByVendor[v.id]?.outstanding || 0,
    effective_status:  v._effectiveStatus,
  }));

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Vendors</h1>
          <div className="subtitle">Maintenance companies under contract — details, documents, and payment tracking.</div>
        </div>
        <div className="btn-group">
          <button className="btn" onClick={() => setShowExport(true)} disabled={!vendors || vendors.length === 0}>Export / Print</button>
          <button className="btn btn-primary" onClick={() => setEditingVendor({})}>+ Add Vendor</button>
        </div>
      </div>

      <ExportPrintModal
        isOpen={showExport}
        onClose={() => setShowExport(false)}
        title="Vendors"
        sheetName="Vendors"
        filenameBase="vendors"
        rows={exportRows}
        dateField="contract_start"
        columns={[
          { key: 'name',                header: 'Vendor',           width: 24 },
          { key: 'service_category',    header: 'Category',         width: 14 },
          { key: 'contact_person',      header: 'Contact',          width: 18 },
          { key: 'contact_phone',       header: 'Phone',            width: 16 },
          { key: 'contact_email',       header: 'Email',            width: 22 },
          { key: 'buildings_covered',   header: 'Buildings',        width: 24 },
          { key: 'contract_start',      header: 'Start',            width: 12 },
          { key: 'contract_end',        header: 'End',              width: 12 },
          { key: 'contract_value_aed',  header: 'Contract (AED)',   width: 14, halign: 'right', numeric: true },
          { key: 'paid_total',          header: 'Paid (AED)',       width: 14, halign: 'right', numeric: true },
          { key: 'outstanding_total',   header: 'Outstanding (AED)',width: 16, halign: 'right', numeric: true },
          { key: 'trade_license',       header: 'License',          width: 14 },
          { key: 'trn_number',          header: 'TRN',              width: 14 },
          { key: 'effective_status',    header: 'Status',           width: 12 },
        ]}
        extraMetadata={{
          'Category Filter': categoryFilter === 'all' ? 'All' : categoryFilter,
          'Status Filter':   statusFilter   === 'all' ? 'All' : statusFilter,
          'Search':          search || '—',
          'Active':          String(counts.active),
          'Expiring Soon':   String(counts.expiring),
          'Expired':         String(counts.expired),
        }}
      />

      <div className="kpi-row">
        <div className="kpi-card"><div className="label">Total Vendors</div><div className="value">{counts.total}</div></div>
        <div className="kpi-card"><div className="label">Active</div><div className="value" style={{color:'#5a6b4f'}}>{counts.active}</div></div>
        <div className="kpi-card"><div className="label">Expiring Soon</div><div className="value" style={{color:'#a07d3c'}}>{counts.expiring}</div></div>
        <div className="kpi-card"><div className="label">Expired</div><div className="value" style={{color:'#8b4a42'}}>{counts.expired}</div></div>
      </div>

      <div className="card">
        <div style={{display:'flex', gap: 12, flexWrap: 'wrap', alignItems:'flex-end', marginBottom: 14}}>
          <div style={{flex: '1 1 180px'}}>
            <label style={{fontSize: 10, letterSpacing:'0.06em', textTransform:'uppercase', color:'var(--text-secondary)', marginBottom: 6, display:'block', fontWeight: 500}}>Search</label>
            <input className="form-input" placeholder="Name, contact, phone, email…" value={search} onChange={e => setSearch(e.target.value)}/>
          </div>
          <div style={{flex: '0 0 180px'}}>
            <label style={{fontSize: 10, letterSpacing:'0.06em', textTransform:'uppercase', color:'var(--text-secondary)', marginBottom: 6, display:'block', fontWeight: 500}}>Category</label>
            <select className="form-input" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
              <option value="all">All categories</option>
              {VENDOR_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={{flex: '0 0 160px'}}>
            <label style={{fontSize: 10, letterSpacing:'0.06em', textTransform:'uppercase', color:'var(--text-secondary)', marginBottom: 6, display:'block', fontWeight: 500}}>Status</label>
            <select className="form-input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="all">All statuses</option>
              {VENDOR_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {error && <div style={{color:'#8b4a42', fontSize: 12, marginBottom: 12}}>{error}</div>}

        {vendors === null ? (
          <div style={{padding: 24, color: 'var(--text-muted)', fontSize: 13}}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{padding: 40, color: 'var(--text-muted)', fontSize: 13, textAlign: 'center'}}>
            {vendors.length === 0 ? 'No vendors yet. Click "Add Vendor" to create the first one.' : 'No vendors match the current filters.'}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Vendor</th>
                <th>Category</th>
                <th>Contact</th>
                <th>Contract</th>
                <th style={{textAlign:'right'}}>Value (AED)</th>
                <th style={{textAlign:'right'}}>Outstanding</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(v => {
                const tot = paymentTotalsByVendor[v.id] || { outstanding: 0 };
                return (
                  <tr key={v.id} style={{cursor: 'pointer'}} onClick={() => setDetailVendor(v)}>
                    <td className="name-cell">
                      {v.name}
                      {v.address && <span className="sub">{v.address}</span>}
                    </td>
                    <td>{v.service_category}</td>
                    <td>
                      {v.contact_person || '—'}
                      {v.contact_phone && <span className="sub">{v.contact_phone}</span>}
                    </td>
                    <td>
                      {v.contract_start || '—'}
                      <span className="sub">to {v.contract_end || '—'}</span>
                    </td>
                    <td style={{textAlign:'right'}}>{v.contract_value_aed != null ? fmtAED(v.contract_value_aed) : '—'}</td>
                    <td style={{textAlign:'right', color: tot.outstanding > 0 ? '#8b4a42' : 'var(--text-muted)'}}>{tot.outstanding > 0 ? fmtAED(tot.outstanding) : '—'}</td>
                    <td>{vendorStatusBadge(v._effectiveStatus)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {editingVendor && (
        <VendorEditModal
          vendor={editingVendor}
          buildings={buildings}
          vendorBuildingIds={editingVendor?.id ? vendorBuildings[editingVendor.id] : []}
          onSaved={async () => { setEditingVendor(null); await load(); }}
          onClose={() => setEditingVendor(null)}
        />
      )}

      {detailVendor && !editingVendor && (
        <VendorDetailModal
          vendor={detailVendor}
          buildings={buildings}
          vendorBuildingIds={vendorBuildings[detailVendor.id] || []}
          onClose={() => setDetailVendor(null)}
          onEdit={() => setEditingVendor(detailVendor)}
          onDeleted={async () => { setDetailVendor(null); await load(); }}
          onChanged={load}
        />
      )}
    </div>
  );
};
