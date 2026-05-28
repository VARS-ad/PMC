// ==================== VENDOR INVOICE DOCS ====================
// Same widget pattern as <InvoiceDocsCell> but adapted for vendor invoices.
// Each vendor_payments row can carry two attachments:
//   • kind = 'invoice'         → the bill the vendor sent us
//   • kind = 'payment_receipt' → our proof of paying it
//
// Backing store: existing public.vendor_documents (filtered to rows where
// payment_id matches) and the existing private `maintenance-documents`
// bucket. No schema migration needed.

const VENDOR_INVOICE_DOCS_BUCKET = 'maintenance-documents';

const VENDOR_INVOICE_DOCS_SLOTS = [
  { kind: 'invoice',         label: 'Invoice document', hint: 'The bill the vendor sent us' },
  { kind: 'payment_receipt', label: 'Payment receipt',  hint: 'Proof we paid the vendor' },
];

const VendorInvoiceDocsCell = ({ payment, vendorId }) => {
  const [docs, setDocs] = useState(null);
  const [open, setOpen] = useState(false);

  const reload = async () => {
    if (!supabaseClient || !payment || !payment.id) { setDocs([]); return; }
    const { data } = await supabaseClient
      .from('vendor_documents')
      .select('id,kind,filename,storage_path,created_at')
      .eq('payment_id', payment.id)
      .in('kind', ['invoice','payment_receipt'])
      .order('created_at', { ascending: false });
    setDocs(data || []);
  };
  useEffect(() => { reload(); }, [payment && payment.id]);

  // Multiple rows of same kind are allowed by the schema; the cell shows
  // the slot as "filled" if at least one exists. The modal then lets the
  // user see all files in that slot.
  const byKind = (docs || []).reduce((acc, d) => { (acc[d.kind] = acc[d.kind] || []).push(d); return acc; }, {});
  const hasInvoice = !!(byKind.invoice && byKind.invoice.length);
  const hasReceipt = !!(byKind.payment_receipt && byKind.payment_receipt.length);

  const Pill = ({ filled, letter, count, title }) => (
    <span
      title={title}
      style={{
        display:'inline-flex',alignItems:'center',justifyContent:'center',
        minWidth:18,height:18,borderRadius:4,fontSize:10,fontWeight:600,padding:'0 4px',
        background: filled ? '#e6efe1' : '#fff',
        color:      filled ? '#5a6b4f' : '#a8b0b6',
        border:     '1px solid ' + (filled ? '#c8d4be' : '#dde1e0'),
      }}
    >{letter}{count > 1 ? ' ' + count : ''}</span>
  );

  return (
    <>
      <td
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        style={{whiteSpace:'nowrap',cursor:'pointer',textAlign:'center'}}
        title={
          hasInvoice && hasReceipt ? 'Invoice + receipt attached'
          : hasInvoice              ? 'Invoice attached · receipt missing'
          : hasReceipt              ? 'Receipt attached · invoice missing'
          : 'No documents — click to upload'
        }
      >
        {docs === null ? (
          <span style={{fontSize:10,color:'var(--text-muted)'}}>…</span>
        ) : (
          <span style={{display:'inline-flex',gap:4}}>
            <Pill filled={hasInvoice} letter="I" count={(byKind.invoice         || []).length} title="Invoice document"/>
            <Pill filled={hasReceipt} letter="R" count={(byKind.payment_receipt || []).length} title="Payment receipt"/>
          </span>
        )}
      </td>
      {open && (
        <VendorInvoiceDocsModal
          payment={payment}
          vendorId={vendorId}
          docsByKind={byKind}
          onClose={() => setOpen(false)}
          onChange={reload}
        />
      )}
    </>
  );
};

