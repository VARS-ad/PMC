// ==================== PROPERTIES PAGE ====================
const PropertiesPage = ({ searchSelectedItem, clearSearchSelection }) => {
  const { data, setData, showToast, t } = useApp();
  const [selectedResident, setSelectedResident] = useState(null);
  const [editingResident, setEditingResident] = useState(null);
  const [showImport, setShowImport] = useState(false); // false | 'pick' | 'csv' | 'excel' | 'sql'
  const [showExport, setShowExport] = useState(false); // false | 'pick'
  const [showAddResident, setShowAddResident] = useState(false);
  const [newRes, setNewRes] = useState({ name:'', flat:'', contact:'', coResidents:1, policy:'Standard', tower:'' });
  const [resSearch, setResSearch] = useState('');
  const [importFile, setImportFile] = useState(null);
  const importFileRef = useRef(null);
  const [activePropertyTab, setActivePropertyTab] = useState('overview');

  // Sample building data
  const buildingSampleData = {
    name: 'The Pinnacle Residences - Tower A',
    totalUnits: 50,
    occupiedUnits: 38,
    facilities: ['Gym', 'Swimming Pool', 'Spa', 'Concierge', 'Parking'],
    units: Array.from({length:50}, (_, i) => {
      const floor = Math.floor(i/5) + 1;
      const unitNum = (i % 5) + 1;
      const unitId = String.fromCharCode(65 + (i % 3)) + '-' + String(floor).padStart(2,'0') + String(unitNum).padStart(2,'0');
      const isOccupied = Math.random() > 0.24;
      return {
        id: unitId, floor, type: ['Studio', '1-Bed', '2-Bed', '3-Bed'][i % 4], status: isOccupied ? 'Occupied' : 'Vacant', sqft: 450 + i * 15
      };
    }),
    residents: [
      { id: 'RES-001', name: 'Mr. Ahmed Al-Mansouri', unitId: 'A-0101', contact: '+971 50 123 4567', moveInDate: '15 Jan 2024' },
      { id: 'RES-002', name: 'Ms. Fatima Al-Naqbi', unitId: 'B-0203', contact: '+971 50 234 5678', moveInDate: '22 Feb 2024' },
      { id: 'RES-003', name: 'Mr. Hassan Al-Shehhi', unitId: 'C-0305', contact: '+971 50 345 6789', moveInDate: '08 Mar 2024' },
      { id: 'RES-004', name: 'Ms. Layla Al-Kaabi', unitId: 'A-0407', contact: '+971 50 456 7890', moveInDate: '19 Jan 2024' },
      { id: 'RES-005', name: 'Mr. Omar Al-Mazrouei', unitId: 'B-0508', contact: '+971 50 567 8901', moveInDate: '10 Feb 2024' },
      { id: 'RES-006', name: 'Ms. Zainab Al-Falahi', unitId: 'C-0610', contact: '+971 50 678 9012', moveInDate: '25 Mar 2024' },
      { id: 'RES-007', name: 'Mr. Ibrahim Al-Suwaidi', unitId: 'A-0712', contact: '+971 50 789 0123', moveInDate: '05 Apr 2024' },
      { id: 'RES-008', name: 'Ms. Hana Al-Qubaisi', unitId: 'B-0813', contact: '+971 50 890 1234', moveInDate: '12 Apr 2024' }
    ]
  };

  // Open resident detail from search
  useEffect(() => {
    if (searchSelectedItem && searchSelectedItem.type === 'Resident' && searchSelectedItem.sourceData) {
      setSelectedResident(searchSelectedItem.sourceData);
      if (clearSearchSelection) clearSearchSelection();
    }
  }, [searchSelectedItem]);

  const handleAddResident = () => {
    if (!newRes.name || !newRes.flat) { showToast(t('pm.fillNameFlat')); return; }
    const id = `RES-${String(data.residents.length+1).padStart(3,'0')}`;
    const entry = { id, name: newRes.name, flat: newRes.flat, contact: newRes.contact, coResidents: parseInt(newRes.coResidents)||1, status: 'Pending', policy: newRes.policy, absence: 'None' };
    setData(prev => ({...prev, residents: [...prev.residents, entry]}));
    setNewRes({ name:'', flat:'', contact:'', coResidents:1, policy:'Standard', tower:'' });
    setShowAddResident(false);
    showToast(t('pm.residentAdded'));
  };

  const RESIDENT_COLUMNS = [
    {header:t('pm.residentTableId'), key:'id'}, {header:t('pm.tableHeaderName'), key:'name'}, {header:t('pm.tableHeaderFlat'), key:'flat'},
    {header:t('pm.residentTableCoResidents'), key:'coResidents'}, {header:t('pm.tableHeaderContact'), key:'contact'},
    {header:t('pm.tableHeaderStatus'), key:'status'}, {header:t('pm.tableHeaderPolicy'), key:'policy'}, {header:t('pm.residentTableAbsence'), key:'absence'}
  ];

  const handleExportResidents = (format) => {
    if (format === 'excel') {
      exportToExcel(filteredResidents, RESIDENT_COLUMNS, 'VARS_Residents_Export');
      showToast(t('pm.exportExcel'));
    } else if (format === 'csv') {
      const header = RESIDENT_COLUMNS.map(c => c.header).join(',');
      const rows = filteredResidents.map(r => RESIDENT_COLUMNS.map(c => '"' + (r[c.key] !== undefined ? r[c.key] : '') + '"').join(','));
      const csv = [header, ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'VARS_Residents_Export.csv'; a.click();
      URL.revokeObjectURL(url);
      showToast(t('pm.exportCsv'));
    } else if (format === 'sql') {
      const lines = filteredResidents.map(r => {
        const vals = RESIDENT_COLUMNS.map(c => "'" + (r[c.key] !== undefined ? String(r[c.key]).replace(/'/g, "''") : '') + "'").join(', ');
        return `INSERT INTO residents (${RESIDENT_COLUMNS.map(c => c.key).join(', ')}) VALUES (${vals});`;
      });
      const sql = lines.join('\n');
      const blob = new Blob([sql], { type: 'text/sql' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'VARS_Residents_Export.sql'; a.click();
      URL.revokeObjectURL(url);
      showToast(t('pm.exportSql'));
    }
    setShowExport(false);
  };

  const handleDownloadTemplate = (format) => {
    const sampleRow = { id: 'RES-001', name: 'John Smith', flat: 'A-101', coResidents: 2, contact: '+971 50 000 0000', status: 'Verified', policy: 'Standard', absence: 'None' };
    if (format === 'csv') {
      const header = RESIDENT_COLUMNS.map(c => c.header).join(',');
      const row = RESIDENT_COLUMNS.map(c => '"' + sampleRow[c.key] + '"').join(',');
      const csv = header + '\n' + row;
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'VARS_Residents_Template.csv'; a.click(); URL.revokeObjectURL(url);
    } else if (format === 'excel') {
      exportToExcel([sampleRow], RESIDENT_COLUMNS, 'VARS_Residents_Template');
    } else if (format === 'sql') {
      const cols = RESIDENT_COLUMNS.map(c => c.key).join(', ');
      const vals = RESIDENT_COLUMNS.map(c => "'" + sampleRow[c.key] + "'").join(', ');
      const sql = `-- Template: Residents table\nCREATE TABLE IF NOT EXISTS residents (\n${RESIDENT_COLUMNS.map(c => '  ' + c.key + ' TEXT').join(',\n')}\n);\n\n-- Sample row:\nINSERT INTO residents (${cols}) VALUES (${vals});`;
      const blob = new Blob([sql], { type: 'text/sql' });
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'VARS_Residents_Template.sql'; a.click(); URL.revokeObjectURL(url);
    }
    showToast(t('pm.templateDownloaded'));
  };

  const handleImportFile = (file, format) => {
    if (!file) { showToast('Please select a file first'); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        let rows = [];
        if (format === 'csv') {
          const text = e.target.result;
          const lines = text.split('\n').filter(l => l.trim());
          if (lines.length < 2) { showToast(t('pm.csvEmpty')); return; }
          const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
          for (let i = 1; i < lines.length; i++) {
            const vals = lines[i].split(',').map(v => v.replace(/"/g, '').trim());
            const obj = {};
            headers.forEach((h, idx) => { const col = RESIDENT_COLUMNS.find(c => c.header.toLowerCase() === h.toLowerCase() || c.key.toLowerCase() === h.toLowerCase()); if (col) obj[col.key] = vals[idx] || ''; });
            if (obj.name && obj.flat) rows.push(obj);
          }
        } else if (format === 'excel') {
          const wb = XLSX.read(e.target.result, { type: 'binary' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(ws);
          jsonData.forEach(row => {
            const obj = {};
            RESIDENT_COLUMNS.forEach(c => { const val = row[c.header] || row[c.key]; if (val !== undefined) obj[c.key] = val; });
            if (obj.name && obj.flat) rows.push(obj);
          });
        }
        if (rows.length === 0) { showToast(t('pm.noValidRows')); return; }
        const newResidents = rows.map((r, idx) => ({
          id: r.id || `RES-${String(data.residents.length + idx + 1).padStart(3, '0')}`,
          name: r.name, flat: r.flat, contact: r.contact || '', coResidents: parseInt(r.coResidents) || 1,
          status: r.status || 'Pending', policy: r.policy || 'Standard', absence: r.absence || 'None'
        }));
        setData(prev => ({ ...prev, residents: [...prev.residents, ...newResidents] }));
        showToast(`${newResidents.length} ` + (newResidents.length !== 1 ? t('pm.residentsImported') : t('pm.residentImported')));
        setShowImport(false); setImportFile(null);
      } catch (err) { showToast(t('pm.fileUploadError') + ' ' + (err.message || 'Invalid file format. Please upload an Excel file (.xlsx or .xls) or CSV file.')); }
    };
    if (format === 'csv' || format === 'sql') reader.readAsText(file);
    else reader.readAsBinaryString(file);
  };

  const filteredResidents = data.residents.filter(r => {
    if (!resSearch) return true;
    return r.name.toLowerCase().includes(resSearch.toLowerCase()) || r.flat.toLowerCase().includes(resSearch.toLowerCase());
  });

  return (
    <div>
      <div className="page-header">
        <div><h1>{t('pm.propertiesResidents')}</h1><div className="subtitle">{data.towers.length} properties · {data.towers.reduce((a,t)=>a+t.totalFlats,0).toLocaleString()} flats · {data.towers.reduce((a,t)=>a+t.occupied,0).toLocaleString()} occupied</div></div>
        <div className="btn-group">
          <button className="btn btn-primary" onClick={()=>setShowAddResident(true)}>{t('pm.addResidentBtn')}</button>
          <button className="btn" onClick={()=>setShowImport('pick')}><Icon name="upload" size={12}/> {t('pm.importBtn')}</button>
          <button className="btn" onClick={()=>setShowExport('pick')}><Icon name="download" size={12}/> {t('pm.exportBtn')}</button>
        </div>
      </div>

      <div className="card"><h3 style={{marginBottom:16}}>{t('pm.propertiesOverview')}</h3>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))',gap:12}}>
          {data.towers.map(t => (
            <div key={t.name} style={{border:'1px solid #e5e5e5',borderRadius:10,padding:16}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                <div style={{width:32,height:32,background:'#E6EAE9',borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center'}}><svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='#61707D' stroke-width='1.5'><rect x='4' y='2' width='16' height='20' rx='2'/><path d='M9 22V18h6v4M9 6h.01M15 6h.01M9 10h.01M15 10h.01M9 14h.01M15 14h.01'/></svg></div>
                <span style={{cursor:'pointer'}}>⋯</span>
              </div>
              <h3 style={{fontSize:14,marginBottom:2}}>{t.name}</h3>
              {t.location && <div style={{fontSize:11,color:'#61707D',marginBottom:8}}>{t.location}</div>}
              <div style={{display:'flex',justifyContent:'space-between',fontSize:13}}><span>{t('pm.totalUnits')}</span><strong>{t.totalFlats.toLocaleString()}</strong></div>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:13}}><span>{t('pm.occupied')}</span><strong>{t.occupied.toLocaleString()}</strong></div>
              <div className="progress-bar" style={{marginTop:8}}><div className="fill" style={{width:`${Math.round(t.occupied/t.totalFlats*100)}%`}}/></div>
              <div style={{fontSize:11,color:'#61707D',marginTop:4}}>{Math.round(t.occupied/t.totalFlats*100)}% {t('pm.occupancy')}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h3>{t('pm.residentRegistry')}</h3>
          <div style={{display:'flex',gap:8}}>
            <div className="search-bar" style={{maxWidth:200}}><span className="search-icon"><Icon name="search" size={14}/></span><input placeholder={t('pm.searchResidentFlat')} value={resSearch} onChange={e=>setResSearch(e.target.value)}/></div>
            <button className="btn btn-sm"><Icon name="filter" size={12}/> {t('pm.filterBtn')}</button>
          </div>
        </div>
        <table className="data-table">
          <thead><tr><th>{t('pm.tableHeaderId')}</th><th>{t('pm.tableHeaderName')}</th><th>{t('pm.tableHeaderCoResident')}</th><th>{t('pm.tableHeaderFlat')}</th><th>{t('pm.tableHeaderContact')}</th><th>{t('pm.tableHeaderStatus')}</th><th>{t('pm.tableHeaderPolicy')}</th><th>{t('pm.tableHeaderScheduledAbsence')}</th><th>{t('pm.tableHeaderActions')}</th></tr></thead>
          <tbody>
            {filteredResidents.map(r => (
              <tr key={r.id}>
                <td>{r.id}</td><td className="name-cell"><div style={{display:'flex',alignItems:'center',gap:6}}><Icon name="user" size={14}/>{r.name}</div></td>
                <td>{r.coResidents}</td><td>{r.flat}</td><td>{r.contact}</td>
                <td>{r.status==='Verified' ? <span className="status verified">✓ {t('pm.statusVerified')}</span> : <StatusBadge status="Pending"/>}</td>
                <td>{r.policy}</td><td>{r.absence}</td>
                <td><button className="btn btn-sm" onClick={()=>setSelectedResident(r)}>{t('pm.propertyDetails')}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination total={1087} pageSize={10} page={1} onPageChange={()=>{}}/>
      </div>

      {selectedResident && (
        <div className="modal-overlay" onClick={()=>setSelectedResident(null)}>
          <div className="modal modal-wide" onClick={e=>e.stopPropagation()}>
            <div className="modal-header">
              <div><div className="modal-sub">modal/resident/profile</div><h2>{t('pm.residentProfileTitle')}</h2></div>
              <button className="modal-close" onClick={()=>setSelectedResident(null)}>×</button>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:16,marginBottom:20}}>
              <div style={{width:48,height:48,background:'#E6EAE9',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center'}}><Icon name="user" size={20}/></div>
              <div><div style={{fontWeight:600,fontSize:16}}>{selectedResident.name}</div><div style={{fontSize:12,color:'#61707D'}}>{selectedResident.flat} · {selectedResident.id}</div></div>
            </div>
            <div className="grid-2" style={{marginBottom:16}}>
              <div><div style={{fontSize:11,color:'#61707D'}}>{t('pm.contactLabel')}</div><div style={{fontWeight:600}}>{selectedResident.contact}</div></div>
              <div><div style={{fontSize:11,color:'#61707D'}}>{t('pm.verificationLabel')}</div><div style={{fontWeight:600}}>{selectedResident.status}</div></div>
              <div><div style={{fontSize:11,color:'#61707D'}}>{t('pm.accessPolicyLabel')}</div><div style={{fontWeight:600}}>{selectedResident.policy}</div></div>
              <div><div style={{fontSize:11,color:'#61707D'}}>{t('pm.scheduledAbsenceLabel')}</div><div style={{fontWeight:600}}>{selectedResident.absence}</div></div>
            </div>
            <div style={{fontWeight:600,marginBottom:8}}>{t('pm.preferencesLabel')}</div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid #E6EAE9'}}><span>{t('pm.packageAutoAccept')}</span><Toggle value={selectedResident.packageAutoAccept !== false} onChange={(v)=>{const updated={...selectedResident,packageAutoAccept:v};setSelectedResident(updated);setData(prev=>({...prev,residents:prev.residents.map(r=>r.id===selectedResident.id?{...r,packageAutoAccept:v}:r)}));showToast(t('pm.preferencesLabel') + ' ' + t('pm.settingsSaved'), t('pm.packageAutoAccept') + ' ' + (v ? t('pm.prefEnabled') : t('pm.prefDisabled')))}}/></div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid #E6EAE9'}}><span>Visitor pre-approval required</span><Toggle value={selectedResident.visitorPreApproval !== false} onChange={(v)=>{const updated={...selectedResident,visitorPreApproval:v};setSelectedResident(updated);setData(prev=>({...prev,residents:prev.residents.map(r=>r.id===selectedResident.id?{...r,visitorPreApproval:v}:r)}));showToast('Preference updated','Visitor pre-approval '+(v?'enabled':'disabled'))}}/></div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid #E6EAE9'}}><span>Email notifications</span><Toggle value={selectedResident.emailNotifications === true} onChange={(v)=>{const updated={...selectedResident,emailNotifications:v};setSelectedResident(updated);setData(prev=>({...prev,residents:prev.residents.map(r=>r.id===selectedResident.id?{...r,emailNotifications:v}:r)}));showToast('Preference updated','Email notifications '+(v?'enabled':'disabled'))}}/></div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',marginBottom:16}}><span>Push notifications</span><Toggle value={selectedResident.pushNotifications !== false} onChange={(v)=>{const updated={...selectedResident,pushNotifications:v};setSelectedResident(updated);setData(prev=>({...prev,residents:prev.residents.map(r=>r.id===selectedResident.id?{...r,pushNotifications:v}:r)}));showToast('Preference updated','Push notifications '+(v?'enabled':'disabled'))}}/></div>
            <div className="grid-2" style={{marginTop:16}}>
              <button className="btn btn-primary" onClick={()=>setEditingResident({...selectedResident})}>Edit Profile</button>
              <button className="btn" onClick={()=>setSelectedResident(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {editingResident && (
        <div className="modal-overlay" onClick={()=>setEditingResident(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-header">
              <div><div className="modal-sub">form/resident/edit</div><h2>Edit Resident</h2></div>
              <button className="modal-close" onClick={()=>setEditingResident(null)}>×</button>
            </div>
            <div className="form-group"><label>Full Name</label><input className="form-input" value={editingResident.name} onChange={e=>setEditingResident(p=>({...p,name:e.target.value}))}/></div>
            <div className="form-group"><label>{t('pm.flatUnitLabel')}</label><input className="form-input" value={editingResident.flat} onChange={e=>setEditingResident(p=>({...p,flat:e.target.value}))}/></div>
            <div className="form-group"><label>Contact</label><input className="form-input" value={editingResident.contact} onChange={e=>setEditingResident(p=>({...p,contact:e.target.value}))}/></div>
            <div className="form-group"><label>Co-Residents</label><input className="form-input" type="number" value={editingResident.coResidents} onChange={e=>setEditingResident(p=>({...p,coResidents:parseInt(e.target.value)||0}))}/></div>
            <div className="form-group"><label>Access Policy</label><select className="form-input" value={editingResident.policy} onChange={e=>setEditingResident(p=>({...p,policy:e.target.value}))}><option>Standard</option><option>Enhanced</option><option>Custom</option></select></div>
            <div className="form-group"><label>Verification Status</label><select className="form-input" value={editingResident.status} onChange={e=>setEditingResident(p=>({...p,status:e.target.value}))}><option>Verified</option><option>Pending</option><option>Suspended</option></select></div>
            <div className="form-group"><label>Scheduled Absence</label><input className="form-input" placeholder="e.g. 18–25 Apr or None" value={editingResident.absence} onChange={e=>setEditingResident(p=>({...p,absence:e.target.value}))}/></div>
            <div className="grid-2" style={{marginTop:16}}>
              <button className="btn btn-primary" onClick={()=>{setData(prev=>({...prev,residents:prev.residents.map(r=>r.id===editingResident.id?editingResident:r)}));setSelectedResident(editingResident);setEditingResident(null);showToast('Profile updated',editingResident.name+' has been updated')}}>Save Changes</button>
              <button className="btn" onClick={()=>setEditingResident(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showAddResident && (
        <div className="modal-overlay" onClick={()=>setShowAddResident(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-header">
              <div><div className="modal-sub">form/resident/add</div><h2>Add New Resident</h2></div>
              <button className="modal-close" onClick={()=>setShowAddResident(false)}>×</button>
            </div>
            <div className="form-group"><label>Full Name *</label><input className="form-input" placeholder="e.g. Mr. Ahmed Al-Sayed" value={newRes.name} onChange={e=>setNewRes(p=>({...p,name:e.target.value}))}/></div>
            <div className="grid-2">
              <div className="form-group"><label>Flat / Unit *</label><input className="form-input" placeholder="e.g. A-1204" value={newRes.flat} onChange={e=>setNewRes(p=>({...p,flat:e.target.value}))}/></div>
              <div className="form-group"><label>Tower</label>
                <select className="form-input" value={newRes.tower} onChange={e=>setNewRes(p=>({...p,tower:e.target.value}))}>
                  <option value="">Select tower</option>
                  <option value="Tower A">Tower A</option><option value="Tower B">Tower B</option>
                  <option value="Tower C">Tower C</option><option value="Tower D">Tower D</option>
                </select>
              </div>
            </div>
            <div className="form-group"><label>Mobile Number</label><input className="form-input" placeholder="+971 5X XXX XXXX" value={newRes.contact} onChange={e=>setNewRes(p=>({...p,contact:e.target.value}))}/></div>
            <div className="grid-2">
              <div className="form-group"><label>Co-Residents</label><input className="form-input" type="number" min="0" value={newRes.coResidents} onChange={e=>setNewRes(p=>({...p,coResidents:e.target.value}))}/></div>
              <div className="form-group"><label>Access Policy</label>
                <select className="form-input" value={newRes.policy} onChange={e=>setNewRes(p=>({...p,policy:e.target.value}))}>
                  <option value="Standard">Standard</option><option value="Enhanced">Enhanced</option><option value="Custom">Custom</option>
                </select>
              </div>
            </div>
            <div className="grid-2" style={{marginTop:8}}>
              <button className="btn btn-primary" onClick={handleAddResident}>Add Resident</button>
              <button className="btn" onClick={()=>setShowAddResident(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImport && (
        <div className="modal-overlay" onClick={()=>{setShowImport(false);setImportFile(null)}}>
          <div className="modal" style={{maxWidth:480}} onClick={e=>e.stopPropagation()}>
            <div className="modal-header">
              <div><div className="modal-sub">modal/import · Resident Data Import</div><h2 style={{fontSize:16}}>{showImport === 'pick' ? 'Import Residents' : 'Import via ' + showImport.toUpperCase()}</h2></div>
              <button className="modal-close" onClick={()=>{setShowImport(false);setImportFile(null)}}>×</button>
            </div>

            {showImport === 'pick' && (
              <div>
                <p style={{fontSize:13,color:'#61707D',marginBottom:16}}>Choose the format of your data source.</p>
                {[
                  {key:'csv', label:'CSV File', sub:'Comma-separated values (.csv)', icon:'\u2013'},
                  {key:'excel', label:'Excel Spreadsheet', sub:'Microsoft Excel (.xlsx, .xls)', icon:'\u2013'},
                  {key:'sql', label:'SQL Database', sub:'SQL insert statements (.sql)', icon:'\u2013'}
                ].map(opt => (
                  <div key={opt.key} onClick={()=>setShowImport(opt.key)}
                    style={{display:'flex',alignItems:'center',gap:14,padding:'14px 16px',border:'1px solid #E6EAE9',borderRadius:8,marginBottom:8,cursor:'pointer',transition:'all 0.15s'}}
                    onMouseEnter={e=>e.currentTarget.style.borderColor='#131F23'}
                    onMouseLeave={e=>e.currentTarget.style.borderColor='#e0e0e0'}>
                    <span style={{fontSize:24}}>{opt.icon}</span>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:600}}>{opt.label}</div>
                      <div style={{fontSize:11,color:'#61707D'}}>{opt.sub}</div>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#61707D" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                  </div>
                ))}
              </div>
            )}

            {(showImport === 'csv' || showImport === 'excel' || showImport === 'sql') && (
              <div>
                {/* Step 1: Template */}
                <div style={{background:'#E6EAE9',borderRadius:8,padding:16,marginBottom:16}}>
                  <div style={{fontSize:12,fontWeight:600,marginBottom:8}}>1. Download Template</div>
                  <p style={{fontSize:11,color:'#61707D',marginBottom:10}}>Use this template to prepare your data. It contains the required columns and a sample row.</p>
                  <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:10}}>
                    {RESIDENT_COLUMNS.map(c => <span key={c.key} style={{background:'#e8e8e8',padding:'2px 8px',borderRadius:4,fontSize:10,fontWeight:600}}>{c.header}</span>)}
                  </div>
                  <button className="btn btn-sm" onClick={()=>handleDownloadTemplate(showImport)}><Icon name="download" size={12}/> Download {showImport.toUpperCase()} Template</button>
                </div>

                {/* Step 2: Upload */}
                <div style={{marginBottom:16}}>
                  <div style={{fontSize:12,fontWeight:600,marginBottom:8}}>2. Upload Your File</div>
                  <input type="file" ref={importFileRef} style={{display:'none'}}
                    accept={showImport === 'csv' ? '.csv' : showImport === 'excel' ? '.xlsx,.xls' : '.sql'}
                    onChange={e => { if(e.target.files[0]) setImportFile(e.target.files[0]); }} />
                  <div onClick={()=>importFileRef.current && importFileRef.current.click()}
                    onDragOver={e=>{e.preventDefault();e.currentTarget.style.borderColor='#131F23'}}
                    onDragLeave={e=>{e.preventDefault();e.currentTarget.style.borderColor='#d0d0d0'}}
                    onDrop={e=>{e.preventDefault();e.currentTarget.style.borderColor='#d0d0d0';if(e.dataTransfer.files[0]) setImportFile(e.dataTransfer.files[0])}}
                    style={{padding:24,border:'2px dashed #d0d0d0',borderRadius:8,textAlign:'center',cursor:'pointer',background:'#f5f2ef',transition:'all 0.2s'}}>
                    {importFile ? (
                      <div>
                        <div style={{fontWeight:600,fontSize:13}}>{importFile.name}</div>
                        <div style={{fontSize:11,color:'#61707D',marginTop:4}}>{(importFile.size/1024).toFixed(1)} KB · Click to change</div>
                      </div>
                    ) : (
                      <div>
                        <Icon name="upload" size={20}/>
                        <div style={{fontSize:12,marginTop:6}}>Drag & drop or <span style={{fontWeight:600,textDecoration:'underline'}}>Browse Files</span></div>
                        <div style={{fontSize:10,color:'#61707D',marginTop:4}}>{showImport === 'csv' ? '.csv files' : showImport === 'excel' ? '.xlsx, .xls files' : '.sql files'}</div>
                      </div>
                    )}
                  </div>
                </div>

                <div style={{display:'flex',gap:8}}>
                  <button className="btn" style={{flex:1}} onClick={()=>{setShowImport('pick');setImportFile(null)}}>← Back</button>
                  <button className="btn btn-primary" style={{flex:1}} onClick={()=>handleImportFile(importFile, showImport)}>Import Data</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Export Modal */}
      {showExport && (
        <div className="modal-overlay" onClick={()=>setShowExport(false)}>
          <div className="modal" style={{maxWidth:420}} onClick={e=>e.stopPropagation()}>
            <div className="modal-header">
              <div><div className="modal-sub">modal/export · Resident Data Export</div><h2 style={{fontSize:16}}>Export Residents</h2></div>
              <button className="modal-close" onClick={()=>setShowExport(false)}>×</button>
            </div>
            <p style={{fontSize:13,color:'#61707D',marginBottom:16}}>Export {filteredResidents.length} resident{filteredResidents.length !== 1 ? 's' : ''} in your preferred format.</p>
            {[
              {key:'csv', label:'CSV File', sub:'Universal format, works everywhere', icon:'\u2013'},
              {key:'excel', label:'Excel Spreadsheet', sub:'Formatted .xlsx with auto-width columns', icon:'\u2013'},
              {key:'sql', label:'SQL Statements', sub:'INSERT statements for database import', icon:'\u2013'}
            ].map(opt => (
              <div key={opt.key} onClick={()=>handleExportResidents(opt.key)}
                style={{display:'flex',alignItems:'center',gap:14,padding:'14px 16px',border:'1px solid #E6EAE9',borderRadius:8,marginBottom:8,cursor:'pointer',transition:'all 0.15s'}}
                onMouseEnter={e=>e.currentTarget.style.borderColor='#131F23'}
                onMouseLeave={e=>e.currentTarget.style.borderColor='#e0e0e0'}>
                <span style={{fontSize:24}}>{opt.icon}</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:600}}>{opt.label}</div>
                  <div style={{fontSize:11,color:'#61707D'}}>{opt.sub}</div>
                </div>
                <Icon name="download" size={14}/>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

