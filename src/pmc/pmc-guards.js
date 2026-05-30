// ==================== PMC GUARDS PAGE ====================
// Reads security profiles + assignments from Supabase, computes on-duty status
// from current Dubai time + shift. Clicking a row (or the Chat button) opens
// GuardDetailModal — view/edit guard fields and direct-chat with that guard.

const PMCGuardsPage = () => {
  const { selectedProperties = [] } = useApp();
  const [guards, setGuards] = useState(null);
  const [error, setError] = useState(null);
  const [buildings, setBuildings] = useState([]);
  const [allBuildings, setAllBuildings] = useState([]); // for the edit-form dropdown
  const [shiftFilter, setShiftFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showDownload, setShowDownload] = useState(false);
  const [openedGuard, setOpenedGuard] = useState(null); // { guard, focusChat? }

  const load = async () => {
    setError(null);
    if (!supabaseClient) return;
    const { data: profs, error: e1 } = await supabaseClient.from('profiles').select('id,full_name,phone,created_at').eq('role','security').order('full_name');
    if (e1) { setError(e1.message); setGuards([]); return; }
    const ids = (profs || []).map(p => p.id);
    let assignments = [];
    if (ids.length) {
      const { data } = await supabaseClient.from('security_assignments').select('profile_id,building_id,shift').in('profile_id', ids);
      assignments = data || [];
    }
    const buildingIds = [...new Set(assignments.map(a => a.building_id))];
    let bs = [];
    if (buildingIds.length) {
      const { data } = await supabaseClient.from('buildings').select('id,name').in('id', buildingIds);
      bs = data || [];
    }
    setBuildings(bs);
    // Also load the full building list so the detail-modal edit form
    // can re-assign a guard to any building, not just one that already
    // has another guard on it.
    const { data: allBs } = await supabaseClient.from('buildings').select('id,name').order('name');
    setAllBuildings(allBs || []);
    const buildingById = Object.fromEntries(bs.map(b => [b.id, b]));
    setGuards((profs || []).map(p => {
      const sa = assignments.find(a => a.profile_id === p.id);
      return {
        ...p,
        building_id: sa ? sa.building_id : null,
        building_name: sa && buildingById[sa.building_id] ? buildingById[sa.building_id].name : '—',
        shift: sa ? sa.shift : null,
      };
    }));
  };
  useEffect(() => { load(); }, []);

  // Asia/Dubai is UTC+4. On-duty schedule: Day 06–18, Night 18–06, 24h always.
  const isOnDuty = (shift) => {
    if (!shift) return false;
    if (shift === '24h') return true;
    const now = new Date();
    const dubaiHour = (now.getUTCHours() + 4) % 24;
    if (shift === 'Day')   return dubaiHour >= 6  && dubaiHour < 18;
    if (shift === 'Night') return dubaiHour >= 18 || dubaiHour < 6;
    return false;
  };

  const filtered = (guards || []).filter(g => {
    if (selectedProperties.length > 0 && !selectedProperties.includes(g.building_id)) return false;
    if (shiftFilter !== 'all' && g.shift !== shiftFilter) return false;
    if (search && !(g.full_name || '').toLowerCase().includes(search.toLowerCase()) && !(g.phone || '').includes(search)) return false;
    return true;
  });

  const onDutyCount = filtered.filter(g => isOnDuty(g.shift)).length;
  const offDutyCount = filtered.length - onDutyCount;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Guards</h1>
        </div>
        <div className="btn-group">
          <button className="btn" onClick={() => setShowDownload(true)} disabled={!guards || guards.length === 0}>Download Data</button>
          <button className="btn btn-sm" onClick={load}>Refresh</button>
        </div>
      </div>

      <ExportPrintModal
        isOpen={showDownload}
        onClose={() => setShowDownload(false)}
        dataTypes={[
          {
            id:           'guards',
            label:        'Guards',
            title:        'Guards',
            sheetName:    'Guards',
            filenameBase: 'guards',
            dateField:    'created_at',
            rows: filtered.map(g => ({ ...g, on_duty: isOnDuty(g.shift) ? 'On Duty' : 'Off Duty' })),
            columns: [
              { key: 'full_name',     header: 'Name',     width: 26 },
              { key: 'phone',         header: 'Phone',    width: 18 },
              { key: 'building_name', header: 'Building', width: 26 },
              { key: 'shift',         header: 'Shift',    width: 10 },
              { key: 'on_duty',       header: 'Status',   width: 12 },
              { key: 'created_at',    header: 'Joined',   width: 14,
                value: (r) => r.created_at ? new Date(r.created_at).toLocaleDateString() : '' },
            ],
            extraMetadata: {
              'Property Filter': selectedProperties.length === 0 ? 'All buildings' : (selectedProperties.length + ' selected'),
              'Shift Filter':   shiftFilter === 'all' ? 'All' : shiftFilter,
              'Search':         search || '—',
              'On Duty Now':    String(onDutyCount),
              'Off Duty':       String(offDutyCount),
            },
          },
          {
            id:           'shift_summary',
            label:        'Shift Summary',
            title:        'Guards — Shift Summary',
            sheetName:    'Shift Summary',
            filenameBase: 'guards-shift_summary',
            rows: (() => {
              const total = Math.max((filtered || []).length, 1);
              const shifts = ['Day','Night','24h'];
              return shifts.map(s => {
                const onShift = (filtered || []).filter(g => g.shift === s);
                const onDuty = onShift.filter(g => isOnDuty(g.shift)).length;
                return {
                  shift: s,
                  guards: onShift.length,
                  buildings: new Set(onShift.map(g => g.building_id).filter(Boolean)).size,
                  on_duty: onDuty,
                  pct: Math.round(onShift.length / total * 100),
                };
              });
            })(),
            columns: [
              { key: 'shift',     header: 'Shift',          width: 14 },
              { key: 'guards',    header: 'Guards',         width: 12, halign: 'right', numeric: true },
              { key: 'buildings', header: 'Buildings',      width: 14, halign: 'right', numeric: true },
              { key: 'on_duty',   header: 'On Duty Now',    width: 14, halign: 'right', numeric: true },
              { key: 'pct',       header: '% of Force',     width: 14, halign: 'right', numeric: true,
                value: (r) => (r.pct || 0) + '%' },
            ],
            extraMetadata: {
              'Property Filter':   selectedProperties.length === 0 ? 'All buildings' : (selectedProperties.length + ' selected'),
              'Total Guards':      String((filtered || []).length),
              'On Duty Now':       String(onDutyCount),
              'Off Duty':          String(offDutyCount),
              'Buildings Covered': String(new Set((filtered || []).map(g => g.building_id).filter(Boolean)).size),
            },
          },
        ]}
      />

      <div className="kpi-row" style={{gridTemplateColumns:'repeat(4, minmax(0, 1fr))'}}>
        <div className="kpi-card"><div className="label">Total Guards</div><div className="value">{filtered.length}</div></div>
        <div className="kpi-card"><div className="label">On Duty Now</div><div className="value" style={{color:'#5a6b4f'}}>{onDutyCount}</div></div>
        <div className="kpi-card"><div className="label">Off Duty</div><div className="value" style={{color:'#61707D'}}>{offDutyCount}</div></div>
        <div className="kpi-card"><div className="label">Buildings Covered</div><div className="value">{new Set(filtered.map(g => g.building_id).filter(Boolean)).size}</div></div>
      </div>

      <div className="card">
        <div style={{display:'flex',gap:14,flexWrap:'wrap',alignItems:'flex-end'}}>
          <div style={{flex:'1 1 160px'}}>
            <label style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:6,display:'block',fontWeight:500}}>Shift</label>
            <select className="form-input" value={shiftFilter} onChange={e => setShiftFilter(e.target.value)}>
              <option value="all">All shifts</option>
              <option>Day</option><option>Night</option><option>24h</option>
            </select>
          </div>
          <div style={{flex:'2 1 200px'}}>
            <label style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:6,display:'block',fontWeight:500}}>Search</label>
            <input type="text" className="form-input" placeholder="Name or phone…" value={search} onChange={e => setSearch(e.target.value)}/>
          </div>
          <button className="btn btn-sm" onClick={() => { setShiftFilter('all'); setSearch(''); }}>Clear filters</button>
        </div>
      </div>

      <div className="card">
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
          <div style={{fontSize:12,color:'var(--text-secondary)'}}>{filtered.length} guard{filtered.length===1?'':'s'}</div>
        </div>
        {error && <div style={{padding:10,background:'#fdf2f1',color:'#8b4a42',borderRadius:6,fontSize:12,marginBottom:14}}>{error}</div>}
        {guards === null ? (
          <div style={{padding:24,color:'var(--text-muted)',fontSize:13}}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{padding:32,color:'var(--text-muted)',fontSize:13,textAlign:'center'}}>No guards match these filters. Add some via <strong>Profile Creation → Security</strong>.</div>
        ) : (
          <table className="data-table">
            <thead><tr><th style={{width:'24%'}}>Guard</th><th style={{width:'14%'}}>Phone</th><th style={{width:'18%'}}>Building</th><th style={{width:'9%'}}>Shift</th><th style={{width:'12%'}}>Status</th><th style={{width:'10%'}}>Onboarded</th><th style={{width:'13%',textAlign:'right'}}>Actions</th></tr></thead>
            <tbody>
              {filtered.map(g => {
                const onDuty = isOnDuty(g.shift);
                const initials = (g.full_name || '').split(' ').filter(Boolean).map(p => p[0]).slice(0, 2).join('').toUpperCase() || '?';
                return (
                  <tr key={g.id}
                    style={{transition:'background 0.12s',cursor:'pointer'}}
                    onClick={() => setOpenedGuard({ guard: g, focusChat: false })}
                    onMouseEnter={e=>e.currentTarget.style.background='var(--bg-surface)'}
                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <td style={{padding:'14px 12px'}}>
                      <div style={{display:'flex',alignItems:'center',gap:12}}>
                        <div style={{width:38,height:38,borderRadius:'50%',background: onDuty ? 'linear-gradient(135deg, #d4c8c0 0%, #61707D 100%)' : 'var(--bg-surface)',border: onDuty ? 'none' : '1px solid var(--border-light)',display:'flex',alignItems:'center',justifyContent:'center',color: onDuty ? '#fff' : 'var(--text-secondary)',fontSize:12,fontWeight:600,flexShrink:0,letterSpacing:'0.04em'}}>{initials}</div>
                        <div style={{minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:500,color:'var(--text-dark)'}}>{g.full_name}</div>
                          <div style={{fontSize:11,color:'var(--text-muted)',marginTop:1}}>{g.id.slice(0,8).toUpperCase()}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{fontSize:12,color:'var(--text-secondary)',fontVariantNumeric:'tabular-nums'}}>{g.phone || '—'}</td>
                    <td>
                      <span style={{fontSize:12,padding:'4px 10px',background:'var(--bg-surface)',borderRadius:4,border:'1px solid var(--border-light)'}}>{g.building_name}</span>
                    </td>
                    <td><span style={{fontSize:12,fontWeight:500,padding:'3px 10px',background: g.shift === '24h' ? '#131F23' : g.shift === 'Night' ? '#5a4a40' : '#E6EAE9',color: g.shift === 'Day' ? '#5a4a40' : '#fff',borderRadius:3}}>{g.shift || '—'}</span></td>
                    <td>
                      <span style={{display:'inline-flex',alignItems:'center',gap:8,fontSize:12,padding:'4px 10px',background: onDuty ? '#eef2e8' : 'var(--bg-surface)',color: onDuty ? '#4a5a3f' : '#61707D',borderRadius:4,fontWeight:500}}>
                        <span style={{position:'relative',width:8,height:8}}>
                          <span style={{position:'absolute',inset:0,borderRadius:4,background: onDuty ? '#5a6b4f' : '#D0D6D5'}}/>
                          {onDuty && <span style={{position:'absolute',inset:-3,borderRadius:7,background:'#5a6b4f',opacity:0.25,animation:'pulse 2s ease-in-out infinite'}}/>}
                        </span>
                        {onDuty ? 'On duty' : 'Off duty'}
                      </span>
                    </td>
                    <td style={{fontSize:12,color:'var(--text-secondary)',fontVariantNumeric:'tabular-nums'}}>{g.created_at ? new Date(g.created_at).toLocaleDateString() : '—'}</td>
                    <td style={{textAlign:'right',whiteSpace:'nowrap'}}>
                      <button
                        onClick={e => { e.stopPropagation(); setOpenedGuard({ guard: g, focusChat: true }); }}
                        style={{padding:'6px 14px',fontSize:11,background:'#fff',border:'1px solid var(--border-medium)',borderRadius:4,color:'var(--text-dark)',cursor:'pointer',fontWeight:500}}>Chat</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {openedGuard && (
        <GuardDetailModal
          guard={openedGuard.guard}
          focusChat={openedGuard.focusChat}
          buildings={allBuildings}
          onClose={() => setOpenedGuard(null)}
          onSaved={() => { setOpenedGuard(null); load(); }}
        />
      )}
    </div>
  );
};

// ===== GuardDetailModal =====
// Click any guard row (or the per-row Chat button) to open this. The header
// shows the guard at a glance; below it the "Details" pane is an inline
// editable form (saves to profiles + security_assignments) and the "Chat"
// pane is a per-guard direct message thread stored in data.chatMessages
// under the deterministic roomId "guard-direct-{guard.id}". The same poll
// that syncs the rest of app_state picks up new messages automatically.
const GuardDetailModal = ({ guard, focusChat, buildings, onClose, onSaved }) => {
  const { data, setData } = useApp();
  const [tab, setTab] = useState(focusChat ? 'chat' : 'details');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    full_name:   guard.full_name || '',
    phone:       guard.phone || '',
    building_id: guard.building_id || '',
    shift:       guard.shift || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSave = async () => {
    if (!supabaseClient) { setError('Supabase not initialized'); return; }
    setSaving(true); setError(null);
    try {
      const { error: pe } = await supabaseClient.from('profiles')
        .update({ full_name: form.full_name.trim() || null, phone: form.phone.trim() || null })
        .eq('id', guard.id);
      if (pe) throw pe;
      // Upsert the security_assignments row — one per guard. If the user
      // cleared the building or shift, drop the assignment instead.
      if (form.building_id && form.shift) {
        const { error: ae } = await supabaseClient.from('security_assignments')
          .upsert({ profile_id: guard.id, building_id: form.building_id, shift: form.shift }, { onConflict: 'profile_id' });
        if (ae) throw ae;
      } else {
        await supabaseClient.from('security_assignments').delete().eq('profile_id', guard.id);
      }
      onSaved();
    } catch (e) {
      setError(e.message || String(e));
      setSaving(false);
    }
  };

  const initials = (guard.full_name || '').split(' ').filter(Boolean).map(p => p[0]).slice(0, 2).join('').toUpperCase() || '?';
  const roomId = 'guard-direct-' + guard.id;
  const messages = (data.chatMessages || []).filter(m => m.roomId === roomId);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{maxWidth:640,padding:0,overflow:'hidden'}}>
        {/* Header */}
        <div style={{display:'flex',alignItems:'center',gap:14,padding:'18px 22px',borderBottom:'1px solid var(--border-light)'}}>
          <div style={{width:48,height:48,borderRadius:'50%',background:'linear-gradient(135deg, #d4c8c0 0%, #61707D 100%)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:14,fontWeight:600,flexShrink:0,letterSpacing:'0.04em'}}>{initials}</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:11,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-muted)'}}>Security guard</div>
            <h2 style={{fontSize:18,margin:'2px 0 0',color:'var(--text-dark)'}}>{guard.full_name || '—'}</h2>
            <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2,fontVariantNumeric:'tabular-nums'}}>{guard.id.slice(0,8).toUpperCase()}</div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        {/* Tabs */}
        <div style={{display:'flex',gap:4,padding:'12px 22px 0',borderBottom:'1px solid var(--border-light)'}}>
          {[{key:'details',label:'Details'},{key:'chat',label:'Chat' + (messages.length ? ' · ' + messages.length : '')}].map(t => (
            <div key={t.key}
              onClick={() => setTab(t.key)}
              style={{padding:'10px 16px',cursor:'pointer',fontSize:13,fontWeight: tab===t.key ? 600 : 400,color: tab===t.key ? 'var(--text-dark)' : 'var(--text-secondary)',borderBottom: tab===t.key ? '2px solid var(--bg-warm-dark)' : '2px solid transparent',marginBottom:-1}}>
              {t.label}
            </div>
          ))}
        </div>

        {/* Body */}
        <div style={{padding:'18px 22px',maxHeight:'60vh',overflowY:'auto'}}>
          {tab === 'details' && (
            <div>
              {error && <div style={{padding:10,background:'#fdf2f1',color:'#8b4a42',borderRadius:6,fontSize:12,marginBottom:12}}>{error}</div>}
              {!editing ? (
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'14px 24px'}}>
                  <Field label="Full name"  value={guard.full_name || '—'}/>
                  <Field label="Phone"      value={guard.phone || '—'}/>
                  <Field label="Building"   value={guard.building_name || '—'}/>
                  <Field label="Shift"      value={guard.shift || '—'}/>
                  <Field label="Onboarded"  value={guard.created_at ? new Date(guard.created_at).toLocaleDateString() : '—'}/>
                  <Field label="Profile ID" value={guard.id}/>
                </div>
              ) : (
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'14px 16px'}}>
                  <EditField label="Full name" value={form.full_name} onChange={v => setForm(f => ({...f, full_name: v}))}/>
                  <EditField label="Phone"     value={form.phone}     onChange={v => setForm(f => ({...f, phone: v}))}/>
                  <div>
                    <div style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:6,fontWeight:500}}>Building</div>
                    <select className="form-input" value={form.building_id} onChange={e => setForm(f => ({...f, building_id: e.target.value}))}>
                      <option value="">— None —</option>
                      {(buildings || []).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:6,fontWeight:500}}>Shift</div>
                    <select className="form-input" value={form.shift} onChange={e => setForm(f => ({...f, shift: e.target.value}))}>
                      <option value="">— None —</option>
                      <option>Day</option><option>Night</option><option>24h</option>
                    </select>
                  </div>
                </div>
              )}

              <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:18}}>
                {!editing ? (
                  <button className="btn btn-sm" onClick={() => setEditing(true)}>Edit</button>
                ) : (
                  <>
                    <button className="btn btn-sm" disabled={saving} onClick={() => { setEditing(false); setForm({ full_name: guard.full_name || '', phone: guard.phone || '', building_id: guard.building_id || '', shift: guard.shift || '' }); setError(null); }}>Cancel</button>
                    <button className="btn btn-primary btn-sm" disabled={saving} onClick={handleSave}>{saving ? 'Saving…' : 'Save'}</button>
                  </>
                )}
              </div>
            </div>
          )}

          {tab === 'chat' && (
            <GuardChatPane guard={guard} roomId={roomId} messages={messages} data={data} setData={setData}/>
          )}
        </div>
      </div>
    </div>
  );
};

