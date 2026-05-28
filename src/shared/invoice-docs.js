// ==================== INVOICE DOCS ====================
// Reusable widget for attaching files to an invoice. Each invoice can
// hold up to two attachments — one of kind 'invoice' (the issued bill)
// and one of kind 'payment_proof' (receipt / bank confirmation).
//
// • <InvoiceDocsCell invoice={i} />          → a <td> cell with a
//   compact indicator of what's attached. Click opens the modal.
// • <InvoiceDocsModal invoice onClose />     → two-slot upload UI
//   (View · Replace · Delete per slot).
//
// Backing store: public.invoice_attachments + Storage bucket
// `invoice-attachments` (see migration 0009).

const INVOICE_DOCS_BUCKET = 'invoice-attachments';

const INVOICE_DOCS_SLOTS = [
  { kind: 'invoice',       label: 'Invoice document',  hint: 'The bill you issued' },
  { kind: 'payment_proof', label: 'Payment proof',     hint: 'Receipt or bank confirmation' },
];

const InvoiceDocsCell = ({ invoice }) => {
  const [atts, setAtts] = useState(null);
  const [open, setOpen] = useState(false);

  const reload = async () => {
    if (!supabaseClient || !invoice || !invoice.id) { setAtts([]); return; }
    const { data } = await supabaseClient
      .from('invoice_attachments')
      .select('id,kind,file_name,storage_path,size_bytes,uploaded_at')
      .eq('invoice_id', invoice.id);
    setAtts(data || []);
  };
  useEffect(() => { reload(); }, [invoice && invoice.id]);

  const byKind = (atts || []).reduce((acc, a) => { acc[a.kind] = a; return acc; }, {});
  const hasInvoice = !!byKind.invoice;
  const hasProof   = !!byKind.payment_proof;

  // Two little pills. Filled = attached, hollow = missing.
  const Pill = ({ filled, letter, title }) => (
    <span
      title={title}
      style={{
        display:'inline-flex',alignItems:'center',justifyContent:'center',
        width:18,height:18,borderRadius:4,fontSize:10,fontWeight:600,
        background: filled ? '#e6efe1' : '#fff',
        color:      filled ? '#5a6b4f' : '#a8b0b6',
        border:     '1px solid ' + (filled ? '#c8d4be' : '#dde1e0'),
      }}
    >{letter}</span>
  );

  return (
    <>
      <td
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        style={{whiteSpace:'nowrap',cursor:'pointer',textAlign:'center'}}
        title={
          hasInvoice && hasProof ? 'Invoice + payment proof attached'
          : hasInvoice            ? 'Invoice attached · payment proof missing'
          : hasProof              ? 'Payment proof attached · invoice missing'
          : 'No documents — click to upload'
        }
      >
        {atts === null ? (
          <span style={{fontSize:10,color:'var(--text-muted)'}}>…</span>
        ) : (
          <span style={{display:'inline-flex',gap:4}}>
            <Pill filled={hasInvoice} letter="I" title="Invoice document"/>
            <Pill filled={hasProof}   letter="P" title="Payment proof"/>
          </span>
        )}
      </td>
      {open && (
        <InvoiceDocsModal
          invoice={invoice}
          attachments={atts || []}
          onClose={() => setOpen(false)}
          onChange={reload}
        />
      )}
    </>
  );
};

