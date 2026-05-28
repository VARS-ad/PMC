// ==================== VENDORS / MAINTENANCE COMPANIES ====================
// Master list of maintenance / service companies the PMC has contracts with.
// Backed by public.vendors + vendor_buildings (M2M) + vendor_payments
// + vendor_documents. Document files live in the private storage bucket
// `maintenance-documents`. RLS allows PMC-only access. See
// supabase/migrations/0007_vendors.sql for the schema.

// Service categories and statuses are stored as canonical English strings in
// the DB (CHECK constraints enforce this). The UI translates them via t() at
// render time. PAYMENT_METHODS / PAYMENT_STATUSES likewise.
const VENDOR_CATEGORIES = [
  'Plumbing', 'Electrical', 'HVAC', 'Cleaning', 'Security', 'Gardening',
  'Pest Control', 'Lift Maintenance', 'General Handyman', 'Other',
];
const VENDOR_STATUSES   = ['Active', 'Expiring Soon', 'Expired', 'Terminated'];
const PAYMENT_STATUSES  = ['Pending', 'Paid', 'Overdue', 'Cancelled'];
const PAYMENT_METHODS   = ['Bank Transfer', 'Cheque', 'Cash', 'Credit Card', 'Other'];

// Document-kind metadata (no display label — that's i18n at render time).
const VENDOR_DOC_KINDS_META = [
  { kind: 'contract',        labelKey: 'vendors.doc.contracts', accept: '.pdf,image/*,.doc,.docx', multiple: true },
  { kind: 'payment_receipt', labelKey: 'vendors.doc.receipts',  accept: '.pdf,image/*',            multiple: true },
  { kind: 'invoice',         labelKey: 'vendors.doc.invoices',  accept: '.pdf,image/*',            multiple: true },
  { kind: 'other',           labelKey: 'vendors.doc.other',     accept: '*/*',                     multiple: true },
];

// Derive effective status from contract_end (overrides DB status unless terminated).
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

// Status badge — takes a canonical status string + optional translated label.
// If no label passed, falls back to the status string itself (English).
const vendorStatusBadge = (status, label) => {
  const c = ({
    'Active':         { bg: '#e6efe1', fg: '#5a6b4f' },
    'Expiring Soon':  { bg: '#fdf2dc', fg: '#a07d3c' },
    'Expired':        { bg: '#fdf2f1', fg: '#8b4a42' },
    'Terminated':     { bg: '#E6EAE9', fg: '#8a7e72' },
  })[status] || { bg: '#E6EAE9', fg: '#888' };
  return <span style={{padding:'3px 10px',borderRadius:4,fontSize:11,fontWeight:500,background:c.bg,color:c.fg}}>{label || status}</span>;
};
const paymentStatusBadge = (status, label) => {
  const c = ({
    'Paid':       { bg: '#e6efe1', fg: '#5a6b4f' },
    'Pending':    { bg: '#fdf2dc', fg: '#a07d3c' },
    'Overdue':    { bg: '#fdf2f1', fg: '#8b4a42' },
    'Cancelled':  { bg: '#E6EAE9', fg: '#8a7e72' },
  })[status] || { bg: '#E6EAE9', fg: '#888' };
  return <span style={{padding:'2px 8px',borderRadius:3,fontSize:10,fontWeight:600,background:c.bg,color:c.fg}}>{label || status}</span>;
};

// Lookup helpers: i18n keys for canonical status / payment-status strings.
const _statusKey  = (s) => 'vendors.status.' + ({ 'Active':'active','Expiring Soon':'expiringSoon','Expired':'expired','Terminated':'terminated' }[s] || 'active');
const _payKey     = (s) => 'vendors.pay.'    + ({ 'Paid':'paid','Pending':'pending','Overdue':'overdue','Cancelled':'overdue' }[s] || 'pending');

const fmtAED = (n) => 'AED ' + (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });

