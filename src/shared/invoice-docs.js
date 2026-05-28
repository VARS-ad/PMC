// ==================== INVOICE DOCS ====================
// Each invoice row in the UI gets TWO independent cells, one per slot:
//   • <InvoiceSlotCell invoice slot="invoice"        /> → "Invoice" column
//   • <InvoiceSlotCell invoice slot="payment_proof"  /> → "Proof of payment" column
// Each cell shows a paperclip pill with an optional file count, and
// clicking it opens a focused modal that lists every file in that slot
// and lets the PMC user upload another, view, or delete.
//
// Multiple files per slot are allowed (no UNIQUE — see migration 0010).
// Files land in `invoice-attachments` under {invoice_id}/{kind}/{filename}.

const INVOICE_DOCS_BUCKET = 'invoice-attachments';

const INVOICE_SLOT_META = {
  invoice:       { label: 'Invoice',          hint: 'The bill you issued' },
  payment_proof: { label: 'Proof of payment', hint: 'Bank slip, receipt or cheque image' },
};

// Reusable in-app confirmation modal used after a payment-proof /
// payment-receipt upload to offer to flip the parent's status to Paid.
// Lives above the slot modal (z-index 1200) so it sits on top of
// whatever invoked it.
const MarkPaidConfirmModal = ({ title, subtitle, bodyText, confirmLabel, busy, onCancel, onConfirm }) => (
  <div className="modal-overlay" onClick={onCancel} style={{zIndex:1200}}>
    <div className="modal" onClick={e => e.stopPropagation()} style={{maxWidth:440,padding:0,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div className="modal-header" style={{padding:'22px 26px 14px 28px',margin:0,borderBottom:'1px solid var(--border-light)'}}>
        <div>
          <div style={{fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:4}}>{subtitle || ''}</div>
          <h2 style={{margin:0}}>{title}</h2>
        </div>
      </div>
      <div style={{padding:'20px 28px 8px'}}>
        <div style={{fontSize:13,color:'var(--text-secondary)',lineHeight:1.5}}>{bodyText}</div>
      </div>
      <div style={{padding:'14px 22px 22px',display:'flex',gap:8,justifyContent:'flex-end'}}>
        <button className="btn" onClick={onCancel} disabled={busy}>Cancel</button>
        <button className="btn btn-primary" onClick={onConfirm} disabled={busy}>{busy ? 'Saving…' : (confirmLabel || 'Mark as Paid')}</button>
      </div>
    </div>
  </div>
);

// Shared pill rendered in both the resident and vendor docs cells. Uses
// an inline SVG paperclip so the icon size, baseline and stroke colour
// match the "+" exactly — the emoji rendering shifted the pill height
// inconsistently across rows.
const SlotPill = ({ filled, count }) => (
  <span
    style={{
      display:'inline-flex',alignItems:'center',justifyContent:'center',gap:4,
      width:'auto',minWidth:32,height:22,padding:'0 8px',borderRadius:4,
      lineHeight:1,fontSize:12,fontWeight:600,
      background: filled ? '#e6efe1' : '#fff',
      color:      filled ? '#5a6b4f' : '#a8b0b6',
      border:     '1px solid ' + (filled ? '#c8d4be' : '#dde1e0'),
      verticalAlign:'middle',
    }}
  >
    {filled ? (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{display:'block'}}>
        <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 17.93 8.83l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
      </svg>
    ) : (
      <span style={{fontSize:14,lineHeight:1,display:'block'}}>+</span>
    )}
    {filled && count > 1 && <span style={{fontSize:11,lineHeight:1}}>{count}</span>}
  </span>
);

const InvoiceSlotCell = ({ invoice, slot }) => {
  const [docs, setDocs] = useState(null);
  const [open, setOpen] = useState(false);

  const reload = async () => {
    if (!supabaseClient || !invoice || !invoice.id) { setDocs([]); return; }
    const { data } = await supabaseClient
      .from('invoice_attachments')
      .select('id,kind,file_name,storage_path,size_bytes,uploaded_at')
      .eq('invoice_id', invoice.id)
      .eq('kind', slot)
      .order('uploaded_at', { ascending: false });
    setDocs(data || []);
  };
  useEffect(() => { reload(); }, [invoice && invoice.id, slot]);

  const count = (docs || []).length;
  const filled = count > 0;
  const meta = INVOICE_SLOT_META[slot] || { label: slot };

  return (
    <>
      <td
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        style={{whiteSpace:'nowrap',cursor:'pointer',textAlign:'center'}}
        title={
          docs === null  ? 'Loading…'
          : filled       ? count + ' file' + (count === 1 ? '' : 's') + ' attached — click to manage'
          :                'No files yet — click to upload'
        }
      >
        {docs === null ? (
          <span style={{fontSize:10,color:'var(--text-muted)'}}>…</span>
        ) : (
          <SlotPill filled={filled} count={count}/>
        )}
      </td>
      {open && (
        <InvoiceSlotModal
          invoice={invoice}
          slot={slot}
          docs={docs || []}
          onClose={() => setOpen(false)}
          onChange={reload}
        />
      )}
    </>
  );
};

const InvoiceSlotFileRow = ({ doc, onChange }) => {
  const [signedUrl, setSignedUrl] = useState(null);
  const [busy, setBusy]           = useState(false);

  useEffect(() => {
    if (!doc || !supabaseClient) return;
    let mounted = true;
    supabaseClient.storage.from(INVOICE_DOCS_BUCKET)
      .createSignedUrl(doc.storage_path, 300)
      .then(({ data }) => { if (mounted) setSignedUrl(data && data.signedUrl); });
    return () => { mounted = false; };
  }, [doc && doc.id]);

  const doDelete = async () => {
    if (!doc || !supabaseClient) return;
    if (!window.confirm('Delete "' + doc.file_name + '"?')) return;
    setBusy(true);
    try {
      await supabaseClient.storage.from(INVOICE_DOCS_BUCKET).remove([doc.storage_path]);
      await supabaseClient.from('invoice_attachments').delete().eq('id', doc.id);
      await onChange();
    } catch (e) { /* surfaces via UI not changing */ }
    setBusy(false);
  };

  const fmtSize = (b) => {
    if (b == null) return '';
    if (b < 1024) return b + ' B';
    if (b < 1024*1024) return Math.round(b/1024) + ' KB';
    return (b / (1024*1024)).toFixed(1) + ' MB';
  };

  return (
    <div style={{padding:'10px 12px',background:'var(--bg-surface)',border:'1px solid var(--border-light)',borderRadius:6,marginBottom:8}}>
      <div style={{fontSize:12,fontWeight:500,wordBreak:'break-all',color:'var(--text-dark)',marginBottom:4}}>{doc.file_name}</div>
      <div style={{fontSize:10,color:'var(--text-muted)',marginBottom:8}}>
        {fmtSize(doc.size_bytes)}
        {doc.size_bytes ? ' · ' : ''}
        uploaded {new Date(doc.uploaded_at).toLocaleDateString()}
      </div>
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

const InvoiceSlotModal = ({ invoice, slot, docs, onClose, onChange }) => {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [askPaid, setAskPaid] = useState(false);
  const meta = INVOICE_SLOT_META[slot] || { label: slot };

  const doUpload = async (file) => {
    if (!file || !supabaseClient) return;
    setBusy(true); setError(null);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = invoice.id + '/' + slot + '/' + Date.now() + '-' + safeName;
      const { error: upErr } = await supabaseClient.storage
        .from(INVOICE_DOCS_BUCKET)
        .upload(path, file, { contentType: file.type || undefined });
      if (upErr) throw new Error('Upload: ' + upErr.message);
      const { error: insErr } = await supabaseClient.from('invoice_attachments').insert({
        invoice_id:   invoice.id,
        kind:         slot,
        storage_path: path,
        file_name:    file.name,
        mime_type:    file.type || null,
        size_bytes:   file.size || null,
      });
      if (insErr) throw new Error('Metadata: ' + insErr.message);
      await onChange();
      // Payment proof attached → offer to flip the invoice to Paid
      // (only if it isn't already Paid / Cancelled). We surface this
      // via the in-app confirm modal, not window.confirm.
      if (slot === 'payment_proof' && invoice.status !== 'Paid' && invoice.status !== 'Cancelled') {
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
      const { error: stErr } = await supabaseClient.from('invoices')
        .update({ status: 'Paid' })
        .eq('id', invoice.id);
      if (stErr) throw new Error(stErr.message);
      invoice.status = 'Paid';
      try {
        window.dispatchEvent(new CustomEvent('vars:invoice-status-changed', {
          detail: { invoice_id: invoice.id, new_status: 'Paid' },
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
            <h2>{invoice.invoice_number || 'Invoice'}</h2>
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
              {docs.map(d => <InvoiceSlotFileRow key={d.id} doc={d} onChange={onChange}/>)}
            </div>
          )}
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => inputRef.current && inputRef.current.click()}>
            {busy ? 'Uploading…' : (docs.length === 0 ? '+ Upload' : '+ Add another')}
          </button>
        </div>
      </div>
      {askPaid && (
        <MarkPaidConfirmModal
          subtitle={'Invoice ' + (invoice.invoice_number || '')}
          title="Mark as Paid?"
          bodyText={'Proof of payment is attached. Flip this invoice to Paid? It will move out of Outstanding and the status badge will turn green.'}
          confirmLabel="Yes, mark as Paid"
          busy={busy}
          onCancel={() => setAskPaid(false)}
          onConfirm={confirmMarkPaid}
        />
      )}
    </div>
  );
};