const InvoiceDocsSlot = ({ invoice, slot, attachment, onChange }) => {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [signedUrl, setSignedUrl] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!attachment || !supabaseClient) { setSignedUrl(null); return; }
    let mounted = true;
    supabaseClient.storage.from(INVOICE_DOCS_BUCKET)
      .createSignedUrl(attachment.storage_path, 300)
      .then(({ data }) => { if (mounted) setSignedUrl(data && data.signedUrl); });
    return () => { mounted = false; };
  }, [attachment && attachment.id]);

  const doUpload = async (file) => {
    if (!file || !supabaseClient) return;
    setBusy(true); setError(null);
    try {
      // If a file already exists in this slot, delete the old object first.
      if (attachment) {
        await supabaseClient.storage.from(INVOICE_DOCS_BUCKET).remove([attachment.storage_path]);
        await supabaseClient.from('invoice_attachments').delete().eq('id', attachment.id);
      }
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = invoice.id + '/' + slot.kind + '/' + Date.now() + '-' + safeName;
      const { error: upErr } = await supabaseClient.storage
        .from(INVOICE_DOCS_BUCKET)
        .upload(path, file, { contentType: file.type || undefined });
      if (upErr) throw new Error('Upload: ' + upErr.message);
      const { error: insErr } = await supabaseClient.from('invoice_attachments').insert({
        invoice_id:   invoice.id,
        kind:         slot.kind,
        storage_path: path,
        file_name:    file.name,
        mime_type:    file.type || null,
        size_bytes:   file.size || null,
      });
      if (insErr) throw new Error('Metadata: ' + insErr.message);
      await onChange();
    } catch (e) {
      setError(e.message || String(e));
    }
    setBusy(false);
  };

  const doDelete = async () => {
    if (!attachment || !supabaseClient) return;
    if (!window.confirm('Delete "' + attachment.file_name + '"?')) return;
    setBusy(true); setError(null);
    try {
      await supabaseClient.storage.from(INVOICE_DOCS_BUCKET).remove([attachment.storage_path]);
      await supabaseClient.from('invoice_attachments').delete().eq('id', attachment.id);
      await onChange();
    } catch (e) {
      setError(e.message || String(e));
    }
    setBusy(false);
  };

  const fmtSize = (b) => {
    if (b == null) return '';
    if (b < 1024) return b + ' B';
    if (b < 1024*1024) return Math.round(b/1024) + ' KB';
    return (b / (1024*1024)).toFixed(1) + ' MB';
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
      {attachment ? (
        <div>
          <div style={{padding:'10px 12px',background:'var(--bg-surface)',border:'1px solid var(--border-light)',borderRadius:6,marginBottom:10}}>
            <div style={{fontSize:12,fontWeight:500,wordBreak:'break-all',color:'var(--text-dark)',marginBottom:4}}>{attachment.file_name}</div>
            <div style={{fontSize:10,color:'var(--text-muted)'}}>
              {fmtSize(attachment.size_bytes)}
              {attachment.size_bytes ? ' · ' : ''}
              uploaded {new Date(attachment.uploaded_at).toLocaleDateString()}
            </div>
          </div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            {signedUrl ? (
              <a className="btn btn-sm" href={signedUrl} target="_blank" rel="noopener" style={{textDecoration:'none'}}>View</a>
            ) : (
              <button className="btn btn-sm" disabled>View</button>
            )}
            <button className="btn btn-sm" disabled={busy} onClick={() => inputRef.current && inputRef.current.click()}>
              {busy ? 'Working…' : 'Replace'}
            </button>
            <button className="btn btn-sm" disabled={busy} onClick={doDelete} style={{color:'#8b4a42'}}>Delete</button>
          </div>
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

const InvoiceDocsModal = ({ invoice, attachments, onClose, onChange }) => {
  const byKind = (attachments || []).reduce((acc, a) => { acc[a.kind] = a; return acc; }, {});
  return (
    <div className="modal-overlay" onClick={onClose} style={{zIndex:1100}}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{maxWidth:720,maxHeight:'88vh',padding:0,display:'flex',flexDirection:'column',overflow:'hidden'}}>
        <div className="modal-header" style={{position:'sticky',top:0,background:'#fff',padding:'24px 28px 18px 32px',margin:0,borderBottom:'1px solid var(--border-light)',zIndex:2}}>
          <div>
            <div style={{fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:4}}>Invoice documents</div>
            <h2>{invoice.invoice_number || 'Invoice'}</h2>
            <div className="modal-sub">{invoice.description || ''}</div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div style={{padding:'20px 32px 32px',overflowY:'auto',flex:1}}>
          <div style={{display:'flex',gap:14,flexWrap:'wrap'}}>
            {INVOICE_DOCS_SLOTS.map(s => (
              <InvoiceDocsSlot
                key={s.kind}
                invoice={invoice}
                slot={s}
                attachment={byKind[s.kind] || null}
                onChange={onChange}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
