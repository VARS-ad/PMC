// ==================== VENDOR INVOICE DOCS ====================
// Same single-slot pattern as <InvoiceSlotCell>, adapted for vendor
// invoices. Each vendor_payments row gets two cells, one per slot:
//   • <VendorSlotCell payment vendorId slot="invoice"         />
//   • <VendorSlotCell payment vendorId slot="payment_receipt" />
// Multiple files per slot are allowed (vendor_documents has no UNIQUE).
// Files live in `maintenance-documents` under
// {vendor_id}/payment-{payment_id}/{kind}/{filename}.

const VENDOR_DOCS_BUCKET = 'maintenance-documents';

const VENDOR_SLOT_META = {
  invoice:         { label: 'Invoice',          hint: 'The bill the vendor sent us' },
  payment_receipt: { label: 'Proof of payment', hint: 'Our receipt / bank slip for paying them' },
};

const VendorSlotCell = ({ payment, vendorId, slot }) => {
  const [docs, setDocs] = useState(null);
  const [open, setOpen] = useState(false);

  const reload = async () => {
    if (!supabaseClient || !payment || !payment.id) { setDocs([]); return; }
    const { data } = await supabaseClient
      .from('vendor_documents')
      .select('id,kind,filename,storage_path,created_at')
      .eq('payment_id', payment.id)
      .eq('kind', slot)
      .order('created_at', { ascending: false });
    setDocs(data || []);
  };
  useEffect(() => { reload(); }, [payment && payment.id, slot]);

  const count = (docs || []).length;
  const filled = count > 0;

  return (
    <>
      <td
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        style={{whiteSpace:'nowrap',cursor:'pointer',textAlign:'center'}}
        title={
          docs === null ? 'Loading…'
          : filled      ? count + ' file' + (count === 1 ? '' : 's') + ' attached — click to manage'
          :               'No files yet — click to upload'
        }
      >
        {docs === null ? (
          <span style={{fontSize:10,color:'var(--text-muted)'}}>…</span>
        ) : (
          <SlotPill filled={filled} count={count}/>
        )}
      </td>
      {open && (
        <VendorSlotModal
          payment={payment}
          vendorId={vendorId}
          slot={slot}
          docs={docs || []}
          onClose={() => setOpen(false)}
          onChange={reload}
        />
      )}
    </>
  );
};

const VendorSlotFileRow = ({ doc, onChange }) => {
  const [signedUrl, setSignedUrl] = useState(null);
  const [busy, setBusy]           = useState(false);

  useEffect(() => {
    if (!doc || !supabaseClient) return;
    let mounted = true;
    supabaseClient.storage.from(VENDOR_DOCS_BUCKET)
      .createSignedUrl(doc.storage_path, 300)
      .then(({ data }) => { if (mounted) setSignedUrl(data && data.signedUrl); });
    return () => { mounted = false; };
  }, [doc && doc.id]);

  const doDelete = async () => {
    if (!doc || !supabaseClient) return;
    if (!window.confirm('Delete "' + doc.filename + '"?')) return;
    setBusy(true);
    try {
      await supabaseClient.storage.from(VENDOR_DOCS_BUCKET).remove([doc.storage_path]);
      await supabaseClient.from('vendor_documents').delete().eq('id', doc.id);
      await onChange();
    } catch (e) { /* ignored */ }
    setBusy(false);
  };

  return (
    <div style={{padding:'10px 12px',background:'var(--bg-surface)',border:'1px solid var(--border-light)',borderRadius:6,marginBottom:8}}>
      <div style={{fontSize:12,fontWeight:500,wordBreak:'break-all',color:'var(--text-dark)',marginBottom:4}}>{doc.filename}</div>
      <div style={{fontSize:10,color:'var(--text-muted)',marginBottom:8}}>uploaded {new Date(doc.created_at).toLocaleDateString()}</div>
      <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
        {signedUrl ? (
          <a className="btn btn-sm" href={signedUrl} target="_blank" rel="noopener" style={{textDecoration:'none'}}>View</a>
        ) : (
          <button className="btn btn-sm" disabled>View</button>
        )}
        <button className="btn btn-sm" disabled={busy} onClick={doDelete} style={{color:'#8b4a42'}}>Delete</button>
      </div>
    </div>
  );
};

