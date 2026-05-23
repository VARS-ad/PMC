// ==================== ESCALATIONS PAGE ====================
const EscalationsPage = () => {
  const { data, t } = useApp();
  const [selected, setSelected] = useState(null);
  const unresolved = data.escalations.filter(e => e.status !== 'Resolved');
  const resolved = data.escalations.filter(e => e.status === 'Resolved');
  const criticalCount = unresolved.filter(e => e.severity === 'Critical').length;

  return (
    <div>
      <div className="page-header">
        <div><h1>{t('pm.escalationsTitle')}</h1><div className="subtitle">{unresolved.length} {t('pm.unresolvedHeading').toLowerCase()} · {criticalCount} {t('pm.criticalLabel')} · {t('pm.slaTrackerLabel')}</div></div>
        <button className="btn btn-primary">{t('pm.newEscalationBtn')}</button>
      </div>
      <div className="kpi-row" style={{gridTemplateColumns:'repeat(4,1fr)'}}>
        <div className="kpi-card"><div className="label">{t('pm.totalUnresolvedCard')}</div><div><span className="value">{unresolved.length}</span><span style={{fontSize:12,color:'#a89a92',marginLeft:4}}>{criticalCount} {t('pm.criticalLabel')}</span></div></div>
        <div className="kpi-card"><div className="label">{t('pm.slaBreachesCard')}</div><div><span className="value">1</span><span style={{fontSize:12,color:'#a89a92',marginLeft:4}}>+18{t('pm.hoursOverdueSuffix')}</span></div></div>
        <div className="kpi-card"><div className="label">{t('pm.securityAlertsCard')}</div><span className="value">1</span></div>
        <div className="kpi-card"><div className="label">{t('pm.complianceFlagsCard')}</div><span className="value">1</span></div>
      </div>

      <div className="page-with-panel">
        <div>
          <div className="card">
            <div className="card-header"><h3>⚠ {t('pm.unresolvedHeading')} ({unresolved.length})</h3><button className="btn btn-sm"><Icon name="filter" size={12}/> {t('pm.filterBtn')}</button></div>
            {unresolved.map(e => (
              <div key={e.id} className="escalation-item" onClick={()=>setSelected(e)}>
                <div style={{display:'flex',gap:6,marginBottom:6}}>
                  {e.severity && <StatusBadge status={e.severity}/>}
                  <span style={{fontSize:12,background:'#e8e3de',padding:'2px 8px',borderRadius:4}}>{e.type}</span>
                  <span style={{fontSize:11,color:'#a89a92'}}>{e.id}</span>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div><div style={{fontWeight:600}}>{e.title}</div><div style={{fontSize:12,color:'#a89a92'}}>{e.flat && `${t('pm.flatLabel')} ${e.flat} · `}{t('pm.createdLabel')} {e.created} &nbsp; {t('pm.assignedLabel')} {e.assigned}</div></div>
                  <div style={{textAlign:'right'}}><div style={{fontSize:12,color:'#a89a92'}}>⏱ {e.sla}</div><StatusBadge status={e.status}/></div>
                </div>
              </div>
            ))}
          </div>
          <div className="card">
            <h3>✓ {t('pm.resolvedHeading')} ({resolved.length})</h3>
            {resolved.map(e => (
              <div key={e.id} style={{padding:'12px 0',borderBottom:'1px solid #ebe7e3',opacity:0.6}}>
                <div style={{display:'flex',gap:6,marginBottom:4}}><span style={{fontSize:12,background:'#e8e3de',padding:'2px 8px',borderRadius:4}}>{e.type}</span><span style={{fontSize:11,color:'#a89a92'}}>{e.id}</span></div>
                <div>{e.title}</div><div style={{fontSize:12,color:'#a89a92'}}>{t('pm.createdLabel')} {e.created} · {t('pm.resolvedLabel')}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="right-panel">
          <div className="card">
            <h3>{t('pm.escalationDetail')}</h3>
            {selected ? (
              <div style={{marginTop:12}}>
                <StatusBadge status={selected.severity}/><h3 style={{marginTop:8}}>{selected.title}</h3>
                <p style={{fontSize:12,color:'#a89a92',marginTop:4}}>{t('pm.assignedToLabel')} {selected.assigned}</p>
                <p style={{fontSize:12,color:'#a89a92'}}>{t('pm.slaSuffix')}: {selected.sla}</p>
                <button className="btn btn-primary btn-sm" style={{marginTop:12}}>{t('pm.resolveBtn')}</button>
              </div>
            ) : (<p style={{color:'#a89a92',textAlign:'center',marginTop:24}}>{t('pm.selectEscalation')}</p>)}
          </div>
          <div className="card">
            <h3>{t('pm.slaTrackerLabel')}</h3>
            {data.escalations.filter(e=>e.status!=='Resolved').map(e => (
              <div key={e.id} className="sla-item">
                <span>{e.id}</span>
                <div className="sla-bar"><div className="sla-fill" style={{width: e.sla.includes('overdue') ? '100%' : e.sla.includes('remaining') ? '70%' : '40%'}}/></div>
                <span style={{fontSize:11,color:'#a89a92',whiteSpace:'nowrap'}}>{e.sla}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

