// ==================== PRE-APPROVE FORM + QR CODE ====================
const PreApproveForm = ({ onBack, showToast, data, setData }) => {
  const [step, setStep] = useState('form'); // form | review | qr
  const [visitorType, setVisitorType] = useState('Resident Guest');
  const [entryType, setEntryType] = useState('Walk-in');
  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [additionalVisitors, setAdditionalVisitors] = useState(0);
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [idDocType, setIdDocType] = useState('Passport');
  const [docNumber, setDocNumber] = useState('');
  const [remarks, setRemarks] = useState('');
  const [visitDate, setVisitDate] = useState('');
  const [visitTime, setVisitTime] = useState('');
  const [repeater, setRepeater] = useState('Single Visit');
  const [qrData, setQrData] = useState(null);
  const [preApproveErrors, setPreApproveErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const qrRef = useRef(null);
  const qrInstance = useRef(null);

  // If signed in as a real resident, pull their actual name/flat/building from Supabase Auth
  // so the QR payload, visitor entry, and schedule entries carry true values instead of legacy
  // hardcoded "B-102 / Nitin Sharma / Sky Tower". Falls back to those defaults for demo logins.
  const [authResident, setAuthResident] = useState(null);
  useEffect(() => {
    if (!supabaseClient) return;
    let mounted = true;
    (async () => {
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        const userId = session && session.user && session.user.id;
        const role = session && session.user && session.user.app_metadata && session.user.app_metadata.role;
        if (!userId || role !== 'resident') return;
        const [{ data: profile }, { data: ra }] = await Promise.all([
          supabaseClient.from('profiles').select('id,full_name').eq('id', userId).maybeSingle(),
          supabaseClient.from('resident_assignments').select('unit_id').eq('profile_id', userId).maybeSingle(),
        ]);
        if (!mounted || !ra) return;
        const { data: unit } = await supabaseClient.from('units').select('id,floor,unit_number,building_id').eq('id', ra.unit_id).maybeSingle();
        const { data: building } = unit ? await supabaseClient.from('buildings').select('name').eq('id', unit.building_id).maybeSingle() : { data: null };
        if (mounted) setAuthResident({
          name: (profile && profile.full_name) || 'Resident',
          flat: (unit && unit.unit_number) || 'B-102',
          building: (building && building.name) || 'Sky Tower - The Pinnacle Residences',
          floor: unit && unit.floor,
        });
      } catch (_) { /* fall back to defaults */ }
    })();
    return () => { mounted = false; };
  }, []);
  const r_flat = (authResident && authResident.flat) || 'B-102';
  const r_name = (authResident && authResident.name) || 'Nitin Sharma';
  const r_building = (authResident && authResident.building) || 'Sky Tower - The Pinnacle Residences';

  const generatePermitRef = () => {
    const d = new Date();
    const num = Math.floor(Math.random() * 9000) + 1000;
    return 'VPR-' + d.getFullYear() + '-' + num;
  };

  const handleSubmit = async () => {
    if (!fullName.trim()) { showToast('Visitor name is required'); return; }
    if (!/^[a-zA-Z\s]+$/.test(fullName)) { showToast('Visitor name must contain only letters and spaces'); return; }
    if (!mobile.trim()) { showToast('Please enter mobile number'); return; }

    // Block past dates and past times for today
    if (visitDate) {
      const todayStr = new Date().toISOString().split('T')[0];
      if (visitDate < todayStr) { showToast('Cannot pre-approve a visitor for a past date'); return; }
      if (visitDate === todayStr && visitTime) {
        const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
        const [h, m] = visitTime.split(':').map(Number);
        if (h * 60 + m < nowMinutes) { showToast('Cannot pre-approve a visitor for a past time today'); return; }
      }
    }

    const permitRef = generatePermitRef();
    const now = new Date();
    const baseDate = visitDate ? new Date(visitDate) : now;
    // Calculate validity based on repeater type
    let validUntil = '';
    let repeaterLabel = repeater;
    if (repeater === 'Single Visit') {
      validUntil = (visitDate || now.toLocaleDateString('en-GB')) + ' 23:59';
    } else {
      validUntil = 'Until cancelled';
    }
    const qrPayload = {
      permit: permitRef,
      property: r_building,
      unit: r_flat,
      resident: r_name,
      visitor: fullName.trim(),
      mobile: mobile.trim(),
      type: visitorType,
      entry: entryType,
      guests: additionalVisitors + 1,
      vehicle: vehicleNumber || 'N/A',
      idDoc: idDocType + (docNumber ? ': ' + docNumber : ''),
      date: visitDate || now.toLocaleDateString('en-GB'),
      time: visitTime || now.toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit'}),
      validUntil: validUntil,
      repeater: repeater,
      status: 'PRE-APPROVED',
      created: now.toISOString()
    };

    setQrData(qrPayload);
    setStep('review'); setIsSubmitting(false);
    // Visitor is NOT saved to the system yet — only saved when resident clicks "Pre-Approve" on the review page
  };

  // Called when resident confirms pre-approval on the review page
  const confirmPreApproval = async () => {
    if (!qrData) return;
    const visitorEntry = {
      id: 'PA-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
      name: qrData.visitor,
      resident: r_name,
      flat: r_flat,
      contact: qrData.mobile,
      type: qrData.type,
      purpose: 'Personal visit',
      gate: 'Main Gate',
      status: 'Pre-Approved',
      time: qrData.time,
      date: qrData.date,
      permitRef: qrData.permit,
      duration: '—',
      qrCode: 'Pre-approved',
      repeater: qrData.repeater || 'Single Visit',
      validUntil: qrData.validUntil,
      approvedBy: 'Resident',
      qrPayload: qrData
    };
    // Pre-approved visitors do NOT go into the entry log — entry log is only for people who actually entered the building.
    // They will be added to the entry log by security when they physically arrive and pass the gate.
    const scheduleEntry = { time: qrData.time, description: qrData.visitor + ' — ' + qrData.type, flat: r_flat, type: qrData.type };
    const pmScheduleEntry = { time: qrData.time, name: qrData.visitor + ' (' + qrData.type + ')', flat: r_flat, type: qrData.type };
    setData(prev => ({
      ...prev,
      visitors: [visitorEntry, ...prev.visitors],
      todayScheduleSecurity: [...prev.todayScheduleSecurity, scheduleEntry].sort((a, b) => a.time.localeCompare(b.time)),
      todaySchedule: [...prev.todaySchedule, pmScheduleEntry].sort((a, b) => a.time.localeCompare(b.time))
    }));

    // Dual-write: if signed in as a real Supabase resident, ALSO insert into the new visits table
    // so the security side's UpcomingVisitsPanel can render it. Legacy JSON flow still works either way.
    if (supabaseClient) {
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        const userId = session && session.user && session.user.id;
        const role = session && session.user && session.user.app_metadata && session.user.app_metadata.role;
        if (userId && role === 'resident') {
          const { data: ra } = await supabaseClient.from('resident_assignments').select('unit_id').eq('profile_id', userId).maybeSingle();
          if (ra && ra.unit_id) {
            const typeMap = {
              'Resident Guest': 'Resident Guest',
              'Service Vendor': 'Service Vendor',
              'Delivery / Courier': 'Delivery',
              'Delivery': 'Delivery',
              'Contractor / Worker': 'Contractor',
              'Contractor': 'Contractor',
            };
            const dbType = typeMap[qrData.type] || 'Resident Guest';
            let visitDateIso;
            try {
              const parts = (qrData.date || '').split('/');
              if (parts.length === 3) {
                visitDateIso = parts[2] + '-' + String(parts[1]).padStart(2,'0') + '-' + String(parts[0]).padStart(2,'0');
              } else {
                visitDateIso = new Date().toISOString().slice(0,10);
              }
            } catch (_) { visitDateIso = new Date().toISOString().slice(0,10); }
            await supabaseClient.from('visits').insert({
              unit_id: ra.unit_id,
              type: dbType,
              visitor_name: qrData.visitor,
              visitor_phone: qrData.mobile || null,
              visit_date: visitDateIso,
              status: 'Pre-Approved',
              permit_ref: qrData.permit,
              created_by: userId,
              vehicle: (qrData.vehicle && qrData.vehicle !== 'N/A') ? qrData.vehicle : null,
            });
          }
        }
      } catch (e) { /* silent — legacy flow still works */ }
    }

    showToast('Pre-approval confirmed and saved!');
    setStep('qr');
  };

  // QR contains just the permit ref — scanned only through Security app
  const getQrImgUrl = (permit) => 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' + encodeURIComponent(permit || 'UNKNOWN');

  useEffect(() => {
    if (step === 'qr' && qrData && qrRef.current) {
      try {
        qrRef.current.innerHTML = '<img src="' + getQrImgUrl(qrData.permit) + '" width="280" height="280" style="display:block;margin:0 auto;" crossorigin="anonymous" />';
      } catch (error) {
        qrRef.current.innerHTML = '<div style="padding:40px 20px;text-align:center;color:#8b4a42;font-size:13px;background:#fff5f5;border-radius:6px;">QR code could not be generated. Please check your connection and try again.</div>';
      }
    }
  }, [step, qrData]);

  const getShareText = () => {
    const d = qrData;
    if (!d) return '';
    return [
      'VARS — Visitor Pre-Approval*',
      '',
      '✅ Your visit has been pre-approved!',
      '',
      'Permit: ' + d.permit,
      'Property: ' + d.property,
      'Unit: ' + d.unit,
      'Host: ' + d.resident,
      'Date: ' + d.date,
      '⏰ Time: ' + d.time,
      'Vehicle: ' + d.vehicle,
      'Repeater: ' + (d.repeater || 'Single Visit'),
      '',
      'Show this message or QR code at the gate.',
      'Valid until: ' + d.validUntil
    ].join('\n');
  };

  const getQrBlob = () => {
    return new Promise((resolve) => {
      if (!qrRef.current) { resolve(null); return; }
      const img = qrRef.current.querySelector('img');
      if (!img) { resolve(null); return; }
      const drawPass = () => {
        const pad = 40, w = 400, qrSize = 180;
        const passCanvas = document.createElement('canvas');
        passCanvas.width = w; passCanvas.height = 620;
        const ctx = passCanvas.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, 620);
        ctx.fillStyle = '#ae9751'; ctx.fillRect(0, 0, w, 4);
        ctx.fillStyle = '#1a1a1a'; ctx.font = 'bold 18px Arial'; ctx.textAlign = 'center';
        ctx.fillText('VARS — Visitor Pass', w/2, 36);
        ctx.fillStyle = '#2d6a4f'; ctx.font = 'bold 13px Arial';
        ctx.fillText('PRE-APPROVED', w/2, 58);
        ctx.drawImage(img, (w - qrSize) / 2, 72, qrSize, qrSize);
        ctx.fillStyle = '#1a1a1a'; ctx.font = 'bold 14px Arial';
        ctx.fillText(qrData ? qrData.permit : '', w/2, 272);
        ctx.textAlign = 'left'; ctx.font = '12px Arial';
        const details = qrData ? [
          ['Visitor', qrData.visitor], ['Phone', qrData.mobile], ['Property', qrData.property],
          ['Unit', qrData.unit], ['Host', qrData.resident], ['Type', qrData.type],
          ['Date', qrData.date], ['Time', qrData.time], ['Vehicle', qrData.vehicle],
          ['Repeater', qrData.repeater || 'Single Visit'], ['Valid Until', qrData.validUntil],
        ] : [];
        let y = 298;
        details.forEach(([label, val]) => {
          ctx.fillStyle = '#8a8a8a'; ctx.font = '11px Arial'; ctx.fillText(label, pad, y);
          ctx.fillStyle = '#1a1a1a'; ctx.font = '12px Arial'; ctx.fillText(val || '', 140, y); y += 24;
        });
        ctx.strokeStyle = '#e8e8e8'; ctx.beginPath(); ctx.moveTo(pad, y+4); ctx.lineTo(w-pad, y+4); ctx.stroke();
        ctx.fillStyle = '#8a8a8a'; ctx.font = '10px Arial'; ctx.textAlign = 'center';
        ctx.fillText('Show this pass or scan QR code at the gate', w/2, y + 24);
        ctx.fillText('VARS Property Management System', w/2, y + 40);
        passCanvas.toBlob((blob) => { resolve(blob); }, 'image/png');
      };
      if (img.complete) { drawPass(); } else { img.onload = drawPass; img.onerror = () => resolve(null); }
    });
  };

  const getPassFile = async () => {
    const blob = await getQrBlob();
    if (!blob) return null;
    return new File([blob], 'VARS-PM-Pass-' + (qrData ? qrData.permit : 'QR') + '.png', { type: 'image/png' });
  };

  const sharePass = async () => {
    const file = await getPassFile();
    if (!navigator.share || !navigator.canShare) {
      showToast('Sharing is not supported on this device. You can download the QR code instead.');
      await savePassImage();
      return;
    }
    if (file && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
        showToast('Could not share. Please try downloading instead.');
      }
    }
    // Fallback: save image so user can attach it manually
    await savePassImage();
    showToast('Image saved — attach it in WhatsApp or Telegram');
  };

  const shareToWhatsApp = async () => {
    const file = await getPassFile();
    if (!navigator.share || !navigator.canShare) {
      await savePassImage();
      window.open('https://api.whatsapp.com/send?text=' + encodeURIComponent('Here is your visitor pass for ' + (qrData ? qrData.property : 'Sky Tower') + '. Please show the attached QR image at the gate.'), '_blank');
      showToast('Image saved — attach it in the WhatsApp chat');
      return;
    }
    if (file && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
        showToast('Could not share. Please try downloading instead.');
      }
    }
    // Fallback: save + open WhatsApp so user can attach
    await savePassImage();
    window.open('https://api.whatsapp.com/send?text=' + encodeURIComponent('Here is your visitor pass for ' + (qrData ? qrData.property : 'Sky Tower') + '. Please show the attached QR image at the gate.'), '_blank');
    showToast('Image saved — attach it in the WhatsApp chat');
  };

  const shareToTelegram = async () => {
    const file = await getPassFile();
    if (!navigator.share || !navigator.canShare) {
      await savePassImage();
      return;
    }
    if (file && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
        showToast('Could not share. Please try downloading instead.');
      }
    }
    await savePassImage();
    window.open('https://t.me/share/url?url=' + encodeURIComponent('VARS Visitor Pass') + '&text=' + encodeURIComponent('Here is your visitor pass. Please show the attached QR image at the gate.'), '_blank');
    showToast('Image saved — attach it in the Telegram chat');
  };

  const savePassImage = async () => {
    const blob = await getQrBlob();
    if (!blob) { showToast('Could not generate image'); return; }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = 'VARS-PM-Pass-' + (qrData ? qrData.permit : 'QR') + '.png';
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  // ---- STEP 2: REVIEW SCREEN (pass details, not yet saved) ----
  if (step === 'review') {
    return (
      <div className="res-content" style={{paddingBottom:80}}>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:20}}>
          <button onClick={() => {setStep('form');}} style={{background:'none',border:'none',fontSize:18,cursor:'pointer',color:'#6b5d52'}}>←</button>
          <h3 style={{fontSize:18,fontWeight:600,letterSpacing:'-0.01em',margin:0}}>Review Pre-Approval</h3>
        </div>

        <div style={{background:'#fff',border:'1px solid #ebe7e3',borderRadius:6,padding:20,marginBottom:16}}>
          <div style={{fontSize:11,color:'#a89a92',letterSpacing:'0.06em',textTransform:'uppercase',marginBottom:12,fontWeight:600}}>Pass Details</div>
          {qrData && (() => {
            const rows = [
              ['Property', qrData.property],
              ['Unit / Flat', qrData.unit],
              ['Host', qrData.resident],
              ['Visitor', qrData.visitor],
              ['Phone', qrData.mobile],
              ['Type', qrData.type],
              ['Total Guests', String(qrData.guests)],
              ['Vehicle', qrData.vehicle],
              ['Date', qrData.date],
              ['Time', qrData.time],
              ['Repeater', qrData.repeater || 'Single Visit'],
              ['Valid Until', qrData.validUntil],
            ];
            return rows.map(([label, val], i) => (
              <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom: i < rows.length - 1 ? '1px solid #f0f0f0' : 'none'}}>
                <span style={{fontSize:12,color:'#a89a92'}}>{label}</span>
                <span style={{fontSize:12,color: label === 'Valid Until' && val === 'Until cancelled' ? '#2d6a4f' : '#1a1a1a',fontWeight:500,textAlign:'right',maxWidth:'60%'}}>{val}</span>
              </div>
            ));
          })()}
        </div>

        <button onClick={() => setStep('form')} style={{width:'100%',padding:14,background:'#fff',color:'#1a1a1a',border:'1px solid #d5cfc8',borderRadius:6,fontSize:14,fontWeight:500,cursor:'pointer',marginBottom:12,letterSpacing:'0.03em'}}>
          Edit Details
        </button>

        <button onClick={confirmPreApproval} style={{width:'100%',padding:16,background:'#5a6b4f',color:'#fff',border:'none',borderRadius:6,fontSize:15,fontWeight:700,cursor:'pointer',letterSpacing:'0.04em'}}>
          Pre-Approve Visitor
        </button>
      </div>
    );
  }

  // ---- STEP 3: QR CODE SCREEN (after confirmed, visitor saved) ----
  if (step === 'qr') {
    return (
      <div className="res-content" style={{paddingBottom:80}}>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:20}}>
          <button onClick={onBack} style={{background:'none',border:'none',fontSize:18,cursor:'pointer',color:'#6b5d52'}}>←</button>
          <h3 style={{fontSize:18,fontWeight:600,letterSpacing:'-0.01em',margin:0}}>Visitor Pre-Approved</h3>
        </div>

        <div style={{background:'#fff',border:'1px solid #ebe7e3',borderRadius:6,padding:24,textAlign:'center',marginBottom:16}}>
          <div style={{background:'#e0e5db',color:'#5a6b4f',padding:'8px 16px',borderRadius:4,display:'inline-block',fontSize:13,fontWeight:600,letterSpacing:'0.04em',marginBottom:16}}>VISITOR PRE-APPROVED</div>
          <div ref={qrRef} style={{display:'flex',justifyContent:'center',marginBottom:16}}></div>
          <div style={{fontSize:11,color:'#a89a92',marginBottom:8}}>Scan this QR code at the gate</div>
          <div style={{fontSize:14,fontWeight:600,color:'#1a1a1a',marginBottom:4}}>{qrData && qrData.permit}</div>
          <div style={{fontSize:12,color:'#6b5d52',marginBottom:4}}>{qrData && qrData.visitor}</div>
          <div style={{fontSize:11,color:'#a89a92'}}>{qrData && qrData.type} · {qrData && qrData.date} · {qrData && qrData.time}</div>
          {qrData && qrData.repeater && qrData.repeater !== 'Single Visit' && (
            <div style={{fontSize:11,color:'#5a5470',marginTop:4}}>Multiple Entry — Valid until cancelled</div>
          )}
        </div>

        <button onClick={sharePass} style={{width:'100%',padding:14,background:'#fff',color:'#1a1a1a',border:'1px solid #d5cfc8',borderRadius:6,fontSize:14,fontWeight:500,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:8,marginBottom:12,letterSpacing:'0.03em'}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13"/></svg>
          Share QR Pass
        </button>

        <button onClick={onBack} style={{width:'100%',padding:14,background:'#928989',color:'#fff',border:'none',borderRadius:6,fontSize:14,fontWeight:600,cursor:'pointer',letterSpacing:'0.03em'}}>
          Done
        </button>
      </div>
    );
  }

  // ---- FORM SCREEN ----
  return (
    <div className="res-content" style={{paddingBottom:80}}>
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:20}}>
        <button onClick={onBack} style={{background:'none',border:'none',fontSize:18,cursor:'pointer',color:'#6b5d52'}}>←</button>
        <div>
          <h3 style={{fontSize:18,fontWeight:600,letterSpacing:'-0.01em',margin:0}}>Pre-Approved Request</h3>
          <div style={{fontSize:11,color:'#a89a92',letterSpacing:'0.04em'}}>Create Request</div>
        </div>
      </div>

      {/* Guest Type */}
      <div style={{background:'#fff',border:'1px solid #ebe7e3',borderRadius:6,padding:20,marginBottom:12}}>
        <div style={{fontSize:11,color:'#a89a92',letterSpacing:'0.06em',textTransform:'uppercase',marginBottom:10,fontWeight:600}}>Visitor Type *</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
          {['Resident Guest','Contractor / Worker','Delivery / Courier','Domestic Staff','Service Vendor','Other / Misc.'].map(t => (
            <div key={t} onClick={() => setVisitorType(t)}
              style={{padding:'12px 8px',border: visitorType===t ? '2px solid #1a1a1a' : '1px solid #e0e0e0',
              borderRadius:6,textAlign:'center',cursor:'pointer',background: visitorType===t ? '#faf8f5' : '#fff',
              fontSize:12,fontWeight: visitorType===t ? 600 : 400,color:'#1a1a1a',transition:'all .15s'}}>
              {t}
            </div>
          ))}
        </div>
      </div>

      {/* Visitor Identity */}
      <div style={{background:'#fff',border:'1px solid #ebe7e3',borderRadius:6,padding:20,marginBottom:12}}>
        <div style={{fontSize:11,color:'#a89a92',letterSpacing:'0.06em',textTransform:'uppercase',marginBottom:14,fontWeight:600}}>Visitor Identity</div>

        <div style={{marginBottom:14}}>
          <label style={{fontSize:12,color:'#6b5d52',fontWeight:500,marginBottom:4,display:'block'}}>Full Name *</label>
          <input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Enter visitor full name..."
            style={{width:'100%',padding:12,border:preApproveErrors.fullName ? '2px solid #d32f2f' : '1px solid #ebe7e3',borderRadius:6,fontSize:14,outline:'none',boxSizing:'border-box'}} />
          {preApproveErrors.fullName && <div style={{fontSize:11,color:'#d32f2f',marginTop:4}}>{preApproveErrors.fullName}</div>}
        </div>

        <div style={{marginBottom:14}}>
          <label style={{fontSize:12,color:'#6b5d52',fontWeight:500,marginBottom:4,display:'block'}}>Mobile Number *</label>
          <input value={mobile} onChange={e => setMobile(e.target.value)} placeholder="+971 XX XXX XXXX" type="tel"
            style={{width:'100%',padding:12,border:preApproveErrors.mobile ? '2px solid #d32f2f' : '1px solid #ebe7e3',borderRadius:6,fontSize:14,outline:'none',boxSizing:'border-box'}} />
          {preApproveErrors.mobile && <div style={{fontSize:11,color:'#d32f2f',marginTop:4}}>{preApproveErrors.mobile}</div>}
        </div>

        {/* ID Document fields removed — collected by Security at the gate for non-Guest visitors */}
      </div>

      {/* Visit Details */}
      <div style={{background:'#fff',border:'1px solid #ebe7e3',borderRadius:6,padding:20,marginBottom:12}}>
        <div style={{fontSize:11,color:'#a89a92',letterSpacing:'0.06em',textTransform:'uppercase',marginBottom:14,fontWeight:600}}>Visit Details</div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:14}}>
          <div>
            <label style={{fontSize:12,color:'#6b5d52',fontWeight:500,marginBottom:4,display:'block'}}>Visit Date</label>
            <input type="date" value={visitDate} onChange={e => setVisitDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              style={{width:'100%',padding:12,border:'1px solid #ebe7e3',borderRadius:6,fontSize:13,outline:'none',boxSizing:'border-box'}} />
          </div>
          <div>
            <label style={{fontSize:12,color:'#6b5d52',fontWeight:500,marginBottom:4,display:'block'}}>Visit Time</label>
            <input type="time" value={visitTime} onChange={e => setVisitTime(e.target.value)}
              style={{width:'100%',padding:12,border:'1px solid #ebe7e3',borderRadius:6,fontSize:13,outline:'none',boxSizing:'border-box'}} />
          </div>
        </div>

        <div style={{marginBottom:14}}>
          <label style={{fontSize:12,color:'#6b5d52',fontWeight:500,marginBottom:8,display:'block'}}>Additional Visitors</label>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <button onClick={() => setAdditionalVisitors(Math.max(0, additionalVisitors-1))}
              style={{width:40,height:40,border:'1px solid #ebe7e3',borderRadius:6,background:'#fff',fontSize:18,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>-</button>
            <span style={{fontSize:18,fontWeight:600,minWidth:30,textAlign:'center'}}>{additionalVisitors}</span>
            <button onClick={() => setAdditionalVisitors(additionalVisitors+1)}
              style={{width:40,height:40,border:'1px solid #ebe7e3',borderRadius:6,background:'#fff',fontSize:18,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>+</button>
            <span style={{fontSize:12,color:'#a89a92'}}>Total visitors: {additionalVisitors + 1}</span>
          </div>
        </div>

        <div style={{marginBottom:14}}>
          <label style={{fontSize:12,color:'#6b5d52',fontWeight:500,marginBottom:4,display:'block'}}>Vehicle Number (if any)</label>
          <input value={vehicleNumber} onChange={e => setVehicleNumber(e.target.value)} placeholder="e.g. AD-12345 — leave blank if none"
            style={{width:'100%',padding:12,border:'1px solid #ebe7e3',borderRadius:6,fontSize:14,outline:'none',boxSizing:'border-box'}} />
        </div>

        {/* Repeater */}
        <div style={{marginBottom:14}}>
          <label style={{fontSize:12,color:'#6b5d52',fontWeight:500,marginBottom:8,display:'block'}}>Repeater</label>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            {['Single Visit','Multiple Entry'].map(r => (
              <div key={r} onClick={() => setRepeater(r)}
                style={{padding:'12px 10px',border: repeater===r ? '2px solid #1a1a1a' : '1px solid #e0e0e0',
                borderRadius:6,textAlign:'center',cursor:'pointer',background: repeater===r ? '#faf8f5' : '#fff',
                fontSize:12,fontWeight: repeater===r ? 600 : 400,color:'#1a1a1a',transition:'all .15s'}}>
                {r}
              </div>
            ))}
          </div>
          <div style={{fontSize:11,color:'#a89a92',marginTop:8,lineHeight:'1.5'}}>
            {repeater === 'Single Visit' && 'QR code will be valid for one day only (visit date).'}
            {repeater === 'Multiple Entry' && 'QR code will remain valid for multiple entries until you cancel the approval.'}
          </div>
        </div>

        <div>
          <label style={{fontSize:12,color:'#6b5d52',fontWeight:500,marginBottom:4,display:'block'}}>Entry Remarks</label>
          <textarea value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Add any notes for the guard..."
            rows={3} style={{width:'100%',padding:12,border:'1px solid #ebe7e3',borderRadius:6,fontSize:14,outline:'none',resize:'vertical',boxSizing:'border-box'}} />
        </div>
      </div>

      <button onClick={handleSubmit} disabled={isSubmitting}
        style={{width:'100%',padding:16,background:isSubmitting ? '#a89a92' : '#928989',color:'#fff',border:'none',borderRadius:6,fontSize:15,fontWeight:600,cursor:isSubmitting ? 'not-allowed' : 'pointer',letterSpacing:'0.04em',marginTop:4,opacity:isSubmitting ? 0.7 : 1}}>
        {isSubmitting ? 'Creating...' : 'Create Pre-Approved Request'}
        </button>
    </div>
  );
};

