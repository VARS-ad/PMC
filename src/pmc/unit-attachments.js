// ==================== UNIT ATTACHMENTS ====================

// Stock placeholder URLs when the storage object is missing (seed-only).
const ATTACHMENT_PLACEHOLDER = {
  photo:         'https://images.unsplash.com/photo-1502672023488-70e25813eb80?w=1400',
  title_deed:    'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=1400',
  layout:        'https://images.unsplash.com/photo-1503387837-b154d5074bd2?w=1400',
  other:         'https://images.unsplash.com/photo-1568667256549-094345857637?w=1400',
};

const UnitAttachmentRow = ({ file, onDelete, canDelete, bucket }) => {
  const b = bucket || 'unit-attachments';
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!supabaseClient) return;
    let mounted = true;
    supabaseClient.storage.from(b).createSignedUrl(file.storage_path, 300)
      .then(({ data, error }) => {
        if (!mounted) return;
        if (data && data.signedUrl) { setUrl(data.signedUrl); return; }
        // Fallback to a stock placeholder so the filename link opens
        // *something* instead of 404'ing.
        setUrl(ATTACHMENT_PLACEHOLDER[file.kind] || ATTACHMENT_PLACEHOLDER.other);
      });
    return () => { mounted = false; };
  }, [file.storage_path, b, file.kind]);
  return (
    <div style={{display:'flex',alignItems:'center',gap:12,padding:'8px 10px',background:'#fff',border:'1px solid var(--border-light)',borderRadius:6,marginBottom:6,fontSize:12}}>
      <div style={{flex:1,minWidth:0,overflow:'hidden'}}>
        {url ? (
          <a href={url} target="_blank" rel="noopener" style={{color:'var(--accent-warm-dark)',textDecoration:'none',fontWeight:500,wordBreak:'break-all'}}>{file.filename}</a>
        ) : (
          <span style={{color:'var(--text-muted)'}}>{file.filename}</span>
        )}
        <div style={{fontSize:10,color:'var(--text-muted)',marginTop:2}}>{new Date(file.created_at).toLocaleString()}</div>
      </div>
      {canDelete && <button onClick={onDelete} style={{background:'none',border:'none',cursor:'pointer',color:'#8b4a42',fontSize:11,padding:'4px 8px'}}>Delete</button>}
    </div>
  );
};

const UnitAttachmentSection = ({ section, files, uploading, onUpload, onDelete, bucket }) => {
  const inputRef = useRef(null);
  const canAddMore = section.multiple || files.length === 0;
  return (
    <div style={{marginBottom:18,paddingBottom:14,borderBottom:'1px solid var(--border-light)'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
        <div>
          <div style={{fontSize:13,fontWeight:600,color:'var(--text-dark)'}}>{section.label}</div>
          {!section.multiple && <div style={{fontSize:10,color:'var(--text-muted)',marginTop:2}}>One file only</div>}
        </div>
        {canAddMore && (
          <div>
            <input ref={inputRef} type="file" accept={section.accept} style={{display:'none'}} onChange={e => { const f = e.target.files && e.target.files[0]; onUpload(section.kind, f); if (inputRef.current) inputRef.current.value = ''; }}/>
            <button className="btn btn-sm" disabled={uploading} onClick={() => inputRef.current && inputRef.current.click()}>
              {uploading ? 'Uploading…' : '+ Upload'}
            </button>
          </div>
        )}
      </div>
      {files.length === 0 && <div style={{fontSize:12,color:'var(--text-muted)',padding:'4px 0 0'}}>No files yet.</div>}
      {files.map(f => <UnitAttachmentRow key={f.id} file={f} onDelete={() => onDelete(f)} canDelete={true} bucket={bucket}/>)}
    </div>
  );
};

const UnitAttachmentsModal = ({ unit, buildingName, onClose }) => {
  const [attachments, setAttachments] = useState(null);
  const [uploadingKind, setUploadingKind] = useState(null);
  const [error, setError] = useState(null);

  const reload = async () => {
    if (!supabaseClient) return;
    const { data, error: e } = await supabaseClient.from('unit_attachments')
      .select('id,kind,filename,storage_path,created_at')
      .eq('unit_id', unit.id)
      .order('created_at', { ascending: false });
    if (e) setError(e.message); else { setAttachments(data || []); setError(null); }
  };
  useEffect(() => { reload(); }, [unit.id]);

  const handleUpload = async (kind, file) => {
    if (!file || !supabaseClient) return;
    setUploadingKind(kind); setError(null);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = unit.id + '/' + kind + '-' + Date.now() + '-' + safeName;
    const { error: upErr } = await supabaseClient.storage.from('unit-attachments').upload(path, file);
    if (upErr) { setError('Upload failed: ' + upErr.message); setUploadingKind(null); return; }
    const { error: insErr } = await supabaseClient.from('unit_attachments').insert({
      unit_id: unit.id, kind, filename: file.name, storage_path: path,
    });
    if (insErr) setError('Metadata insert: ' + insErr.message);
    setUploadingKind(null);
    await reload();
  };

  const handleDelete = async (att) => {
    if (!supabaseClient) return;
    if (!window.confirm('Delete ' + att.filename + '?')) return;
    await supabaseClient.storage.from('unit-attachments').remove([att.storage_path]);
    await supabaseClient.from('unit_attachments').delete().eq('id', att.id);
    await reload();
  };

  const sections = [
    { kind: 'photo',      label: 'Photos',              accept: 'image/*',      multiple: true  },
    { kind: 'title_deed', label: 'Title Deed',          accept: '.pdf,image/*', multiple: false },
    { kind: 'layout',     label: 'Layout / Floor Plan', accept: '.pdf,image/*', multiple: false },
    { kind: 'other',      label: 'Other Documents',     accept: '*/*',          multiple: true  },
  ];

  const grouped = (attachments || []).reduce((acc, a) => {
    (acc[a.kind] = acc[a.kind] || []).push(a);
    return acc;
  }, {});

  return (
    <div className="modal-overlay" onClick={onClose} style={{zIndex:1100}}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{maxWidth:680,maxHeight:'85vh',overflowY:'auto'}}>
        <div className="modal-header">
          <div>
            <div style={{fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:4}}>Unit attachments</div>
            <h2>{unit.unit_number}</h2>
            <div className="modal-sub">{buildingName} · Floor {unit.floor}</div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        {error && <div style={{padding:10,background:'#fdf2f1',color:'#8b4a42',borderRadius:6,fontSize:12,marginBottom:14}}>{error}</div>}
        {attachments === null ? (
          <div style={{padding:24,color:'var(--text-muted)',fontSize:13}}>Loading…</div>
        ) : (
          <div>
            {sections.map(s => (
              <UnitAttachmentSection key={s.kind} section={s} files={grouped[s.kind] || []} uploading={uploadingKind === s.kind} onUpload={handleUpload} onDelete={handleDelete}/>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

