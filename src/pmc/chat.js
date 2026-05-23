// ==================== CHAT PAGE ====================
const ChatPage = () => {
  const { data, setData, showToast } = useApp();
  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const [messageText, setMessageText] = useState('');
  const [newChatWith, setNewChatWith] = useState('');
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const messagesEndRef = useRef(null);

  const currentUser = data.currentUser;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [data.chatMessages, selectedRoomId]);

  const currentRoom = data.chatRooms?.find(r => r.id === selectedRoomId);
  const currentRoomMessages = data.chatMessages?.filter(m => m.roomId === selectedRoomId) || [];

  const handleSendMessage = () => {
    if (!messageText.trim() || !selectedRoomId) return;

    const newMessage = {
      id: Date.now(),
      roomId: selectedRoomId,
      senderId: currentUser.id || 'pm-1',
      senderName: currentUser.name,
      senderRole: currentUser.role,
      text: messageText,
      timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai' }),
      read: false
    };

    setData(prev => ({
      ...prev,
      chatMessages: [...prev.chatMessages, newMessage],
      chatRooms: prev.chatRooms.map(room =>
        room.id === selectedRoomId
          ? { ...room, lastMessage: messageText, lastMessageTime: newMessage.timestamp, unreadCount: 0 }
          : room
      )
    }));

    setMessageText('');
  };

  const handleCreateNewChat = () => {
    if (!newChatWith.trim()) return;
    // Parse the format "User Name (Role)"
    const match = newChatWith.match(/^(.+?)\s*\(([^)]+)\)$/);
    if (!match) {
      showToast('Please enter in format: Name (Role)');
      return;
    }
    const [, name, role] = match;
    const roomId = 'new-' + Date.now();
    const newRoom = {
      id: roomId,
      participants: [
        { id: currentUser.id || 'pm-1', name: currentUser.name, role: currentUser.role },
        { id: 'user-' + Date.now(), name: name.trim(), role: role.trim() }
      ],
      lastMessage: '',
      lastMessageTime: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      unreadCount: 0
    };
    setData(prev => ({
      ...prev,
      chatRooms: [...prev.chatRooms, newRoom]
    }));
    setSelectedRoomId(roomId);
    setNewChatWith('');
    setShowNewChatModal(false);
    showToast('Chat room created');
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t('sec.messages')}</h1>
          <div className="subtitle">Real-time chat across all roles</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNewChatModal(true)}>+ New Chat</button>
      </div>

      {!selectedRoomId ? (
        <div className="card">
          {(data.chatRooms || []).length === 0 ? (
            <div style={{padding:40,textAlign:'center',color:'var(--text-muted)'}}>
              <div style={{fontSize:14,marginBottom:16}}>No conversations yet</div>
              <button className="btn btn-primary" onClick={() => setShowNewChatModal(true)}>Start a New Chat</button>
            </div>
          ) : (
            <div className="data-table" style={{width:'100%'}}>
              <table style={{width:'100%'}}>
                <thead>
                  <tr>
                    <th>Contact</th>
                    <th>Role</th>
                    <th>Last Message</th>
                    <th>Time</th>
                    <th style={{textAlign:'right'}}>Unread</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.chatRooms || []).map(room => {
                    const otherParticipants = room.participants.filter(p => p.name !== currentUser.name);
                    return (
                      <tr key={room.id} onClick={() => setSelectedRoomId(room.id)} style={{cursor:'pointer'}}>
                        <td className="name-cell">{otherParticipants.map(p => p.name).join(', ')}</td>
                        <td>{otherParticipants.map(p => p.role).join(', ')}</td>
                        <td style={{maxWidth:300,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{room.lastMessage || '—'}</td>
                        <td>{room.lastMessageTime}</td>
                        <td style={{textAlign:'right'}}>
                          {room.unreadCount > 0 && (
                            <div style={{background:'var(--bg-warm-dark)',color:'#fff',borderRadius:'50%',width:24,height:24,display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:'600'}}>{room.unreadCount}</div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="card" style={{display:'flex',flexDirection:'column',height:'calc(100vh - 200px)',maxHeight:800}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16,paddingBottom:16,borderBottom:'1px solid var(--border-light)'}}>
            <div>
              <h2 style={{fontSize:16,fontWeight:600,marginBottom:4}}>
                {currentRoom?.participants.filter(p => p.name !== currentUser.name).map(p => p.name).join(', ')}
              </h2>
              <div style={{fontSize:12,color:'var(--text-muted)'}}>
                {currentRoom?.participants.filter(p => p.name !== currentUser.name).map(p => p.role).join(', ')}
              </div>
            </div>
            <button onClick={() => setSelectedRoomId(null)} style={{background:'none',border:'none',cursor:'pointer',fontSize:20,color:'var(--text-muted)'}}>×</button>
          </div>

          <div style={{flex:1,overflowY:'auto',marginBottom:16,paddingBottom:16,background:'#fafafa',borderRadius:8,padding:16,display:'flex',flexDirection:'column'}}>
            {currentRoomMessages.length === 0 ? (
              <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-muted)',fontSize:13}}>
                No messages yet. Start the conversation!
              </div>
            ) : (
              currentRoomMessages.map(msg => (
                <div key={msg.id} style={{marginBottom:12,display:'flex',justifyContent:msg.senderId === (currentUser.id || 'pm-1') ? 'flex-end' : 'flex-start'}}>
                  <div style={{maxWidth:'70%',padding:'12px 14px',borderRadius:12,background:msg.senderId === (currentUser.id || 'pm-1') ? 'var(--bg-warm-light)' : '#fff',border:msg.senderId === (currentUser.id || 'pm-1') ? 'none' : '1px solid var(--border-light)',boxShadow:'0 1px 3px rgba(0,0,0,0.08)'}}>
                    <div style={{fontSize:11,fontWeight:500,color:'var(--text-secondary)',marginBottom:4}}>{msg.senderName}</div>
                    <div style={{fontSize:13,color:'var(--text-dark)',marginBottom:6,wordWrap:'break-word',lineHeight:1.4}}>{msg.text}</div>
                    <div style={{fontSize:10,color:'var(--text-muted)',textAlign:'right',display:'flex',justifyContent:'flex-end',gap:4,alignItems:'center'}}>
                      {msg.timestamp} {msg.read && <span>✓</span>}
                    </div>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          <div style={{display:'flex',gap:8}}>
            <input
              type="text"
              value={messageText}
              onChange={e => setMessageText(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && handleSendMessage()}
              placeholder="Type a message..."
              style={{flex:1,padding:'12px 14px',border:'1px solid var(--border-light)',borderRadius:8,fontSize:13,fontFamily:'inherit',outline:'none',background:'#fff'}}
            />
            <button onClick={handleSendMessage} className="btn btn-primary">Send</button>
          </div>
        </div>
      )}

      {/* New Chat Modal */}
      {showNewChatModal && (
        <div className="modal-overlay" onClick={() => setShowNewChatModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Start New Chat</h2>
              <button className="modal-close" onClick={() => setShowNewChatModal(false)}>×</button>
            </div>
            <div className="form-group">
              <label>Contact (Name and Role)</label>
              <input
                type="text"
                value={newChatWith}
                onChange={e => setNewChatWith(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && handleCreateNewChat()}
                placeholder="e.g., Ahmed Khalil (Security Guard)"
                className="form-input"
              />
              <div style={{fontSize:11,color:'var(--text-muted)',marginTop:8}}>Enter the contact name and their role in parentheses</div>
            </div>
            <div style={{display:'flex',gap:8,marginTop:24}}>
              <button className="btn" onClick={() => setShowNewChatModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreateNewChat}>Create Chat</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const GuardsPage = ({ searchSelectedItem, clearSearchSelection }) => {
  const { data, setData, showToast } = useApp();
  const [selectedGuard, setSelectedGuard] = useState(null);
  const [showAddGuard, setShowAddGuard] = useState(false);
  const [addStep, setAddStep] = useState(1);
  const [showDeactivate, setShowDeactivate] = useState(null);
  const [showCallPopup, setShowCallPopup] = useState(null);
  const [showChatPanel, setShowChatPanel] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [showDocViewer, setShowDocViewer] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [editingGuard, setEditingGuard] = useState(null); // holds editable copy
  const pageSize = 10;
  const fileInputRef = useRef(null);
  const dropZoneRef = useRef(null);
  const profileUploadRef = useRef(null);

  // Add Guard form state — documents now store {name, size, type, dataUrl}
  const [addGuardForm, setAddGuardForm] = useState({
    fullName: '',
    company: '',
    contact: '',
    gate: '',
    shift: '',
    accessTimes: '',
    documents: []
  });

  const handleFileSelect = (files) => {
    const fileArray = Array.from(files);
    const readers = fileArray.map(file => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          resolve({ name: file.name, size: (file.size / 1024 / 1024).toFixed(1) + ' MB', type: file.name.split('.').pop().toLowerCase(), dataUrl: e.target.result });
        };
        reader.readAsDataURL(file);
      });
    });
    Promise.all(readers).then(newDocs => {
      setAddGuardForm(prev => ({ ...prev, documents: [...prev.documents, ...newDocs] }));
    });
  };

  const handleRemoveDoc = (idx) => {
    setAddGuardForm(prev => ({ ...prev, documents: prev.documents.filter((_, i) => i !== idx) }));
  };

  const handleStartEdit = () => {
    setEditingGuard({ ...selectedGuard });
  };

  const handleSaveEdit = () => {
    setData(prev => ({ ...prev, guards: prev.guards.map(g => g.id === editingGuard.id ? editingGuard : g) }));
    setSelectedGuard(editingGuard);
    setEditingGuard(null);
    showToast('Guard profile updated!');
  };

  const handleProfileDocUpload = (files) => {
    if (!selectedGuard) return;
    const fileArray = Array.from(files);
    const readers = fileArray.map(file => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          resolve({
            id: `DOC-${String(data.documents.length + Math.random() * 1000 | 0).padStart(3, '0')}`,
            name: `${selectedGuard.name} — ${file.name}`,
            type: file.name.split('.').pop().toLowerCase(),
            owner: selectedGuard.id,
            ownerName: selectedGuard.name,
            category: 'guard',
            size: (file.size / 1024 / 1024).toFixed(1) + ' MB',
            uploadedAt: formatDate(new Date()),
            status: 'pending',
            dataUrl: e.target.result
          });
        };
        reader.readAsDataURL(file);
      });
    });
    Promise.all(readers).then(newDocs => {
      setData(prev => ({ ...prev, documents: [...prev.documents, ...newDocs] }));
      showToast(`${newDocs.length} document${newDocs.length > 1 ? 's' : ''} uploaded!`);
    });
  };

  // Open guard profile from search
  useEffect(() => {
    if (searchSelectedItem && searchSelectedItem.type === 'Guard' && searchSelectedItem.sourceData) {
      const guard = data.guards.find(g => g.id === searchSelectedItem.sourceData.id);
      if (guard) setSelectedGuard(guard);
      if (clearSearchSelection) clearSearchSelection();
    }
  }, [searchSelectedItem]);

  const onDuty = data.guards.filter(g => g.status === 'On Duty');
  const totalGuards = data.guards.length;
  const onDutyCount = onDuty.length;
  const verifiedCount = data.guards.filter(g => g.verified).length;

  // Shift overview calculations
  const shiftBreakdown = {
    'Morning': data.guards.filter(g => g.shift === 'Morning' && g.status === 'On Duty').length,
    'Afternoon': data.guards.filter(g => g.shift === 'Afternoon' && g.status === 'On Duty').length,
    'Night': data.guards.filter(g => g.shift === 'Night' && g.status === 'On Duty').length
  };

  // Documents for selected guard
  const guardDocuments = selectedGuard ? data.documents.filter(doc => doc.owner === selectedGuard.id || doc.guardId === selectedGuard.id) : [];

  // Messages for selected guard
  const guardMessages = selectedGuard ? (data.chatMessages || []).filter(msg => msg.guardId === selectedGuard.id).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)) : [];

  const handleSendMessage = () => {
    if (!chatInput.trim() || !selectedGuard) return;
    const newMessage = {
      id: `msg-${Date.now()}`,
      from: 'PMC',
      to: selectedGuard.id,
      guardId: selectedGuard.id,
      text: chatInput,
      timestamp: new Date().toISOString(),
      senderName: 'PMC User'
    };
    setData({
      ...data,
      chatMessages: [...(data.chatMessages || []), newMessage]
    });
    setChatInput('');
  };

  const handleDeactivateGuard = () => {
    const updated = data.guards.filter(g => g.id !== showDeactivate.id);
    setData({ ...data, guards: updated });
    setSelectedGuard(null);
    setShowDeactivate(null);
    showToast(`Guard ${showDeactivate.name} has been deactivated`);
  };

  const handleAddGuardCreate = () => {
    if (!addGuardForm.fullName || !addGuardForm.company || !addGuardForm.contact || !addGuardForm.gate || !addGuardForm.shift) {
      showToast('Please complete all required fields');
      return;
    }
    const newGuardId = `GRD-${String(data.guards.length + 1).padStart(3, '0')}`;
    const newGuard = {
      id: newGuardId,
      name: addGuardForm.fullName,
      shift: addGuardForm.shift,
      shiftTime: addGuardForm.shift === 'Morning' ? '06:00–14:00' : addGuardForm.shift === 'Afternoon' ? '14:00–22:00' : '22:00–06:00',
      gate: addGuardForm.gate,
      company: addGuardForm.company,
      contact: addGuardForm.contact,
      status: 'Off Duty',
      verified: false
    };
    const now = new Date();
    const dateStr = formatDate(now);
    const newDocs = addGuardForm.documents.map((doc, idx) => ({
      id: `DOC-${String(data.documents.length + idx + 1).padStart(3, '0')}`,
      name: `${addGuardForm.fullName} — ${doc.name}`,
      type: doc.type || 'pdf',
      owner: newGuardId,
      ownerName: addGuardForm.fullName,
      category: 'guard',
      size: doc.size || '1.0 MB',
      uploadedAt: dateStr,
      status: 'pending',
      dataUrl: doc.dataUrl || null
    }));
    setData({
      ...data,
      guards: [...data.guards, newGuard],
      documents: [...data.documents, ...newDocs]
    });
    setShowAddGuard(false);
    setAddStep(1);
    setAddGuardForm({ fullName: '', company: '', contact: '', gate: '', shift: '', accessTimes: '', documents: [] });
    showToast('Guard profile created!');
  };

  const paginatedGuards = data.guards.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1>{t('pm.guardsTitle')}</h1>
          <div className="subtitle">{totalGuards} {t('pm.guardsRegistered')} · {onDutyCount} {t('pm.guardsOnDuty')} · {totalGuards - verifiedCount} {t('pm.guardsPendingVerification')}</div>
        </div>
        <button className="btn btn-primary" onClick={() => { setShowAddGuard(true); setAddStep(1); }}>+ Add Guard</button>
      </div>

      {/* Currently On Duty */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3>Currently On Duty <span style={{ background: '#f0f0f0', padding: '2px 8px', borderRadius: 4, fontSize: 11, marginLeft: 8 }}>{onDuty.length} active</span></h3>
        </div>
        <div className="guard-carousel">
          {onDuty.map(g => (
            <div key={g.id} className="guard-chip" style={{ cursor: 'pointer' }} onClick={() => setSelectedGuard(g)}>
              <div className="avatar-sm"><Icon name="user" size={14} /></div>
              <div>
                <div style={{ fontWeight: 500, fontSize: 13 }}>{g.name}</div>
                <div style={{ fontSize: 11, color: '#888' }}>{g.shift === 'Morning' ? 'Senior Guard' : 'Gate Captain'} · {g.gate}</div>
              </div>
              <button className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={(e) => { e.stopPropagation(); setShowCallPopup(g); }}><Icon name="phone" size={12} /></button>
            </div>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        <div className="kpi-card"><div className="label">Total Guards</div><span className="value">{totalGuards}</span></div>
        <div className="kpi-card"><div className="label">On Duty</div><span className="value">{onDutyCount}</span></div>
        <div className="kpi-card"><div className="label">Verified</div><span className="value">{verifiedCount}</span></div>
      </div>

      {/* Two-column layout: Guard Roster + Shift Overview */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: 12 }}>
        {/* Guard Roster Table */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="card-header"><h3>Guard Roster</h3><button className="btn btn-sm"><Icon name="filter" size={12} /> Filter by Shift</button></div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
              <thead>
                <tr><th style={{minWidth:120}}>Name</th><th style={{minWidth:90}}>Shift</th><th>Gate / Post</th><th>Company</th><th>Contact</th><th>Status</th><th>Verified</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {paginatedGuards.map(g => (
                  <tr key={g.id}>
                    <td><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div className="avatar-sm" style={{ width: 24, height: 24, flexShrink: 0 }}><Icon name="user" size={10} /></div><div><div style={{fontWeight:500,fontSize:12}}>{g.name}</div><div style={{fontSize:10,color:'#a89a92'}}>{g.id}</div></div></div></td>
                    <td><div style={{fontSize:12}}>{g.shift}</div><div style={{fontSize:10,color:'#a89a92'}}>{g.shiftTime}</div></td>
                    <td style={{fontSize:12}}>{g.gate}</td>
                    <td style={{fontSize:12}}>{g.company}</td>
                    <td style={{fontSize:11}}>{g.contact}</td>
                    <td><StatusBadge status={g.status} /></td>
                    <td>{g.verified ? <span className="status verified" style={{fontSize:11}}>✓ Verified</span> : <StatusBadge status="Pending" />}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-sm" style={{fontSize:11,padding:'4px 10px'}} onClick={() => setSelectedGuard(g)}>Profile</button>
                        <button className="btn btn-sm" style={{fontSize:11,padding:'4px 8px'}} onClick={() => setShowDeactivate(g)}>⋯</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination total={totalGuards} pageSize={pageSize} page={currentPage} onPageChange={setCurrentPage} />
        </div>

        {/* Shift Overview Panel */}
        <div className="card" style={{ padding: 14 }}>
          <h4 style={{ marginBottom: 12, fontSize: 13, fontWeight: 600 }}>Shift Overview</h4>
          {['Morning', 'Afternoon', 'Night'].map(shift => {
            const shiftTime = shift === 'Morning' ? '06:00–14:00' : shift === 'Afternoon' ? '14:00–22:00' : '22:00–06:00';
            const shiftGuards = data.guards.filter(g => g.shift === shift);
            const onDutyNames = shiftGuards.filter(g => g.status === 'On Duty').map(g => g.gate);
            return (
              <div key={shift} style={{ marginBottom: 10, padding: '10px 12px', background: '#f9f9f9', borderRadius: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{shift} {shiftTime}</div>
                <div style={{ fontSize: 10, color: '#888' }}>{onDutyNames.length > 0 ? onDutyNames.join(', ') : 'No guards on duty'}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Guard Profile Modal */}
      {selectedGuard && (
        <div className="modal-overlay" onClick={() => { setSelectedGuard(null); setShowChatPanel(false); setEditingGuard(null); }}>
          <div className="modal" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div><div className="modal-sub">modal/guard/profile · Guard Tablet Profile</div><h2>Guard Profile</h2></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {!editingGuard && !showChatPanel && <button className="btn btn-sm" onClick={handleStartEdit}><Icon name="edit" size={12} /> Edit</button>}
                <button className="modal-close" onClick={() => { setSelectedGuard(null); setShowChatPanel(false); setEditingGuard(null); }}>×</button>
              </div>
            </div>
            <div className="wizard-steps"><span className="wizard-step">① Compose</span><span className="wizard-sep">›</span><span className="wizard-step">② Audience</span><span className="wizard-sep">›</span><span className="wizard-step">③ Schedule</span><span className="wizard-sep">›</span><span className="wizard-step active">④ Preview</span></div>

            <input type="file" ref={profileUploadRef} multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" style={{ display: 'none' }}
              onChange={(e) => { if (e.target.files.length > 0) handleProfileDocUpload(e.target.files); e.target.value = ''; }} />

            {!showChatPanel ? (
              <div>
                {/* Guard Info */}
                {editingGuard ? (
                  <div style={{ marginBottom: 20 }}>
                    <div className="form-group" style={{ marginBottom: 10 }}><label style={{ fontSize: 11, color: '#888' }}>Full Name</label><input className="form-input" value={editingGuard.name} onChange={e => setEditingGuard({ ...editingGuard, name: e.target.value })} /></div>
                    <div className="grid-2" style={{ gap: 10 }}>
                      <div className="form-group" style={{ marginBottom: 10 }}><label style={{ fontSize: 11, color: '#888' }}>Company</label><input className="form-input" value={editingGuard.company} onChange={e => setEditingGuard({ ...editingGuard, company: e.target.value })} /></div>
                      <div className="form-group" style={{ marginBottom: 10 }}><label style={{ fontSize: 11, color: '#888' }}>Contact</label><input className="form-input" value={editingGuard.contact} onChange={e => setEditingGuard({ ...editingGuard, contact: e.target.value })} /></div>
                      <div className="form-group" style={{ marginBottom: 10 }}><label style={{ fontSize: 11, color: '#888' }}>Gate / Post</label><input className="form-input" value={editingGuard.gate} onChange={e => setEditingGuard({ ...editingGuard, gate: e.target.value })} /></div>
                      <div className="form-group" style={{ marginBottom: 10 }}><label style={{ fontSize: 11, color: '#888' }}>Shift</label>
                        <select className="form-input" value={editingGuard.shift} onChange={e => setEditingGuard({ ...editingGuard, shift: e.target.value, shiftTime: e.target.value === 'Morning' ? '06:00–14:00' : e.target.value === 'Afternoon' ? '14:00–22:00' : '22:00–06:00' })}>
                          <option value="Morning">Morning</option><option value="Afternoon">Afternoon</option><option value="Night">Night</option>
                        </select>
                      </div>
                      <div className="form-group" style={{ marginBottom: 10 }}><label style={{ fontSize: 11, color: '#888' }}>Status</label>
                        <select className="form-input" value={editingGuard.status} onChange={e => setEditingGuard({ ...editingGuard, status: e.target.value })}>
                          <option value="On Duty">On Duty</option><option value="Off Duty">Off Duty</option>
                        </select>
                      </div>
                      <div className="form-group" style={{ marginBottom: 10 }}><label style={{ fontSize: 11, color: '#888' }}>Verified</label>
                        <select className="form-input" value={editingGuard.verified ? 'yes' : 'no'} onChange={e => setEditingGuard({ ...editingGuard, verified: e.target.value === 'yes' })}>
                          <option value="yes">Verified</option><option value="no">Pending</option>
                        </select>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSaveEdit}>Save Changes</button>
                      <button className="btn" style={{ flex: 1 }} onClick={() => setEditingGuard(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                      <div style={{ width: 48, height: 48, background: '#f0f0f0', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="user" size={20} /></div>
                      <div><div style={{ fontWeight: 600, fontSize: 16 }}>{selectedGuard.name}</div><div style={{ fontSize: 12, color: '#888' }}>{selectedGuard.id} · {selectedGuard.company}</div><StatusBadge status={selectedGuard.status} /></div>
                    </div>
                    <div className="grid-2" style={{ marginBottom: 16 }}>
                      <div><div style={{ fontSize: 11, color: '#888' }}>Shift</div><div style={{ fontWeight: 600 }}>{selectedGuard.shift} {selectedGuard.shiftTime}</div></div>
                      <div><div style={{ fontSize: 11, color: '#888' }}>Gate / Post</div><div style={{ fontWeight: 600 }}>{selectedGuard.gate}</div></div>
                      <div><div style={{ fontSize: 11, color: '#888' }}>Contact</div><div style={{ fontWeight: 600 }}>{selectedGuard.contact}</div></div>
                      <div><div style={{ fontSize: 11, color: '#888' }}>Verification</div><div style={{ fontWeight: 600 }}>{selectedGuard.verified ? 'Verified ✓' : 'Pending'}</div></div>
                    </div>
                  </div>
                )}

                {/* Security Documents */}
                {!editingGuard && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <h4 style={{ fontSize: 13, fontWeight: 600 }}>Security Documents</h4>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-sm" onClick={() => profileUploadRef.current && profileUploadRef.current.click()}><Icon name="upload" size={10} /> Upload</button>
                        {guardDocuments.length > 1 && (
                          <button className="btn btn-sm" onClick={() => {
                            guardDocuments.forEach(doc => {
                              if (doc.dataUrl) {
                                const a = document.createElement('a'); a.href = doc.dataUrl; a.download = doc.name; document.body.appendChild(a); a.click(); document.body.removeChild(a);
                              }
                            });
                            showToast(`Downloading ${guardDocuments.length} documents...`);
                          }}><Icon name="download" size={10} /> All</button>
                        )}
                      </div>
                    </div>
                    {guardDocuments.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
                        {guardDocuments.map(doc => (
                          <div key={doc.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#f9f9f9', borderRadius: 6, fontSize: 12 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.name}</div>
                              <div style={{ color: '#888', fontSize: 10 }}>{doc.type.toUpperCase()} · {doc.size} · {doc.uploadedAt}</div>
                            </div>
                            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                              <button className="btn btn-sm" style={{ fontSize: 10, padding: '3px 8px' }} onClick={() => setShowDocViewer(doc)}>View</button>
                              <button className="btn btn-sm" style={{ fontSize: 10, padding: '3px 8px' }} onClick={() => {
                                if (doc.dataUrl) {
                                  const a = document.createElement('a'); a.href = doc.dataUrl; a.download = doc.name; document.body.appendChild(a); a.click(); document.body.removeChild(a);
                                  showToast('Download started!');
                                } else { showToast('Sample entry — no file data'); }
                              }}>Download</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div onClick={() => profileUploadRef.current && profileUploadRef.current.click()} style={{ background: '#f9f9f9', borderRadius: 8, padding: 24, textAlign: 'center', color: '#999', fontSize: 12, cursor: 'pointer', border: '2px dashed #e0e0e0' }}>No documents uploaded<br /><span style={{ color: '#1a1a1a', fontWeight: 600 }}>Click to upload files</span></div>
                    )}
                  </div>
                )}

                {/* Action Buttons */}
                {!editingGuard && (
                  <div className="grid-3">
                    <button className="btn" onClick={() => setShowCallPopup(selectedGuard)}><Icon name="phone" size={14} /> Call</button>
                    <button className="btn" onClick={() => setShowChatPanel(true)}>Message</button>
                    <button className="btn btn-danger" onClick={() => setShowDeactivate(selectedGuard)}>Deactivate</button>
                  </div>
                )}
              </div>
            ) : (
              /* Chat Panel */
              <div>
                <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Message {selectedGuard.name}</h4>
                <div style={{ background: '#f9f9f9', borderRadius: 6, padding: 12, height: 240, overflowY: 'auto', marginBottom: 12 }}>
                  {guardMessages.length > 0 ? (
                    guardMessages.map(msg => (
                      <div key={msg.id} style={{ marginBottom: 12, display: 'flex', justifyContent: msg.from === 'PMC' ? 'flex-end' : 'flex-start' }}>
                        <div style={{ maxWidth: '75%', background: msg.from === 'PMC' ? '#1a1a1a' : '#e8e8e8', color: msg.from === 'PMC' ? '#fff' : '#1a1a1a', padding: '8px 12px', borderRadius: 6, fontSize: 12 }}>
                          {msg.text}
                          <div style={{ fontSize: 10, marginTop: 4, opacity: 0.7 }}>{formatTime24(new Date(msg.timestamp))}</div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ textAlign: 'center', color: '#888', paddingTop: 80 }}>No messages yet</div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="text" className="form-input" placeholder="Type message..." value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleSendMessage()} style={{ flex: 1 }} />
                  <button className="btn btn-primary" onClick={handleSendMessage}>Send</button>
                </div>
                <button className="btn" style={{ width: '100%', marginTop: 12 }} onClick={() => setShowChatPanel(false)}>← Back to Profile</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add Guard Modal */}
      {showAddGuard && (
        <div className="modal-overlay" onClick={() => { setShowAddGuard(false); setAddStep(1); setAddGuardForm({ fullName: '', company: '', contact: '', gate: '', shift: '', accessTimes: '', documents: [] }); }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div><div className="modal-sub">form/guard/add · Step {addStep} of 4</div><h2>Add Guard</h2></div>
              <button className="modal-close" onClick={() => { setShowAddGuard(false); setAddStep(1); setAddGuardForm({ fullName: '', company: '', contact: '', gate: '', shift: '', accessTimes: '', documents: [] }); }}>×</button>
            </div>
            <div className="wizard-steps">
              {['Compose', 'Audience', 'Schedule', 'Preview'].map((s, i) => (
                <React.Fragment key={s}>{i > 0 && <span className="wizard-sep">›</span>}<span className={`wizard-step ${addStep === i + 1 ? 'active' : ''}`}>{i + 1} {s}</span></React.Fragment>
              ))}
            </div>

            {/* Step 1: Basic Info */}
            {addStep === 1 && (
              <div>
                <p style={{ fontWeight: 600, marginBottom: 12 }}>Step 1: Basic Information</p>
                <div className="form-group"><label>Full Name</label><input className="form-input" placeholder="Guard full name" value={addGuardForm.fullName} onChange={e => setAddGuardForm({ ...addGuardForm, fullName: e.target.value })} /></div>
                <div className="form-group"><label>Company / Employer</label><input className="form-input" placeholder="Security company name" value={addGuardForm.company} onChange={e => setAddGuardForm({ ...addGuardForm, company: e.target.value })} /></div>
                <div className="form-group"><label>Contact Number</label><input className="form-input" placeholder="+971 5X XXX XXXX" value={addGuardForm.contact} onChange={e => setAddGuardForm({ ...addGuardForm, contact: e.target.value })} /></div>
                <div className="form-group"><label>Gate / Post Assignment</label><input className="form-input" placeholder="e.g. Main Gate" value={addGuardForm.gate} onChange={e => setAddGuardForm({ ...addGuardForm, gate: e.target.value })} /></div>
                <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => setAddStep(2)}>Continue →</button>
              </div>
            )}

            {/* Step 2: Shift & Security Profile */}
            {addStep === 2 && (
              <div>
                <p style={{ fontWeight: 600, marginBottom: 12 }}>Step 2: Shift & Security Profile</p>
                <div className="form-group"><label>Shift Assignment</label>
                  {['Morning 06:00–14:00', 'Afternoon 14:00–22:00', 'Night 22:00–06:00'].map(s => {
                    const shiftName = s.split(' ')[0];
                    return (
                      <div key={s} className="personnel-item" style={{ marginBottom: 8, cursor: 'pointer', background: addGuardForm.shift === shiftName ? '#f0f0f0' : 'transparent', fontWeight: addGuardForm.shift === shiftName ? 600 : 400 }} onClick={() => setAddGuardForm({ ...addGuardForm, shift: shiftName })}>
                        {s}
                      </div>
                    );
                  })}
                </div>
                <div className="form-group"><label>Approved Access Times</label><input className="form-input" placeholder="e.g. Mon–Fri, 06:00–22:00" value={addGuardForm.accessTimes} onChange={e => setAddGuardForm({ ...addGuardForm, accessTimes: e.target.value })} /></div>
                <div className="grid-2"><button className="btn" onClick={() => setAddStep(1)}>← Back</button><button className="btn btn-primary" onClick={() => setAddStep(3)}>Continue →</button></div>
              </div>
            )}

            {/* Step 3: Documents & Verification */}
            {addStep === 3 && (
              <div>
                <p style={{ fontWeight: 600, marginBottom: 12 }}>Step 3: Documents & Verification</p>
                <input type="file" ref={fileInputRef} multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" style={{ display: 'none' }}
                  onChange={(e) => { if (e.target.files.length > 0) handleFileSelect(e.target.files); e.target.value = ''; }} />
                <div ref={dropZoneRef}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.style.borderColor = '#1a1a1a'; e.currentTarget.style.background = '#f0f0f0'; }}
                  onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.style.borderColor = '#d0d0d0'; e.currentTarget.style.background = '#f9f9f9'; }}
                  onDrop={(e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.style.borderColor = '#d0d0d0'; e.currentTarget.style.background = '#f9f9f9'; if (e.dataTransfer.files.length > 0) handleFileSelect(e.dataTransfer.files); }}
                  onClick={() => fileInputRef.current && fileInputRef.current.click()}
                  style={{ marginBottom: 16, padding: 28, background: '#f9f9f9', border: '2px dashed #d0d0d0', borderRadius: 8, textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s' }}>
                  <div style={{ marginBottom: 8 }}><Icon name="upload" size={24} /></div>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Drag & drop files here</div>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 10 }}>National ID, Guard licence, Work permit</div>
                  <div style={{ fontSize: 11, color: '#888' }}>or <span style={{ color: '#1a1a1a', fontWeight: 600, textDecoration: 'underline' }}>Browse Files</span></div>
                  <div style={{ fontSize: 10, color: '#aaa', marginTop: 6 }}>PDF, DOC, JPG, PNG — up to 10 MB each</div>
                </div>
                {addGuardForm.documents.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    {addGuardForm.documents.map((doc, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, padding: '10px 12px', background: '#f9f9f9', borderRadius: 6, marginBottom: 6, border: '1px solid #e8e8e8' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ background: '#e8e8e8', padding: '2px 6px', borderRadius: 3, fontSize: 10, fontWeight: 600, textTransform: 'uppercase' }}>{doc.type}</span>
                          <span style={{ fontWeight: 500 }}>{doc.name}</span>
                          <span style={{ color: '#888', fontSize: 10 }}>{doc.size}</span>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); handleRemoveDoc(idx); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', fontSize: 16, padding: '0 4px', lineHeight: 1 }}>×</button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="grid-2"><button className="btn" onClick={() => setAddStep(2)}>← Back</button><button className="btn btn-primary" onClick={() => setAddStep(4)}>Continue →</button></div>
              </div>
            )}

            {/* Step 4: Preview */}
            {addStep === 4 && (
              <div>
                <p style={{ fontWeight: 600, marginBottom: 12 }}>Step 4: Preview</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                  <div style={{ width: 48, height: 48, background: '#f0f0f0', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="user" size={20} /></div>
                  <div><div style={{ fontWeight: 600, fontSize: 16 }}>{addGuardForm.fullName || 'Guard Name'}</div><div style={{ fontSize: 12, color: '#888' }}>{addGuardForm.company || 'Company'}</div></div>
                </div>
                <div className="grid-2" style={{ marginBottom: 16 }}>
                  <div><div style={{ fontSize: 11, color: '#888' }}>Shift</div><div style={{ fontWeight: 600 }}>{addGuardForm.shift || 'Not selected'}</div></div>
                  <div><div style={{ fontSize: 11, color: '#888' }}>Gate / Post</div><div style={{ fontWeight: 600 }}>{addGuardForm.gate || 'Not specified'}</div></div>
                  <div><div style={{ fontSize: 11, color: '#888' }}>Contact</div><div style={{ fontWeight: 600 }}>{addGuardForm.contact || 'Not provided'}</div></div>
                  <div><div style={{ fontSize: 11, color: '#888' }}>Access Times</div><div style={{ fontWeight: 600 }}>{addGuardForm.accessTimes || 'Not specified'}</div></div>
                </div>
                <div className="grid-2"><button className="btn" onClick={() => setAddStep(3)}>← Back</button><button className="btn btn-primary" onClick={handleAddGuardCreate}>Create Profile</button></div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Deactivate Modal */}
      {showDeactivate && (
        <div className="modal-overlay" onClick={() => setShowDeactivate(null)}>
          <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <h2 style={{ marginBottom: 8 }}>Deactivate Guard</h2>
            <p style={{ color: '#666', marginBottom: 20 }}>Are you sure you want to deactivate {showDeactivate.name}? They will be removed from the system.</p>
            <div className="grid-2"><button className="btn btn-danger" onClick={handleDeactivateGuard}>Confirm Deactivation</button><button className="btn" onClick={() => setShowDeactivate(null)}>Cancel</button></div>
          </div>
        </div>
      )}

      {/* Call Popup */}
      {showCallPopup && (
        <div className="modal-overlay" onClick={() => setShowCallPopup(null)}>
          <div className="modal" style={{ maxWidth: 320 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 8 }}>{showCallPopup.name}</h3>
            <div style={{ fontSize: 24, fontWeight: 600, marginBottom: 20, textAlign: 'center' }}>{showCallPopup.contact}</div>
            <button className="btn btn-primary" style={{ width: '100%', marginBottom: 8 }} onClick={() => { navigator.clipboard.writeText(showCallPopup.contact); showToast('Phone number copied!'); }}>Copy Number</button>
            <button className="btn" style={{ width: '100%' }} onClick={() => setShowCallPopup(null)}>Close</button>
          </div>
        </div>
      )}

      {/* Document Viewer Modal */}
      {showDocViewer && (
        <div className="modal-overlay" onClick={() => setShowDocViewer(null)}>
          <div className="modal" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div><h2 style={{ fontSize: 16 }}>Document Viewer</h2></div>
              <button className="modal-close" onClick={() => setShowDocViewer(null)}>×</button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, padding: 12, background: '#f9f9f9', borderRadius: 6 }}>
              <span style={{ background: '#e8e8e8', padding: '4px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>{showDocViewer.type}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{showDocViewer.name}</div>
                <div style={{ fontSize: 11, color: '#888' }}>{showDocViewer.size} · Uploaded {showDocViewer.uploadedAt} · Status: {showDocViewer.status}</div>
              </div>
            </div>
            <div style={{ background: '#f0f0f0', borderRadius: 8, marginBottom: 16, minHeight: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {showDocViewer.dataUrl ? (
                ['jpg','jpeg','png','gif','webp'].includes(showDocViewer.type) ? (
                  <img src={showDocViewer.dataUrl} alt={showDocViewer.name} style={{ maxWidth: '100%', maxHeight: 400, objectFit: 'contain' }} />
                ) : showDocViewer.type === 'pdf' ? (
                  (() => {
                    // Convert base64 data URL to blob URL for iframe rendering
                    try {
                      const base64 = showDocViewer.dataUrl.split(',')[1];
                      const binary = atob(base64);
                      const bytes = new Uint8Array(binary.length);
                      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                      const blob = new Blob([bytes], { type: 'application/pdf' });
                      const blobUrl = URL.createObjectURL(blob);
                      return <iframe src={blobUrl} style={{ width: '100%', height: 400, border: 'none' }} title={showDocViewer.name} />;
                    } catch (e) {
                      return <div style={{ padding: 40, textAlign: 'center', color: '#888', fontSize: 12 }}><Icon name="eye" size={32} /><div style={{ marginTop: 8 }}>PDF preview failed</div><div style={{ fontSize: 11, marginTop: 4 }}>Use Download to open this file</div></div>;
                    }
                  })()
                ) : (
                  <div style={{ padding: 40, textAlign: 'center', color: '#888', fontSize: 12 }}><Icon name="eye" size={32} /><div style={{ marginTop: 8 }}>Preview not available for .{showDocViewer.type} files</div><div style={{ fontSize: 11, marginTop: 4 }}>Use Download to open this file</div></div>
                )
              ) : (
                <div style={{ padding: 40, textAlign: 'center', color: '#888', fontSize: 12 }}><Icon name="eye" size={32} /><div style={{ marginTop: 8 }}>No preview available</div><div style={{ fontSize: 11, marginTop: 4 }}>This is a sample document entry</div></div>
              )}
            </div>
            <button className="btn btn-primary" style={{ width: '100%', marginBottom: 8 }} onClick={() => {
              if (showDocViewer.dataUrl) {
                const a = document.createElement('a');
                a.href = showDocViewer.dataUrl;
                a.download = showDocViewer.name;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                showToast('Download started!');
              } else {
                showToast('No file data — sample document entry');
              }
            }}><Icon name="download" size={14} /> Download</button>
            <button className="btn" style={{ width: '100%' }} onClick={() => setShowDocViewer(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
};

