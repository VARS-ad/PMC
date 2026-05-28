// ==================== SIDEBAR ====================
const Sidebar = ({ page, setPage, isOpen, onClose, onLogout }) => {
  const { t } = useApp();

  // Three-group sidebar: Dashboard (analytical surfaces),
  // Operational (day-to-day workflow), Settings (admin / setup).
  // Mirrors the supervisor app sidebar pattern.
  const groups = [
    { label: 'Dashboard', items: [
      { id: 'overview',    label: 'Dashboard',         icon: 'overview' },
      { id: 'properties',  label: t('nav.properties'), icon: 'properties' },
      { id: 'payment',     label: t('nav.payment'),    icon: 'payment' },
      { id: 'reports',     label: t('nav.reports'),    icon: 'reports' },
    ]},
    { label: 'Operational', items: [
      { id: 'service',         label: t('nav.service'),       icon: 'service' },
      { id: 'announcements',   label: t('nav.announcements'), icon: 'announcements' },
      { id: 'visitors',        label: t('nav.visitors'),      icon: 'visitors' },
      { id: 'vendors',         label: t('nav.vendors'),       icon: 'vendors' },
      { id: 'guards',          label: t('nav.guards'),        icon: 'guards' },
    ]},
    { label: 'Settings', items: [
      { id: 'profileCreation', label: 'Profile Creation',     icon: 'reports' },
    ]},
  ];

  const handleNav = (id) => {
    setPage(id);
    if (onClose) onClose();
  };

  return (
    <div className={`sidebar ${isOpen ? 'open' : ''}`}>
      <div className="sidebar-header">
        <svg width="28" height="28" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="VARS" style={{flexShrink:0}}>
          <rect width="100" height="100" rx="4" fill="#3E4C59"/>
          <path d="M33.3 16.7 L50 16.7 L58.1 25.2 L66.7 33.3 L66.7 83.3 L50 83.3 L33.3 66.7 Z" fill="#ffffff"/>
        </svg>
        <span>VARS PM</span>
      </div>
      <nav className="sidebar-nav">
        {groups.map((group, gi) => (
          <div key={group.label} style={{marginTop: gi === 0 ? 0 : 16}}>
            <div style={{padding:'8px 20px 6px',fontSize:10,letterSpacing:'0.1em',textTransform:'uppercase',color:'var(--text-muted)',fontWeight:600,textAlign:'center'}}>
              {group.label}
            </div>
            {group.items.map(item => (
              <div key={item.id} className={`sidebar-item ${page===item.id?'active':''}`} onClick={()=>handleNav(item.id)}>
                <Icon name={item.icon} size={16}/>
                <span>{item.label}</span>
                {item.badge ? <span className="badge">{item.badge}</span> : null}
              </div>
            ))}
          </div>
        ))}
      </nav>
    </div>
  );
};
