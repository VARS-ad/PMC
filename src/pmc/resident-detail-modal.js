// ==================== RESIDENT DETAIL MODAL ====================

const ResidentDetailModal = ({ resident, onClose }) => {
  const [documents, setDocuments] = useState(null);
  const [uploadingKind, setUploadingKind] = useState(null);
  const [error, setError] = useState(null);

  const reload = async () => {
    if (!supabaseClient) return;
    const { data, error: e } = await supabaseClient.from('resident_documents')
      .select('id,kind,filename,storage_path,created_at')
      .eq('profile_id', resident.id)
      .order('created_at', { ascending: false });
    if (e) setError(e.message); else { setDocuments(data || []); setError(null); }
  };
  useEffect(() => { reload(); }, [resident.id]);

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
    await reload();
  };

  const handleDelete = async (doc) => {
    if (!supabaseClient) return;
    if (!window.confirm('Delete ' + doc.filename + '?')) return;
    await supabaseClient.storage.from('resident-documents').remove([doc.storage_path]);
    await supabaseClient.from('resident_documents').delete().eq('id', doc.id);
    await reload();
  };

  const docSections = [
    { kind: 'emirates_id',      label: 'Emirates ID',         accept: '.pdf,image/*', multiple: false },
    { kind: 'passport',         label: 'Passport copy',       accept: '.pdf,image/*', multiple: false },
    { kind: 'tenancy_contract', label: 'Tenancy Contract',    accept: '.pdf',         multiple: false },
    { kind: 'owning_contract',  label: 'Ownership Contract',  accept: '.pdf',         multiple: false },
    { kind: 'title_deed',       label: 'Title Deed (copy)',   accept: '.pdf',         multiple: false },
    { kind: 'other',            label: 'Other Documents',     accept: '*/*',          multiple: true  },
  ];
  const grouped = (documents || []).reduce((acc, d) => { (acc[d.kind] = acc[d.kind] || []).push(d); return acc; }, {});

  const InfoCell = ({ label, value }) => (
    <div>
      <div style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:2}}>{label}</div>
      <div style={{fontSize:13,color:'var(--text-dark)'}}>{value || '—'}</div>
    </div>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{maxWidth:720,maxHeight:'90vh',overflowY:'auto'}}>
        <div className="modal-header">
          <div>
            <div style={{fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:4}}>Resident</div>
            <h2>{resident.full_name}</h2>
            <div className="modal-sub">{resident.building_name} · Floor {resident.floor} · Unit {resident.unit_number}</div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:20,padding:16,background:'var(--bg-surface)',borderRadius:8,border:'1px solid var(--border-light)'}}>
          <InfoCell label="Phone" value={resident.phone}/>
          <InfoCell label="Date of birth" value={resident.date_of_birth}/>
          <InfoCell label="Passport number" value={resident.passport_number}/>
          <InfoCell label="Tenure" value={resident.tenure}/>
          {resident.tenure === 'Tenant' && (<>
            <InfoCell label="Lease start" value={resident.lease_start}/>
            <InfoCell label="Lease end" value={resident.lease_end}/>
            <InfoCell label="Monthly payment" value={resident.monthly_payment_aed != null ? 'AED ' + Number(resident.monthly_payment_aed).toLocaleString() : null}/>
          </>)}
          {resident.tenure === 'Owner' && (
            <InfoCell label="Ownership since" value={resident.ownership_start}/>
          )}
          <InfoCell label="Resident since" value={resident.created_at ? new Date(resident.created_at).toLocaleDateString() : null}/>
        </div>

        {error && <div style={{padding:10,background:'#fdf2f1',color:'#8b4a42',borderRadius:6,fontSize:12,marginBottom:14}}>{error}</div>}

        <div style={{fontSize:11,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:12,fontWeight:500}}>Documents</div>
        {documents === null ? (
          <div style={{padding:24,color:'var(--text-muted)',fontSize:13}}>Loading…</div>
        ) : (
          <div>
            {docSections.map(s => (
              <UnitAttachmentSection key={s.kind} section={s} files={grouped[s.kind] || []} uploading={uploadingKind === s.kind} onUpload={handleUpload} onDelete={handleDelete} bucket="resident-documents"/>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

