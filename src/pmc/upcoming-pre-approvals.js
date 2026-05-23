// ==================== UPCOMING PRE-APPROVALS (security dashboard) ====================
// Shown to security users (authenticated via Supabase Auth) on their dashboard.
// Pulls live from the new `visits` table — independent of the legacy JSON blob.

const UpcomingVisitsPanel = () => {
  const [visits, setVisits] = useState(null);
  const [hasAuth, setHasAuth] = useState(null);

  useEffect(() => {
    if (!supabaseClient) { setHasAuth(false); return; }
    let mounted = true;
    let channel = null;
    const load = async () => {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!mounted) return;
      if (!session || !session.user) { setHasAuth(false); return; }
      setHasAuth(true);
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabaseClient
        .from('visits')
        .select('id,visitor_name,visitor_phone,type,visit_date,visit_time,status,permit_ref')
        .eq('status', 'Pre-Approved')
        .gte('visit_date', today)
        .order('visit_date', { ascending: true });
      if (mounted && !error) setVisits(data || []);
    };
    load();
    // Supabase Realtime — sub-second updates on any visits change (RLS still applies).
    try {
      channel = supabaseClient
        .channel('visits-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'visits' }, () => load())
        .subscribe();
    } catch (_) { /* fall back to polling if realtime unavailable */ }
    // Slow fallback poll (15s) in case the realtime channel drops
    const id = setInterval(load, 15000);
    return () => {
      mounted = false;
      clearInterval(id);
      if (channel) { try { supabaseClient.removeChannel(channel); } catch(_) {} }
    };
  }, []);

  if (hasAuth === null) return null;
  if (!hasAuth || visits === null) return null;

  return (
    <div className="sec-kpi-block" style={{marginBottom:20}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12,paddingBottom:10,borderBottom:'1px solid var(--border-light)'}}>
        <div>
          <div className="sec-kpi-label" style={{marginBottom:4}}>UPCOMING PRE-APPROVALS</div>
          <div style={{fontSize:10,color:'#a89a92'}}>Live from new visits table · realtime stream + 15s fallback</div>
        </div>
        <div style={{fontSize:24,fontWeight:700,color:'#1a1a1a'}}>{visits.length}</div>
      </div>
      {visits.length === 0 ? (
        <div style={{fontSize:12,color:'var(--text-muted)',padding:'14px 0',textAlign:'center'}}>No upcoming pre-approvals.</div>
      ) : (
        <div style={{maxHeight:280,overflowY:'auto'}}>
          {visits.map(v => (
            <div key={v.id} style={{padding:'10px 12px',background:'#e8e3de',borderRadius:6,marginBottom:6,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div style={{minWidth:0,flex:1}}>
                <div style={{fontSize:13,fontWeight:500,color:'#1a1a1a'}}>{v.visitor_name}</div>
                <div style={{fontSize:11,color:'#6b6156',marginTop:2}}>
                  {v.visit_date}{v.visit_time ? ' · ' + v.visit_time : ''} · {v.type}{v.visitor_phone ? ' · ' + v.visitor_phone : ''}
                </div>
              </div>
              <div style={{fontSize:10,color:'#928989',background:'#fff',padding:'4px 8px',borderRadius:4,marginLeft:8,flexShrink:0}}>
                {v.permit_ref || '—'}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