const VendorInvoiceDocsSlot = ({ payment, vendorId, slot, docs, onChange }) => {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const doUpload = async (file) => {
    if (!file || !supabaseClient) return;
    setBusy(true); setError(null);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = vendorId + '/payment-' + payment.id + '/' + slot.kind + '/' + Date.now() + '-' + safeName;
      const { error: upErr } = await supabaseClient.storage
        .from(VENDOR_INVOICE_DOCS_BUCKET)
        .upload(path, file, { contentType: file.type || undefined });
      if (upErr) throw new Error('Upload: ' + upErr.message);
      const { error: insErr } = await supabaseClient.from('vendor_documents').insert({
        vendor_id:    vendorId,
        payment_id:   payment.id,
        kind:         slot.kind,
        filename:     file.name,
        storage_path: path,
      });
      if (insErr) throw new Error('Metadata: ' + insErr.message);
      await onChange();
    } catch (e) {
      setError(e.message || String(e));
    }
    setBusy(false);
  };

  return (
    <div style={{flex:1,minWidth:0,border:'1px solid var(--border-light)',borderRadius:8,padding:'14px 16px',background:'#fff'}}>
      <div style={{fontSize:12,fontWeight:600,color:'var(--text-dark)',marginBottom:2}}>{slot.label}</div>
      <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:12}}>{slot.hint}</div>
      {error && <div style={{padding:8,background:'#fdf2f1',color:'#8b4a42',borderRadius:6,fontSize:11,marginBottom:10}}>{error}</div>}
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
      {(docs && docs.length > 0) ? (
        <div>
          {docs.map(d => (
            <VendorInvoiceDocFileRow key={d.id} doc={d} onChange={onChange}/>
          ))}
          <button className="btn btn-sm" disabled={busy} onClick={() => inputRef.current && inputRef.current.click()} style={{marginTop:6}}>
            {busy ? 'Uploading…' : '+ Add another'}
          </button>
        </div>
      ) : (
        <div>
          <div style={{padding:'18px 12px',background:'var(--bg-surface)',border:'1px dashed var(--border-light)',borderRadius:6,marginBottom:10,fontSize:12,color:'var(--text-muted)',textAlign:'center'}}>
            No file yet
          </div>
          <button className="btn btn-sm" disabled={busy} onClick={() => inputRef.current && inputRef.current.click()}>
            {busy ? 'Uploading…' : '+ Upload'}
          </button>
        </div>
      )}
    </div>
  );
};

const VendorInvoiceDocFileRow = ({ doc, onChange }) => {
  const [signedUrl, setSignedUrl] = useState(null);
  const [busy, setBusy]           = useState(false);

  useEffect(() => {
    if (!doc || !supabaseClient) return;
    let mounted = true;
    supabaseClient.storage.from(VENDOR_INVOICE_DOCS_BUCKET)
      .createSignedUrl(doc.storage_path, 300)
      .then(({ data }) => { if (mounted) setSignedUrl(data && data.signedUrl); });
    return () => { mounted = false; };
  }, [doc && doc.id]);

  const doDelete = async () => {
    if (!doc || !supabaseClient) return;
    if (!window.confirm('Delete "' + doc.filename + '"?')) return;
    setBusy(true);
    try {
      await supabaseClient.storage.from(VENDOR_INVOICE_DOCS_BUCKET).remove([doc.storage_path]);
      await supabaseClient.from('vendor_documents').delete().eq('id', doc.id);
      await onChange();
    } catch (e) { /* swallow */ }
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

const VendorInvoiceDocsModal = ({ payment, vendorId, docsByKind, onClose, onChange }) => {
  return (
    <div className="modal-overlay" onClick={onClose} style={{zIndex:1100}}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{maxWidth:720,maxHeight:'88vh',padding:0,display:'flex',flexDirection:'column',overflow:'hidden'}}>
        <div className="modal-header" style={{position:'sticky',top:0,background:'#fff',padding:'24px 28px 18px 32px',margin:0,borderBottom:'1px solid var(--border-light)',zIndex:2}}>
          <div>
            <div style={{fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:4}}>Vendor invoice documents</div>
            <h2>{payment.invoice_number || 'Invoice'}</h2>
            <div className="modal-sub">{payment.description || ''}</div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div style={{padding:'20px 32px 32px',overflowY:'auto',flex:1}}>
          <div style={{display:'flex',gap:14,flexWrap:'wrap'}}>
            {VENDOR_INVOICE_DOCS_SLOTS.map(s => (
              <VendorInvoiceDocsSlot
                key={s.kind}
                payment={payment}
                vendorId={vendorId}
                slot={s}
                docs={docsByKind[s.kind] || []}
                onChange={onChange}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