const Field = ({ label, value }) => (
  <div>
    <div style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:4,fontWeight:500}}>{label}</div>
    <div style={{fontSize:13,color:'var(--text-dark)',wordBreak:'break-word'}}>{value}</div>
  </div>
);
const EditField = ({ label, value, onChange }) => (
  <div>
    <div style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:6,fontWeight:500}}>{label}</div>
    <input className="form-input" value={value} onChange={e => onChange(e.target.value)}/>
  </div>
);

// Lightweight per-guard direct chat. Stores messages in the same
// `data.chatMessages` blob the existing chat panel uses, but partitions
// them with roomId = "guard-direct-{guard.id}" so it does not collide
// with general/announcement rooms.
const GuardChatPane = ({ guard, roomId, messages, data, setData }) => {
  const [draft, setDraft] = useState('');
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    const me = data.currentUser || { id: 'pmc', name: 'PMC', role: 'manager' };
    const stamp = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai' });
    const msg = {
      id: Date.now(),
      roomId,
      senderId: me.id || 'pmc',
      senderName: me.name || 'PMC',
      senderRole: me.role || 'manager',
      text,
      timestamp: stamp,
      read: false,
    };
    setData(prev => ({ ...prev, chatMessages: [...(prev.chatMessages || []), msg] }));
    setDraft('');
  };

  return (
    <div style={{display:'flex',flexDirection:'column',height:340}}>
      <div style={{flex:1,overflowY:'auto',padding:'4px 2px',display:'flex',flexDirection:'column',gap:8}}>
        {messages.length === 0 ? (
          <div style={{margin:'auto',color:'var(--text-muted)',fontSize:12,textAlign:'center',padding:24}}>
            No messages yet.<br/>Say hello to {guard.full_name?.split(' ')[0] || 'this guard'}.
          </div>
        ) : messages.map(m => {
          const fromMe = m.senderRole === 'manager' || m.senderRole === 'pmc';
          return (
            <div key={m.id} style={{alignSelf: fromMe ? 'flex-end' : 'flex-start',maxWidth:'78%'}}>
              <div style={{padding:'8px 12px',borderRadius:10,background: fromMe ? 'var(--bg-warm-dark)' : 'var(--bg-surface)',color: fromMe ? '#fff' : 'var(--text-dark)',fontSize:13,lineHeight:1.4,wordBreak:'break-word'}}>
                {m.text}
              </div>
              <div style={{fontSize:10,color:'var(--text-muted)',marginTop:2,textAlign: fromMe ? 'right' : 'left'}}>
                {fromMe ? 'You' : (m.senderName || 'Guard')} · {m.timestamp}
              </div>
            </div>
          );
        })}
        <div ref={endRef}/>
      </div>
      <div style={{display:'flex',gap:8,marginTop:10,paddingTop:10,borderTop:'1px solid var(--border-light)'}}>
        <input
          className="form-input"
          placeholder={'Message ' + (guard.full_name?.split(' ')[0] || 'guard') + '…'}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          style={{flex:1}}
        />
        <button className="btn btn-primary btn-sm" disabled={!draft.trim()} onClick={send}>Send</button>
      </div>
    </div>
  );
};

