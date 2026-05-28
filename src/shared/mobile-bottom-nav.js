// ==================== MOBILE BOTTOM NAV ====================
const MobileBottomNav = ({ page, setPage }) => {
  const tabs = [
    { id: 'overview', label: 'Overview', icon: 'overview' },
    { id: 'visitors', label: 'Visitors', icon: 'visitors' },
    { id: 'service', label: 'Service', icon: 'service' },
    { id: 'announcements', label: 'Alerts', icon: 'announcements' },
  ];
  return (
    <div className="mobile-bottom-nav">
      <div className="nav-items">
        {tabs.map(t => (
          <div key={t.id} className={`nav-item ${page===t.id?'active':''}`} onClick={()=>setPage(t.id)}>
            <Icon name={t.icon} size={20}/>
            <span>{t.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