// =====================================================================
// VendorEditModal — create or edit a vendor record + sync buildings M2M
// =====================================================================
const VendorEditModal = ({ vendor, buildings, vendorBuildingIds, onSaved, onClose }) => {
  const { t } = useApp();
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={e => e.stopPropagation()} style={{maxWidth: 720, maxHeight: '90vh', overflowY: 'auto'}}>
        <div className="modal-header">
          <div>
            <h2>{isNew ? t('vendors.modal.add') : t('vendors.modal.edit')}</h2>
            <div className="modal-sub">{isNew ? t('vendors.subtitle') : vendor.name}</div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap: 14}}>
          <div className="form-group">
            <label>{t('vendors.field.companyName')} <span style={{color:'#8b4a42'}}>*</span></label>
            <input className="form-input" value={form.name} onChange={e => setForm({...form, name: e.target.value})}/>
          </div>
          <div className="form-group">
            <label>{t('vendors.field.serviceCategory')} <span style={{color:'#8b4a42'}}>*</span></label>
            <select className="form-input" value={form.service_category} onChange={e => setForm({...form, service_category: e.target.value})}>
              {VENDOR_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label>{t('vendors.field.contactPerson')}</label>
            <input className="form-input" value={form.contact_person} onChange={e => setForm({...form, contact_person: e.target.value})}/>
          </div>
          <div className="form-group">
            <label>{t('vendors.filter.status')}</label>
            <select className="form-input" value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
              {VENDOR_STATUSES.map(s => <option key={s} value={s}>{t(_statusKey(s))}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label>{t('vendors.field.phone')}</label>
            <input className="form-input" value={form.contact_phone} onChange={e => setForm({...form, contact_phone: e.target.value})} placeholder="+971 ..."/>
          </div>
          <div className="form-group">
            <label>{t('vendors.field.email')}</label>
            <input type="email" className="form-input" value={form.contact_email} onChange={e => setForm({...form, contact_email: e.target.value})}/>
          </div>

          <div className="form-group" style={{gridColumn: 'span 2'}}>
            <label>{t('vendors.field.address')}</label>
            <input className="form-input" value={form.address} onChange={e => setForm({...form, address: e.target.value})}/>
          </div>

          <div className="form-group">
            <label>{t('vendors.field.contractStart')}</label>
            <input type="date" className="form-input" value={form.contract_start} onChange={e => setForm({...form, contract_start: e.target.value})}/>
          </div>
          <div className="form-group">
            <label>{t('vendors.field.contractEnd')}</label>
            <input type="date" className="form-input" value={form.contract_end} onChange={e => setForm({...form, contract_end: e.target.value})}/>
          </div>

          <div className="form-group">
            <label>{t('vendors.field.contractValueAed')}</label>
            <input type="number" className="form-input" value={form.contract_value_aed} onChange={e => setForm({...form, contract_value_aed: e.target.value})} min="0" step="100"/>
          </div>
          <div className="form-group">
            <label>{t('vendors.field.tradeLicenseNum')}</label>
            <input className="form-input" value={form.trade_license} onChange={e => setForm({...form, trade_license: e.target.value})}/>
          </div>

          <div className="form-group">
            <label>{t('vendors.field.trnLong')}</label>
            <input className="form-input" value={form.trn_number} onChange={e => setForm({...form, trn_number: e.target.value})}/>
          </div>
          <div/>

          <div className="form-group" style={{gridColumn: 'span 2'}}>
            <label>{t('vendors.field.buildings')}</label>
            {buildings.length === 0 ? (
              <div style={{fontSize: 12, color: 'var(--text-muted)', padding: 8, background: 'var(--bg-surface)', borderRadius: 4}}>—</div>
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
            <label>{t('vendors.field.notes')}</label>
            <textarea className="form-input" rows={3} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})}/>
          </div>
        </div>

        {error && <div style={{color:'#8b4a42', fontSize: 12, marginTop: 12}}>{error}</div>}

        <div className="btn-group" style={{marginTop: 20, justifyContent: 'flex-end'}}>
          <button className="btn" onClick={onClose}>{t('vendors.btn.cancel')}</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? t('vendors.btn.saving') : (isNew ? t('vendors.btn.create') : t('vendors.btn.save'))}
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
  const { t } = useApp();
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
          <h2>{isNew ? t('vendors.modal.addPay') : t('vendors.modal.editPay')}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap: 14}}>
          <div className="form-group">
            <label>{t('vendors.pay.th.invoice')}</label>
            <input className="form-input" value={form.invoice_number} onChange={e => setForm({...form, invoice_number: e.target.value})}/>
          </div>
          <div className="form-group">
            <label>{t('vendors.pay.th.date')}</label>
            <input type="date" className="form-input" value={form.invoice_date} onChange={e => setForm({...form, invoice_date: e.target.value})}/>
          </div>
          <div className="form-group" style={{gridColumn: 'span 2'}}>
            <label>{t('vendors.pay.th.description')} <span style={{color:'#8b4a42'}}>*</span></label>
            <input className="form-input" value={form.description} onChange={e => setForm({...form, description: e.target.value})}/>
          </div>
          <div className="form-group">
            <label>{t('vendors.filter.category')}</label>
            <input className="form-input" value={form.category} onChange={e => setForm({...form, category: e.target.value})}/>
          </div>
          <div className="form-group">
            <label>{t('vendors.pay.th.amount')} (AED) <span style={{color:'#8b4a42'}}>*</span></label>
            <input type="number" className="form-input" value={form.amount_aed} onChange={e => setForm({...form, amount_aed: e.target.value})} min="0" step="0.01"/>
          </div>
          <div className="form-group">
            <label>{t('vendors.pay.th.status')}</label>
            <select className="form-input" value={form.payment_status} onChange={e => setForm({...form, payment_status: e.target.value})}>
              {PAYMENT_STATUSES.map(s => <option key={s} value={s}>{t(_payKey(s))}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>{t('vendors.pay.paid')} ({t('vendors.pay.th.date').toLowerCase()})</label>
            <input type="date" className="form-input" value={form.paid_date} onChange={e => setForm({...form, paid_date: e.target.value})}/>
          </div>
          <div className="form-group">
            <label>Method</label>
            <select className="form-input" value={form.payment_method} onChange={e => setForm({...form, payment_method: e.target.value})}>
              <option value="">—</option>
              {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Reference #</label>
            <input className="form-input" value={form.payment_reference} onChange={e => setForm({...form, payment_reference: e.target.value})}/>
          </div>
          <div className="form-group" style={{gridColumn: 'span 2'}}>
            <label>{t('vendors.field.notes')}</label>
            <textarea className="form-input" rows={2} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})}/>
          </div>
        </div>

        {error && <div style={{color:'#8b4a42', fontSize: 12, marginTop: 12}}>{error}</div>}

        <div className="btn-group" style={{marginTop: 16, justifyContent: 'flex-end'}}>
          <button className="btn" onClick={onClose}>{t('vendors.btn.cancel')}</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? t('vendors.btn.saving') : t('vendors.btn.save')}
          </button>
        </div>
      </div>
    </div>
  );
};