const VendorSlotModal = ({ payment, vendorId, slot, docs, onClose, onChange }) => {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [askPaid, setAskPaid] = useState(false);
  const meta = VENDOR_SLOT_META[slot] || { label: slot };

  const doUpload = async (file) => {
    if (!file || !supabaseClient) return;
    setBusy(true); setError(null);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = vendorId + '/payment-' + payment.id + '/' + slot + '/' + Date.now() + '-' + safeName;
      const { error: upErr } = await supabaseClient.storage
        .from(VENDOR_DOCS_BUCKET)
        .upload(path, file, { contentType: file.type || undefined });
      if (upErr) throw new Error('Upload: ' + upErr.message);
      const { error: insErr } = await supabaseClient.from('vendor_documents').insert({
        vendor_id:    vendorId,
        payment_id:   payment.id,
        kind:         slot,
        filename:     file.name,
        storage_path: path,
      });
      if (insErr) throw new Error('Metadata: ' + insErr.message);
      await onChange();
      // Same Mark-as-Paid flow as the resident widget — but here the
      // status column is vendor_payments.payment_status.
      if (slot === 'payment_receipt' && payment.payment_status !== 'Paid' && payment.payment_status !== 'Cancelled') {
        setAskPaid(true);
      }
    } catch (e) {
      setError(e.message || String(e));
    }
    setBusy(false);
  };

  const confirmMarkPaid = async () => {
    setBusy(true); setError(null);
    try {
      const { error: stErr } = await supabaseClient.from('vendor_payments')
        .update({ payment_status: 'Paid', paid_date: new Date().toISOString().slice(0, 10) })
        .eq('id', payment.id);
      if (stErr) throw new Error(stErr.message);
      payment.payment_status = 'Paid';
      try {
        window.dispatchEvent(new CustomEvent('vars:vendor-payment-status-changed', {
          detail: { payment_id: payment.id, new_status: 'Paid' },
        }));
      } catch (_) {}
      setAskPaid(false);
    } catch (e) {
      setError('Status update failed: ' + (e.message || String(e)));
    }
    setBusy(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{zIndex:1100}}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{maxWidth:560,maxHeight:'88vh',padding:0,display:'flex',flexDirection:'column',overflow:'hidden'}}>
        <div className="modal-header" style={{position:'sticky',top:0,background:'#fff',padding:'24px 28px 18px 32px',margin:0,borderBottom:'1px solid var(--border-light)',zIndex:2}}>
          <div>
            <div style={{fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:4}}>{meta.label}</div>
            <h2>{payment.invoice_number || 'Invoice'}</h2>
            <div className="modal-sub">{meta.hint}</div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div style={{padding:'20px 32px 32px',overflowY:'auto',flex:1}}>
          {error && <div style={{padding:10,background:'#fdf2f1',color:'#8b4a42',borderRadius:6,fontSize:12,marginBottom:14}}>{error}</div>}
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,image/*"
            style={{display:'none'}}
            onChange={(e) => {
              const f = e.target.files && e.target.files[0];
              if (f) doUpload(f);
              if (inputRef.current) inputRef.current.value = '';
            }}
          />
          {docs.length === 0 ? (
            <div style={{padding:'24px 12px',background:'var(--bg-surface)',border:'1px dashed var(--border-light)',borderRadius:6,marginBottom:12,fontSize:12,color:'var(--text-muted)',textAlign:'center'}}>
              No files yet
            </div>
          ) : (
            <div style={{marginBottom:12}}>
              {docs.map(d => <VendorSlotFileRow key={d.id} doc={d} onChange={onChange}/>)}
            </div>
          )}
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => inputRef.current && inputRef.current.click()}>
            {busy ? 'Uploading…' : (docs.length === 0 ? '+ Upload' : '+ Add another')}
          </button>
        </div>
      </div>
      {askPaid && (
        <MarkPaidConfirmModal
          subtitle={'Vendor invoice ' + (payment.invoice_number || '')}
          title="Mark as Paid?"
          bodyText={'Payment receipt is attached. Flip this vendor invoice to Paid? It will be timestamped with today’s date.'}
          confirmLabel="Yes, mark as Paid"
          busy={busy}
          onCancel={() => setAskPaid(false)}
          onConfirm={confirmMarkPaid}
        />
      )}
    </div>
  );
};
