// ==================== LANGUAGE SWITCHER UI ====================
const LanguageSwitcher = ({ compact }) => {
  const { language, setLanguage } = useApp();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const options = [
    { code: 'en', label: 'English', short: 'EN' },
    { code: 'ar', label: 'العربية', short: 'عر' },
  ];
  const current = options.find(o => o.code === language) || options[0];
  return (
    <div ref={ref} style={{position:'relative',display:'inline-block'}}>
      <button onClick={() => setOpen(!open)}
        style={{display:'inline-flex',alignItems:'center',gap:7,padding: compact?'6px 11px':'7px 13px',background:'#fff',border:'1px solid #e4dfd8',borderRadius:20,fontSize:12,fontWeight:500,color:'#1a1a1a',cursor:'pointer',fontFamily:'inherit',lineHeight:1,whiteSpace:'nowrap'}}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#7a6f66" strokeWidth="1.6" style={{display:'block',flexShrink:0}}><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
        <span style={{display:'inline-block',lineHeight:1}}>{current.short}</span>
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#a89a92" strokeWidth="2.5" style={{display:'block',flexShrink:0}}><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      {open && (
        <div style={{position:'absolute',top:'calc(100% + 6px)',right:0,background:'#fff',border:'1px solid #ebe7e3',borderRadius:8,boxShadow:'0 8px 24px rgba(0,0,0,0.12)',zIndex:9999,minWidth:140,overflow:'hidden'}}>
          {options.map(o => (
            <div key={o.code} onClick={() => { setLanguage(o.code); setOpen(false); }}
              style={{padding:'9px 14px',fontSize:12.5,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,background: o.code===language?'#f5f1ec':'#fff',color:'#1a1a1a',fontWeight: o.code===language?600:400,borderBottom:'1px solid #f5f1ec'}}
              onMouseEnter={e => { if (o.code !== language) e.currentTarget.style.background='#faf7f3'; }}
              onMouseLeave={e => { if (o.code !== language) e.currentTarget.style.background='#fff'; }}>
              <span>{o.label}</span>
              {o.code === language && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#928989" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