// =====================================================================
// RenewContractModal — bump contract dates + value + optional new file
// =====================================================================
const RenewContractModal = ({ vendor, onSaved, onClose }) => {
  const { t } = useApp();
  const fileRef = useRef(null);
  const [form, setForm] = useState({
    contract_start: new Date().toISOString().slice(0, 10),
    contract_end:   '',
    contract_value_aed: vendor.contract_value_aed || '',
  });
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);

  const handleRenew = async () => {
    if (!form.contract_start || !form.contract_end) { setError('Both dates are required'); return; }
    if (new Date(form.contract_end) <= new Date(form.contract_start)) { setError('End must be after start'); return; }
    setSaving(true); setError(null);
    try {
      // 1) update vendor row
      const { error: ue } = await supabaseClient.from('vendors').update({
        contract_start:     form.contract_start,
        contract_end:       form.contract_end,
        contract_value_aed: form.contract_value_aed === '' ? null : Number(form.contract_value_aed),
        status:             'Active',
        updated_at:         new Date().toISOString(),
      }).eq('id', vendor.id);
      if (ue) throw ue;

      // 2) if a new file was attached, upload it + insert document metadata
      if (file) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = vendor.id + '/contract-' + Date.now() + '-' + safeName;
        const { error: upErr } = await supabaseClient.storage.from('maintenance-documents').upload(path, file);
        if (upErr) throw upErr;
        const { error: insErr } = await supabaseClient.from('vendor_documents').insert({
          vendor_id: vendor.id, kind: 'contract', filename: file.name, storage_path: path,
        });
        if (insErr) throw insErr;
      }
      onSaved();
    } catch (e) { setError(e.message || String(e)); }
    setSaving(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{maxWidth: 520}}>
        <div className="modal-header">
          <div>
            <h2>{t('vendors.renew.title')} — {vendor.name}</h2>
            <div className="modal-sub">{t('vendors.renew.intro')}</div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div style={{padding:'10px 12px', background:'var(--bg-surface)', borderRadius: 6, fontSize: 12, marginBottom: 16}}>
          <span style={{color:'var(--text-muted)'}}>{t('vendors.renew.currentEnd')}:</span>{' '}
          <strong>{vendor.contract_end || '—'}</strong>
        </div>

        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap: 14}}>
          <div className="form-group">
            <label>{t('vendors.renew.newStart')}</label>
            <input type="date" className="form-input" value={form.contract_start} onChange={e => setForm({...form, contract_start: e.target.value})}/>
          </div>
          <div className="form-group">
            <label>{t('vendors.renew.newEnd')}</label>
            <input type="date" className="form-input" value={form.contract_end} onChange={e => setForm({...form, contract_end: e.target.value})}/>
          </div>
          <div className="form-group" style={{gridColumn: 'span 2'}}>
            <label>{t('vendors.renew.newValue')}</label>
            <input type="number" className="form-input" value={form.contract_value_aed} onChange={e => setForm({...form, contract_value_aed: e.target.value})} min="0" step="100"/>
          </div>
          <div className="form-group" style={{gridColumn: 'span 2'}}>
            <label>{t('vendors.renew.uploadNew')}</label>
            <input ref={fileRef} type="file" accept=".pdf,image/*,.doc,.docx" style={{display:'none'}} onChange={e => setFile(e.target.files && e.target.files[0])}/>
            <div style={{display:'flex', alignItems:'center', gap: 10}}>
              <button className="btn btn-sm" onClick={() => fileRef.current && fileRef.current.click()}>Choose file…</button>
              <span style={{fontSize: 12, color: 'var(--text-muted)'}}>{file ? file.name : '—'}</span>
              {file && <button onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ''; }} style={{background:'none',border:'none',color:'#8b4a42',cursor:'pointer',fontSize:11}}>×</button>}
            </div>
          </div>
        </div>

        {error && <div style={{color:'#8b4a42', fontSize: 12, marginTop: 12}}>{error}</div>}

        <div className="btn-group" style={{marginTop: 18, justifyContent: 'flex-end'}}>
          <button className="btn" onClick={onClose}>{t('vendors.btn.cancel')}</button>
          <button className="btn btn-primary" onClick={handleRenew} disabled={saving}>
            {saving ? t('vendors.renew.confirming') : t('vendors.renew.btn')}
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
  const { t } = useApp();
  const [tab, setTab] = useState('details');
  const [documents, setDocuments] = useState(null);
  const [uploadingKind, setUploadingKind] = useState(null);
  const [payments, setPayments] = useState(null);
  const [editingPayment, setEditingPayment] = useState(null);
  const [showRenew, setShowRenew] = useState(false);
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

  const effectiveStatus = deriveVendorStatus(vendor);
  const canRenew = effectiveStatus === 'Expired' || effectiveStatus === 'Expiring Soon';

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
            <div style={{marginTop: 6}}>{vendorStatusBadge(effectiveStatus, t(_statusKey(effectiveStatus)))}</div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div style={{display:'flex', gap: 8, marginBottom: 18}}>
          <TabBtn id="details"   label={t('vendors.tab.details')}/>
          <TabBtn id="documents" label={t('vendors.tab.documents')} count={documents ? documents.length : null}/>
          <TabBtn id="payments"  label={t('vendors.tab.payments')}  count={payments ? payments.length : null}/>
        </div>

        {error && <div style={{color:'#8b4a42', fontSize: 12, marginBottom: 12}}>{error}</div>}

        {tab === 'details' && (
          <div>
            <div style={{display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap: 16, marginBottom: 18}}>
              <Field label={t('vendors.field.contactPerson')}  value={vendor.contact_person}/>
              <Field label={t('vendors.field.phone')}          value={vendor.contact_phone}/>
              <Field label={t('vendors.field.email')}          value={vendor.contact_email}/>
              <Field label={t('vendors.field.address')}        value={vendor.address}/>
              <Field label={t('vendors.field.contractStart')}  value={vendor.contract_start}/>
              <Field label={t('vendors.field.contractEnd')}    value={vendor.contract_end}/>
              <Field label={t('vendors.field.contractValue')}  value={vendor.contract_value_aed != null ? fmtAED(vendor.contract_value_aed) : null}/>
              <Field label={t('vendors.field.tradeLicense')}   value={vendor.trade_license}/>
              <Field label={t('vendors.field.trn')}            value={vendor.trn_number}/>
              <Field label={t('vendors.field.buildings')}      value={buildingNames.length ? buildingNames.join(', ') : null}/>
            </div>
            {vendor.notes && (
              <div style={{padding:'12px 14px', background:'var(--bg-surface)', borderRadius: 6, fontSize: 13, lineHeight: 1.55, marginBottom: 18}}>
                {vendor.notes}
              </div>
            )}
            <div className="btn-group" style={{justifyContent: 'space-between', alignItems: 'center'}}>
              <button className="btn btn-danger btn-sm" onClick={handleDeleteVendor}>{t('vendors.btn.delete')}</button>
              <div className="btn-group">
                {canRenew && (
                  <button className="btn btn-outline" onClick={() => setShowRenew(true)}>{t('vendors.btn.renew')}</button>
                )}
                <button className="btn btn-primary" onClick={onEdit}>{t('vendors.btn.edit')}</button>
              </div>
            </div>
          </div>
        )}

        {tab === 'documents' && (
          <div>
            {VENDOR_DOC_KINDS_META.map(meta => {
              const section = { kind: meta.kind, label: t(meta.labelKey), accept: meta.accept, multiple: meta.multiple };
              const files = (documents || []).filter(d => d.kind === meta.kind);
              return (
                <UnitAttachmentSection
                  key={meta.kind}
                  section={section}
                  files={files}
                  uploading={uploadingKind === meta.kind}
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
              <div className="kpi-row" style={{gridTemplateColumns:'repeat(4, minmax(0, 1fr))',marginBottom: 14}}>
                <div className="kpi-card"><div className="label">{t('vendors.pay.totalBilled')}</div><div className="value" style={{fontSize:18}}>{fmtAED(totals.total)}</div></div>
                <div className="kpi-card"><div className="label">{t('vendors.pay.paid')}</div><div className="value" style={{fontSize:18, color:'#5a6b4f'}}>{fmtAED(totals.paid)}</div></div>
                <div className="kpi-card"><div className="label">{t('vendors.pay.pending')}</div><div className="value" style={{fontSize:18, color:'#a07d3c'}}>{fmtAED(totals.pending)}</div></div>
                <div className="kpi-card"><div className="label">{t('vendors.pay.overdue')}</div><div className="value" style={{fontSize:18, color:'#8b4a42'}}>{fmtAED(totals.overdue)}</div></div>
              </div>
            )}
            <div style={{display:'flex', justifyContent:'flex-end', marginBottom: 10}}>
              <button className="btn btn-primary btn-sm" onClick={() => setEditingPayment({})}>{t('vendors.pay.addBtn')}</button>
            </div>
            {payments === null ? (
              <div style={{fontSize: 12, color: 'var(--text-muted)', padding: 12}}>{t('vendors.loading')}</div>
            ) : payments.length === 0 ? (
              <div style={{fontSize: 12, color: 'var(--text-muted)', padding: 24, textAlign: 'center', background:'var(--bg-surface)', borderRadius: 6}}>
                {t('vendors.pay.empty')}
              </div>
            ) : (
              <table className="data-table" style={{fontSize: 12}}>
                <thead>
                  <tr>
                    <th style={{width:'14%'}}>{t('vendors.pay.th.invoice')}</th>
                    <th style={{width:'14%'}}>{t('vendors.pay.th.date')}</th>
                    <th style={{width:'40%'}}>{t('vendors.pay.th.description')}</th>
                    <th style={{width:'12%',textAlign:'right'}}>{t('vendors.pay.th.amount')}</th>
                    <th style={{width:'15%'}}>{t('vendors.pay.th.status')}</th>
                    <th style={{width:'5%'}}></th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map(p => (
                    <tr key={p.id} style={{cursor:'pointer'}} onClick={() => setEditingPayment(p)}>
                      <td>{p.invoice_number || '—'}</td>
                      <td>{p.invoice_date || '—'}</td>
                      <td>{p.description}</td>
                      <td style={{textAlign:'right'}}>{fmtAED(p.amount_aed)}</td>
                      <td>{paymentStatusBadge(p.payment_status, t(_payKey(p.payment_status)))}</td>
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

        {showRenew && (
          <RenewContractModal
            vendor={vendor}
            onSaved={() => { setShowRenew(false); if (onChanged) onChanged(); onClose(); }}
            onClose={() => setShowRenew(false)}
          />
        )}
      </div>
    </div>
  );
};

// =====================================================================
// PMCVendorsPage — main list page
// =====================================================================
const PMCVendorsPage = ({ setPage }) => {
  const { t } = useApp();
  const [vendors, setVendors] = useState(null);
  const [buildings, setBuildings] = useState([]);
  const [vendorBuildings, setVendorBuildings] = useState({});
  const [paymentTotalsByVendor, setPaymentTotalsByVendor] = useState({});
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [outstandingOnly, setOutstandingOnly] = useState(false);
  const [editingVendor, setEditingVendor] = useState(null);
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
        const t2 = totMap[p.vendor_id] = totMap[p.vendor_id] || { paid: 0, outstanding: 0, total: 0 };
        const amt = Number(p.amount_aed) || 0;
        t2.total += amt;
        if (p.payment_status === 'Paid') t2.paid += amt;
        if (p.payment_status === 'Pending' || p.payment_status === 'Overdue') t2.outstanding += amt;
      });
      setVendors((vs || []).map(v => ({ ...v, _effectiveStatus: deriveVendorStatus(v) })));
      setBuildings(bs || []);
      setVendorBuildings(vbMap);
      setPaymentTotalsByVendor(totMap);
    } catch (e) { setError(e.message || String(e)); }
  };
  useEffect(() => { load(); }, []);

  const outstandingOf = (v) => paymentTotalsByVendor[v.id]?.outstanding || 0;

  const filtered = (vendors || []).filter(v => {
    if (categoryFilter !== 'all' && v.service_category !== categoryFilter) return false;
    if (statusFilter   !== 'all' && v._effectiveStatus  !== statusFilter)   return false;
    if (outstandingOnly && outstandingOf(v) <= 0) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = (v.name + ' ' + (v.contact_person || '') + ' ' + (v.contact_phone || '') + ' ' + (v.contact_email || '') + ' ' + v.service_category).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const counts = {
    total:           filtered.length,
    active:          filtered.filter(v => v._effectiveStatus === 'Active').length,
    expiring:        filtered.filter(v => v._effectiveStatus === 'Expiring Soon').length,
    expired:         filtered.filter(v => v._effectiveStatus === 'Expired').length,
    withOutstanding: filtered.filter(v => outstandingOf(v) > 0).length,
  };

  const exportRows = filtered.map(v => ({
    ...v,
    buildings_covered: (vendorBuildings[v.id] || []).map(bid => buildings.find(b => b.id === bid)?.name).filter(Boolean).join(', '),
    paid_total:        paymentTotalsByVendor[v.id]?.paid || 0,
    outstanding_total: outstandingOf(v),
    effective_status:  v._effectiveStatus,
  }));

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t('vendors.title')}</h1>
          <div className="subtitle">{t('vendors.subtitle')}</div>
        </div>
        <div className="btn-group">
          <button className="btn" onClick={() => setShowExport(true)} disabled={!vendors || vendors.length === 0}>{t('vendors.exportBtn')}</button>
          {setPage && (
            <button className="btn" onClick={() => { try { window._profileCreationInitialSection = 'vendors'; } catch(e) {} setPage('profileCreation'); }}>
              Bulk Upload…
            </button>
          )}
          <button className="btn btn-primary" onClick={() => setEditingVendor({})}>{t('vendors.addBtn')}</button>
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
          'Category Filter':   categoryFilter === 'all' ? 'All' : categoryFilter,
          'Status Filter':     statusFilter   === 'all' ? 'All' : statusFilter,
          'Outstanding Only':  outstandingOnly ? 'Yes' : 'No',
          'Search':            search || '—',
          'Active':            String(counts.active),
          'Expiring Soon':     String(counts.expiring),
          'Expired':           String(counts.expired),
          'With Outstanding':  String(counts.withOutstanding),
        }}
      />

      <div className="kpi-row" style={{gridTemplateColumns:'repeat(5, minmax(0, 1fr))'}}>
        <div className="kpi-card"><div className="label">{t('vendors.kpi.total')}</div><div className="value">{counts.total}</div></div>
        <div className="kpi-card"><div className="label">{t('vendors.kpi.active')}</div><div className="value" style={{color:'#5a6b4f'}}>{counts.active}</div></div>
        <div className="kpi-card"><div className="label">{t('vendors.kpi.expiringSoon')}</div><div className="value" style={{color:'#a07d3c'}}>{counts.expiring}</div></div>
        <div className="kpi-card"><div className="label">{t('vendors.kpi.expired')}</div><div className="value" style={{color:'#8b4a42'}}>{counts.expired}</div></div>
        <div className="kpi-card" style={{cursor:'pointer', borderColor: outstandingOnly ? 'var(--bg-warm-dark)' : undefined}} onClick={() => setOutstandingOnly(!outstandingOnly)}>
          <div className="label">{t('vendors.kpi.outstanding')}</div>
          <div className="value" style={{color:'#8b4a42'}}>{counts.withOutstanding}</div>
        </div>
      </div>

      <div className="card">
        <div style={{display:'flex', gap: 12, flexWrap: 'wrap', alignItems:'flex-end', marginBottom: 14}}>
          <div style={{flex: '1 1 180px'}}>
            <label style={{fontSize: 10, letterSpacing:'0.06em', textTransform:'uppercase', color:'var(--text-secondary)', marginBottom: 6, display:'block', fontWeight: 500}}>{t('vendors.filter.search')}</label>
            <input className="form-input" placeholder={t('vendors.filter.searchPlaceholder')} value={search} onChange={e => setSearch(e.target.value)}/>
          </div>
          <div style={{flex: '0 0 180px'}}>
            <label style={{fontSize: 10, letterSpacing:'0.06em', textTransform:'uppercase', color:'var(--text-secondary)', marginBottom: 6, display:'block', fontWeight: 500}}>{t('vendors.filter.category')}</label>
            <select className="form-input" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
              <option value="all">{t('vendors.filter.allCategories')}</option>
              {VENDOR_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={{flex: '0 0 160px'}}>
            <label style={{fontSize: 10, letterSpacing:'0.06em', textTransform:'uppercase', color:'var(--text-secondary)', marginBottom: 6, display:'block', fontWeight: 500}}>{t('vendors.filter.status')}</label>
            <select className="form-input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="all">{t('vendors.filter.allStatuses')}</option>
              {VENDOR_STATUSES.map(s => <option key={s} value={s}>{t(_statusKey(s))}</option>)}
            </select>
          </div>
          <label style={{display:'flex', alignItems:'center', gap: 8, padding:'9px 12px', background: outstandingOnly ? 'var(--accent-warm-light)' : 'var(--bg-surface)', border:'1px solid var(--border-light)', borderRadius:4, fontSize:12, cursor:'pointer', whiteSpace:'nowrap'}}>
            <input type="checkbox" checked={outstandingOnly} onChange={e => setOutstandingOnly(e.target.checked)}/>
            <span>{t('vendors.filter.outstandingOnly')}</span>
          </label>
        </div>

        {error && <div style={{color:'#8b4a42', fontSize: 12, marginBottom: 12}}>{error}</div>}

        {vendors === null ? (
          <div style={{padding: 24, color: 'var(--text-muted)', fontSize: 13}}>{t('vendors.loading')}</div>
        ) : filtered.length === 0 ? (
          <div style={{padding: 40, color: 'var(--text-muted)', fontSize: 13, textAlign: 'center'}}>
            {vendors.length === 0 ? t('vendors.empty.none') : t('vendors.empty.noMatch')}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th style={{width:'22%'}}>{t('vendors.th.vendor')}</th>
                <th style={{width:'12%'}}>{t('vendors.th.category')}</th>
                <th style={{width:'18%'}}>{t('vendors.th.contact')}</th>
                <th style={{width:'16%'}}>{t('vendors.th.contract')}</th>
                <th style={{width:'10%',textAlign:'right'}}>{t('vendors.th.value')}</th>
                <th style={{width:'12%',textAlign:'right'}}>{t('vendors.th.outstanding')}</th>
                <th style={{width:'10%'}}>{t('vendors.th.status')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(v => {
                const out = outstandingOf(v);
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
                      <span className="sub">→ {v.contract_end || '—'}</span>
                    </td>
                    <td style={{textAlign:'right'}}>{v.contract_value_aed != null ? fmtAED(v.contract_value_aed) : '—'}</td>
                    <td style={{textAlign:'right', color: out > 0 ? '#8b4a42' : 'var(--text-muted)'}}>{out > 0 ? fmtAED(out) : '—'}</td>
                    <td>{vendorStatusBadge(v._effectiveStatus, t(_statusKey(v._effectiveStatus)))}</td>
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
