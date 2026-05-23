// ==================== REPORTS PAGE ====================
const ReportsPage = () => {
  const { data, t } = useApp();
  const slaData = [{m:t('pm.monthOct'),v:84},{m:t('pm.monthNov'),v:88},{m:t('pm.monthDec'),v:82},{m:t('pm.monthJan'),v:79},{m:t('pm.monthFeb'),v:83},{m:t('pm.monthMar'),v:80},{m:t('pm.monthApr'),v:76},{m:t('pm.monthMay'),v:73},{m:t('pm.monthJun'),v:78}];
  const slaMax = 100; const slaMin = 60;
  const slaPoints = slaData.map((d,i) => {
    const x = 40 + i * (520 / (slaData.length - 1));
    const y = 20 + ((slaMax - d.v) / (slaMax - slaMin)) * 160;
    return `${x},${y}`;
  }).join(' ');

  const resolutionTypes = [
    {type:t('pm.typeAcRepair'),avg:'4.1h',max:'9.2h',sla:82,color:'#1a1a1a'},
    {type:t('pm.typeHandyman'),avg:'5.4h',max:'11.0h',sla:71,color:'#1a1a1a'},
    {type:t('pm.typeInstallation'),avg:'3.0h',max:'6.5h',sla:90,color:'#1a1a1a'},
    {type:t('pm.typeMoveIn'),avg:'1.8h',max:'3.5h',sla:96,color:'#1a1a1a'},
    {type:t('pm.typePestControl'),avg:'6.2h',max:'14.1h',sla:68,color:'#1a1a1a'}
  ];

  const finData = [
    {m:t('pm.monthJan'),collected:40,overdue:15,pending:10},
    {m:t('pm.monthFeb'),collected:35,overdue:20,pending:12},
    {m:t('pm.monthMar'),collected:50,overdue:18,pending:8},
    {m:t('pm.monthApr'),collected:55,overdue:12,pending:15},
    {m:t('pm.monthMay'),collected:65,overdue:10,pending:12},
    {m:t('pm.monthJun'),collected:60,overdue:14,pending:10},
    {m:t('pm.monthJul'),collected:70,overdue:8,pending:14}
  ];
  const finMax = 95;

  const occPoints = [60,62,58,65,63,68,70,72,75,78,80,82,85,88,90,92,94,93,91,94];
  const occMax = 100; const occMin = 50;
  const occLine = occPoints.map((v,i) => {
    const x = i * (480 / (occPoints.length - 1));
    const y = 10 + ((occMax - v) / (occMax - occMin)) * 80;
    return `${x},${y}`;
  }).join(' ');

  return (
    <div>
      <div className="page-header">
        <div><h1>{t('pm.reportsTitle')}</h1><div className="subtitle">{t('pm.reportsSubtitle')}</div></div>
        <div className="btn-group"><button className="btn"><Icon name="download" size={14}/> {t('pm.exportBtn')}</button><button className="btn btn-primary" onClick={()=>{
          exportToExcel([{metric:'SLA Compliance',value:'78%'},{metric:'Avg Resolution',value:'4.1h'},{metric:'Occupancy',value:'94%'},{metric:'Vacant Units',value:'18/300'},{metric:'Renewals',value:41}],
          [{header:'Metric',key:'metric'},{header:'Value',key:'value'}], 'VARS_Reports_KPI');
        }}><Icon name="download" size={14}/> {t('pm.exportCsvBtn')}</button></div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-header"><h3>{t('pm.chartSlaCompliance')}</h3><span style={{fontSize:12,color:'#a89a92',cursor:'pointer'}}>{t('pm.viewAll')}</span></div>
          <svg viewBox="0 0 580 220" style={{width:'100%',height:200}}>
            {[100,95,90,85,80,75,70,65,60].map((v,i) => (
              <React.Fragment key={v}>
                <line x1="40" y1={20+i*20} x2="560" y2={20+i*20} stroke="#f0f0f0" strokeWidth="1"/>
                <text x="32" y={24+i*20} textAnchor="end" fontSize="10" fill="#999">{v}%</text>
              </React.Fragment>
            ))}
            <polyline points={slaPoints} fill="none" stroke="#1a1a1a" strokeWidth="2"/>
            {slaData.map((d,i) => {
              const x = 40 + i * (520 / (slaData.length - 1));
              const y = 20 + ((slaMax - d.v) / (slaMax - slaMin)) * 160;
              return <React.Fragment key={i}><circle cx={x} cy={y} r="4" fill="#fff" stroke="#1a1a1a" strokeWidth="2"/><text x={x} y={210} textAnchor="middle" fontSize="10" fill="#999">{d.m}</text></React.Fragment>;
            })}
          </svg>
        </div>

        <div className="card">
          <div className="card-header"><h3>{t('pm.chartResolutionTime')}</h3><span style={{fontSize:12,color:'#a89a92',cursor:'pointer'}}>{t('pm.viewAll')}</span></div>
          <div style={{display:'flex',flexDirection:'column',gap:16,marginTop:8}}>
            {resolutionTypes.map(r => (
              <div key={r.type}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                  <span style={{fontSize:13,fontWeight:500}}>{r.type} · <span style={{color:'#a89a92',fontWeight:400}}>{t('pm.avgLabel')} {r.avg} · {r.max}</span></span>
                  <span style={{fontSize:13,fontWeight:600,color:r.sla>=90?'#1a1a1a':r.sla>=80?'#666':'#999'}}>{r.sla}% {t('pm.slaSuffix')}</span>
                </div>
                <div style={{height:6,background:'#e8e3de',borderRadius:3,overflow:'hidden'}}>
                  <div style={{height:'100%',width:`${r.sla}%`,background:r.color,borderRadius:3}}/>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid-2" style={{marginTop:0}}>
        <div className="card" style={{background:'#faf8f6',border:'none'}}>
          <h4 style={{marginBottom:8}}>{t('pm.aiInsightTitle')}</h4>
          <p style={{fontSize:13,color:'#a89a92',lineHeight:1.6}}>{t('pm.aiInsight1')}</p>
        </div>
        <div className="card" style={{background:'#faf8f6',border:'none'}}>
          <h4 style={{marginBottom:8}}>{t('pm.aiInsightTitle')}</h4>
          <p style={{fontSize:13,color:'#a89a92',lineHeight:1.6}}>{t('pm.aiInsight2')}</p>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-header"><h3>{t('pm.chartFinancialMetrics')}</h3><span style={{fontSize:12,color:'#a89a92',cursor:'pointer'}}>{t('pm.viewAll')}</span></div>
          <div style={{display:'flex',gap:16,marginBottom:12,justifyContent:'center'}}>
            <span style={{display:'flex',alignItems:'center',gap:4,fontSize:11,color:'#a89a92'}}><span style={{width:8,height:8,borderRadius:'50%',background:'#d9d9d9',display:'inline-block'}}/> {t('pm.legendCollected')}</span>
            <span style={{display:'flex',alignItems:'center',gap:4,fontSize:11,color:'#a89a92'}}><span style={{width:8,height:8,borderRadius:'50%',background:'#888',display:'inline-block'}}/> {t('pm.legendOverdue')}</span>
            <span style={{display:'flex',alignItems:'center',gap:4,fontSize:11,color:'#a89a92'}}><span style={{width:8,height:8,borderRadius:'50%',background:'#c4c4c4',display:'inline-block'}}/> {t('pm.legendPending')}</span>
          </div>
          <div style={{display:'flex',alignItems:'flex-end',gap:12,height:160,padding:'0 4px'}}>
            {finData.map((d,i) => {
              const total = d.collected + d.overdue + d.pending;
              return (
                <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
                  <div style={{width:'100%',maxWidth:44,height:`${(total/finMax)*140}px`,borderRadius:'4px 4px 0 0',overflow:'hidden',display:'flex',flexDirection:'column-reverse'}}>
                    <div style={{height:`${(d.collected/total)*100}%`,background:'#d9d9d9'}}/>
                    <div style={{height:`${(d.overdue/total)*100}%`,background:'#888'}}/>
                    <div style={{height:`${(d.pending/total)*100}%`,background:'#c4c4c4'}}/>
                  </div>
                  <span style={{fontSize:10,color:'#a89a92'}}>{d.m}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3>{t('pm.chartOccupancyTrend')}</h3><span style={{fontSize:12,color:'#a89a92',cursor:'pointer'}}>{t('pm.viewAll')}</span></div>
          <div className="grid-2" style={{gap:12,marginBottom:16}}>
            <div><div style={{fontSize:11,color:'#a89a92'}}>{t('pm.currentOccupancy')}</div><div style={{fontSize:28,fontWeight:700}}>94%</div><div style={{fontSize:11,color:'#22c55e'}}>↑ 1.5% {t('pm.vsLastMonth')}</div></div>
            <div><div style={{fontSize:11,color:'#a89a92'}}>{t('pm.vacantUnits')}</div><div style={{fontSize:28,fontWeight:700}}>18 / 300</div><div style={{fontSize:11,color:'#a89a92'}}>3 {t('pm.newVacanciesThisMonth')}</div></div>
            <div><div style={{fontSize:11,color:'#a89a92'}}>{t('pm.avgVacancyDuration')}</div><div style={{fontSize:28,fontWeight:700}}>22d</div><div style={{fontSize:11,color:'#22c55e'}}>↓ 5d {t('pm.vsPrior3MonthAvg')}</div></div>
            <div><div style={{fontSize:11,color:'#a89a92'}}>{t('pm.renewalsThisMonth')}</div><div style={{fontSize:28,fontWeight:700}}>41</div><div style={{fontSize:11,color:'#a89a92'}}>87% {t('pm.renewalRate')}</div></div>
          </div>
          <svg viewBox="0 0 500 100" style={{width:'100%',height:80}}>
            <polyline points={occLine} fill="none" stroke="#d9d9d9" strokeWidth="1.5"/>
            {(() => {
              const lastDash = occPoints.slice(-4).map((v,i) => {
                const idx = occPoints.length - 4 + i;
                const x = idx * (480 / (occPoints.length - 1));
                const y = 10 + ((occMax - v) / (occMax - occMin)) * 80;
                return `${x},${y}`;
              }).join(' ');
              return <polyline points={lastDash} fill="none" stroke="#1a1a1a" strokeWidth="1.5" strokeDasharray="4,3"/>;
            })()}
            <line x1={`${(occPoints.length - 4) * (480 / (occPoints.length - 1))}`} y1="0" x2={`${(occPoints.length - 4) * (480 / (occPoints.length - 1))}`} y2="100" stroke="#e0e0e0" strokeWidth="1" strokeDasharray="3,3"/>
          </svg>
        </div>
      </div>

      <div className="grid-2" style={{marginTop:0}}>
        <div className="card" style={{background:'#faf8f6',border:'none'}}>
          <h4 style={{marginBottom:8}}>{t('pm.aiInsightTitle')}</h4>
          <p style={{fontSize:13,color:'#a89a92',lineHeight:1.6}}>{t('pm.aiInsight3')}</p>
        </div>
        <div className="card" style={{background:'#faf8f6',border:'none'}}>
          <h4 style={{marginBottom:8}}>{t('pm.aiInsightTitle')}</h4>
          <p style={{fontSize:13,color:'#a89a92',lineHeight:1.6}}>{t('pm.aiInsight4')}</p>
        </div>
      </div>
    </div>
  );
};

