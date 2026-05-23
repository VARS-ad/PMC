// ==================== RESIDENT APP COMPONENTS ====================
const ResidentApp = ({ onLogout }) => {
  const { data, setData, showToast, t } = useApp();
  const [currentPage, setCurrentPage] = useState('home');
  const [selectedVisitor, setSelectedVisitor] = useState(null);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [selectedForApproval, setSelectedForApproval] = useState(null);
  const [helpModal, setHelpModal] = useState(null); // 'security' | 'pm' | 'incident' | null
  const [incidentForm, setIncidentForm] = useState({ type: 'Security', location: '', description: '' });
  const [editingVisitor, setEditingVisitor] = useState(null); // holds editable copy of visitor
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [selectedNotifDetail, setSelectedNotifDetail] = useState(null);
  const [showResPropertyDropdown, setShowResPropertyDropdown] = useState(false);
  const [showPaymentExport, setShowPaymentExport] = useState(false);
  const dismissedNotifIds = data.dismissedNotifIds || [];
  const [resHhTab, setResHhTab] = useState('family');
  const [payModal, setPayModal] = useState(null); // null or { amount: 'AED 3,200' }

  // Fetch the signed-in resident's real name/unit/building so the header shows true values
  // instead of legacy "Hello, Nitin / B-102, Sky Tower". Falls back to those for demo logins.
  const [authResident, setAuthResident] = useState(null);
  useEffect(() => {
    if (!supabaseClient) return;
    let mounted = true;
    (async () => {
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        const userId = session && session.user && session.user.id;
        const rrole = session && session.user && session.user.app_metadata && session.user.app_metadata.role;
        if (!userId || rrole !== 'resident') return;
        const [{ data: profile }, { data: ra }] = await Promise.all([
          supabaseClient.from('profiles').select('full_name').eq('id', userId).maybeSingle(),
          supabaseClient.from('resident_assignments').select('unit_id').eq('profile_id', userId).maybeSingle(),
        ]);
        if (!mounted || !ra) return;
        const { data: unit } = await supabaseClient.from('units').select('floor,unit_number,building_id').eq('id', ra.unit_id).maybeSingle();
        const { data: building } = unit ? await supabaseClient.from('buildings').select('name').eq('id', unit.building_id).maybeSingle() : { data: null };
        if (!mounted) return;
        const firstName = (profile && profile.full_name) ? profile.full_name.split(' ')[0] : 'Nitin';
        setAuthResident({
          name: firstName,
          fullName: (profile && profile.full_name) || 'Nitin Sharma',
          flat: (unit && unit.unit_number) || 'B-102',
          building: (building && building.name) || 'Sky Tower',
        });
      } catch (_) { /* fall back to defaults */ }
    })();
    return () => { mounted = false; };
  }, []);
  const r_name = (authResident && authResident.name) || 'Nitin';
  const r_flat = (authResident && authResident.flat) || 'B-102';
  const r_building = (authResident && authResident.building) || 'Sky Tower';
  const [resHhShowCreate, setResHhShowCreate] = useState(false);
  const [resHhForm, setResHhForm] = useState({ name: '', phone: '', relation: 'Sister', role: 'Maid', schedule: 'Mon to Fri', hours: '9:00 AM to 17:00 PM', allowAccess: false, idDocType: 'Emirates ID', docNumber: '', vehicleNumber: '' });
  const [resHhEditingId, setResHhEditingId] = useState(null); // null = create mode, id = edit mode
  const [resHhViewMember, setResHhViewMember] = useState(null); // member object to view detail + QR
  const [resVisFilter, setResVisFilter] = useState('All');
  const [resVisDateFilter, setResVisDateFilter] = useState('All');
  const [resVisFilterOpen, setResVisFilterOpen] = useState(false);
  const [showServiceBookingModal, setShowServiceBookingModal] = useState(false);
  const [bookingMode, setBookingMode] = useState('amenity'); // 'amenity' or 'service'
  const [serviceBooking, setServiceBooking] = useState({ type:'', location:'', date:'', time:'', duration:'1 hour', guests:1 });
  const [editingAmenityId, setEditingAmenityId] = useState(null); // null = new booking, id = editing existing
  const [showAmenityDetail, setShowAmenityDetail] = useState(null); // holds amenity booking object for detail/edit/delete
  const prevVisitorStatesRef = React.useRef({});

  // Track visitor status changes for live notifications
  useEffect(() => {
    const prev = prevVisitorStatesRef.current;
    const now = {};
    (data.visitors || []).forEach(v => {
      now[v.permitRef || v.id] = v.status;
      const prevStatus = prev[v.permitRef || v.id];
      if (prevStatus && prevStatus !== v.status) {
        // Status changed — show toast for security actions
        if (v.status === 'Inside' && prevStatus === 'Scheduled') {
          showToast('✓ ' + v.name + ' has passed security');
        } else if (v.status === 'Rejected') {
          showToast('✕ ' + v.name + ' was rejected by security');
        } else if (v.status === 'On Hold') {
          showToast('⏸ ' + v.name + ' is on hold at security');
        }
      }
    });
    prevVisitorStatesRef.current = now;
  }, [data.visitors]);

  // Build notifications from visitor data + announcements
  const notifications = React.useMemo(() => {
    const notifs = [];
    // Security action notifications — generated from visitor data
    (data.visitors || []).forEach(v => {
      if (v.securityPassedTime) {
        notifs.push({
          id: 'sec-pass-' + (v.permitRef || v.id),
          type: 'security',
          icon: '✓',
          iconBg: '#e0e5db',
          iconColor: '#5a6b4f',
          title: v.name + ' passed security',
          body: 'Admitted at ' + v.securityPassedTime + (v.securityActionDate ? ' on ' + v.securityActionDate : ''),
          time: v.securityPassedTime,
          visitor: v
        });
      }
      if (v.securityRejectTime) {
        notifs.push({
          id: 'sec-rej-' + (v.permitRef || v.id),
          type: 'security',
          icon: '✕',
          iconBg: '#eddbd9',
          iconColor: '#8b4a42',
          title: v.name + ' rejected by security',
          body: 'Rejected at ' + v.securityRejectTime + (v.securityActionDate ? ' on ' + v.securityActionDate : ''),
          time: v.securityRejectTime,
          visitor: v
        });
      }
      if (v.securityHoldTime) {
        notifs.push({
          id: 'sec-hold-' + (v.permitRef || v.id),
          type: 'security',
          icon: '⏸',
          iconBg: '#ebe3d9',
          iconColor: '#7a6040',
          title: v.name + ' on hold at security',
          body: 'Held since ' + v.securityHoldTime + (v.securityActionDate ? ' on ' + v.securityActionDate : ''),
          time: v.securityHoldTime,
          visitor: v
        });
      }
    });
    // Static announcements
    notifs.push({
      id: 'ann-pool', type: 'announcement', icon: '\u25CF', iconBg: '#e0dde5', iconColor: '#5a5470',
      title: 'Pool Maintenance Notice', body: 'Swimming pool closed for maintenance on April 12.', time: '2h ago'
    });
    notifs.push({
      id: 'ann-elevator', type: 'announcement', icon: '\u2014', iconBg: '#f3e5f5', iconColor: '#7b1fa2',
      title: 'Elevator Service', body: 'Elevator servicing Saturday morning.', time: '5h ago'
    });
    return notifs;
  }, [data.visitors]);

  const unreadCount = notifications.filter(n => !dismissedNotifIds.includes(n.id)).length;

  const dismissNotif = (id) => {
    const updated = [...dismissedNotifIds, id];
    setData(prev => ({ ...prev, dismissedNotifIds: updated }));
  };

  const clearAllNotifs = () => {
    const allIds = notifications.map(n => n.id);
    setData(prev => ({ ...prev, dismissedNotifIds: allIds }));
  };

  const [showCallSecurity, setShowCallSecurity] = useState(false);

  const handleApproveVisitor = (visitor) => {
    const now = new Date();
    const isFromSecurity = visitor.source === 'security';

    const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    const timeStr12 = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    if (isFromSecurity) {
      // Security-originated: update visitor status, mark pending as resolved, add to today's schedule
      setData(prev => ({
        ...prev,
        visitors: prev.visitors.map(v =>
          v.permitRef === visitor.permitRef
            ? { ...v, status: 'Scheduled', qrPayload: v.qrPayload ? { ...v.qrPayload, status: 'RESIDENT APPROVED' } : v.qrPayload }
            : v
        ),
        entryLog: prev.entryLog.map(e =>
          e.refId === visitor.permitRef
            ? { ...e, status: 'RESIDENT APPROVED' }
            : e
        ),
        pendingApprovals: prev.pendingApprovals.map(p => p.id === visitor.id ? { ...p, resolved: 'approved' } : p),
        todayScheduleSecurity: [
          { time: timeStr12, description: visitor.name, flat: visitor.flat || 'B-102', type: visitor.type || 'Guest' },
          ...prev.todayScheduleSecurity
        ]
      }));
      showToast(visitor.name + ' approved — security notified');
    } else {
      // Resident-originated: create new visitor entry
      const permitRef = 'PA-' + Date.now();
      const isoDateRes = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
      const newVisitor = {
        id: Date.now(),
        name: visitor.name,
        type: visitor.type || 'Resident Guest',
        contact: visitor.calledBy || 'Resident',
        resident: 'Nitin Sharma',
        date: dateStr,
        dateIn: isoDateRes,
        dateOut: '',
        time: timeStr12,
        status: 'Scheduled',
        purpose: visitor.purpose || 'Personal visit',
        permitRef: permitRef,
        repeater: visitor.repeater || 'Single Visit',
        flat: 'B-102',
        qrPayload: {
          permit: permitRef,
          property: 'Sky Tower - The Pinnacle Residences',
          unit: 'B-102',
          resident: 'Nitin Sharma',
          visitor: visitor.name,
          type: visitor.type || 'Resident Guest',
          date: dateStr,
          time: timeStr12,
          validUntil: dateStr + ' 23:59',
          repeater: visitor.repeater || 'Single Visit',
          status: 'PRE-APPROVED'
        }
      };
      setData(prev => ({
        ...prev,
        visitors: [newVisitor, ...prev.visitors],
        pendingApprovals: prev.pendingApprovals.map(p => p.id === visitor.id ? { ...p, resolved: 'approved' } : p)
      }));
      showToast(visitor.name + ' approved — moved to upcoming visitors');
    }
  };

  const handleRejectVisitor = (visitor) => {
    const isFromSecurity = visitor.source === 'security';
    setData(prev => ({
      ...prev,
      pendingApprovals: prev.pendingApprovals.map(p => p.id === visitor.id ? { ...p, resolved: 'rejected' } : p),
      visitors: isFromSecurity
        ? prev.visitors.map(v => v.permitRef === visitor.permitRef ? { ...v, status: 'Rejected' } : v)
        : prev.visitors,
      entryLog: isFromSecurity
        ? prev.entryLog.map(e => e.refId === visitor.permitRef ? { ...e, status: 'REJECTED' } : e)
        : prev.entryLog
    }));
    showToast(visitor.name + ' rejected' + (isFromSecurity ? ' — security notified' : ''));
  };

  const handleConfirmApproval = () => {
    if (selectedForApproval) handleApproveVisitor(selectedForApproval);
    setShowApprovalModal(false);
    setSelectedForApproval(null);
  };

  const viewQrRef = React.useRef(null);

  // QR for saved visitor view — just permit ref
  const getViewQrImgUrl = (permit) => 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' + encodeURIComponent(permit || 'UNKNOWN');

  useEffect(() => {
    if (currentPage === 'viewVisitor' && selectedVisitor && selectedVisitor.qrPayload && viewQrRef.current) {
      const sp = selectedVisitor.qrPayload;
      viewQrRef.current.innerHTML = '<img src="' + getViewQrImgUrl(sp.permit) + '" width="280" height="280" style="display:block;margin:0 auto;" crossorigin="anonymous" />';
    }
  }, [currentPage, selectedVisitor]);

  // Shared date/time parsing helpers
  const parseTime24 = (t) => {
    if (!t) return '99:99';
    if (/^\d{1,2}:\d{2}$/.test(t)) return t.padStart(5,'0');
    const m12 = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (m12) { let h = parseInt(m12[1],10); const ampm = m12[3].toUpperCase(); if (ampm === 'PM' && h !== 12) h += 12; if (ampm === 'AM' && h === 12) h = 0; return String(h).padStart(2,'0') + ':' + m12[2]; }
    return t;
  };
  const parseDateISO = (d) => {
    if (!d) return '9999-99-99';
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    const slashParts = d.split('/');
    if (slashParts.length === 3) return slashParts[2]+'-'+slashParts[1].padStart(2,'0')+'-'+slashParts[0].padStart(2,'0');
    const mm = {Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12'};
    const monMatch = d.match(/^(\d{1,2})\s+([A-Za-z]{3})(?:\s+(\d{4}))?$/);
    if (monMatch) return (monMatch[3] || '2026')+'-'+(mm[monMatch[2]]||'01')+'-'+monMatch[1].padStart(2,'0');
    return '9999-99-99';
  };

  const renderPage = () => {
    switch(currentPage) {
      case 'viewVisitor':
        if (!selectedVisitor) { setCurrentPage('home'); return null; }
        const vp = selectedVisitor.qrPayload;
        const isEditing = !!editingVisitor;
        const canEdit = selectedVisitor.status === 'Scheduled' || selectedVisitor.status === 'Pre-Approved' || selectedVisitor.status === 'Pending';
        const canDelete = selectedVisitor.status === 'Scheduled' || selectedVisitor.status === 'Pre-Approved' || selectedVisitor.status === 'Pending';

        const saveEdit = () => {
          if (!editingVisitor) return;
          // Recalculate validity based on new date if changed
          const newValidUntil = editingVisitor.date
            ? (selectedVisitor.repeater === 'Single Visit' || !selectedVisitor.repeater
              ? editingVisitor.date + ' 23:59'
              : 'Until cancelled')
            : (selectedVisitor.validUntil || '—');

          setData(prev => ({
            ...prev,
            visitors: prev.visitors.map(v => {
              if ((v.permitRef && v.permitRef === selectedVisitor.permitRef) || v.id === selectedVisitor.id) {
                const updated = {
                  ...v,
                  name: editingVisitor.name,
                  contact: editingVisitor.phone,
                  type: editingVisitor.type,
                  date: editingVisitor.date,
                  time: editingVisitor.time,
                  validUntil: newValidUntil,
                  qrPayload: v.qrPayload ? {
                    ...v.qrPayload,
                    visitor: editingVisitor.name,
                    mobile: editingVisitor.phone,
                    type: editingVisitor.type,
                    date: editingVisitor.date,
                    time: editingVisitor.time,
                    vehicle: editingVisitor.vehicle,
                    guests: editingVisitor.guests,
                    validUntil: newValidUntil
                  } : v.qrPayload
                };
                setSelectedVisitor(updated);
                return updated;
              }
              return v;
            }),
            // Also update schedule entries so Security app reflects changes
            todayScheduleSecurity: prev.todayScheduleSecurity.map(s =>
              s.description && s.description.includes(selectedVisitor.name)
                ? { ...s, time: editingVisitor.time, description: editingVisitor.name + ' — ' + editingVisitor.type }
                : s
            ),
            todaySchedule: prev.todaySchedule.map(s =>
              s.name && s.name.includes(selectedVisitor.name)
                ? { ...s, time: editingVisitor.time, name: editingVisitor.name + ' (' + editingVisitor.type + ')' }
                : s
            )
          }));
          setEditingVisitor(null);
          showToast('Visitor details updated');
        };

        const deleteVisitor = () => {
          if (!window.confirm('Delete this visitor pass? This action cannot be undone.')) return;
          setData(prev => ({
            ...prev,
            visitors: prev.visitors.filter(v => !((v.permitRef && v.permitRef === selectedVisitor.permitRef) || v.id === selectedVisitor.id)),
            entryLog: prev.entryLog.filter(e => e.refId !== selectedVisitor.permitRef)
          }));
          setShowDeleteConfirm(false);
          setSelectedVisitor(null);
          setCurrentPage('home');
          showToast('Pre-approval deleted');
        };

        // Status badge for this visitor
        const viewStatusBadge = () => {
          const s = selectedVisitor.status;
          const vd = selectedVisitor.date;
          const nowStr = new Date().toISOString().split('T')[0];
          let parsedDate = vd;
          if (vd && !(/^\d{4}-\d{2}-\d{2}$/.test(vd))) { const p = vd.split('/'); if (p.length === 3) parsedDate = p[2]+'-'+p[1].padStart(2,'0')+'-'+p[0].padStart(2,'0'); }
          const isPast = parsedDate && parsedDate < nowStr;
          const isFuture = parsedDate && parsedDate > nowStr;

          // Future: always Pre-Approved
          if (isFuture) return { bg: '#ccc8c1', color: '#4a4540', label: '✓ PRE-APPROVED' };

          // Past: remap logically
          if (isPast) {
            if (s === 'Pre-Approved' || s === 'Scheduled' || s === 'Pending') return { bg: '#e8e3de', color: '#8a7f76', label: 'NO SHOW' };
            if (s === 'Inside' || s === 'Passed Security') return { bg: '#d5d0ca', color: '#6b6560', label: '→ CHECKED OUT' };
            if (s === 'Rejected' || s === 'Denied Entry' || s === 'On Hold') return { bg: '#d4b8b4', color: '#7a3b33', label: '✕ REJECTED' };
            return { bg: '#d5d0ca', color: '#6b6560', label: '→ CHECKED OUT' };
          }

          // Today: actual status
          if (s === 'Inside' || s === 'Passed Security') return { bg: '#c5cebf', color: '#3a4a30', label: '✓ INSIDE' };
          if (s === 'Rejected' || s === 'Denied Entry') return { bg: '#d4b8b4', color: '#7a3b33', label: '✕ REJECTED' };
          if (s === 'On Hold') return { bg: '#d6ccb8', color: '#6b5a3a', label: '⏸ ON HOLD' };
          if (s === 'Checked Out' || s === 'Exited') return { bg: '#d5d0ca', color: '#6b6560', label: '→ CHECKED OUT' };
          return { bg: '#ccc8c1', color: '#4a4540', label: '✓ PRE-APPROVED' };
        };
        const badge = viewStatusBadge();

        return (
          <div className="res-content" style={{paddingBottom:80}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20}}>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <button onClick={() => { setCurrentPage('home'); setSelectedVisitor(null); setEditingVisitor(null); }} style={{background:'none',border:'none',fontSize:18,cursor:'pointer',color:'#6b5d52'}}>←</button>
                <h3 style={{fontSize:18,fontWeight:600,letterSpacing:'-0.01em',margin:0}}>Visitor Details</h3>
              </div>
            </div>

            <div style={{background:'#fff',border:'1px solid #ebe7e3',borderRadius:6,padding:24,textAlign:'center',marginBottom:16}}>
              <div style={{background:badge.bg,color:badge.color,padding:'8px 20px',borderRadius:20,display:'inline-block',fontSize:12,fontWeight:600,letterSpacing:'0.04em',marginBottom:16}}>{badge.label}</div>
              {selectedVisitor.securityPassedTime && <div style={{fontSize:11,color:'#5a6b4f',marginBottom:8}}>Passed at {selectedVisitor.securityPassedTime}{selectedVisitor.securityActionDate ? ' on ' + selectedVisitor.securityActionDate : ''}</div>}
              {selectedVisitor.securityRejectTime && <div style={{fontSize:11,color:'#8b4a42',marginBottom:8}}>Rejected at {selectedVisitor.securityRejectTime}</div>}
              {selectedVisitor.securityHoldTime && <div style={{fontSize:11,color:'#7a6040',marginBottom:8}}>On hold since {selectedVisitor.securityHoldTime}</div>}
              {vp ? (
                <div ref={viewQrRef} style={{display:'flex',justifyContent:'center',marginBottom:16}}></div>
              ) : (
                <div style={{padding:20,color:'#a89a92',fontSize:13}}>QR code not available (visitor was created before this feature)</div>
              )}
              <div style={{fontSize:11,color:'#a89a92',marginBottom:8}}>Scan this QR code at the gate</div>
              <div style={{fontSize:14,fontWeight:600,color:'#1a1a1a',marginBottom:4}}>{selectedVisitor.permitRef || '—'}</div>
              <div style={{fontSize:12,color:'#6b5d52'}}>{selectedVisitor.name}</div>
            </div>

            {/* Edit Mode */}
            {isEditing ? (
              <div style={{background:'#fff',border:'1px solid #ebe7e3',borderRadius:6,padding:20,marginBottom:16}}>
                <div style={{fontSize:11,color:'#a89a92',letterSpacing:'0.06em',textTransform:'uppercase',marginBottom:12,fontWeight:600}}>Edit Details</div>
                {[
                  { label: 'Visitor Name', key: 'name', type: 'text' },
                  { label: 'Phone', key: 'phone', type: 'tel' },
                  { label: 'Type', key: 'type', type: 'select', options: ['Guest','Vendor','Contractor','Delivery','Agent'] },
                  { label: 'Date', key: 'date', type: 'text', placeholder: 'e.g. 05 Apr' },
                  { label: 'Time', key: 'time', type: 'text', placeholder: 'e.g. 14:00' },
                  { label: 'Vehicle', key: 'vehicle', type: 'text', placeholder: 'e.g. Toyota Camry — ABC 1234' },
                  { label: 'Total Guests', key: 'guests', type: 'text' },
                ].map((field) => (
                  <div key={field.key} style={{marginBottom:12}}>
                    <label style={{fontSize:11,color:'#a89a92',display:'block',marginBottom:4}}>{field.label}</label>
                    {field.type === 'select' ? (
                      <select value={editingVisitor[field.key]} onChange={e => setEditingVisitor({...editingVisitor, [field.key]: e.target.value})} style={{width:'100%',padding:'8px 10px',border:'1px solid #d5cfc8',borderRadius:4,fontSize:13,background:'#fff'}}>
                        {field.options.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input type={field.type} value={editingVisitor[field.key]} onChange={e => setEditingVisitor({...editingVisitor, [field.key]: e.target.value})} placeholder={field.placeholder || ''} style={{width:'100%',padding:'8px 10px',border:'1px solid #d5cfc8',borderRadius:4,fontSize:13,boxSizing:'border-box'}}/>
                    )}
                  </div>
                ))}
                <div style={{display:'flex',gap:10,marginTop:16}}>
                  <button onClick={saveEdit} style={{flex:1,padding:12,background:'#928989',color:'#fff',border:'none',borderRadius:5,fontSize:13,fontWeight:600,cursor:'pointer'}}>Save Changes</button>
                  <button onClick={() => setEditingVisitor(null)} style={{flex:1,padding:12,background:'#fff',color:'#8a7f76',border:'1px solid #d5cfc8',borderRadius:5,fontSize:13,cursor:'pointer'}}>Cancel</button>
                </div>
              </div>
            ) : (
              <div style={{background:'#fff',border:'1px solid #ebe7e3',borderRadius:6,padding:20,marginBottom:16}}>
                <div style={{fontSize:11,color:'#a89a92',letterSpacing:'0.06em',textTransform:'uppercase',marginBottom:12,fontWeight:600}}>Pass Details</div>
                {(() => {
                  const rows = [
                    ['Property', vp ? vp.property : 'Sky Tower - The Pinnacle Residences'],
                    ['Unit / Flat', selectedVisitor.flat],
                    ['Host', selectedVisitor.resident],
                    ['Visitor', selectedVisitor.name],
                    ['Phone', selectedVisitor.contact],
                    ['Type', selectedVisitor.type],
                    ['Total Guests', vp ? String(vp.guests) : '1'],
                    ['Vehicle', vp ? vp.vehicle : 'N/A'],
                    ['Date Entered', (() => { const d = selectedVisitor.dateIn || selectedVisitor.date || ''; if (!d) return '—'; if (/^\d{4}-\d{2}-\d{2}$/.test(d)) { const p = d.split('-'); const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; return parseInt(p[2],10)+' '+m[parseInt(p[1],10)-1]+' '+p[0]; } return d; })()],
                    ['Time', selectedVisitor.time],
                    ['Date Exit', (() => { const d = selectedVisitor.dateOut || ''; if (!d) return '—'; if (/^\d{4}-\d{2}-\d{2}$/.test(d)) { const p = d.split('-'); const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; return parseInt(p[2],10)+' '+m[parseInt(p[1],10)-1]+' '+p[0]; } return d; })()],
                    ['Repeater', selectedVisitor.repeater || (vp ? vp.repeater : '') || 'Single Visit'],
                    ['Valid Until', selectedVisitor.validUntil || (vp ? vp.validUntil : '—')],
                  ];
                  return rows.map(([label, val], i) => (
                    <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom: i < rows.length - 1 ? '1px solid #f0f0f0' : 'none'}}>
                      <span style={{fontSize:12,color:'#a89a92'}}>{label}</span>
                      <span style={{fontSize:12,color: label === 'Valid Until' && val === 'Until cancelled' ? '#2d6a4f' : label === 'Repeater' && val !== 'Single Visit' ? '#1565c0' : '#1a1a1a',fontWeight:500,textAlign:'right',maxWidth:'60%'}}>{val}</span>
                    </div>
                  ));
                })()}
              </div>
            )}

            {vp && (function() {
              const viewGetBlob = () => new Promise((resolve) => {
                if (!viewQrRef.current) { resolve(null); return; }
                const img = viewQrRef.current.querySelector('img');
                if (!img) { resolve(null); return; }
                const drawIt = () => {
                  const pad = 40, w = 400;
                  const pc = document.createElement('canvas'); pc.width = w; pc.height = 620;
                  const ctx = pc.getContext('2d');
                  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, 620);
                  ctx.fillStyle = '#ae9751'; ctx.fillRect(0, 0, w, 4);
                  ctx.fillStyle = '#1a1a1a'; ctx.font = 'bold 18px Arial'; ctx.textAlign = 'center';
                  ctx.fillText('VARS — Visitor Pass', w/2, 36);
                  ctx.fillStyle = '#2d6a4f'; ctx.font = 'bold 13px Arial'; ctx.fillText('PRE-APPROVED', w/2, 58);
                  ctx.drawImage(img, (w - 180) / 2, 72, 180, 180);
                  ctx.fillStyle = '#1a1a1a'; ctx.font = 'bold 14px Arial'; ctx.fillText(vp.permit, w/2, 272);
                  ctx.textAlign = 'left'; ctx.font = '12px Arial';
                  let y = 298;
                  [['Visitor',vp.visitor],['Phone',vp.mobile],['Property',vp.property],['Unit',vp.unit],['Host',vp.resident],['Type',vp.type],['Date',vp.date],['Time',vp.time],['Vehicle',vp.vehicle],['Valid Until',vp.validUntil]].forEach(([l,v]) => {
                    ctx.fillStyle = '#8a8a8a'; ctx.font = '11px Arial'; ctx.fillText(l, pad, y);
                    ctx.fillStyle = '#1a1a1a'; ctx.font = '12px Arial'; ctx.fillText(v || '', 140, y); y += 24;
                  });
                  ctx.strokeStyle = '#e8e8e8'; ctx.beginPath(); ctx.moveTo(pad, y+4); ctx.lineTo(w-pad, y+4); ctx.stroke();
                  ctx.fillStyle = '#8a8a8a'; ctx.font = '10px Arial'; ctx.textAlign = 'center';
                  ctx.fillText('Show this pass or scan QR code at the gate', w/2, y+24);
                  pc.toBlob((blob) => { resolve(blob); }, 'image/png');
                };
                if (img.complete) { drawIt(); } else { img.onload = drawIt; img.onerror = () => resolve(null); }
              });
              const viewShare = async () => {
                const blob = await viewGetBlob();
                if (!blob) { showToast('Could not generate image'); return; }
                const file = new File([blob], 'VARS-PM-Pass-' + vp.permit + '.png', { type: 'image/png' });
                if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                  try { await navigator.share({ files: [file] }); return; } catch(e) { if (e.name === 'AbortError') return; }
                }
                const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.download = file.name; a.href = url; a.click(); URL.revokeObjectURL(url);
                showToast('Image saved — attach it in WhatsApp or Telegram');
              };
              return (<React.Fragment>
                <button onClick={viewShare} style={{width:'100%',padding:14,background:'#fff',color:'#1a1a1a',border:'1px solid #d5cfc8',borderRadius:6,fontSize:14,fontWeight:500,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:8,marginBottom:12,letterSpacing:'0.03em'}}>
                  Share QR Pass
                </button>
              </React.Fragment>);
            })()}

            {canEdit && !isEditing && (
              <button onClick={() => setEditingVisitor({
                name: selectedVisitor.name,
                phone: selectedVisitor.contact || (vp ? vp.mobile : ''),
                type: selectedVisitor.type,
                date: selectedVisitor.date,
                time: selectedVisitor.time,
                vehicle: vp ? vp.vehicle : '',
                guests: vp ? String(vp.guests) : '1'
              })} style={{width:'100%',padding:14,background:'#fff',color:'#1a1a1a',border:'1px solid #d5cfc8',borderRadius:6,fontSize:14,fontWeight:500,cursor:'pointer',marginBottom:12,letterSpacing:'0.03em'}}>
                Edit Details
              </button>
            )}

            {canDelete && !isEditing && (
              <button onClick={() => setShowDeleteConfirm(true)} style={{width:'100%',padding:14,background:'#fff',color:'#8b4a42',border:'1px solid #deccca',borderRadius:6,fontSize:13,fontWeight:500,cursor:'pointer',marginBottom:12,letterSpacing:'0.03em'}}>
                Delete Pre-Approval
              </button>
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteConfirm && (
              <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.5)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:20}} onClick={() => setShowDeleteConfirm(false)}>
                <div style={{background:'#fff',borderRadius:8,padding:24,maxWidth:340,width:'100%',textAlign:'center'}} onClick={e => e.stopPropagation()}>
                  <div style={{fontSize:32,marginBottom:12}}><svg width='32' height='32' viewBox='0 0 24 24' fill='none' stroke='#7a6040' stroke-width='1.5'><path d='M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z'/></svg></div>
                  <h3 style={{fontSize:16,fontWeight:600,marginBottom:8,color:'#1a1a1a'}}>Delete Pre-Approval?</h3>
                  <p style={{fontSize:13,color:'#8a7f76',marginBottom:20,lineHeight:1.4}}>This will permanently remove the pre-approval for <strong>{selectedVisitor.name}</strong>. The visitor will no longer be able to use this pass.</p>
                  <div style={{display:'flex',gap:10}}>
                    <button onClick={() => setShowDeleteConfirm(false)} style={{flex:1,padding:12,background:'#fff',color:'#8a7f76',border:'1px solid #d5cfc8',borderRadius:5,fontSize:13,cursor:'pointer'}}>Cancel</button>
                    <button onClick={deleteVisitor} style={{flex:1,padding:12,background:'#8b4a42',color:'#fff',border:'none',borderRadius:5,fontSize:13,fontWeight:600,cursor:'pointer'}}>Delete</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      case 'payment':
        const monthsUpper = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
        const monthsArabic = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
        const monthsAbbr = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const isAr = t('res.payment') !== 'Payment';
        const monthHeader = (mIdx, year) => isAr ? (monthsArabic[mIdx] + ' ' + year) : (monthsUpper[mIdx] + ' ' + year);
        const monthShort = (mIdx) => isAr ? monthsArabic[mIdx] : monthsAbbr[mIdx];
        const transactions = [
          { mIdx: 2, year: 2026, items: [
            { kind: 'maintenance', mIdx: 2, day: 5, payMethod: 'UPI', refNum: '84920', amount: 'AED 2,400', status: 'Paid' },
            { kind: 'water', mIdx: 2, day: 5, payMethod: 'UPI', refNum: '84921', amount: 'AED 400', status: 'Paid' },
          ]},
          { mIdx: 1, year: 2026, items: [
            { kind: 'maintenance', mIdx: 1, day: 4, payMethod: 'Card', refNum: '79103', amount: 'AED 2,400', status: 'Paid' },
            { kind: 'penalty', mIdx: 1, day: 18, payMethod: 'Auto', amount: 'AED 200', status: 'Penalty' },
          ]},
          { mIdx: 0, year: 2026, items: [
            { kind: 'maintenance', mIdx: 0, day: 5, payMethod: 'UPI', refNum: '74210', amount: 'AED 2,400', status: 'Paid' },
            { kind: 'parking', mIdx: 0, day: 10, payMethod: 'Card', refNum: '74305', amount: 'AED 750', status: 'Paid' },
          ]},
        ];
        const titleFor = (item) => {
          if (item.kind === 'maintenance') return t('res.maintenance') + ' — ' + monthShort(item.mIdx);
          if (item.kind === 'water') return t('res.waterCharges') + ' — ' + monthShort(item.mIdx);
          if (item.kind === 'penalty') return t('res.latePaymentPenalty');
          if (item.kind === 'parking') return (isAr ? 'رسوم موقف السيارات' : 'Parking fee') + ' — Q1';
          return '';
        };
        const detailFor = (item) => {
          const datePart = monthShort(item.mIdx) + ' ' + item.day;
          if (item.payMethod === 'Auto') return datePart + ' · ' + t('res.autoDeducted');
          const methodLabel = item.payMethod === 'Card' ? t('res.card') : item.payMethod;
          return datePart + ' · ' + methodLabel + (item.refNum ? ' · ' + t('res.ref') + ' #' + item.refNum : '');
        };
        const statusLabelP = (st) => st === 'Paid' ? t('res.paid') : st === 'Penalty' ? t('res.penalty') : st === 'Unpaid' ? t('res.unpaid') : st;
        // Flatten transactions for Export / Print
        const paymentRows = transactions.flatMap(group => group.items.map(item => ({
          item:        titleFor(item),
          date:        monthShort(item.mIdx) + ' ' + item.day + ', ' + group.year,
          isoDate:     new Date(group.year, item.mIdx, item.day).toISOString().slice(0, 10),
          payMethod:   item.payMethod || '',
          refNum:      item.refNum || '',
          amount:      item.amount,
          status:      statusLabelP(item.status),
        })));
        return (
          <div className="res-content" style={{padding:'12px 16px',paddingBottom:80}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
              <div style={{fontSize:20,fontWeight:600,color:'#1a1a1a'}}>{t('res.payment')}</div>
              <button
                onClick={() => setShowPaymentExport(true)}
                style={{padding:'8px 14px',border:'1px solid #d5cfc8',borderRadius:5,background:'#fff',color:'#1a1a1a',fontSize:12,fontWeight:500,cursor:'pointer'}}>
                Export / Print
              </button>
            </div>
            <ExportPrintModal
              isOpen={showPaymentExport}
              onClose={() => setShowPaymentExport(false)}
              title="My Payments"
              sheetName="Payments"
              filenameBase="my_payments"
              rows={paymentRows}
              dateField="isoDate"
              columns={[
                { key: 'item',      header: 'Item',          width: 32 },
                { key: 'date',      header: 'Date',          width: 14 },
                { key: 'amount',    header: 'Amount',        width: 14, halign: 'right' },
                { key: 'payMethod', header: 'Method',        width: 12 },
                { key: 'refNum',    header: 'Reference #',   width: 14 },
                { key: 'status',    header: 'Status',        width: 12 },
              ]}
              extraMetadata={{
                'Resident':  (data.currentUser && data.currentUser.name) || 'Resident',
                'Unit':      'A-304',
              }}
            />

            {/* Total Due Card — derived from data.invoices for this resident */}
            {(() => {
              const myInvoices = (data.invoices || []).filter(i => !i.flat || i.flat === 'A-304'); // best-effort filter
              const unpaid = myInvoices.filter(i => i.status === 'Pending' || i.status === 'Overdue');
              const totalDue = unpaid.reduce((s, i) => s + Number(i.amount || 0), 0);
              const nextDue = unpaid.slice().sort((a,b) => (a.dueDate || '').localeCompare(b.dueDate || ''))[0];
              const amountLabel = 'AED ' + Math.round(totalDue).toLocaleString();
              return (
                <div style={{background:'#fff',border:'1px solid #ebe7e3',borderRadius:10,padding:20,marginBottom:28}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                    <span style={{fontSize:12,color:'#a89a92'}}>{t('res.totalDueMonth')}</span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a89a92" strokeWidth="1.5"><path d="M6 9l6 6 6-6"/></svg>
                  </div>
                  <div style={{fontSize:32,fontWeight:700,color:'#1a1a1a',marginBottom:4}}>{totalDue > 0 ? amountLabel : 'AED 0'}</div>
                  <div style={{fontSize:12,color:'#a89a92',marginBottom:14}}>
                    {nextDue ? (t('res.dueBy') + ' ' + nextDue.dueDate) : (unpaid.length === 0 ? 'All settled ✓' : t('res.dueBy') + ' —')}
                    {unpaid.length > 1 ? ' · ' + unpaid.length + ' open invoices' : ''}
                  </div>
                  <div style={{display:'flex',gap:12}}>
                    <button onClick={() => setPayModal({ amount: amountLabel })} disabled={totalDue === 0} style={{padding:'8px 18px',border:'1px solid #928989',borderRadius:4,background: totalDue === 0 ? '#f0ede9' : '#fff',color: totalDue === 0 ? '#a89a92' : '#1a1a1a',fontSize:12,fontWeight:600,cursor: totalDue === 0 ? 'default' : 'pointer'}}>{t('res.payNow')}</button>
                    {payModal && <PaymentMethodModal amount={payModal.amount} onClose={() => setPayModal(null)} showToast={showToast}/>}
                    <button onClick={() => showToast('Detailed breakdown coming soon')} style={{padding:'8px 18px',border:'none',borderRadius:4,background:'none',color:'#a89a92',fontSize:12,fontWeight:500,cursor:'pointer'}}>{t('res.checkDetails')}</button>
                  </div>
                </div>
              );
            })()}

            {/* Transaction History */}
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
              <span style={{fontSize:16,fontWeight:600,color:'#1a1a1a'}}>{t('res.transactionHistory')}</span>
              <span style={{fontSize:11,color:'#a89a92',cursor:'pointer'}}>{t('res.downloadPDF')}</span>
            </div>

            {transactions.map((group, gi) => (
              <div key={gi} style={{marginBottom:20}}>
                <div style={{fontSize:10,color:'#a89a92',letterSpacing:'0.08em',fontWeight:600,marginBottom:10}}>{monthHeader(group.mIdx, group.year)}</div>
                {group.items.map((tx, ti) => (
                  <div key={ti} style={{display:'flex',alignItems:'center',gap:12,marginBottom:16,paddingBottom:16,borderBottom: ti < group.items.length - 1 ? '1px solid #f0f0f0' : 'none'}}>
                    <div style={{width:40,height:40,borderRadius:8,background:'#e8e3de',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a89a92" strokeWidth="1.5"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:14,fontWeight:500,color:'#1a1a1a'}}>{titleFor(tx)}</div>
                      <div style={{fontSize:11,color:'#a89a92'}}>{detailFor(tx)}</div>
                    </div>
                    <div style={{textAlign:'right',flexShrink:0}}>
                      <div style={{fontSize:13,fontWeight:600,color:'#1a1a1a'}}>– {tx.amount}</div>
                      <span style={{fontSize:10,color: tx.status === 'Penalty' ? '#c62828' : '#888',fontWeight:500,border:'1px solid '+(tx.status === 'Penalty' ? '#ef9a9a' : '#e0e0e0'),padding:'1px 8px',borderRadius:4}}>{statusLabelP(tx.status)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        );

      case 'services':
      case 'book':
        const svcLabel = (name) => {
          switch(name) {
            case 'Plumbing': return t('res.plumbing');
            case 'Electrician': return t('res.electrician');
            case 'Housekeeping': return t('res.housekeeping');
            case 'AC Repair': return t('res.acRepair');
            case 'Pest Control': return t('res.pestControl');
            case 'Locksmith': return t('res.locksmith');
            case 'Painter': return t('res.painter');
            case 'Carpenter': return t('res.carpenter');
            case 'Swimming Pool': return t('res.swimmingPool');
            case 'Table Tennis': return t('res.tableTennis');
            case 'Squash': return t('res.squash');
            case 'Gym': return t('res.gym');
            case 'Sauna': return t('res.sauna');
            case 'BBQ Area': return t('res.bbqArea');
            case 'Kids Area': return t('res.kidsArea');
            case 'Yoga Room': return t('res.yogaRoom');
            default: return name;
          }
        };
        const bookServices = [
          { label: 'Plumbing', icon: (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7a6f66" strokeWidth="1.5"><path d="M4 22V12M4 12H8M4 12V8H2V6h4V4h2v2h4V4h2v2h2v2h-2v4h4v2h-4v8h-2v-8H8v8H6"/></svg>) },
          { label: 'Electrician', icon: (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7a6f66" strokeWidth="1.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>) },
          { label: 'Housekeeping', icon: (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7a6f66" strokeWidth="1.5"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6"/></svg>) },
          { label: 'AC Repair', icon: (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7a6f66" strokeWidth="1.5"><rect x="2" y="4" width="20" height="12" rx="2"/><path d="M8 20h8M12 16v4M7 10h2M11 10h2M15 10h2"/></svg>) },
          { label: 'Pest Control', icon: (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7a6f66" strokeWidth="1.5"><circle cx="12" cy="10" r="5"/><path d="M7 5l-2-3M17 5l2-3M5 10H2M22 10h-3M7 15l-3 4M17 15l3 4"/></svg>) },
          { label: 'Locksmith', icon: (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7a6f66" strokeWidth="1.5"><rect x="3" y="11" width="18" height="11" rx="2"/><circle cx="12" cy="16" r="1"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>) },
          { label: 'Painter', icon: (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7a6f66" strokeWidth="1.5"><path d="M19 3H5a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2zM12 11v6M10 21h4"/></svg>) },
          { label: 'Carpenter', icon: (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7a6f66" strokeWidth="1.5"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>) },
        ];
        const bookAmenities = [
          { label: 'Swimming Pool', icon: (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7a6f66" strokeWidth="1.5"><path d="M2 20c2-2 4-2 6 0s4 2 6 0 4-2 6 0M2 16c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M8 14V8a2 2 0 114 0v1"/></svg>) },
          { label: 'Table Tennis', icon: (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7a6f66" strokeWidth="1.5"><circle cx="10" cy="10" r="7"/><path d="M15 15l6 6M14 10a4 4 0 01-4 4"/></svg>) },
          { label: 'Squash', icon: (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7a6f66" strokeWidth="1.5"><circle cx="12" cy="10" r="6"/><path d="M10 16l-2 6M14 16l2 6"/></svg>) },
          { label: 'Gym', icon: (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7a6f66" strokeWidth="1.5"><path d="M6.5 6.5h11M6 12h12M17.5 6.5v11M6.5 6.5v11M4 8v8M20 8v8M2 10v4M22 10v4"/></svg>) },
          { label: 'Sauna', icon: (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7a6f66" strokeWidth="1.5"><path d="M7 12c0-3 2-5 5-5s5 2 5 5v9H7v-9z"/><path d="M9 3c0 2 1 3 3 3s3-1 3-3"/><path d="M10 21v-4h4v4"/></svg>) },
          { label: 'BBQ Area', icon: (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7a6f66" strokeWidth="1.5"><circle cx="12" cy="12" r="8"/><path d="M8 10c1-1 2 0 3 0s2-1 3 0M8 14c1-1 2 0 3 0s2-1 3 0"/><path d="M9 20l-1 2M15 20l1 2"/></svg>) },
          { label: 'Kids Area', icon: (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7a6f66" strokeWidth="1.5"><circle cx="12" cy="5" r="3"/><path d="M6.5 8h11L19 10l-3 1v4l2 6h-2l-2-5h-4l-2 5H6l2-6v-4L5 10l1.5-2z"/></svg>) },
          { label: 'Yoga Room', icon: (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7a6f66" strokeWidth="1.5"><circle cx="12" cy="4" r="2"/><path d="M12 6v4M8 22l4-8 4 8M4 14l8 2 8-2"/></svg>) },
        ];
        const upcomingRequests = [
          { id: 1, title: 'Plumber visit', detail: 'Today, 3:00 PM', status: 'In Progress' },
          { id: 2, title: 'Leaky tap complaint', detail: 'Raised 2 days ago', status: 'In Progress' },
        ];
        const serviceHistory = [
          { id: 1, title: 'Electrician', detail: 'Mar 28 · AED 499', status: 'Done' },
          { id: 2, title: 'Noise complaint', detail: 'Mar 22 · Ticket #1042', status: 'Closed' },
          { id: 3, title: 'Maintenance payment', detail: 'Mar 15 · AED 250', status: 'Paid' },
        ];
        return (
          <div className="res-content" style={{padding:'12px 16px',paddingBottom:80}}>
            <div style={{fontSize:20,fontWeight:600,color:'#1a1a1a',marginBottom:20}}>{t('res.bookAmenitiesServices')}</div>

            {/* Book Amenities */}
            <div style={{marginBottom:24}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
                <span style={{fontSize:14,fontWeight:600,color:'#1a1a1a'}}>{t('res.bookAmenities')}</span>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12}}>
                {bookAmenities.map((svc, i) => (
                  <div key={i} onClick={() => {setBookingMode('amenity'); setServiceBooking({type:svc.label, location:'', date:'', time:'', duration:'1 hour', guests:1, comments:''}); setShowServiceBookingModal(true);}} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:8,cursor:'pointer',padding:'4px 0'}}>
                    <div style={{width:48,height:48,borderRadius:'50%',background:'rgba(255,255,255,0.55)',display:'flex',alignItems:'center',justifyContent:'center',border:'1px solid rgba(255,255,255,0.5)',boxShadow:'0 2px 8px rgba(120,100,90,0.05)'}}>
                      {svc.icon}
                    </div>
                    <span style={{fontSize:10,color:'#7a6f66',textAlign:'center',lineHeight:'1.3'}}>{svcLabel(svc.label)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Amenity Bookings — upcoming + past */}
            {(() => {
              const todayISO = new Date().toISOString().split('T')[0];
              const allBookings = (data.amenityBookings || []).slice().sort((a, b) => {
                const da = a.date + ' ' + a.time, db = b.date + ' ' + b.time;
                return da > db ? -1 : da < db ? 1 : 0;
              });
              const upcoming = allBookings.filter(b => b.date >= todayISO);
              const past = allBookings.filter(b => b.date < todayISO);
              const sorted = [...upcoming.reverse(), ...past];
              if (sorted.length === 0) return null;
              const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
              return (
                <div style={{marginBottom:24}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
                    <span style={{fontSize:14,fontWeight:600,color:'#1a1a1a'}}>{t('res.amenityBookings')}</span>
                  </div>
                  {sorted.map(b => {
                    const isPast = b.date < todayISO;
                    const dp = b.date.split('-');
                    const dateLabel = b.date === todayISO ? t('common.today') : (parseInt(dp[2]) + ' ' + months[parseInt(dp[1])-1]);
                    return (
                      <div key={b.id} onClick={() => !isPast && setShowAmenityDetail(b)} style={{display:'flex',alignItems:'center',gap:12,marginBottom:10,paddingBottom:10,borderBottom:'1px solid #f2efec',opacity: isPast ? 0.5 : 1,cursor: isPast ? 'default' : 'pointer'}}>
                        <div style={{width:40,height:40,borderRadius:'50%',background:'#e8e3de',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a89a92" strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                        </div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:600,color:'#1a1a1a'}}>{svcLabel(b.type)}</div>
                          <div style={{fontSize:11,color:'#a89a92'}}>{dateLabel} · {b.time} · {b.duration}</div>
                          <div style={{fontSize:10,color:'#7a6f66',marginTop:2}}>{b.guests} {b.guests === 1 ? t('res.person') : t('res.people')}</div>
                        </div>
                        {isPast ? (
                          <span style={{fontSize:10,fontWeight:500,color:'#a89a92'}}>{t('res.completed')}</span>
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c4b8b0" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* Book Services */}
            <div style={{marginBottom:24}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
                <span style={{fontSize:14,fontWeight:600,color:'#1a1a1a'}}>{t('res.bookServices')}</span>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12}}>
                {bookServices.map((svc, i) => (
                  <div key={i} onClick={() => {setBookingMode('service'); setServiceBooking({type:svc.label, location:'', date:'', time:'', duration:'1 hour', guests:1, comments:''}); setShowServiceBookingModal(true);}} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:8,cursor:'pointer',padding:'4px 0'}}>
                    <div style={{width:48,height:48,borderRadius:'50%',background:'rgba(255,255,255,0.55)',display:'flex',alignItems:'center',justifyContent:'center',border:'1px solid rgba(255,255,255,0.5)',boxShadow:'0 2px 8px rgba(120,100,90,0.05)'}}>
                      {svc.icon}
                    </div>
                    <span style={{fontSize:10,color:'#7a6f66',textAlign:'center',lineHeight:'1.3'}}>{svcLabel(svc.label)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Service Bookings — upcoming + past (dynamic from serviceRequests) */}
            {(() => {
              const svcTodayISO = new Date().toISOString().split('T')[0];
              const svcMonths = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
              const svcMonthsMap = {Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12'};
              const parseSvcDate = (d) => {
                if (!d) return '9999-99-99';
                if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
                const sp = d.split('/');
                if (sp.length === 3) return sp[2]+'-'+sp[1].padStart(2,'0')+'-'+sp[0].padStart(2,'0');
                const mm = d.match(/^(\d{1,2})\s+([A-Za-z]{3})(?:\s+(\d{4}))?$/);
                if (mm) return (mm[3]||'2026')+'-'+(svcMonthsMap[mm[2]]||'01')+'-'+mm[1].padStart(2,'0');
                return '9999-99-99';
              };
              const allSvc = (data.serviceRequests || []).slice();
              const activeStatuses = ['Scheduled','Pending Approval','In Progress'];
              const pastStatuses = ['Completed','Done','Closed','Paid','Cancelled'];
              const upcoming = allSvc
                .filter(s => activeStatuses.includes(s.status) && parseSvcDate(s.date) >= svcTodayISO)
                .sort((a,b) => (parseSvcDate(a.date)+' '+(a.time||'')).localeCompare(parseSvcDate(b.date)+' '+(b.time||'')));
              const past = allSvc
                .filter(s => pastStatuses.includes(s.status) || parseSvcDate(s.date) < svcTodayISO)
                .sort((a,b) => (parseSvcDate(b.date)+' '+(b.time||'')).localeCompare(parseSvcDate(a.date)+' '+(a.time||'')));
              const svcStatusColor = (st) => {
                if (st === 'Pending Approval') return '#b08a4a';
                if (st === 'Scheduled') return '#5a6b4f';
                if (st === 'In Progress') return '#4a6fa5';
                if (st === 'Completed' || st === 'Done') return '#2d6a4f';
                if (st === 'Paid') return '#1565c0';
                if (st === 'Closed' || st === 'Cancelled') return '#888';
                return '#5a6b4f';
              };
              const formatSvcDate = (d) => {
                const iso = parseSvcDate(d);
                if (iso === svcTodayISO) return t('common.today');
                const dp = iso.split('-');
                if (dp.length === 3) return parseInt(dp[2]) + ' ' + svcMonths[parseInt(dp[1])-1];
                return d;
              };
              const svcStatusLabel = (st) => {
                if (st === 'Pending Approval') return t('res.pendingApproval');
                if (st === 'Scheduled') return t('res.scheduled');
                if (st === 'In Progress') return t('res.inProgress');
                if (st === 'Completed' || st === 'Done') return t('res.completed');
                if (st === 'Paid') return t('res.paid');
                if (st === 'Closed') return t('res.closed');
                if (st === 'Cancelled') return t('res.cancelled');
                if (st === 'Open') return t('res.open');
                return st;
              };
              return (
                <>
                  {upcoming.length > 0 && (
                    <div style={{marginBottom:24}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
                        <span style={{fontSize:14,fontWeight:600,color:'#1a1a1a'}}>{t('res.upcomingRequests')}</span>
                        <span onClick={() => setCurrentPage('services')} style={{fontSize:11,color:'#a89a92',cursor:'pointer'}}>{t('res.seeAllSmall')}</span>
                      </div>
                      {upcoming.map(s => (
                        <div key={s.id} style={{display:'flex',alignItems:'center',gap:12,marginBottom:10,paddingBottom:10,borderBottom:'1px solid #f2efec'}}>
                          <div style={{width:40,height:40,borderRadius:'50%',background:'#e8e3de',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a89a92" strokeWidth="1.5"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>
                          </div>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:13,fontWeight:600,color:'#1a1a1a'}}>{svcLabel(s.type)}</div>
                            <div style={{fontSize:11,color:'#a89a92'}}>{formatSvcDate(s.date)} · {s.time || '—'}</div>
                            {s.location && <div style={{fontSize:10,color:'#7a6f66',marginTop:1}}>{s.location}</div>}
                          </div>
                          <span style={{fontSize:10,fontWeight:500,color:svcStatusColor(s.status)}}>{svcStatusLabel(s.status)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {past.length > 0 && (
                    <div style={{marginBottom:24}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
                        <span style={{fontSize:14,fontWeight:600,color:'#1a1a1a'}}>{t('res.transactionHistory')}</span>
                        <span onClick={() => setCurrentPage('services')} style={{fontSize:11,color:'#a89a92',cursor:'pointer'}}>{t('res.seeAllSmall')}</span>
                      </div>
                      {past.map(s => (
                        <div key={s.id} style={{display:'flex',alignItems:'center',gap:12,marginBottom:10,paddingBottom:10,borderBottom:'1px solid #f2efec',opacity:0.5}}>
                          <div style={{width:40,height:40,borderRadius:'50%',background:'#e8e3de',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a89a92" strokeWidth="1.5"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>
                          </div>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:13,fontWeight:600,color:'#1a1a1a'}}>{svcLabel(s.type)}</div>
                            <div style={{fontSize:11,color:'#a89a92'}}>{formatSvcDate(s.date)} · {s.time || '—'}</div>
                            {s.location && <div style={{fontSize:10,color:'#7a6f66',marginTop:1}}>{s.location}</div>}
                          </div>
                          <span style={{fontSize:10,fontWeight:500,color:svcStatusColor(s.status)}}>{svcStatusLabel(s.status)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        );

      case 'viewall':
        const allVisitors = data.visitors || [];
        const visFilterTypes = ['All', 'Resident Guest', 'Contractor / Worker', 'Delivery / Courier', 'Domestic Staff', 'Service Vendor', 'Other / Misc.'];
        const visDateFilterOptions = ['All', 'Today', 'Next Week', 'Next Month', 'Past Week', 'Past Month'];

        // Status badge — Door.com inspired palette
        // Logic: future = always Pre-Approved, past = Checked Out / Rejected / No Show only
        const vStatusBadge = (status, visitorDate) => {
          const vDate = visitorDate ? parseVisDate(visitorDate) : null;
          const isPast = vDate && vDate < todayStr;
          const isFuture = vDate && vDate > todayStr;

          // Future visitors: always Pre-Approved
          if (isFuture) {
            return <span style={{background:'#ccc8c1',color:'#4a4540',padding:'3px 10px',borderRadius:20,fontSize:10,fontWeight:600}}>{t('res.preApproved')}</span>;
          }

          // Past visitors: remap statuses logically
          if (isPast) {
            if (status === 'Pre-Approved' || status === 'Scheduled' || status === 'Pending') {
              return <span style={{background:'#e8e3de',color:'#8a7f76',padding:'3px 10px',borderRadius:20,fontSize:10,fontWeight:600}}>{t('res.noShow')}</span>;
            }
            if (status === 'Inside' || status === 'Passed Security') {
              return <span style={{background:'#d5d0ca',color:'#6b6560',padding:'3px 10px',borderRadius:20,fontSize:10,fontWeight:600}}>{t('res.checkedOut')}</span>;
            }
            if (status === 'Rejected' || status === 'Denied Entry') {
              return <span style={{background:'#d4b8b4',color:'#7a3b33',padding:'3px 10px',borderRadius:20,fontSize:10,fontWeight:600}}>{t('res.rejected')}</span>;
            }
            if (status === 'On Hold') {
              return <span style={{background:'#d4b8b4',color:'#7a3b33',padding:'3px 10px',borderRadius:20,fontSize:10,fontWeight:600}}>{t('res.rejected')}</span>;
            }
            // Checked Out / Exited
            return <span style={{background:'#d5d0ca',color:'#6b6560',padding:'3px 10px',borderRadius:20,fontSize:10,fontWeight:600}}>{t('res.checkedOut')}</span>;
          }

          // Today: show actual status
          const map = {
            'Inside': { bg: '#c5cebf', color: '#3a4a30', label: t('res.inside') },
            'Passed Security': { bg: '#c5cebf', color: '#3a4a30', label: t('res.inside') },
            'Pre-Approved': { bg: '#ccc8c1', color: '#4a4540', label: t('res.preApproved') },
            'Scheduled': { bg: '#ccc8c1', color: '#4a4540', label: t('res.preApproved') },
            'Checked Out': { bg: '#d5d0ca', color: '#6b6560', label: t('res.checkedOut') },
            'Exited': { bg: '#d5d0ca', color: '#6b6560', label: t('res.checkedOut') },
            'Rejected': { bg: '#d4b8b4', color: '#7a3b33', label: t('res.rejected') },
            'Denied Entry': { bg: '#d4b8b4', color: '#7a3b33', label: t('res.rejected') },
            'On Hold': { bg: '#d6ccb8', color: '#6b5a3a', label: t('res.onHold') },
            'Pending': { bg: '#c8cdd4', color: '#3a4a5a', label: t('res.pendingStatus') }
          };
          const s = map[status] || { bg: '#d5d0ca', color: '#6b6560', label: status };
          return <span style={{background:s.bg,color:s.color,padding:'3px 10px',borderRadius:20,fontSize:10,fontWeight:600}}>{s.label}</span>;
        };

        // Parse any date format to YYYY-MM-DD
        const monthsMap = {Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12'};
        const parseVisDate = (dateStr) => {
          if (!dateStr) return null;
          if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
          const slashParts = dateStr.split('/');
          if (slashParts.length === 3) return slashParts[2]+'-'+slashParts[1].padStart(2,'0')+'-'+slashParts[0].padStart(2,'0');
          const monMatch = dateStr.match(/^(\d{1,2})\s+([A-Za-z]{3})(?:\s+(\d{4}))?$/);
          if (monMatch) return (monMatch[3] || '2026')+'-'+(monthsMap[monMatch[2]]||'01')+'-'+monMatch[1].padStart(2,'0');
          return dateStr;
        };
        const today = new Date();
        const todayStr = today.toISOString().slice(0,10);
        const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r.toISOString().slice(0,10); };

        // Apply type filter
        let filteredVisitors = resVisFilter === 'All' ? allVisitors : allVisitors.filter(v => v.type === resVisFilter);

        // Apply date range filter
        if (resVisDateFilter !== 'All') {
          filteredVisitors = filteredVisitors.filter(v => {
            const vd = parseVisDate(v.date);
            if (!vd) return false;
            if (resVisDateFilter === 'Today') return vd === todayStr;
            if (resVisDateFilter === 'Next Week') return vd >= todayStr && vd <= addDays(today, 7);
            if (resVisDateFilter === 'Next Month') return vd >= todayStr && vd <= addDays(today, 30);
            if (resVisDateFilter === 'Past Week') return vd < todayStr && vd >= addDays(today, -7);
            if (resVisDateFilter === 'Past Month') return vd < todayStr && vd >= addDays(today, -30);
            return true;
          });
        }

        // Group by date
        const grouped = {};
        filteredVisitors.forEach(v => {
          const key = parseVisDate(v.date) || 'Unknown';
          if (!grouped[key]) grouped[key] = [];
          grouped[key].push(v);
        });
        // Sort visitors within each date group by time (earliest first)
        Object.keys(grouped).forEach(key => {
          grouped[key].sort((a, b) => parseTime24(a.time).localeCompare(parseTime24(b.time)));
        });

        // Sort: Today first, then future dates ascending, then past dates descending
        const sortedDateKeys = Object.keys(grouped).sort((a, b) => {
          const aIsToday = a === todayStr;
          const bIsToday = b === todayStr;
          const aIsFuture = a > todayStr;
          const bIsFuture = b > todayStr;
          if (aIsToday && !bIsToday) return -1;
          if (!aIsToday && bIsToday) return 1;
          if (aIsFuture && bIsFuture) return a.localeCompare(b); // future ascending
          if (aIsFuture && !bIsFuture) return -1; // future before past
          if (!aIsFuture && bIsFuture) return 1;
          return b.localeCompare(a); // past descending (most recent first)
        });

        // Find where past starts for separator
        const firstPastIdx = sortedDateKeys.findIndex(k => k < todayStr);

        const isArV = t('res.in') !== 'In';
        const monthsArV = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
        const translatePurpose = (p) => {
          if (!p) return t('res.visit');
          if (p === 'Personal visit') return t('res.personalVisit');
          if (p === 'Delivery') return t('res.delivery');
          if (p === 'Maintenance') return t('res.maintenance');
          if (p === 'Moving Out Service') return t('res.movingOut');
          return p;
        };
        const translateTime = (tm) => {
          if (!tm || !isArV) return tm || '—';
          return tm.replace(/\bAM\b/i, 'ص').replace(/\bPM\b/i, 'م');
        };
        const formatDateLabel = (key) => {
          if (key === todayStr) return t('res.today');
          const yd = addDays(today, -1);
          if (key === yd) return t('res.yesterday');
          const tmr = addDays(today, 1);
          if (key === tmr) return t('res.tomorrow');
          // Format as "DD Mon" (e.g. "05 Apr", "10 Mar")
          const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
          const parts = key.split('-');
          if (parts.length === 3) {
            const d = parseInt(parts[2], 10);
            const m = parseInt(parts[1], 10) - 1;
            const monName = isArV ? monthsArV[m] : months[m];
            return (d < 10 ? '0' + d : d) + ' ' + monName;
          }
          return key;
        };

        return (
          <div className="res-content" style={{padding:'12px 16px',paddingBottom:80}}>
            {/* Header */}
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
              <div style={{fontSize:18,fontWeight:600,color:'#1a1a1a'}}>{t('res.visitorsTitle')}</div>
              <div style={{position:'relative'}}>
                <button onClick={() => setResVisFilterOpen(!resVisFilterOpen)} style={{background:'none',border:'1px solid #d5cfc8',borderRadius:6,padding:'6px 14px',fontSize:12,color:'#7a6f66',cursor:'pointer',display:'flex',alignItems:'center',gap:6}}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7a6f66" strokeWidth="1.5"><line x1="4" y1="6" x2="20" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="10" y1="18" x2="14" y2="18"/></svg>
                  {t('res.filter')}
                </button>
                {resVisFilterOpen && (() => {
                  const typeLabel = (vt) => vt === 'All' ? t('res.all') : vt === 'Resident Guest' ? t('res.residentGuest') : vt === 'Contractor / Worker' ? t('res.contractorWorker') : vt === 'Delivery / Courier' ? t('res.deliveryCourier') : vt === 'Domestic Staff' ? t('res.domesticStaff') : vt === 'Service Vendor' ? t('res.serviceVendor') : vt === 'Other / Misc.' ? t('res.otherMisc') : vt;
                  const dateLabelF = (dt) => dt === 'All' ? t('res.all') : dt === 'Today' ? t('res.today') : dt === 'Next Week' ? t('res.nextWeek') : dt === 'Next Month' ? t('res.nextMonth') : dt === 'Past Week' ? t('res.pastWeek') : dt === 'Past Month' ? t('res.pastMonth') : dt;
                  return (
                  <div style={{position:'absolute',top:36,right:0,background:'#fff',border:'1px solid #ebe7e3',borderRadius:8,boxShadow:'0 4px 16px rgba(0,0,0,0.1)',zIndex:100,minWidth:200,overflow:'hidden'}}>
                    <div style={{padding:'10px 14px',fontSize:11,color:'#a89a92',borderBottom:'1px solid #ebe7e3',fontWeight:600}}>{t('res.visitorType')}</div>
                    {visFilterTypes.map(vt => (
                      <div key={vt} onClick={() => { setResVisFilter(vt); if (resVisDateFilter !== 'All') setResVisFilterOpen(true); else setResVisFilterOpen(false); }}
                        style={{padding:'9px 14px',fontSize:13,color: resVisFilter === vt ? '#1a1a1a' : '#555',fontWeight: resVisFilter === vt ? 600 : 400,cursor:'pointer',background: resVisFilter === vt ? '#f5f5f5' : '#fff'}}>
                        {typeLabel(vt)}
                      </div>
                    ))}
                    <div style={{padding:'10px 14px',fontSize:11,color:'#a89a92',borderBottom:'1px solid #ebe7e3',borderTop:'1px solid #f0f0f0',fontWeight:600}}>{t('res.dateRange')}</div>
                    {visDateFilterOptions.map(dt => (
                      <div key={dt} onClick={() => { setResVisDateFilter(dt); setResVisFilterOpen(false); }}
                        style={{padding:'9px 14px',fontSize:13,color: resVisDateFilter === dt ? '#1a1a1a' : '#555',fontWeight: resVisDateFilter === dt ? 600 : 400,cursor:'pointer',background: resVisDateFilter === dt ? '#f5f5f5' : '#fff'}}>
                        {dateLabelF(dt)}
                      </div>
                    ))}
                  </div>
                  );
                })()}
              </div>
            </div>

            {/* Active filter chips */}
            {(resVisFilter !== 'All' || resVisDateFilter !== 'All') && (
              <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap'}}>
                {resVisFilter !== 'All' && (
                  <span style={{background:'#e8e3de',borderRadius:20,padding:'4px 12px',fontSize:12,color:'#1a1a1a',display:'flex',alignItems:'center',gap:6}}>
                    {resVisFilter === 'Resident Guest' ? t('res.residentGuest') : resVisFilter === 'Contractor / Worker' ? t('res.contractorWorker') : resVisFilter === 'Delivery / Courier' ? t('res.deliveryCourier') : resVisFilter === 'Domestic Staff' ? t('res.domesticStaff') : resVisFilter === 'Service Vendor' ? t('res.serviceVendor') : resVisFilter === 'Other / Misc.' ? t('res.otherMisc') : resVisFilter}
                    <span onClick={() => setResVisFilter('All')} style={{cursor:'pointer',color:'#a89a92',fontWeight:700,fontSize:14}}>×</span>
                  </span>
                )}
                {resVisDateFilter !== 'All' && (
                  <span style={{background:'#e8e3de',borderRadius:20,padding:'4px 12px',fontSize:12,color:'#1a1a1a',display:'flex',alignItems:'center',gap:6}}>
                    {resVisDateFilter === 'Today' ? t('res.today') : resVisDateFilter === 'Next Week' ? t('res.nextWeek') : resVisDateFilter === 'Next Month' ? t('res.nextMonth') : resVisDateFilter === 'Past Week' ? t('res.pastWeek') : resVisDateFilter === 'Past Month' ? t('res.pastMonth') : resVisDateFilter}
                    <span onClick={() => setResVisDateFilter('All')} style={{cursor:'pointer',color:'#a89a92',fontWeight:700,fontSize:14}}>×</span>
                  </span>
                )}
              </div>
            )}

            {/* Date-grouped visitor cards */}
            {sortedDateKeys.map((dateKey, idx) => (
              <React.Fragment key={dateKey}>
                {/* Separator before historical section */}
                {idx === firstPastIdx && firstPastIdx > 0 && (
                  <div style={{display:'flex',alignItems:'center',gap:10,margin:'16px 0 12px'}}>
                    <div style={{flex:1,height:1,background:'#e8e3de'}}></div>
                    <span style={{fontSize:11,color:'#a89a92',fontWeight:500,whiteSpace:'nowrap'}}>{t('res.pastVisitors')}</span>
                    <div style={{flex:1,height:1,background:'#e8e3de'}}></div>
                  </div>
                )}
                <div style={{marginBottom:16}}>
                  <div style={{fontSize:13,fontWeight:600,color: dateKey >= todayStr ? '#1a1a1a' : '#888',marginBottom:10}}>{formatDateLabel(dateKey)}</div>
                  {grouped[dateKey].map(v => (
                    <div key={'vc-'+v.id} onClick={() => { setSelectedVisitor(v); setCurrentPage('viewVisitor'); }}
                      style={{background: dateKey >= todayStr ? '#f5f5f5' : '#fafafa',borderRadius:10,padding:14,marginBottom:8,cursor:'pointer',opacity: dateKey < todayStr ? 0.8 : 1}}>
                      <div style={{display:'flex',gap:12,alignItems:'flex-start'}}>
                        <div style={{width:40,height:40,borderRadius:'50%',background:'#e8e8e8',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a89a92" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/></svg>
                        </div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:4}}>
                            <div style={{fontSize:14,fontWeight:600,color:'#1a1a1a'}}>{v.name}</div>
                            {vStatusBadge(v.status, v.date)}
                          </div>
                          <div style={{fontSize:12,color:'#8a7f76',marginBottom:3}}>{v.type === 'Resident Guest' ? t('res.residentGuest') : v.type === 'Contractor / Worker' ? t('res.contractorWorker') : v.type === 'Delivery / Courier' ? t('res.deliveryCourier') : v.type === 'Domestic Staff' ? t('res.domesticStaff') : v.type === 'Service Vendor' ? t('res.serviceVendor') : v.type === 'Other / Misc.' ? t('res.otherMisc') : (v.type || t('res.guest'))} — {translatePurpose(v.purpose)}</div>
                          <div style={{fontSize:11,color:'#a89a92',marginBottom:3}}>{(() => {
                            const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                            const fmtD = (d) => { if (!d) return ''; const monArr = isArV ? monthsArV : months; if (/^\d{4}-\d{2}-\d{2}$/.test(d)) { const p = d.split('-'); return parseInt(p[2],10) + ' ' + monArr[parseInt(p[1],10)-1] + ' ' + p[0]; } if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(d)) { const p = d.split('/'); return parseInt(p[0],10) + ' ' + monArr[parseInt(p[1],10)-1] + ' ' + p[2]; } return d; };
                            const dateIn = fmtD(v.dateIn || v.date || '');
                            const dateOut = fmtD(v.dateOut || '');
                            const timeStr = translateTime(v.time);
                            let line = dateIn ? t('res.in') + ': ' + dateIn + ' ' + t('res.atTime') + ' ' + timeStr : timeStr;
                            if (dateOut) line += '  ·  ' + t('res.outLabel') + ': ' + dateOut;
                            return line;
                          })()}</div>
                          <div style={{fontSize:11,color:'#a89a92'}}>
                            {(() => {
                              const vd = parseVisDate(v.date);
                              const isPastV = vd && vd < todayStr;
                              const isFutureV = vd && vd > todayStr;
                              if (isFutureV) return t('res.preApprovedBy') + ': ' + (v.resident || t('res.resident'));
                              if (isPastV && (v.status === 'Pre-Approved' || v.status === 'Scheduled' || v.status === 'Pending')) return t('res.didNotArrive');
                              if (isPastV && (v.status === 'Inside' || v.status === 'Passed Security')) return t('res.visitedCheckedOut');
                              if (isPastV && (v.status === 'Rejected' || v.status === 'Denied Entry')) return t('res.rejectedBySecurity');
                              if (isPastV && v.status === 'On Hold') return t('res.rejectedBySecurity');
                              if (isPastV) return t('res.checkedOutShort');
                              if (v.status === 'Pre-Approved' || v.status === 'Scheduled') return t('res.preApprovedBy') + ': ' + (v.resident || t('res.resident'));
                              if (v.status === 'Inside' || v.status === 'Passed Security') return t('res.currentlyInside');
                              if (v.status === 'Rejected' || v.status === 'Denied Entry') return t('res.rejectedBySecurity');
                              if (v.status === 'Checked Out' || v.status === 'Exited') return t('res.checkedOutShort');
                              return t('res.preApprovedBy') + ': ' + (v.resident || t('res.resident'));
                            })()}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </React.Fragment>
            ))}

            {filteredVisitors.length === 0 && (
              <div style={{textAlign:'center',color:'#a89a92',padding:40,fontSize:13}}>{t('res.noVisitorsFound')}</div>
            )}
          </div>
        );

      case 'home':
        const pendingVisitors_home = data.visitors.filter(v => v.status === 'Pending' || v.status === 'Waiting');
        const waitingApprovals = (data.pendingApprovals || []).filter(p => !p.resolved);
        const homeTodayStr = new Date().toISOString().split('T')[0];
        const scheduledVisitors = data.visitors
          .filter(v => (v.status === 'Scheduled' || v.status === 'Pre-Approved') && parseDateISO(v.date) >= homeTodayStr)
          .sort((a, b) => {
            const da = parseDateISO(a.date), db = parseDateISO(b.date);
            if (da !== db) return da.localeCompare(db);
            return parseTime24(a.time).localeCompare(parseTime24(b.time));
          });
        // Upcoming Services — open service requests from the legacy ledger
        const upcomingServices = (data.serviceRequests || [])
          .filter(s => s.status === 'New' || s.status === 'Acknowledged' || s.status === 'In Progress' || s.status === 'Scheduled')
          .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
          .slice(0, 5);
        const recentAnnouncements = data.announcements ? data.announcements.filter(a => a.status === 'Live' || a.status === 'Sent').slice(0,2) : [];
        const bookingServices = [
          { label: 'Plumbing', icon: (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7a6f66" strokeWidth="1.5"><path d="M4 22V12M4 12H8M4 12V8H2V6h4V4h2v2h4V4h2v2h2v2h-2v4h4v2h-4v8h-2v-8H8v8H6"/></svg>) },
          { label: 'Electrician', icon: (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7a6f66" strokeWidth="1.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>) },
          { label: 'Housekeeping', icon: (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7a6f66" strokeWidth="1.5"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6"/></svg>) },
          { label: 'Personal Trainer', icon: (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7a6f66" strokeWidth="1.5"><circle cx="12" cy="5" r="3"/><path d="M6.5 8h11L19 10l-3 1v4l2 6h-2l-2-5h-4l-2 5H6l2-6v-4L5 10l1.5-2z"/></svg>) },
          { label: 'Swimming Pool', icon: (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7a6f66" strokeWidth="1.5"><path d="M2 20c2-2 4-2 6 0s4 2 6 0 4-2 6 0M2 16c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M8 14V8a2 2 0 114 0v1"/></svg>) },
          { label: 'Table Tennis', icon: (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7a6f66" strokeWidth="1.5"><circle cx="10" cy="10" r="7"/><path d="M15 15l6 6M14 10a4 4 0 01-4 4"/></svg>) },
          { label: 'Squash', icon: (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7a6f66" strokeWidth="1.5"><circle cx="12" cy="10" r="6"/><path d="M10 16l-2 6M14 16l2 6"/></svg>) }
        ];
        return (
          <div className="res-content" style={{padding:'12px 16px',paddingBottom:20}}>
            {/* Pending approvals — only rendered when there's something to act on.
                Standalone 'New Visitor' header removed per user request; pending
                approvals now appear inline above the Upcoming Visitors list. */}
            {waitingApprovals.length > 0 && (
            <div style={{background:'rgba(255,255,255,0.55)',backdropFilter:'blur(12px)',WebkitBackdropFilter:'blur(12px)',borderRadius:18,padding:16,marginBottom:14,border:'1px solid rgba(255,255,255,0.5)',boxShadow:'0 2px 12px rgba(120,100,90,0.06)'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                <span style={{fontSize:13,fontWeight:600,color:'#1a1a1a'}}>Action needed</span>
                <span style={{fontSize:11,color:'#a89a92'}}>{waitingApprovals.length} {t('res.pending')}</span>
              </div>
              {waitingApprovals.slice(0,2).map(v => (
                <div key={v.id} style={{marginBottom: 14}}>
                  <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:10}}>
                    <div style={{width:44,height:44,borderRadius:'50%',background:'#f2efec',display:'flex',alignItems:'center',justifyContent:'center'}}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a89a92" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/></svg>
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:14,fontWeight:600,color:'#1a1a1a'}}>{v.name}</div>
                      <div style={{fontSize:11,color:'#a89a92'}}>{(v.type === 'Resident Guest' ? t('res.residentGuest') : v.type === 'Contractor / Worker' ? t('res.contractorWorker') : v.type === 'Delivery / Courier' ? t('res.deliveryCourier') : v.type === 'Domestic Staff' ? t('res.domesticStaff') : v.type === 'Service Vendor' ? t('res.serviceVendor') : v.type === 'Other / Misc.' ? t('res.otherMisc') : (v.type || t('res.guest')))} — {v.purpose === 'Personal visit' ? t('res.personalVisit') : v.purpose === 'Delivery' ? t('res.delivery') : v.purpose === 'Maintenance' ? t('res.maintenance') : v.purpose === 'Moving Out Service' ? t('res.movingOut') : (v.purpose || t('res.personalVisit'))}</div>
                      <div style={{fontSize:11,color:'#a89a92'}}>
                        {v.date && v.time ? v.date + ' · ' + ((t('res.in') !== 'In' && v.time) ? v.time.replace(/\bAM\b/i,'ص').replace(/\bPM\b/i,'م') : v.time) : ''}{v.date || v.time ? ' · ' : ''}{v.source === 'security' ? t('res.fromSecurityGate') : (t('res.gate')+': '+t('res.mainGate'))} — {v.flat || 'B-102'}
                      </div>
                      {v.repeater && v.repeater !== 'Single Visit' && (
                        <div style={{fontSize:10,color:'#a89a92',marginTop:2}}>{v.repeater}</div>
                      )}
                    </div>
                    <span style={{fontSize:10,color:'#7a6f66',background:'rgba(26,26,26,0.06)',padding:'3px 10px',borderRadius:4,fontWeight:600}}>
                      {v.source === 'security' ? t('res.securityRequest') : t('res.waiting')}
                    </span>
                  </div>
                  <div style={{display:'flex',gap:8}}>
                    <button onClick={() => handleApproveVisitor(v)} style={{flex:1,padding:'10px 0',borderRadius:6,border:'none',background:'#928989',color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg> {t('res.approve')}
                    </button>
                    <button onClick={() => handleRejectVisitor(v)} style={{flex:1,padding:'10px 0',borderRadius:6,border:'1px solid #d5cfc8',background:'#fff',color:'#8b4a42',fontSize:12,fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c62828" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg> {t('res.reject')}
                    </button>
                    <button onClick={() => setShowCallSecurity(!showCallSecurity)} style={{padding:'10px 14px',borderRadius:6,border:'1px solid #d5cfc8',background:'#fff',color:'#7a6f66',fontSize:11,fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',gap:4}}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7a6f66" strokeWidth="1.5"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.11 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
                      {t('res.call')}
                    </button>
                  </div>
                  {showCallSecurity && (
                    <div style={{marginTop:8,background:'#f2efec',borderRadius:6,padding:12,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                      <div>
                        <div style={{fontSize:12,fontWeight:600,color:'#1a1a1a'}}>{t('res.securityGate')}</div>
                        <div style={{fontSize:13,color:'#7a6f66'}}>+971 4 123 4567</div>
                      </div>
                      <a href="tel:+97141234567" style={{background:'#928989',color:'#fff',borderRadius:6,padding:'8px 16px',fontSize:12,fontWeight:600,textDecoration:'none',display:'flex',alignItems:'center',gap:4}}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.11 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
                        {t('res.callNow')}
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>
            )}

            {/* Visitors — pre-approved + upcoming (formerly two sections, now merged) */}
            <div style={{background:'rgba(255,255,255,0.55)',backdropFilter:'blur(12px)',WebkitBackdropFilter:'blur(12px)',borderRadius:18,padding:16,marginBottom:14,border:'1px solid rgba(255,255,255,0.5)',boxShadow:'0 2px 12px rgba(120,100,90,0.06)'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                <span style={{fontSize:13,fontWeight:600,color:'#1a1a1a'}}>Visitors</span>
                <span onClick={() => setCurrentPage('viewall')} style={{fontSize:11,color:'#a89a92',cursor:'pointer'}}>{t('res.seeAll')} ›</span>
              </div>
              {scheduledVisitors.length > 0 ? scheduledVisitors.slice(0,3).map(v => {
                const statusLabel = v.status === 'Inside' ? t('res.passedSecurity') : v.status === 'Rejected' ? t('res.rejected') : v.status === 'Checked Out' || v.status === 'Exited' ? t('res.checkedOut') : v.status === 'On Hold' ? t('res.onHold') : t('res.preApproved');
                const statusColor = v.status === 'Inside' ? '#2d6a4f' : v.status === 'Rejected' ? '#8b4a42' : v.status === 'On Hold' ? '#7a6040' : '#7a6f66';
                const statusBg = v.status === 'Inside' ? '#e0e5db' : v.status === 'Rejected' ? '#eddbd9' : v.status === 'On Hold' ? '#ebe3d9' : 'rgba(26,26,26,0.06)';
                return (
                <div key={'up-'+v.id} style={{display:'flex',alignItems:'center',gap:12,cursor:'pointer',marginBottom: 10,paddingBottom:10,borderBottom:'1px solid #f2efec'}} onClick={() => { setSelectedVisitor(v); setCurrentPage('viewVisitor'); }}>
                  <div style={{width:40,height:40,borderRadius:'50%',background:'#e8e3de',display:'flex',alignItems:'center',justifyContent:'center'}}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a89a92" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/></svg>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14,fontWeight:600,color:'#1a1a1a'}}>{v.name}</div>
                    <div style={{fontSize:11,color:'#a89a92'}}>{(v.type === 'Resident Guest' ? t('res.residentGuest') : v.type === 'Contractor / Worker' ? t('res.contractorWorker') : v.type === 'Delivery / Courier' ? t('res.deliveryCourier') : v.type === 'Domestic Staff' ? t('res.domesticStaff') : v.type === 'Service Vendor' ? t('res.serviceVendor') : v.type === 'Other / Misc.' ? t('res.otherMisc') : (v.type || t('res.guest')))} — {v.purpose === 'Personal visit' ? t('res.personalVisit') : v.purpose === 'Delivery' ? t('res.delivery') : v.purpose === 'Maintenance' ? t('res.maintenance') : v.purpose === 'Moving Out Service' ? t('res.movingOut') : (v.purpose || t('res.personalVisit'))}</div>
                    <div style={{fontSize:11,color:'#a89a92'}}>{(() => { const isAr = t('res.in') !== 'In'; const monthsEn=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; const monthsArH=['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']; const months = isAr ? monthsArH : monthsEn; const d=v.date||''; let datePart=''; if(/^\d{4}-\d{2}-\d{2}$/.test(d)){const p=d.split('-'); datePart=parseInt(p[2],10)+' '+months[parseInt(p[1],10)-1];} else if(/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(d)){const p=d.split('/'); datePart=parseInt(p[0],10)+' '+months[parseInt(p[1],10)-1];} else { datePart=d; } const tStr = v.time && isAr ? v.time.replace(/\bAM\b/i,'ص').replace(/\bPM\b/i,'م') : v.time; return datePart + ' · ' + tStr; })()}</div>
                    <div style={{fontSize:10,color:'#7a6f66',marginTop:2,display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
                      <span>{t('res.gate')}: {v.gate || t('res.mainGate')}</span>
                      <span style={{color:'#c4b8b0'}}>·</span>
                      <span style={{color:'#7a6f66',fontSize:10,fontWeight:500}}>{t('res.status')}: {statusLabel}</span>
                    </div>
                    {v.repeater && v.repeater !== 'Single Visit' && <div style={{fontSize:10,color:'#5a5470',marginTop:2}}>{v.repeater}</div>}
                  </div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c4b8b0" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                </div>
                );
              }) : (
                <div style={{textAlign:'center',color:'#c4b8b0',fontSize:12,padding:8}}>{t('res.noUpcoming')}</div>
              )}
              <button onClick={() => setCurrentPage('preapprove')} style={{width:'100%',marginTop:4,padding:'13px 0',borderRadius:14,border:'none',background:'#1a1a1a',color:'#fff',fontSize:13,fontWeight:600,cursor:'pointer',letterSpacing:'-0.01em'}}>{t('res.preApprovedGuest')}</button>
            </div>

            {/* Upcoming Amenities — booked amenities */}
            <div style={{background:'rgba(255,255,255,0.55)',backdropFilter:'blur(12px)',WebkitBackdropFilter:'blur(12px)',borderRadius:18,padding:16,marginBottom:14,border:'1px solid rgba(255,255,255,0.5)',boxShadow:'0 2px 12px rgba(120,100,90,0.06)'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                <span style={{fontSize:13,fontWeight:600,color:'#1a1a1a'}}>{t('res.upcomingAmenities')}</span>
                <span onClick={() => setCurrentPage('book')} style={{fontSize:11,color:'#a89a92',cursor:'pointer'}}>{t('res.seeAll')} ›</span>
              </div>
              {(() => {
                const todayISO = new Date().toISOString().split('T')[0];
                const upcoming = (data.amenityBookings || [])
                  .filter(b => b.date >= todayISO)
                  .sort((a, b) => (a.date + ' ' + a.time).localeCompare(b.date + ' ' + b.time));
                if (upcoming.length === 0) {
                  return <div style={{textAlign:'center',color:'#c4b8b0',fontSize:12,padding:8}}>{t('res.noAmenities')}</div>;
                }
                return upcoming.slice(0, 3).map(b => {
                  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                  const dp = b.date.split('-');
                  const dateLabel = b.date === todayISO ? t('common.today') : (parseInt(dp[2]) + ' ' + months[parseInt(dp[1])-1]);
                  const bTime = b.time;
                  return (
                    <div key={b.id} onClick={() => setShowAmenityDetail(b)} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 0',borderBottom:'1px solid rgba(200,190,180,0.15)',cursor:'pointer'}}>
                      <div style={{width:40,height:40,borderRadius:'50%',background:'rgba(255,255,255,0.55)',display:'flex',alignItems:'center',justifyContent:'center',border:'1px solid rgba(255,255,255,0.5)',flexShrink:0}}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7a6f66" strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:600,color:'#1a1a1a'}}>{b.type}</div>
                        <div style={{fontSize:11,color:'#a89a92'}}>{dateLabel} · {bTime} · {b.duration}</div>
                        <div style={{fontSize:10,color:'#7a6f66',marginTop:1}}>{b.guests} {b.guests === 1 ? t('res.person') : t('res.people')}</div>
                      </div>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c4b8b0" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                    </div>
                  );
                });
              })()}
              <button onClick={() => {setBookingMode('amenity'); setServiceBooking({type:'', location:'', date:'', time:'', duration:'1 hour', guests:1, comments:''}); setShowServiceBookingModal(true);}} style={{width:'100%',marginTop:8,padding:'13px 0',borderRadius:14,border:'1px solid rgba(26,26,26,0.12)',background:'rgba(255,255,255,0.5)',color:'#1a1a1a',fontSize:13,fontWeight:600,cursor:'pointer',letterSpacing:'-0.01em'}}>{t('res.bookAmenity')}</button>
            </div>

            {/* Upcoming Service — booked separately */}
            <div style={{background:'rgba(255,255,255,0.55)',backdropFilter:'blur(12px)',WebkitBackdropFilter:'blur(12px)',borderRadius:18,padding:16,marginBottom:14,border:'1px solid rgba(255,255,255,0.5)',boxShadow:'0 2px 12px rgba(120,100,90,0.06)'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                <span style={{fontSize:13,fontWeight:600,color:'#1a1a1a'}}>{t('res.upcomingService')}</span>
                <span onClick={() => setCurrentPage('services')} style={{fontSize:11,color:'#a89a92',cursor:'pointer'}}>{t('res.seeAll')} ›</span>
              </div>
              {(() => {
                const svcTodayISO = new Date().toISOString().split('T')[0];
                const upcomingSvc = (data.serviceRequests || [])
                  .filter(s => {
                    const d = parseDateISO(s.date);
                    return d >= svcTodayISO && (s.status === 'Scheduled' || s.status === 'Pending Approval' || s.status === 'In Progress');
                  })
                  .sort((a, b) => (parseDateISO(a.date) + ' ' + (a.time||'')).localeCompare(parseDateISO(b.date) + ' ' + (b.time||'')))
                  .slice(0, 3);
                if (upcomingSvc.length === 0) {
                  return <div style={{textAlign:'center',color:'#c4b8b0',fontSize:12,padding:8}}>{t('res.noUpcomingServices')}</div>;
                }
                const isArH = t('res.in') !== 'In';
                const svcMonths = isArH ? ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'] : ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                const svcTypeLabel = (tp) => {
                  switch(tp) {
                    case 'AC Repair': return t('res.acRepair');
                    case 'Plumbing': return t('res.plumbing');
                    case 'Pest Control': return t('res.pestControl');
                    case 'Electrical': return t('res.electrical');
                    case 'Handyman': return t('res.handyman');
                    case 'Installation': return t('res.installation');
                    case 'Move-In': return t('res.moveIn') === 'res.moveIn' ? 'Move-In' : t('res.moveIn');
                    case 'Move-Out': return t('res.moveOut') === 'res.moveOut' ? 'Move-Out' : t('res.moveOut');
                    default: return tp;
                  }
                };
                const statusColors = {Scheduled:'#5a6b4f','Pending Approval':'#b08a4a','In Progress':'#4a6fa5'};
                return upcomingSvc.map(s => {
                  const iso = parseDateISO(s.date);
                  const dp = iso.split('-');
                  const dl = iso === svcTodayISO ? t('res.today') : (parseInt(dp[2]) + ' ' + svcMonths[parseInt(dp[1])-1]);
                  return (
                    <div key={s.id} style={{display:'flex',alignItems:'center',gap:12,marginBottom:10,paddingBottom:10,borderBottom:'1px solid #f2efec'}}>
                      <div style={{width:40,height:40,borderRadius:'50%',background:'#e8e3de',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a89a92" strokeWidth="1.5"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:600,color:'#1a1a1a'}}>{svcTypeLabel(s.type)}</div>
                        <div style={{fontSize:11,color:'#a89a92'}}>{dl} · {s.time || '—'}</div>
                        {s.location && <div style={{fontSize:10,color:'#7a6f66',marginTop:1}}>{s.location}</div>}
                      </div>
                      <span style={{fontSize:10,fontWeight:500,color: statusColors[s.status] || '#5a6b4f'}}>{s.status === 'Scheduled' ? t('res.scheduled') : s.status === 'Pending Approval' ? t('res.pendingApproval') : s.status === 'In Progress' ? t('res.inProgress') : s.status === 'Completed' ? t('res.completed') : s.status === 'Open' ? t('res.open') : s.status === 'Cancelled' ? t('res.cancelled') : s.status === 'Closed' ? t('res.closed') : s.status}</span>
                    </div>
                  );
                });
              })()}
              <button onClick={() => {setBookingMode('service'); setServiceBooking({type:'', location:'', date:'', time:'', duration:'1 hour', guests:'Normal', comments:''}); setShowServiceBookingModal(true);}} style={{width:'100%',marginTop:4,padding:'13px 0',borderRadius:14,border:'1px solid rgba(26,26,26,0.12)',background:'rgba(255,255,255,0.5)',color:'#1a1a1a',fontSize:13,fontWeight:600,cursor:'pointer',letterSpacing:'-0.01em'}}>{t('res.addServiceRequest')}</button>
            </div>

            {/* Recent Announcements */}
            <div style={{background:'rgba(255,255,255,0.55)',backdropFilter:'blur(12px)',WebkitBackdropFilter:'blur(12px)',borderRadius:18,padding:16,marginBottom:14,border:'1px solid rgba(255,255,255,0.5)',boxShadow:'0 2px 12px rgba(120,100,90,0.06)'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                <span style={{fontSize:13,fontWeight:600,color:'#1a1a1a'}}>{t('res.recentAnnouncements')}</span>
                <span onClick={() => setCurrentPage('resAnnouncements')} style={{fontSize:11,color:'#a89a92',cursor:'pointer'}}>{t('res.seeAll')} ›</span>
              </div>
              {(() => {
                const isArA = t('res.in') !== 'In';
                const monthsEnA = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                const monthsArA = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
                const annTitleMap = {
                  'Pool Maintenance — Temporary Closure': 'res.annPoolMaintenance',
                  'Elevator Servicing — Tower B': 'res.annElevatorServicing',
                  'Community BBQ — Friday Evening': 'res.annCommunityBBQ',
                  'Visitor Policy Update': 'res.annVisitorPolicy',
                  'Water Supply Interruption — Tower C': 'res.annWaterSupply',
                  'Parking Garage Deep Clean': 'res.annParkingClean',
                  'Fire Drill — All Towers': 'res.annFireDrill',
                  'Gym Equipment Upgrade': 'res.annGymUpgrade'
                };
                const annTitle = (title) => annTitleMap[title] ? t(annTitleMap[title]) : title;
                // Format created string: "05 Apr, 09:44" -> Arabic months if needed
                const annCreated = (c) => {
                  if (!c || !isArA) return c || '2hr ago';
                  return c.replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/, (m) => monthsArA[monthsEnA.indexOf(m)] || m).replace(/\bAM\b/i,'ص').replace(/\bPM\b/i,'م');
                };
                if (recentAnnouncements.length > 0) {
                  return recentAnnouncements.slice(0,3).map((a, idx) => (
                    <div key={a.id} onClick={() => setCurrentPage('resAnnouncements')} style={{cursor:'pointer', paddingBottom: idx < Math.min(recentAnnouncements.length, 3) - 1 ? 10 : 0, marginBottom: idx < Math.min(recentAnnouncements.length, 3) - 1 ? 10 : 0, borderBottom: idx < Math.min(recentAnnouncements.length, 3) - 1 ? '1px solid rgba(0,0,0,0.06)' : 'none'}}>
                      <div style={{fontSize:14,fontWeight:600,color:'#1a1a1a',marginBottom:4}}>{annTitle(a.title)}</div>
                      {a.body && <div style={{fontSize:12,color:'#8a7f76',lineHeight:'1.5',marginBottom:6}}>{a.body.length > 80 ? a.body.substring(0,80) + '…' : a.body}</div>}
                      <div style={{fontSize:11,color:'#c4b8b0'}}>{annCreated(a.created)}</div>
                    </div>
                  ));
                }
                return (
                  <div>
                    <div style={{fontSize:14,fontWeight:600,color:'#1a1a1a',marginBottom:4}}>{t('res.annWaterPipeline')}</div>
                    <div style={{fontSize:12,color:'#8a7f76',lineHeight:'1.5',marginBottom:6}}>{t('res.bodyWaterPipeline')}</div>
                    <div style={{fontSize:11,color:'#c4b8b0'}}>{isArA ? 'قبل ساعتين' : '2hr ago'}</div>
                  </div>
                );
              })()}
            </div>

            {/* Find and contact for help */}
            <div style={{background:'#fff',borderRadius:12,padding:16,border:'1px solid #ebe7e3'}}>
              <div style={{fontSize:13,fontWeight:600,color:'#1a1a1a',marginBottom:12}}>{t('res.findContactHelp')}</div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10}}>
                <div onClick={() => setHelpModal('security')} style={{cursor:'pointer',border:'1px solid #ebe7e3',borderRadius:8,padding:14,textAlign:'center',background:'#faf8f6'}}>
                  <div style={{marginBottom:6}}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7a6f66" strokeWidth="1.5"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.11 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg></div>
                  <div style={{fontSize:10,color:'#7a6f66',fontWeight:500,lineHeight:'1.3'}}>{t('res.contactHeadSecurity')}</div>
                </div>
                <div onClick={() => setHelpModal('pm')} style={{cursor:'pointer',border:'1px solid #ebe7e3',borderRadius:8,padding:14,textAlign:'center',background:'#faf8f6'}}>
                  <div style={{marginBottom:6}}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7a6f66" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/></svg></div>
                  <div style={{fontSize:10,color:'#7a6f66',fontWeight:500,lineHeight:'1.3'}}>{t('res.contactPropertyMgr')}</div>
                </div>
                <div onClick={() => setHelpModal('incident')} style={{cursor:'pointer',border:'1px solid #ebe7e3',borderRadius:8,padding:14,textAlign:'center',background:'#faf8f6'}}>
                  <div style={{marginBottom:6}}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7a6f66" strokeWidth="1.5"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>
                  <div style={{fontSize:10,color:'#7a6f66',fontWeight:500,lineHeight:'1.3'}}>{t('res.reportIncident')}</div>
                </div>
              </div>
            </div>
          </div>
        );
      case 'activity':
        return (
          <div className="res-content">
            <h3 className="res-section-title">Activity/Visitor Log — 05 April</h3>
            {data.entryLog.slice(0,4).map(e => (
              <div key={e.id} className="res-visitor-card">
                <div className="name">{e.visitor}</div>
                <div className="type">{e.type}</div>
                <div className="time">{e.timeIn} • {e.duration}</div>
                <div style={{marginTop:8,fontSize:11,color:'#5a6b4f',fontWeight:600}}>✓ In</div>
              </div>
            ))}
          </div>
        );
      case 'more':
        return (
          <div className="res-content">
            <h3 className="res-section-title">Menu</h3>
            {[
              {label:'My Household & Regular Visitors',page:'household'},
              {label:'All Residents'},
              {label:'Notifications / Announcements'},
              {label:'Payment History'},
              {label:'Service Requests'},
              {label:'Profile Settings'},
              {label:'Sign Out',onClick:onLogout}
            ].map((item,i) => (
              <div
                key={i}
                onClick={() => {
                  if(item.onClick) item.onClick();
                  else if(item.page) setCurrentPage(item.page);
                }}
                style={{background:'#fff',border:'1px solid #e5e5e5',borderRadius:10,padding:14,marginBottom:10,cursor:'pointer'}}
              >
                <div style={{fontSize:13,fontWeight:500,color:'#1a1a1a'}}>{item.label}</div>
              </div>
            ))}
          </div>
        );
      case 'chat':
        return <ChatPage />;
      case 'household':
        const [hhTab, setHhTab] = [resHhTab, setResHhTab];
        const [hhShowCreate, setHhShowCreate] = [resHhShowCreate, setResHhShowCreate];
        const [hhForm, setHhForm] = [resHhForm, setResHhForm];

        const hhFormDefaults = { name: '', phone: '', relation: 'Sister', role: 'Maid', schedule: 'Mon to Fri', hours: '9:00 AM to 17:00 PM', allowAccess: false, idDocType: 'Emirates ID', docNumber: '', vehicleNumber: '' };

        const saveHhMember = () => {
          if (!hhForm.name.trim()) { showToast('Please enter a name'); return; }
          if (!hhForm.phone.trim()) { showToast('Please enter a mobile number'); return; }
          if (resHhEditingId) {
            // Edit existing
            if (hhTab === 'family') {
              setData(prev => ({ ...prev, household: prev.household.map(m => m.id === resHhEditingId ? { ...m, name: hhForm.name.trim(), phone: hhForm.phone.trim(), relation: hhForm.relation, allowAccess: hhForm.allowAccess, idDocType: hhForm.idDocType, docNumber: hhForm.docNumber, vehicleNumber: hhForm.vehicleNumber } : m) }));
            } else {
              setData(prev => ({ ...prev, regularVisitors: prev.regularVisitors.map(v => v.id === resHhEditingId ? { ...v, name: hhForm.name.trim(), phone: hhForm.phone.trim(), role: hhForm.role, schedule: hhForm.schedule, hours: hhForm.hours, idDocType: hhForm.idDocType, docNumber: hhForm.docNumber, vehicleNumber: hhForm.vehicleNumber } : v) }));
            }
            setResHhEditingId(null);
            showToast('Updated successfully');
          } else {
            // Create new
            const base = { id: Date.now(), name: hhForm.name.trim(), phone: hhForm.phone.trim(), status: 'Active', idDocType: hhForm.idDocType, docNumber: hhForm.docNumber, vehicleNumber: hhForm.vehicleNumber };
            if (hhTab === 'family') {
              setData(prev => ({ ...prev, household: [...prev.household, { ...base, relation: hhForm.relation, allowAccess: hhForm.allowAccess }] }));
            } else {
              setData(prev => ({ ...prev, regularVisitors: [...prev.regularVisitors, { ...base, role: hhForm.role, schedule: hhForm.schedule, hours: hhForm.hours }] }));
            }
            showToast((hhTab === 'family' ? 'Family member' : 'Regular visitor') + ' added');
          }
          setHhShowCreate(false);
          setHhForm(hhFormDefaults);
        };

        const deleteHhMember = (id) => {
          if (hhTab === 'family') {
            setData(prev => ({ ...prev, household: prev.household.filter(m => m.id !== id) }));
          } else {
            setData(prev => ({ ...prev, regularVisitors: prev.regularVisitors.filter(v => v.id !== id) }));
          }
          showToast('Removed');
        };

        const startEditHh = (member) => {
          setResHhEditingId(member.id);
          if (hhTab === 'family') {
            setHhForm({ name: member.name, phone: member.phone, relation: member.relation || 'Sister', allowAccess: member.allowAccess || false, idDocType: member.idDocType || 'Emirates ID', docNumber: member.docNumber || '', vehicleNumber: member.vehicleNumber || '', role: 'Maid', schedule: 'Mon to Fri', hours: '9:00 AM to 17:00 PM' });
          } else {
            setHhForm({ name: member.name, phone: member.phone, role: member.role || 'Maid', schedule: member.schedule || 'Mon to Fri', hours: member.hours || '9:00 AM to 17:00 PM', idDocType: member.idDocType || 'Emirates ID', docNumber: member.docNumber || '', vehicleNumber: member.vehicleNumber || '', relation: 'Sister', allowAccess: false });
          }
          setHhShowCreate(true);
        };

        // Generate QR data for a household member
        const hhQrData = (member, type) => {
          return JSON.stringify({
            permit: 'HH-' + member.id,
            property: 'Sky Tower - The Pinnacle Residences',
            unit: 'B-102',
            resident: 'Nitin Sharma',
            name: member.name,
            mobile: member.phone,
            type: type === 'family' ? 'Family — ' + (member.relation || 'Member') : 'Regular — ' + (member.role || 'Visitor'),
            idDoc: (member.idDocType || 'Emirates ID') + (member.docNumber ? ': ' + member.docNumber : ''),
            vehicle: member.vehicleNumber || 'N/A',
            access: type === 'family' ? 'Permanent Resident' : (member.schedule || 'Scheduled') + ' / ' + (member.hours || ''),
            status: member.status || 'Active',
            validUntil: 'Until cancelled'
          });
        };

        // ---- MEMBER DETAIL + QR VIEW ----
        if (resHhViewMember) {
          const vm = resHhViewMember;
          const vmType = hhTab;
          const vmQrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(hhQrData(vm, vmType));
          const vmInfoRows = vmType === 'family' ? [
            ['Name', vm.name], ['Phone', vm.phone], ['Relation', vm.relation || 'Family'],
            ['ID Document', (vm.idDocType || 'Emirates ID') + (vm.docNumber ? ': ' + vm.docNumber : '')],
            ['Vehicle', vm.vehicleNumber || 'N/A'], ['Access', vm.allowAccess ? 'Full Access' : 'Standard'],
            ['Status', vm.status || 'Active'], ['Valid Until', 'Until cancelled']
          ] : [
            ['Name', vm.name], ['Phone', vm.phone], ['Role', vm.role],
            ['Schedule', vm.schedule], ['Hours', vm.hours],
            ['ID Document', (vm.idDocType || 'Emirates ID') + (vm.docNumber ? ': ' + vm.docNumber : '')],
            ['Vehicle', vm.vehicleNumber || 'N/A'],
            ['Status', vm.status || 'Active'], ['Valid Until', 'Until cancelled']
          ];

          return (
            <div className="res-content" style={{padding:'12px 16px',paddingBottom:80}}>
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:20}}>
                <button onClick={() => setResHhViewMember(null)} style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:'#6b5d52'}}>‹</button>
                <span style={{fontSize:16,fontWeight:600,color:'#1a1a1a'}}>{vm.name}</span>
              </div>

              {/* Status badge */}
              <div style={{textAlign:'center',marginBottom:16}}>
                <span style={{background:'#e0e5db',color:'#5a6b4f',padding:'6px 20px',borderRadius:20,fontSize:12,fontWeight:600,letterSpacing:'0.04em'}}>
                  {vmType === 'family' ? 'FAMILY MEMBER' : 'REGULAR VISITOR'} — ACTIVE
                </span>
              </div>

              {/* QR Code */}
              <div style={{textAlign:'center',marginBottom:20}}>
                <div style={{background:'#fff',border:'1px solid #ebe7e3',borderRadius:12,padding:20,display:'inline-block'}}>
                  <img src={vmQrUrl} alt="QR Code" style={{width:180,height:180}} />
                </div>
                <div style={{fontSize:11,color:'#a89a92',marginTop:8}}>Security will scan this QR to verify entry</div>
              </div>

              {/* Info rows */}
              <div style={{background:'#f2efec',borderRadius:10,overflow:'hidden',marginBottom:16}}>
                {vmInfoRows.map(([label, val], i) => (
                  <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 16px',borderBottom: i < vmInfoRows.length-1 ? '1px solid #e8e8e8' : 'none'}}>
                    <span style={{fontSize:12,color:'#a89a92'}}>{label}</span>
                    <span style={{fontSize:12,color: label === 'Status' ? '#2e7d32' : '#1a1a1a',fontWeight:500,textAlign:'right',maxWidth:'60%'}}>{val}</span>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
                <button onClick={() => { setResHhViewMember(null); startEditHh(vm); }}
                  style={{padding:14,background:'#fff',color:'#1a1a1a',border:'1px solid #d5cfc8',borderRadius:6,fontSize:13,fontWeight:600,cursor:'pointer'}}>
                  Edit Details
                </button>
                <button onClick={() => {
                  const link = document.createElement('a'); link.href = vmQrUrl; link.download = vm.name.replace(/\s+/g,'_') + '_QR.png'; link.click();
                  showToast('QR code downloaded');
                }} style={{padding:14,background:'#928989',color:'#fff',border:'none',borderRadius:6,fontSize:13,fontWeight:600,cursor:'pointer'}}>
                  Share QR Pass
                </button>
              </div>
              <button onClick={() => { deleteHhMember(vm.id); setResHhViewMember(null); }}
                style={{width:'100%',padding:14,background:'#fff',color:'#8b4a42',border:'1px solid #c62828',borderRadius:6,fontSize:13,fontWeight:600,cursor:'pointer'}}>
                Remove {hhTab === 'family' ? 'Family Member' : 'Regular Visitor'}
              </button>
            </div>
          );
        }

        // ---- CREATE / EDIT FORM ----
        if (hhShowCreate) {
          return (
            <div className="res-content" style={{padding:'12px 16px',paddingBottom:80}}>
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:20}}>
                <button onClick={() => { setHhShowCreate(false); setResHhEditingId(null); setHhForm(hhFormDefaults); }} style={{background:'none',border:'none',fontSize:18,cursor:'pointer',color:'#6b5d52'}}>‹</button>
                <span style={{fontSize:16,fontWeight:500,color:'#1a1a1a'}}>{resHhEditingId ? 'Edit' : 'Add'} {hhTab === 'family' ? 'family member' : 'regular visitor'}</span>
              </div>

              {/* Identity section */}
              <div style={{background:'#f2efec',borderRadius:8,overflow:'hidden',marginBottom:16}}>
                <div style={{background:'#e8e8e8',padding:'10px 16px',fontSize:12,fontWeight:600,color:'#1a1a1a',letterSpacing:'0.02em'}}>
                  {hhTab === 'family' ? 'Resident Identity' : 'Visitor Identity'}
                </div>
                <div style={{padding:16}}>
                  <div style={{marginBottom:14}}>
                    <label style={{fontSize:10,color:'#a89a92',letterSpacing:'0.06em',textTransform:'uppercase',display:'block',marginBottom:6,fontWeight:600}}>Full Name *</label>
                    <input value={hhForm.name} onChange={e => setHhForm(p => ({...p, name: e.target.value}))} placeholder="Enter full name..."
                      style={{width:'100%',padding:'10px 12px',border:'1px solid #ebe7e3',borderRadius:4,fontSize:13,outline:'none',boxSizing:'border-box',background:'#fff'}} />
                  </div>
                  <div style={{marginBottom:14}}>
                    <label style={{fontSize:10,color:'#a89a92',letterSpacing:'0.06em',textTransform:'uppercase',display:'block',marginBottom:6,fontWeight:600}}>Mobile Number *</label>
                    <input value={hhForm.phone} onChange={e => setHhForm(p => ({...p, phone: e.target.value}))} placeholder="+971 XXXXX XXXX" type="tel"
                      style={{width:'100%',padding:'10px 12px',border:'1px solid #ebe7e3',borderRadius:4,fontSize:13,outline:'none',boxSizing:'border-box',background:'#fff'}} />
                  </div>
                </div>
              </div>

              {/* ID Document section */}
              <div style={{background:'#f2efec',borderRadius:8,overflow:'hidden',marginBottom:16}}>
                <div style={{background:'#e8e8e8',padding:'10px 16px',fontSize:12,fontWeight:600,color:'#1a1a1a',letterSpacing:'0.02em'}}>
                  Identification & Vehicle
                </div>
                <div style={{padding:16}}>
                  <div style={{marginBottom:14}}>
                    <label style={{fontSize:10,color:'#a89a92',letterSpacing:'0.06em',textTransform:'uppercase',display:'block',marginBottom:6,fontWeight:600}}>ID Document Type</label>
                    <select value={hhForm.idDocType} onChange={e => setHhForm(p => ({...p, idDocType: e.target.value}))}
                      style={{width:'100%',padding:'10px 12px',border:'1px solid #ebe7e3',borderRadius:4,fontSize:13,background:'#fff',outline:'none',boxSizing:'border-box'}}>
                      {['Emirates ID','Passport','Driving License','National ID','Other'].map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div style={{marginBottom:14}}>
                    <label style={{fontSize:10,color:'#a89a92',letterSpacing:'0.06em',textTransform:'uppercase',display:'block',marginBottom:6,fontWeight:600}}>Document Number</label>
                    <input value={hhForm.docNumber} onChange={e => setHhForm(p => ({...p, docNumber: e.target.value}))} placeholder="Enter document number..."
                      style={{width:'100%',padding:'10px 12px',border:'1px solid #ebe7e3',borderRadius:4,fontSize:13,outline:'none',boxSizing:'border-box',background:'#fff'}} />
                  </div>
                  <div>
                    <label style={{fontSize:10,color:'#a89a92',letterSpacing:'0.06em',textTransform:'uppercase',display:'block',marginBottom:6,fontWeight:600}}>Vehicle Number</label>
                    <input value={hhForm.vehicleNumber} onChange={e => setHhForm(p => ({...p, vehicleNumber: e.target.value}))} placeholder="e.g. DXB 12345 (optional)"
                      style={{width:'100%',padding:'10px 12px',border:'1px solid #ebe7e3',borderRadius:4,fontSize:13,outline:'none',boxSizing:'border-box',background:'#fff'}} />
                  </div>
                </div>
              </div>

              {/* Role/Relation section */}
              {hhTab === 'family' ? (
                <div style={{background:'#f2efec',borderRadius:8,padding:16,marginBottom:20}}>
                  <label style={{fontSize:10,color:'#a89a92',letterSpacing:'0.06em',textTransform:'uppercase',display:'block',marginBottom:6,fontWeight:600}}>Relation Type</label>
                  <select value={hhForm.relation} onChange={e => setHhForm(p => ({...p, relation: e.target.value}))}
                    style={{width:'100%',padding:'10px 12px',border:'1px solid #ebe7e3',borderRadius:4,fontSize:13,background:'#fff',outline:'none',boxSizing:'border-box'}}>
                    {['Sister','Brother','Mother','Father','Spouse','Son','Daughter','Other'].map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <div style={{marginTop:14}}>
                    <label style={{fontSize:10,color:'#a89a92',letterSpacing:'0.06em',textTransform:'uppercase',display:'block',marginBottom:6,fontWeight:600}}>Allow Access for Request</label>
                    <div onClick={() => setHhForm(p => ({...p, allowAccess: !p.allowAccess}))} style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer'}}>
                      <div style={{width:20,height:20,border:'1px solid #ccc',borderRadius:3,background: hhForm.allowAccess ? '#1a1a1a' : '#fff',display:'flex',alignItems:'center',justifyContent:'center'}}>
                        {hhForm.allowAccess && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><path d="M20 6L9 17l-5-5"/></svg>}
                      </div>
                      <span style={{fontSize:12,color:'#7a6f66'}}>Enable access requests</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{background:'#f2efec',borderRadius:8,padding:16,marginBottom:20}}>
                  <div style={{marginBottom:14}}>
                    <label style={{fontSize:10,color:'#a89a92',letterSpacing:'0.06em',textTransform:'uppercase',display:'block',marginBottom:6,fontWeight:600}}>Role</label>
                    <select value={hhForm.role} onChange={e => setHhForm(p => ({...p, role: e.target.value}))}
                      style={{width:'100%',padding:'10px 12px',border:'1px solid #ebe7e3',borderRadius:4,fontSize:13,background:'#fff',outline:'none',boxSizing:'border-box'}}>
                      {['Maid','Nanny','Driver','Cook','Gardener','Tutor','Other'].map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  <div style={{marginBottom:14}}>
                    <label style={{fontSize:10,color:'#a89a92',letterSpacing:'0.06em',textTransform:'uppercase',display:'block',marginBottom:6,fontWeight:600}}>Schedule</label>
                    <select value={hhForm.schedule} onChange={e => setHhForm(p => ({...p, schedule: e.target.value}))}
                      style={{width:'100%',padding:'10px 12px',border:'1px solid #ebe7e3',borderRadius:4,fontSize:13,background:'#fff',outline:'none',boxSizing:'border-box'}}>
                      {['Mon to Fri','Mon, Wed, Fri','Tue, Thu, Sat','Everyday','Weekends','Custom'].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{fontSize:10,color:'#a89a92',letterSpacing:'0.06em',textTransform:'uppercase',display:'block',marginBottom:6,fontWeight:600}}>Hours</label>
                    <input value={hhForm.hours} onChange={e => setHhForm(p => ({...p, hours: e.target.value}))} placeholder="9:00 AM to 17:00 PM"
                      style={{width:'100%',padding:'10px 12px',border:'1px solid #ebe7e3',borderRadius:4,fontSize:13,outline:'none',boxSizing:'border-box',background:'#fff'}} />
                  </div>
                </div>
              )}

              <button onClick={saveHhMember} style={{width:'100%',padding:16,background:'#928989',color:'#fff',border:'none',borderRadius:4,fontSize:14,fontWeight:600,cursor:'pointer'}}>
                {resHhEditingId ? 'Save Changes' : 'Save'}
              </button>
            </div>
          );
        }

        // ---- MAIN LIST VIEW ----
        const idDocLabel = (kind) => {
          if (kind === 'Emirates ID' || !kind) return t('res.emiratesID');
          if (kind === 'Passport') return t('res.passport');
          if (kind === 'Driving License') return t('res.drivingLicense');
          if (kind === 'National ID') return t('res.nationalID');
          if (kind === 'Other') return t('res.other');
          return kind;
        };
        const statusLabelHh = (s) => s === 'Active' ? t('res.verified') : s === 'Pending' ? t('res.pendingStatus') : s;
        return (
          <div className="res-content" style={{padding:'12px 16px',paddingBottom:80}}>
            <div style={{fontSize:20,fontWeight:600,color:'#1a1a1a',marginBottom:16}}>{t('res.myHouseholdTitle')}</div>

            {/* Tabs */}
            <div style={{display:'flex',marginBottom:16,borderRadius:6,overflow:'hidden',border:'1px solid #928989'}}>
              <button onClick={() => setHhTab('family')} style={{flex:1,padding:'12px 0',border:'none',fontSize:13,fontWeight:600,cursor:'pointer',background: hhTab==='family' ? '#1a1a1a' : '#fff',color: hhTab==='family' ? '#fff' : '#1a1a1a'}}>{t('res.familyMember')}</button>
              <button onClick={() => setHhTab('regular')} style={{flex:1,padding:'12px 0',border:'none',fontSize:13,fontWeight:600,cursor:'pointer',background: hhTab==='regular' ? '#1a1a1a' : '#fff',color: hhTab==='regular' ? '#fff' : '#1a1a1a'}}>{t('res.regularVisitor')}</button>
            </div>

            {/* Create button */}
            <button onClick={() => { setHhForm(hhFormDefaults); setResHhEditingId(null); setHhShowCreate(true); }}
              style={{background:'#fff',border:'1px solid #928989',borderRadius:4,padding:'8px 16px',fontSize:13,fontWeight:600,cursor:'pointer',marginBottom:16,color:'#1a1a1a'}}>{t('res.create')}</button>

            {hhTab === 'family' ? (
              data.household.length === 0 ? (
                <div style={{textAlign:'center',color:'#c4b8b0',padding:32,fontSize:13}}>{t('res.noFamily')}</div>
              ) : data.household.map(m => (
                <div key={m.id} onClick={() => setResHhViewMember(m)} style={{background:'#f2efec',borderRadius:10,padding:14,marginBottom:10,cursor:'pointer'}}>
                  <div style={{display:'flex',gap:12,alignItems:'center'}}>
                    <div style={{width:42,height:42,borderRadius:'50%',background:'#e8e8e8',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a89a92" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/></svg>
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:2}}>
                        <div style={{fontSize:14,fontWeight:600,color:'#1a1a1a'}}>{m.name}</div>
                        <span style={{background:'#e0e5db',color:'#5a6b4f',padding:'2px 8px',borderRadius:4,fontSize:10,fontWeight:600}}>{statusLabelHh(m.status)}</span>
                      </div>
                      <div style={{fontSize:12,color:'#a89a92',marginBottom:2}}>{m.relation || t('res.family')} — {m.phone}</div>
                      <div style={{fontSize:11,color:'#c4b8b0'}}>{idDocLabel(m.idDocType)}{m.docNumber ? ': ' + m.docNumber : ''}</div>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                  </div>
                </div>
              ))
            ) : (
              data.regularVisitors.length === 0 ? (
                <div style={{textAlign:'center',color:'#c4b8b0',padding:32,fontSize:13}}>{t('res.noRegular')}</div>
              ) : data.regularVisitors.map(v => (
                <div key={v.id} onClick={() => setResHhViewMember(v)} style={{background:'#f2efec',borderRadius:10,padding:14,marginBottom:10,cursor:'pointer'}}>
                  <div style={{display:'flex',gap:12,alignItems:'center'}}>
                    <div style={{width:42,height:42,borderRadius:'50%',background:'#e8e8e8',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a89a92" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/></svg>
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:2}}>
                        <div style={{fontSize:14,fontWeight:600,color:'#1a1a1a'}}>{v.name}</div>
                        <span style={{background:'#e0e5db',color:'#5a6b4f',padding:'2px 8px',borderRadius:4,fontSize:10,fontWeight:600}}>{statusLabelHh(v.status)}</span>
                      </div>
                      <div style={{fontSize:12,color:'#7a6f66',fontWeight:500,marginBottom:2}}>{v.role} — {v.schedule}</div>
                      <div style={{fontSize:11,color:'#a89a92',marginBottom:2}}>{v.phone} — {v.hours}</div>
                      <div style={{fontSize:11,color:'#c4b8b0'}}>{idDocLabel(v.idDocType)}{v.docNumber ? ': ' + v.docNumber : ''}</div>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                  </div>
                </div>
              ))
            )}
          </div>
        );
      case 'preapprove':
        return <PreApproveForm onBack={() => setCurrentPage('home')} showToast={showToast} data={data} setData={setData} />;

      case 'resAnnouncements':
        // Building announcements only — no visitor entrance/exit events
        const buildingAnns = (data.announcements || []).filter(a => a.status === 'Live' || a.status === 'Sent');
        const priorityColors = { High: { bg: '#eddbd9', color: '#8b4a42' }, Normal: { bg: 'rgba(90,84,112,0.08)', color: '#5a5470' } };
        return (
          <div className="res-content" style={{padding:'12px 16px',paddingBottom:80}}>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16}}>
              <button onClick={() => setCurrentPage('home')} style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:'#6b5d52'}}>‹</button>
              <span style={{fontSize:18,fontWeight:600,color:'#1a1a1a'}}>{t('res.announcementsLabel')}</span>
              <span style={{fontSize:11,color:'rgba(26,26,26,0.35)',marginLeft:'auto'}}>{buildingAnns.length} {buildingAnns.length === 1 ? t('res.announcement') : t('res.announcementsPlural')}</span>
            </div>
            {buildingAnns.length > 0 ? buildingAnns.map(a => {
              const pc = priorityColors[a.priority] || priorityColors.Normal;
              return (
                <div key={a.id} style={{background:'rgba(255,255,255,0.55)',backdropFilter:'blur(12px)',borderRadius:16,padding:14,marginBottom:10,border:'1px solid rgba(255,255,255,0.5)',boxShadow:'0 2px 12px rgba(120,100,90,0.06)',display:'flex',alignItems:'flex-start',gap:12}}>
                  <div style={{width:36,height:36,borderRadius:'50%',background: a.priority === 'High' ? '#eddbd9' : '#e0dde5',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,color: a.priority === 'High' ? '#8b4a42' : '#5a5470',fontWeight:700,flexShrink:0,marginTop:2}}>
                    {a.priority === 'High' ? '!' : '●'}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:14,fontWeight:600,color:'#1a1a1a',marginBottom:4}}>{a.title}</div>
                    {a.body && <div style={{fontSize:13,color:'#7a6f66',lineHeight:'1.5',marginBottom:6}}>{a.body}</div>}
                    <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                      <span style={{fontSize:11,color:'rgba(26,26,26,0.3)'}}>{a.created}</span>
                      <span style={{fontSize:10,background:pc.bg,color:pc.color,padding:'2px 8px',borderRadius:10,fontWeight:500}}>{a.priority === 'High' ? t('res.important') : t('res.announcement')}</span>
                      {a.audience && <span style={{fontSize:10,color:'#a89a92'}}>{a.audience}</span>}
                    </div>
                  </div>
                </div>
              );
            }) : (
              <div style={{textAlign:'center',color:'#a89a92',padding:40,fontSize:13}}>{t('res.noAnnouncements')}</div>
            )}
          </div>
        );

      case 'profile':
        const profileMenuItems = [
          { label: t('res.personalInfo'), icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7a6f66" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/></svg>) },
          { label: t('res.generalSetting'), icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7a6f66" strokeWidth="1.5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>) },
          { label: t('res.visitorLog'), icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7a6f66" strokeWidth="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>), page: 'viewall' },
          { label: t('res.preference'), icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7a6f66" strokeWidth="1.5"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>) },
          { label: t('res.accounts'), icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7a6f66" strokeWidth="1.5"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>) },
          { label: t('res.helpSupport'), icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7a6f66" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>) }
        ];
        return (
          <div className="res-content" style={{padding:0,paddingBottom:80}}>
            {/* Profile header card */}
            <div style={{background:'rgba(255,255,255,0.4)',padding:'28px 16px 24px',textAlign:'center',borderBottom:'1px solid rgba(26,26,26,0.06)'}}>
              <div style={{width:72,height:72,borderRadius:'50%',border:'2px solid rgba(26,26,26,0.08)',background:'rgba(255,255,255,0.5)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 14px'}}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="1.2"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/></svg>
              </div>
              <div style={{fontSize:18,fontWeight:600,color:'#1a1a1a',marginBottom:2}}>Rashid</div>
              <div style={{fontSize:13,color:'#a89a92',marginBottom:2}}>{t('res.residentRole')}</div>
              <div style={{fontSize:12,color:'#c4b8b0'}}>{t('res.block')} C — 127</div>
            </div>
            {/* Menu items */}
            <div style={{padding:'12px 16px'}}>
              {profileMenuItems.map((item, i) => (
                <div key={i} onClick={() => { if (item.page) setCurrentPage(item.page); }}
                  style={{display:'flex',alignItems:'center',gap:14,padding:'14px 0',borderBottom: i < profileMenuItems.length - 1 ? '1px solid rgba(26,26,26,0.06)' : 'none',cursor:'pointer'}}>
                  <div style={{width:36,height:36,borderRadius:'50%',background:'rgba(26,26,26,0.04)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                    {item.icon}
                  </div>
                  <div style={{flex:1,fontSize:14,fontWeight:500,color:'#1a1a1a'}}>{item.label}</div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                </div>
              ))}
              {/* Logout */}
              <div onClick={onLogout} style={{display:'flex',alignItems:'center',gap:14,padding:'14px 0',marginTop:12,cursor:'pointer'}}>
                <div style={{width:36,height:36,borderRadius:'50%',background:'#fff5f5',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c62828" strokeWidth="1.5"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                </div>
                <div style={{flex:1,fontSize:14,fontWeight:500,color:'#8b4a42'}}>{t('res.logout')}</div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="res-app">
      {/* Header — only on home page */}
      {currentPage === 'home' && (
        <div className="res-header">
          <div className="res-header-left" style={{display:'flex',flexDirection:'row',alignItems:'center',gap:12}}>
            <div onClick={() => setCurrentPage('profile')} style={{width:44,height:44,borderRadius:'50%',background:'rgba(26,26,26,0.06)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',flexShrink:0}}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(26,26,26,0.35)" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/></svg>
            </div>
            <div style={{position:'relative'}}>
              <div style={{fontSize:15,fontWeight:600,color:'#1a1a1a',letterSpacing:'-0.02em'}}>{t('res.hello')}, {r_name}</div>
              <div onClick={() => setShowResPropertyDropdown(!showResPropertyDropdown)} style={{cursor:'pointer',display:'flex',alignItems:'center',gap:4,fontSize:11,color:'rgba(26,26,26,0.4)',marginTop:2}}>
                {r_flat}, {r_building}
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(26,26,26,0.35)" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
              </div>
              {showResPropertyDropdown && (
                <div style={{position:'absolute',top:'100%',left:0,marginTop:6,background:'rgba(255,255,255,0.9)',backdropFilter:'blur(20px)',WebkitBackdropFilter:'blur(20px)',border:'1px solid rgba(255,255,255,0.6)',borderRadius:14,boxShadow:'0 8px 32px rgba(26,26,26,0.12)',zIndex:200,minWidth:220,padding:4}}>
                  <div onClick={() => setShowResPropertyDropdown(false)} style={{padding:'10px 14px',borderRadius:10,cursor:'pointer',background:'rgba(26,26,26,0.05)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <div>
                      <div style={{fontSize:12,fontWeight:600,color:'#1a1a1a'}}>The Pinnacle Residences</div>
                      <div style={{fontSize:10,color:'#a89a92'}}>Al Reem Island</div>
                    </div>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2d6a4f" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg>
                  </div>
                  {[
                    {name:'Al Raha Gardens', loc:'Al Raha Beach'},
                    {name:'Saadiyat Grove', loc:'Saadiyat Island'},
                    {name:'Yas Bay Residences', loc:'Yas Island'},
                    {name:'Bloom Living', loc:'Casares'}
                  ].map((p,i) => (
                    <div key={i} style={{padding:'10px 14px',borderRadius:6,cursor:'not-allowed',opacity:0.5,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <div>
                        <div style={{fontSize:12,fontWeight:500,color:'#1a1a1a'}}>{p.name}</div>
                        <div style={{fontSize:10,color:'#a89a92'}}>{p.loc}</div>
                      </div>
                      <span style={{fontSize:9,background:'rgba(26,26,26,0.06)',color:'rgba(26,26,26,0.4)',padding:'2px 8px',borderRadius:10,fontWeight:500}}>Coming Soon</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="res-header-right" style={{display:'flex',alignItems:'center',gap:8,position:'relative'}}>
            <LanguageSwitcher compact/>
            <div onClick={() => { setShowNotifications(!showNotifications); setSelectedNotifDetail(null); setShowResPropertyDropdown(false); }} style={{width:34,height:34,borderRadius:'50%',border:'1px solid rgba(200,188,178,0.3)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',position:'relative',background:'rgba(255,255,255,0.5)',backdropFilter:'blur(8px)',WebkitBackdropFilter:'blur(8px)'}}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(26,26,26,0.4)" strokeWidth="1.5"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
              {unreadCount > 0 && (
                <div style={{position:'absolute',top:-2,right:-2,minWidth:16,height:16,background:'#1a1a1a',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,color:'#fff',fontWeight:700,border:'2px solid rgba(236,228,223,0.95)',padding:'0 3px'}}>{unreadCount > 9 ? '9+' : unreadCount}</div>
              )}
            </div>
            {/* Notification dropdown popup */}
            {showNotifications && (
              <div style={{position:'absolute',top:42,right:-8,width:280,background:'rgba(255,255,255,0.55)',backdropFilter:'blur(12px)',WebkitBackdropFilter:'blur(12px)',borderRadius:18,boxShadow:'0 2px 12px rgba(120,100,90,0.06)',border:'1px solid rgba(255,255,255,0.5)',zIndex:999,overflow:'hidden'}}>
                <div style={{padding:'14px 16px 10px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{fontSize:13,fontWeight:600,color:'#1a1a1a'}}>{t('res.notifications')}</span>
                  {notifications.filter(n => !dismissedNotifIds.includes(n.id)).length > 0 && (
                    <span onClick={clearAllNotifs} style={{fontSize:11,color:'#a89a92',cursor:'pointer'}}>{t('res.clearAll')}</span>
                  )}
                </div>
                <div style={{maxHeight:300,overflowY:'auto'}}>
                  {selectedNotifDetail ? (
                    <div style={{padding:'4px 16px 12px'}}>
                      <div onClick={() => setSelectedNotifDetail(null)} style={{fontSize:11,color:'#a89a92',cursor:'pointer',marginBottom:10,display:'flex',alignItems:'center',gap:4}}>
                        <span style={{fontSize:14}}>‹</span> {t('res.back')}
                      </div>
                      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
                        <div style={{width:32,height:32,borderRadius:'50%',background:selectedNotifDetail.iconBg,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,color:selectedNotifDetail.iconColor,fontWeight:700}}>{selectedNotifDetail.icon}</div>
                        <div style={{flex:1}}>
                          <div style={{fontSize:13,fontWeight:600,color:'#1a1a1a'}}>{selectedNotifDetail.title}</div>
                          <div style={{fontSize:10,color:'#a89a92'}}>{selectedNotifDetail.time}</div>
                        </div>
                      </div>
                      <div style={{fontSize:12,color:'#7a6f66',lineHeight:'1.5',background:'rgba(26,26,26,0.03)',borderRadius:10,padding:10}}>{selectedNotifDetail.body}</div>
                      {selectedNotifDetail.visitor && (
                        <div style={{marginTop:8,background:'rgba(26,26,26,0.03)',borderRadius:10,padding:10}}>
                          <div style={{fontSize:10,fontWeight:600,color:'#1a1a1a',marginBottom:4}}>{t('res.visitorDetails')}</div>
                          <div style={{fontSize:11,color:'#7a6f66'}}>{t('res.typeLabel')}: {selectedNotifDetail.visitor.type}</div>
                          <div style={{fontSize:11,color:'#7a6f66'}}>{t('res.gateLabel')}: {selectedNotifDetail.visitor.gate || t('res.mainGate')}</div>
                          <div style={{fontSize:11,color:'#7a6f66'}}>{t('res.dateLabel')}: {selectedNotifDetail.visitor.date}</div>
                        </div>
                      )}
                    </div>
                  ) : (
                    notifications.filter(n => !dismissedNotifIds.includes(n.id)).length === 0 ? (
                      <div style={{padding:'16px 16px 12px',textAlign:'center',color:'#c4b8b0',fontSize:12}}>{t('res.noNewNotifs')}</div>
                    ) : (
                      notifications.filter(n => !dismissedNotifIds.includes(n.id)).map(n => (
                        <div key={n.id} style={{display:'flex',alignItems:'flex-start',gap:10,padding:'10px 16px',borderTop:'1px solid rgba(26,26,26,0.04)',cursor:'pointer'}}
                          onClick={() => setSelectedNotifDetail(n)}>
                          <div style={{width:30,height:30,borderRadius:'50%',background:n.iconBg,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,color:n.iconColor,fontWeight:700,flexShrink:0,marginTop:1}}>{n.icon}</div>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:12,fontWeight:600,color:'#1a1a1a',marginBottom:1}}>{n.title}</div>
                            <div style={{fontSize:11,color:'#a89a92',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{n.body}</div>
                            <div style={{fontSize:10,color:'#c4b8b0',marginTop:2}}>{n.time}</div>
                          </div>
                          <div onClick={(e) => { e.stopPropagation(); dismissNotif(n.id); }} style={{width:20,height:20,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',flexShrink:0,marginTop:1,color:'#c4b8b0',fontSize:14}} title="Dismiss">×</div>
                        </div>
                      ))
                    )
                  )}
                </div>
                <div onClick={() => { setShowNotifications(false); setCurrentPage('resAnnouncements'); }} style={{padding:'10px 16px',borderTop:'1px solid rgba(26,26,26,0.04)',textAlign:'center',fontSize:11,color:'#a89a92',cursor:'pointer',fontWeight:500}}>
                  View All ›
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {renderPage()}

      <div className="res-bottom-nav">
        <div className={`res-nav-item ${currentPage==='home'?'active':''}`} onClick={() => setCurrentPage('home')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill={currentPage==='home'?'#1a1a1a':'none'} stroke={currentPage==='home'?'#1a1a1a':'#888'} strokeWidth="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          <span>{t('res.home')}</span>
        </div>
        <div className={`res-nav-item ${currentPage==='viewall'||currentPage==='viewVisitor'?'active':''}`} onClick={() => setCurrentPage('viewall')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={currentPage==='viewall'||currentPage==='viewVisitor'?'#1a1a1a':'#888'} strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/></svg>
          <span>{t('res.visitors')}</span>
        </div>
        <div className={`res-nav-item ${currentPage==='book'?'active':''}`} onClick={() => setCurrentPage('book')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={currentPage==='book'?'#1a1a1a':'#888'} strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <span>{t('res.book')}</span>
        </div>
        <div className={`res-nav-item ${currentPage==='payment'?'active':''}`} onClick={() => setCurrentPage('payment')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={currentPage==='payment'?'#1a1a1a':'#888'} strokeWidth="1.5"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
          <span>{t('res.payments')}</span>
        </div>
        <div className={`res-nav-item ${currentPage==='household'?'active':''}`} onClick={() => setCurrentPage('household')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={currentPage==='household'?'#1a1a1a':'#888'} strokeWidth="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
          <span>{t('res.myHousehold')}</span>
        </div>
      </div>

      {showApprovalModal && selectedForApproval && (
        <div className="res-modal-overlay" onClick={() => setShowApprovalModal(false)}>
          <div className="res-modal" onClick={e => e.stopPropagation()}>
            <div className="res-approval-modal">
              <div className="avatar"><svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='#a89a92' stroke-width='1.5'><path d='M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z'/><circle cx='12' cy='13' r='4'/></svg></div>
              <div className="timer">04:57</div>
              <div className="visitor-info">
                <p style={{fontSize:14,fontWeight:600}}>{selectedForApproval.name}</p>
                <p style={{fontSize:12,color:'#8a7f76'}}>{selectedForApproval.type} • Gate Main</p>
              </div>
              <div className="action-buttons">
                <button className="approve-btn" onClick={handleConfirmApproval}>✓ Approve</button>
                <button className="deny-btn">✕ Deny</button>
              </div>
              <div style={{marginTop:16,fontSize:12,color:'#1a1a1a',textDecoration:'underline',cursor:'pointer'}}>Call Guard</div>
            </div>
          </div>
        </div>
      )}

      {/* Contact Head of Security Modal */}
      {helpModal === 'security' && (
        <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,.5)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:20}} onClick={() => setHelpModal(null)}>
          <div style={{background:'#fff',borderRadius:12,padding:24,maxWidth:380,width:'100%',boxShadow:'0 8px 32px rgba(0,0,0,.2)'}} onClick={e => e.stopPropagation()}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
              <h3 style={{margin:0,fontSize:16,fontWeight:600}}>Head of Security</h3>
              <button onClick={() => setHelpModal(null)} style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:'#a89a92'}}>&times;</button>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20}}>
              <div style={{width:48,height:48,borderRadius:'50%',background:'#928989',color:'#a89a92',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,fontWeight:700}}>AK</div>
              <div>
                <div style={{fontWeight:600,fontSize:14}}>Ahmed Khalil</div>
                <div style={{fontSize:12,color:'#a89a92'}}>Head of Security — Main Gate</div>
              </div>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              <a href="tel:+971551112222" style={{display:'flex',alignItems:'center',gap:10,padding:'12px 16px',background:'#f5f2ef',borderRadius:8,textDecoration:'none',color:'#1a1a1a'}}>
                <span style={{fontSize:18}}><svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.5'><path d='M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.11 2 2 0 014.11 2h3a2 2 0 012 1.72 12.05 12.05 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.05 12.05 0 002.81.7A2 2 0 0122 16.92z'/></svg></span>
                <div><div style={{fontSize:13,fontWeight:500}}>Phone Call</div><div style={{fontSize:12,color:'#a89a92'}}>+971 55 111 2222</div></div>
              </a>
              <a href="https://wa.me/971551112222" target="_blank" style={{display:'flex',alignItems:'center',gap:10,padding:'12px 16px',background:'#e0e5db',borderRadius:8,textDecoration:'none',color:'#1a1a1a'}}>
                <span style={{fontSize:18}}><svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.5'><path d='M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z'/></svg></span>
                <div><div style={{fontSize:13,fontWeight:500}}>WhatsApp</div><div style={{fontSize:12,color:'#a89a92'}}>+971 55 111 2222</div></div>
              </a>
              <a href="mailto:ahmed.khalil@secureguard.ae" style={{display:'flex',alignItems:'center',gap:10,padding:'12px 16px',background:'#f0f4ff',borderRadius:8,textDecoration:'none',color:'#1a1a1a'}}>
                <span style={{fontSize:18}}><svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.5'><rect x='2' y='4' width='20' height='16' rx='2'/><path d='M22 7l-10 7L2 7'/></svg></span>
                <div><div style={{fontSize:13,fontWeight:500}}>Email</div><div style={{fontSize:12,color:'#a89a92'}}>ahmed.khalil@secureguard.ae</div></div>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Contact Property Manager Modal */}
      {helpModal === 'pm' && (
        <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,.5)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:20}} onClick={() => setHelpModal(null)}>
          <div style={{background:'#fff',borderRadius:12,padding:24,maxWidth:380,width:'100%',boxShadow:'0 8px 32px rgba(0,0,0,.2)'}} onClick={e => e.stopPropagation()}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
              <h3 style={{margin:0,fontSize:16,fontWeight:600}}>Property Manager</h3>
              <button onClick={() => setHelpModal(null)} style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:'#a89a92'}}>&times;</button>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20}}>
              <div style={{width:48,height:48,borderRadius:'50%',background:'#928989',color:'#a89a92',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,fontWeight:700}}>HP</div>
              <div>
                <div style={{fontWeight:600,fontSize:14}}>Hassan Al-PM</div>
                <div style={{fontSize:12,color:'#a89a92'}}>Property Manager — Pinnacle Residences</div>
              </div>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              <a href="tel:+971509990001" style={{display:'flex',alignItems:'center',gap:10,padding:'12px 16px',background:'#f5f2ef',borderRadius:8,textDecoration:'none',color:'#1a1a1a'}}>
                <span style={{fontSize:18}}><svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.5'><path d='M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.11 2 2 0 014.11 2h3a2 2 0 012 1.72 12.05 12.05 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.05 12.05 0 002.81.7A2 2 0 0122 16.92z'/></svg></span>
                <div><div style={{fontSize:13,fontWeight:500}}>Phone Call</div><div style={{fontSize:12,color:'#a89a92'}}>+971 50 999 0001</div></div>
              </a>
              <a href="https://wa.me/971509990001" target="_blank" style={{display:'flex',alignItems:'center',gap:10,padding:'12px 16px',background:'#e0e5db',borderRadius:8,textDecoration:'none',color:'#1a1a1a'}}>
                <span style={{fontSize:18}}><svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.5'><path d='M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z'/></svg></span>
                <div><div style={{fontSize:13,fontWeight:500}}>WhatsApp</div><div style={{fontSize:12,color:'#a89a92'}}>+971 50 999 0001</div></div>
              </a>
              <a href="mailto:hassan@pinnaclepm.ae" style={{display:'flex',alignItems:'center',gap:10,padding:'12px 16px',background:'#f0f4ff',borderRadius:8,textDecoration:'none',color:'#1a1a1a'}}>
                <span style={{fontSize:18}}><svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.5'><rect x='2' y='4' width='20' height='16' rx='2'/><path d='M22 7l-10 7L2 7'/></svg></span>
                <div><div style={{fontSize:13,fontWeight:500}}>Email</div><div style={{fontSize:12,color:'#a89a92'}}>hassan@pinnaclepm.ae</div></div>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Report Incident Modal */}
      {helpModal === 'incident' && (
        <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,.5)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:20}} onClick={() => setHelpModal(null)}>
          <div style={{background:'#fff',borderRadius:12,padding:24,maxWidth:420,width:'100%',boxShadow:'0 8px 32px rgba(0,0,0,.2)',maxHeight:'90vh',overflowY:'auto'}} onClick={e => e.stopPropagation()}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
              <h3 style={{margin:0,fontSize:16,fontWeight:600}}>Report an Incident</h3>
              <button onClick={() => setHelpModal(null)} style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:'#a89a92'}}>&times;</button>
            </div>

            <div style={{marginBottom:16}}>
              <label style={{fontSize:12,color:'#8a7f76',fontWeight:500,display:'block',marginBottom:6}}>Incident Type</label>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                {['Security','Maintenance','Noise','Safety'].map(t => (
                  <div key={t} onClick={() => setIncidentForm(f => ({...f, type: t}))}
                    style={{padding:10,border: incidentForm.type===t ? '2px solid #1a1a1a' : '1px solid #e0e0e0',
                    borderRadius:6,textAlign:'center',cursor:'pointer',background: incidentForm.type===t ? '#faf8f5' : '#fff',
                    fontSize:12,fontWeight: incidentForm.type===t ? 600 : 400}}>
                    {t}
                  </div>
                ))}
              </div>
            </div>

            <div style={{marginBottom:16}}>
              <label style={{fontSize:12,color:'#8a7f76',fontWeight:500,display:'block',marginBottom:6}}>Location</label>
              <input value={incidentForm.location} onChange={e => setIncidentForm(f => ({...f, location: e.target.value}))}
                placeholder="e.g. Lobby Tower A, Parking Level 2, Pool Area..."
                style={{width:'100%',padding:12,border:'1px solid #ebe7e3',borderRadius:6,fontSize:13,outline:'none',boxSizing:'border-box'}} />
            </div>

            <div style={{marginBottom:20}}>
              <label style={{fontSize:12,color:'#8a7f76',fontWeight:500,display:'block',marginBottom:6}}>Description</label>
              <textarea value={incidentForm.description} onChange={e => setIncidentForm(f => ({...f, description: e.target.value}))}
                placeholder="Please describe the incident in detail..."
                rows={4}
                style={{width:'100%',padding:12,border:'1px solid #ebe7e3',borderRadius:6,fontSize:13,outline:'none',resize:'vertical',boxSizing:'border-box'}} />
            </div>

            <button onClick={() => {
              if (!incidentForm.description.trim()) { showToast('Please describe the incident'); return; }
              showToast('Incident reported — Security and PM have been notified');
              setIncidentForm({ type: 'Security', location: '', description: '' });
              setHelpModal(null);
            }} style={{width:'100%',padding:14,background:'#c0392b',color:'#fff',border:'none',borderRadius:6,fontSize:14,fontWeight:600,cursor:'pointer',letterSpacing:'0.03em',marginBottom:10}}>
              Submit Incident Report
            </button>
            <button onClick={() => setHelpModal(null)} style={{width:'100%',padding:12,background:'none',color:'#a89a92',border:'1px solid #ebe7e3',borderRadius:6,fontSize:13,cursor:'pointer'}}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Booking Modal — amenity or service */}
      {showServiceBookingModal && (
        <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,.5)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:20}} onClick={() => setShowServiceBookingModal(false)}>
          <div style={{background:'#fff',borderRadius:12,padding:24,maxWidth:420,width:'100%',boxShadow:'0 8px 32px rgba(0,0,0,.2)'}} onClick={e => e.stopPropagation()}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
              <h3 style={{margin:0,fontSize:16,fontWeight:600}}>Book {serviceBooking.type || (bookingMode === 'service' ? 'Service' : 'Amenity')}</h3>
              <button onClick={() => setShowServiceBookingModal(false)} style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:'#a89a92'}}>&times;</button>
            </div>
            <div style={{marginBottom:16}}>
              <label style={{fontSize:12,color:'#8a7f76',fontWeight:500,display:'block',marginBottom:6}}>{bookingMode === 'service' ? 'Service Type' : 'Amenity Type'}</label>
              {serviceBooking.type ? (
                <input value={serviceBooking.type} disabled style={{width:'100%',padding:10,border:'1px solid #e0e0e0',borderRadius:6,fontSize:13,background:'#f5f5f5',color:'#8a8a8a'}}/>
              ) : (
                <select value={serviceBooking.type} onChange={e => setServiceBooking(f => ({...f, type: e.target.value}))} style={{width:'100%',padding:12,border:'1px solid #ebe7e3',borderRadius:6,fontSize:15,outline:'none'}}>
                  {bookingMode === 'service' ? (
                    <>{['', 'Plumbing', 'Electrician', 'Housekeeping', 'AC Repair', 'Pest Control', 'Locksmith', 'Painter', 'Carpenter'].map(v => <option key={v} value={v}>{v || 'Select service'}</option>)}</>
                  ) : (
                    <>{['', 'Swimming Pool', 'Table Tennis', 'Squash', 'Gym', 'Sauna', 'BBQ Area', 'Kids Area', 'Yoga Room'].map(v => <option key={v} value={v}>{v || 'Select amenity'}</option>)}</>
                  )}
                </select>
              )}
            </div>
            {bookingMode === 'service' && (
            <div style={{marginBottom:16}}>
              <label style={{fontSize:12,color:'#8a7f76',fontWeight:500,display:'block',marginBottom:6}}>Location</label>
              <select value={serviceBooking.location} onChange={e => setServiceBooking(f => ({...f, location: e.target.value}))} style={{width:'100%',padding:12,border:'1px solid #ebe7e3',borderRadius:6,fontSize:15,outline:'none'}}>
                {['', 'Kitchen', 'Bathroom', 'Bedroom', 'Living Room', 'Common Area', 'Balcony'].map(v => <option key={v} value={v}>{v || 'Select location'}</option>)}
              </select>
            </div>
            )}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
              <div>
                <label style={{fontSize:12,color:'#8a7f76',fontWeight:500,display:'block',marginBottom:6}}>Date <span style={{color:'#c0392b'}}>*</span></label>
                <input type="date" value={serviceBooking.date} min={new Date().toISOString().split('T')[0]} onChange={e => setServiceBooking(f => ({...f, date: e.target.value}))} style={{width:'100%',padding:10,border:'1px solid #ebe7e3',borderRadius:6,fontSize:13,outline:'none'}}/>
              </div>
              <div>
                <label style={{fontSize:12,color:'#8a7f76',fontWeight:500,display:'block',marginBottom:6}}>Time <span style={{color:'#c0392b'}}>*</span></label>
                <input type="time" value={serviceBooking.time} onChange={e => setServiceBooking(f => ({...f, time: e.target.value}))} style={{width:'100%',padding:10,border:'1px solid #ebe7e3',borderRadius:6,fontSize:13,outline:'none'}}/>
              </div>
            </div>
            {bookingMode === 'amenity' ? (
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
                <div>
                  <label style={{fontSize:12,color:'#8a7f76',fontWeight:500,display:'block',marginBottom:6}}>Duration</label>
                  <select value={serviceBooking.duration} onChange={e => setServiceBooking(f => ({...f, duration: e.target.value}))} style={{width:'100%',padding:10,border:'1px solid #ebe7e3',borderRadius:6,fontSize:13,outline:'none'}}>
                    <option value="1 hour">1 hour</option><option value="2 hours">2 hours</option><option value="3 hours">3 hours</option><option value="4 hours">4 hours</option><option value="Half day">Half day</option><option value="Full day">Full day</option>
                  </select>
                </div>
                <div>
                  <label style={{fontSize:12,color:'#8a7f76',fontWeight:500,display:'block',marginBottom:6}}>Number of People</label>
                  <input type="number" value={serviceBooking.guests} onChange={e => setServiceBooking(f => ({...f, guests: parseInt(e.target.value)||1}))} min="1" max="10" style={{width:'100%',padding:10,border:'1px solid #ebe7e3',borderRadius:6,fontSize:13,outline:'none'}}/>
                </div>
              </div>
            ) : (
              <div style={{marginBottom:16}}>
                <label style={{fontSize:12,color:'#8a7f76',fontWeight:500,display:'block',marginBottom:6}}>Urgency</label>
                <select value={serviceBooking.guests} onChange={e => setServiceBooking(f => ({...f, guests: e.target.value}))} style={{width:'100%',padding:10,border:'1px solid #ebe7e3',borderRadius:6,fontSize:13,outline:'none'}}>
                  <option value="Normal">Normal</option><option value="Urgent">Urgent</option><option value="Emergency">Emergency</option>
                </select>
              </div>
            )}
            <div style={{marginBottom:16}}>
              <label style={{fontSize:12,color:'#8a7f76',fontWeight:500,display:'block',marginBottom:6}}>Comments</label>
              <textarea value={serviceBooking.comments || ''} onChange={e => setServiceBooking(f => ({...f, comments: e.target.value}))} placeholder={bookingMode === 'service' ? 'Describe the issue or any special requirements...' : 'Any special requests or notes...'} rows={3} style={{width:'100%',padding:10,border:'1px solid #ebe7e3',borderRadius:6,fontSize:13,outline:'none',resize:'vertical',boxSizing:'border-box'}}/>
            </div>
            <button onClick={() => {
              if (!serviceBooking.type || !serviceBooking.date || !serviceBooking.time) {showToast('Please fill in all required fields'); return;}
              if (bookingMode === 'service' && !serviceBooking.location) {showToast('Please select a location'); return;}
              const autoLocation = bookingMode === 'amenity' ? 'Ground Floor' : serviceBooking.location;
              if (bookingMode === 'service') {
                setData(prev => ({...prev, serviceRequests: [...prev.serviceRequests, {id: 'SR-'+Date.now(), type: serviceBooking.type, flat: 'B-102', resident: 'Nitin Sharma', date: serviceBooking.date, time: serviceBooking.time, status: 'Pending Approval', location: serviceBooking.location, urgency: serviceBooking.guests, comments: serviceBooking.comments || ''}]}));
              } else if (editingAmenityId) {
                setData(prev => ({...prev, amenityBookings: (prev.amenityBookings||[]).map(b => b.id === editingAmenityId ? {...b, type: serviceBooking.type, date: serviceBooking.date, time: serviceBooking.time, duration: serviceBooking.duration, guests: serviceBooking.guests, location: autoLocation, comments: serviceBooking.comments || ''} : b)}));
                showToast(serviceBooking.type + ' booking updated');
              } else {
                const booking = {id: 'BK-'+Date.now(), type: serviceBooking.type, location: autoLocation, date: serviceBooking.date, time: serviceBooking.time, duration: serviceBooking.duration, guests: serviceBooking.guests, comments: serviceBooking.comments || '', status:'Confirmed'};
                setData(prev => ({...prev, amenityBookings: [...(prev.amenityBookings||[]), booking]}));
              }
              if (!editingAmenityId) showToast(serviceBooking.type + ' booked for ' + serviceBooking.date + ' at ' + serviceBooking.time);
              setShowServiceBookingModal(false); setEditingAmenityId(null); setServiceBooking({type:'', location:'', date:'', time:'', duration:'1 hour', guests:1, comments:''});
            }} style={{width:'100%',padding:14,background:'#928989',color:'#fff',border:'none',borderRadius:6,fontSize:14,fontWeight:600,cursor:'pointer',marginBottom:10}}>
              {bookingMode === 'service' ? 'Book Service' : (editingAmenityId ? 'Update Booking' : 'Book Amenity')}
            </button>
            <button onClick={() => { setShowServiceBookingModal(false); setEditingAmenityId(null); }} style={{width:'100%',padding:12,background:'none',color:'#a89a92',border:'1px solid #ebe7e3',borderRadius:6,fontSize:13,cursor:'pointer'}}>Cancel</button>
          </div>
        </div>
      )}

      {/* Amenity Booking Detail Modal — edit / delete */}
      {showAmenityDetail && (
        <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,.5)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:20}} onClick={() => setShowAmenityDetail(null)}>
          <div style={{background:'#fff',borderRadius:12,padding:24,maxWidth:380,width:'100%',boxShadow:'0 8px 32px rgba(0,0,0,.2)'}} onClick={e => e.stopPropagation()}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
              <h3 style={{margin:0,fontSize:16,fontWeight:600}}>{showAmenityDetail.type}</h3>
              <button onClick={() => setShowAmenityDetail(null)} style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:'#a89a92'}}>&times;</button>
            </div>
            <div style={{marginBottom:20}}>
              {(() => {
                const b = showAmenityDetail;
                const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                const dp = b.date.split('-');
                const dateLabel = dp.length === 3 ? (parseInt(dp[2]) + ' ' + months[parseInt(dp[1])-1] + ' ' + dp[0]) : b.date;
                return (
                  <div style={{display:'flex',flexDirection:'column',gap:10}}>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:13,color:'#1a1a1a'}}><span style={{color:'#8a7f76'}}>Date</span><span style={{fontWeight:500}}>{dateLabel}</span></div>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:13,color:'#1a1a1a'}}><span style={{color:'#8a7f76'}}>Time</span><span style={{fontWeight:500}}>{b.time}</span></div>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:13,color:'#1a1a1a'}}><span style={{color:'#8a7f76'}}>Duration</span><span style={{fontWeight:500}}>{b.duration}</span></div>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:13,color:'#1a1a1a'}}><span style={{color:'#8a7f76'}}>People</span><span style={{fontWeight:500}}>{b.guests}</span></div>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:13,color:'#1a1a1a'}}><span style={{color:'#8a7f76'}}>Status</span><span style={{fontWeight:500,color:'#5a6b4f'}}>{b.status}</span></div>
                  </div>
                );
              })()}
            </div>
            <button onClick={() => {
              setBookingMode('amenity');
              setEditingAmenityId(showAmenityDetail.id);
              setServiceBooking({type: showAmenityDetail.type, location: showAmenityDetail.location || '', date: showAmenityDetail.date, time: showAmenityDetail.time, duration: showAmenityDetail.duration, guests: showAmenityDetail.guests, comments: showAmenityDetail.comments || ''});
              setShowAmenityDetail(null);
              setShowServiceBookingModal(true);
            }} style={{width:'100%',padding:13,background:'#928989',color:'#fff',border:'none',borderRadius:6,fontSize:14,fontWeight:600,cursor:'pointer',marginBottom:8}}>Edit Booking</button>
            <button onClick={() => {
              setData(prev => ({...prev, amenityBookings: (prev.amenityBookings||[]).filter(b => b.id !== showAmenityDetail.id)}));
              showToast(showAmenityDetail.type + ' booking cancelled');
              setShowAmenityDetail(null);
            }} style={{width:'100%',padding:13,background:'none',color:'#c0392b',border:'1px solid #e0d5d0',borderRadius:6,fontSize:14,fontWeight:600,cursor:'pointer',marginBottom:8}}>Cancel Booking</button>
            <button onClick={() => setShowAmenityDetail(null)} style={{width:'100%',padding:12,background:'none',color:'#a89a92',border:'1px solid #ebe7e3',borderRadius:6,fontSize:13,cursor:'pointer'}}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
};

