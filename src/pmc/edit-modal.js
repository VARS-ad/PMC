// ==================== EDIT MODAL + DELETE HELPER ====================

async function deleteUsersViaFunction(profileIds) {
  const { data: { session } } = await supabaseClient.auth.getSession();
  const headers = { 'Content-Type': 'application/json' };
  if (session && session.access_token) headers['Authorization'] = 'Bearer ' + session.access_token;
  const resp = await fetch(SUPABASE_URL + '/functions/v1/delete-user', {
    method: 'POST', headers,
    body: JSON.stringify({ profile_ids: profileIds }),
  });
  return resp.json();
}

const EditRecordModal = ({ kind, record, onClose, onSaved }) => {
  const initial = (() => {
    if (kind === 'building') return { name: record.name || '', address: record.address || '', notes: record.notes || '' };
    if (kind === 'resident') return { full_name: record.full_name || '', phone: record.phone || '' };
    return { full_name: record.full_name || '', phone: record.phone || '', shift: record.shift || 'Day' };
  })();
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const save = async () => {
    setBusy(true); setError(null);
    try {
      if (kind === 'building') {
        const { error: e } = await supabaseClient.from('buildings').update({
          name: form.name.trim(),
          address: form.address.trim() || null,
          notes: form.notes.trim() || null,
        }).eq('id', record.id);
        if (e) throw e;
      } else if (kind === 'resident' || kind === 'security') {
        const { error: e } = await supabaseClient.from('profiles').update({
          full_name: form.full_name.trim(),
          phone: form.phone.trim() || null,
        }).eq('id', record.id);
        if (e) throw e;
        if (kind === 'security' && form.shift !== record.shift) {
          const { error: se } = await supabaseClient.from('security_assignments').update({
            shift: form.shift,
          }).eq('profile_id', record.id);
          if (se) throw se;
        }
      }
      if (onSaved) onSaved();
      onClose();
    } catch (e) {
      setError(String(e.message || e));
    }
    setBusy(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{zIndex:1050}}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{maxWidth:500}}>
        <div className="modal-header">
          <div>
            <div style={{fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:4}}>Edit {kind}</div>
            <h2>{kind === 'building' ? record.name : record.full_name}</h2>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        {kind === 'building' && (
          <div>
            <div style={{marginBottom:14}}><PCField label="Building name" required value={form.name} onChange={v => setForm(f => ({...f, name: v}))}/></div>
            <div style={{marginBottom:14}}><PCField label="Address" value={form.address} onChange={v => setForm(f => ({...f, address: v}))}/></div>
            <div style={{marginBottom:14}}><PCField label="Notes" value={form.notes} onChange={v => setForm(f => ({...f, notes: v}))} textarea/></div>
          </div>
        )}
        {kind === 'resident' && (
          <div>
            <div style={{marginBottom:14}}><PCField label="Full name" required value={form.full_name} onChange={v => setForm(f => ({...f, full_name: v}))}/></div>
            <div style={{marginBottom:14}}><PCField label="Phone" value={form.phone} onChange={v => setForm(f => ({...f, phone: v}))}/></div>
            <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:14,padding:10,background:'var(--bg-page)',borderRadius:6}}>Email, building, and unit cannot be changed here. Delete and re-add the resident to move them to a different unit.</div>
          </div>
        )}
        {kind === 'security' && (
          <div>
            <div style={{marginBottom:14}}><PCField label="Full name" required value={form.full_name} onChange={v => setForm(f => ({...f, full_name: v}))}/></div>
            <div style={{marginBottom:14}}><PCField label="Phone" value={form.phone} onChange={v => setForm(f => ({...f, phone: v}))}/></div>
            <div style={{marginBottom:14}}><PCSelect label="Shift" value={form.shift} onChange={v => setForm(f => ({...f, shift: v}))} options={[{value:'Day',label:'Day'},{value:'Night',label:'Night'},{value:'24h',label:'24h'}]}/></div>
            <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:14,padding:10,background:'var(--bg-page)',borderRadius:6}}>Email and building cannot be changed here. Delete and re-add to move the guard to a different building.</div>
          </div>
        )}
        {error && <div style={{padding:10,background:'#fdf2f1',color:'#8b4a42',borderRadius:6,fontSize:12,marginBottom:14}}>{error}</div>}
        <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:8}}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save changes'}</button>
        </div>
      </div>
    </div>
  );
};

