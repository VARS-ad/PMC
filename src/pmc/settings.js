// ==================== SETTINGS PAGE ====================
const SettingsPage = () => {
  const { data, setData, showToast, language, setLanguage } = useApp();
  const { t } = useApp();
  const [activeTab, setActiveTab] = useState(t('pm.pmsProfile'));
  const tabIcons = {[t('pm.pmsProfile')]:'user',['Notifications']:'announcements',[t('pm.accessPolicy')]:'security',[t('pm.packagePreferences')]:'packages',[t('pm.propertySettings')]:'properties',[t('pm.generalApp')]:'settings'};
  const tabs = [t('pm.pmsProfile'),'Notifications',t('pm.accessPolicy'),t('pm.packagePreferences'),t('pm.propertySettings'),'Guard Roster',t('pm.generalApp')];

  const contacts = [
    { role: t('pm.rolePropertyManager'), name: 'Hassan Al-PM', phone: '+971 50 999 0001' },
    { role: t('pm.roleMaintenanceHead'), name: 'Tariq Facilities', phone: '+971 55 999 0002' },
    { role: t('pm.roleHeadOfSecurity'), name: 'Karim SecOps', phone: '+971 50 999 0003' }
  ];

  const languages = [
    { code: 'en', label: 'English' },
    { code: 'ar', label: 'العربية (Arabic)' },
  ];
  return (
    <div>
      <div className="page-header"><div><h1>{t('pm.profileMyVarsSettings')}</h1><div className="subtitle">{t('pm.settingsSecurityProfile')}</div></div></div>
      <div className="card" style={{marginBottom:20}}>
        <div style={{fontSize:11,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:10,fontWeight:500}}>Language</div>
        <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
          {languages.map(l => (
            <button key={l.code} onClick={() => setLanguage && setLanguage(l.code)} style={{
              padding:'8px 18px', fontSize:13, fontWeight: language === l.code ? 500 : 400,
              background: language === l.code ? 'var(--bg-warm-dark)' : '#fff',
              color: language === l.code ? '#fff' : 'var(--text-dark)',
              border: language === l.code ? 'none' : '1px solid var(--border-light)',
              borderRadius:8, cursor:'pointer',
            }}>{l.label}</button>
          ))}
        </div>
        <div style={{fontSize:11,color:'var(--text-muted)',marginTop:10}}>Switches the entire app interface for your tab. Other users / tabs are unaffected.</div>
      </div>
      <div className="settings-layout">
        <div>
          <div className="settings-nav">
            {tabs.map(t => <div key={t} className={`settings-nav-item ${activeTab===t?'active':''}`} onClick={()=>setActiveTab(t)} style={{display:'flex',alignItems:'center',gap:8}}><Icon name={tabIcons[t]||'settings'} size={16}/>{t} <span style={{marginLeft:'auto'}}>›</span></div>)}
          </div>
          <div className="settings-contacts">
            <h4>{t('pm.pmcContacts')}</h4>
            {contacts.map(c => <div key={c.name} className="settings-contact"><div className="role">{c.role}</div><div className="name">{c.name}</div><div className="phone">{c.phone}</div></div>)}
          </div>
        </div>
        <div className="card">
          {activeTab === t('pm.pmsProfile') && (<div>
            <h3 style={{marginBottom:20}}>{t('pm.pmsProfile')}</h3>
            <div style={{display:'flex',gap:16,marginBottom:20}}>
              <div style={{width:56,height:56,background:'#e8e3de',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><Icon name="user" size={24}/></div>
              <div style={{flex:1}}>
                <div className="form-group"><label>{t('pm.fullNameLabel')}</label><input className="form-input" defaultValue="Hassan Al-Manageeri"/></div>
                <div className="grid-2">
                  <div className="form-group"><label>{t('pm.emailLabel')}</label><input className="form-input" defaultValue="hassan@pinnaclepm.ae"/></div>
                  <div className="form-group"><label>{t('pm.mobileLabel')}</label><input className="form-input" defaultValue="+971 50 999 0001"/></div>
                </div>
              </div>
            </div>
            <div style={{display:'flex',gap:16,marginBottom:20}}>
              <div style={{width:56,height:56,background:'#e8e3de',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><Icon name="user" size={24}/></div>
              <div style={{flex:1}}>
                <div className="form-group"><label>{t('pm.fullNameLabel')}</label><input className="form-input" defaultValue="Hassan Al-Manageeri"/></div>
                <div className="grid-2">
                  <div className="form-group"><label>{t('pm.emailLabel')}</label><input className="form-input" defaultValue="hassan@pinnaclepm.ae"/></div>
                  <div className="form-group"><label>{t('pm.mobileLabel')}</label><input className="form-input" defaultValue="+971 50 999 0001"/></div>
                </div>
              </div>
            </div>
            <h4 style={{marginBottom:12}}>{t('pm.permissionsAccess')}</h4>
            <div className="grid-2" style={{marginBottom:16}}>
              {[t('pm.permVisitorManagement'),t('pm.permGuardManagement'),t('pm.permPropertyConfiguration'),t('pm.permAnnouncementCreation'),t('pm.permReportExport'),t('pm.permSystemAdmin')].map((p,i) => (
                <div key={p} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 0'}}>
                  <div style={{width:18,height:18,borderRadius:4,border:i<5?'none':'1.5px solid #ccc',background:i<5?'#1a1a1a':'transparent',display:'flex',alignItems:'center',justifyContent:'center'}}>
                    {i<5 && <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </div>
                  <span style={{fontSize:13,color:i<5?'#333':'#999'}}>{p}</span>
                </div>
              ))}
            </div>
            <button className="btn btn-primary" onClick={()=>showToast('Profile saved','Settings have been updated')}><Icon name="download" size={14}/> Save Changes</button>
            <div style={{marginTop:32}}>
              <h3 style={{marginBottom:20}}>Change Password</h3>
              <div className="grid-2">
                <div className="form-group"><label>Current Password</label><input className="form-input" type="password" defaultValue="********"/></div>
                <div className="form-group"><label>New Password</label><input className="form-input" type="password" defaultValue="********"/></div>
              </div>
              <div className="form-group" style={{maxWidth:'50%'}}><label>Confirm New Password</label><input className="form-input" type="password" defaultValue="********"/></div>
              <button className="btn" onClick={()=>showToast('Password updated','Your password has been changed')}><Icon name="security" size={14}/> Update Password</button>
            </div>
          </div>)}

          {activeTab === 'Notifications' && (<div>
            <h3 style={{marginBottom:20}}>Notification Preferences</h3>
            {[
              { category: 'Visitors', items: [{label:'New visitor check-in',push:true,email:false},{label:'Pending approval timeout',push:true,email:true},{label:'Guard override used',push:true,email:true}]},
              { category: 'Service Requests', items: [{label:'New service request',push:true,email:false},{label:'SLA breach warning',push:true,email:true}]},
              { category: 'Announcements', items: [{label:'Low acknowledgement rate',push:false,email:true}]},
              { category: 'Escalations', items: [{label:'New escalation raised',push:true,email:true},{label:'Escalation unresolved 4h+',push:true,email:true}]}
            ].map(cat => (
              <div key={cat.category} style={{marginBottom:20}}>
                <h4 style={{marginBottom:8}}>{cat.category}</h4>
                {cat.items.map(item => (
                  <div key={item.label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid #ebe7e3'}}>
                    <span>{item.label}</span>
                    <div style={{display:'flex',gap:16,alignItems:'center'}}>
                      <span style={{fontSize:12,color:'#a89a92'}}>Push</span><Toggle value={item.push} onChange={()=>{}}/>
                      <span style={{fontSize:12,color:'#a89a92'}}>Email</span><Toggle value={item.email} onChange={()=>{}}/>
                    </div>
                  </div>
                ))}
              </div>
            ))}
            <button className="btn btn-primary">Save Preferences</button>
          </div>)}

          {activeTab === t('pm.accessPolicy') && (<div>
            <h3 style={{marginBottom:20}}>{t('pm.accessPolicy')}</h3>
            {[
              {label:'Visitor pre-approval required by default',desc:'All new visitors must be approved by resident before entry',value:true},
              {label:'Allow users to set timing and pre-approval',desc:'All new visitors must be approved by resident before entry',value:true},
              {label:'Resident Override',desc:'All new visitors must be approved by resident before entry',value:true},
              {label:'Additional notification/reminder and other capabilities',desc:'All new visitors must be approved by resident before entry',value:true},
              {label:'Allow guard override without resident response',desc:'Guard can override after 60s no-response timeout',value:true},
              {label:'Auto-approve returning visitors (24h)',desc:'Visitors who checked in within 24h may be auto-approved',value:false},
              {label:'Require ID document scan for contractors',desc:'Contractors must provide ID at gate',value:true},
              {label:'Enable QR pre-pass (resident-generated)',desc:'Residents can generate QR codes for guests via app',value:true},
              {label:'Two-factor approval for move-in/out',desc:'Move-in/out requires both PM and resident approval',value:true},
            ].map(p => (
              <div key={p.label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 0',borderBottom:'1px solid #ebe7e3'}}>
                <div><div style={{fontWeight:500}}>{p.label}</div><div style={{fontSize:12,color:'#a89a92'}}>{p.desc}</div></div>
                <Toggle value={p.value} onChange={()=>{}}/>
              </div>
            ))}
          </div>)}

          {activeTab === t('pm.packagePreferences') && (<div>
            <h3 style={{marginBottom:20}}>{t('pm.packagePreferences')}</h3>
            <h4 style={{marginBottom:12}}>Whitelisted Delivery Platforms</h4>
            {[{name:'Amazon',on:true},{name:'Noon',on:true},{name:'DHL',on:true},{name:'FedEx',on:true},{name:'Aramex',on:true},{name:'Deliveroo',on:false}].map(p => (
              <div key={p.name} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 0',borderBottom:'1px solid #ebe7e3'}}>
                <span>{p.name}</span><Toggle value={p.on} onChange={()=>{}}/>
              </div>
            ))}
            <div className="form-group" style={{marginTop:16}}><label>Default Pickup Window</label><input className="form-input" defaultValue="Within 48 hours" style={{maxWidth:300}}/></div>
          </div>)}

          {activeTab === t('pm.propertySettings') && (<div>
            <h3 style={{marginBottom:20}}>{t('pm.propertySettings')}</h3>
            <div className="form-group"><label>Property Name</label><input className="form-input" defaultValue="The Pinnacle Residences" style={{maxWidth:400}}/></div>
            <div className="form-group"><label>Location</label><input className="form-input" defaultValue="Al Reem Island, Abu Dhabi" style={{maxWidth:400}}/></div>
            <div className="form-group"><label>Time Zone</label><input className="form-input" defaultValue="Asia/Dubai (GMT+4)" style={{maxWidth:400}}/></div>
            <div className="form-group"><label>Total Towers</label><input className="form-input" defaultValue="4" style={{maxWidth:400}}/></div>
            <button className="btn btn-primary">Save Changes</button>
          </div>)}

          {activeTab === 'Guard Roster' && (<div>
            <h3 style={{marginBottom:20}}>Security Guard Management</h3>
            <h4 style={{marginBottom:16}}>Active Guards</h4>
            {data.guards && data.guards.map(guard => (
              <div key={guard.id} style={{border:'1px solid #e0e0e0', borderRadius:8, padding:16, marginBottom:12}}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14, fontWeight:600, marginBottom:4}}>{guard.name}</div>
                    <div style={{fontSize:12, color:'#666', marginBottom:8}}>ID: {guard.id}</div>
                    <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, fontSize:12}}>
                      <div><span style={{color:'#999'}}>Shift:</span> {guard.shift} ({guard.shiftTime})</div>
                      <div><span style={{color:'#999'}}>Gate:</span> {guard.gate}</div>
                      <div><span style={{color:'#999'}}>Company:</span> {guard.company}</div>
                      <div><span style={{color:'#999'}}>Contact:</span> {guard.contact}</div>
                      <div><span style={{color:'#999'}}>Status:</span> <span style={{color:guard.status==='On Duty'?'#2d6a4f':'#666'}}>{guard.status}</span></div>
                      <div><span style={{color:'#999'}}>Verified:</span> {guard.verified ? '✓ Yes' : 'Pending'}</div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <h4 style={{marginBottom:16, marginTop:24}}>Security Company Information</h4>
            <div style={{border:'1px solid #e0e0e0', borderRadius:8, padding:16}}>
              <div className="grid-2" style={{marginBottom:16}}>
                <div className="form-group"><label>Primary Security Company</label><input className="form-input" defaultValue="SecureGuard LLC" /></div>
                <div className="form-group"><label>Emergency Contact</label><input className="form-input" defaultValue="+971 4 000 0000" /></div>
              </div>
              <div className="form-group"><label>Contract Valid Until</label><input className="form-input" defaultValue="31 Dec 2026" /></div>
              <button className="btn btn-primary" onClick={()=>showToast('Security settings saved','Guard management settings have been updated')}>Save Security Settings</button>
            </div>
          </div>)}}

          {activeTab === t('pm.generalApp') && (<div>
            <h3 style={{marginBottom:20}}>{t('pm.generalApp')}</h3>
            <div className="form-group"><label>Language</label><input className="form-input" defaultValue="English" style={{maxWidth:400}}/></div>
            <div className="form-group"><label>Date Format</label><input className="form-input" defaultValue="DD/MM/YYYY" style={{maxWidth:400}}/></div>
            <div className="form-group"><label>Time Format</label><input className="form-input" defaultValue="24-hour" style={{maxWidth:400}}/></div>
            <div className="form-group"><label>Time Zone</label><input className="form-input" defaultValue="UTC+04:00" style={{maxWidth:400}}/></div>
            <div className="form-group"><label>Default Table Page Size</label><input className="form-input" defaultValue="10 rows" style={{maxWidth:400}}/></div>
            <button className="btn btn-primary">Save Changes</button>
          </div>)}

        </div>
      </div>
    </div>
  );
};

