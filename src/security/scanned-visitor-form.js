const ScannedVisitorForm = ({ scannedData, onClose, onSave }) => {
  const { data } = useApp();
  const [securityNotes, setSecurityNotes] = React.useState('');
  const [idVerified, setIdVerified] = React.useState(false);
  const [vehicleVerified, setVehicleVerified] = React.useState(false);
  const [additionalGuests, setAdditionalGuests] = React.useState('');
  const [gateUsed, setGateUsed] = React.useState('Main Gate');
  const [idDocType, setIdDocType] = React.useState('');
  const [idDocNumber, setIdDocNumber] = React.useState('');
  const [idError, setIdError] = React.useState('');

  const parsed = React.useMemo(() => {
    if (!scannedData) return {};
    try {
      // Step 1: Extract the permit ref from whatever was scanned
      let input = scannedData.trim();

      // If it's a URL with ?scan= param, extract the permit ref
      if (input.startsWith('http')) {
        try {
          const url = new URL(input);
          const scanParam = url.searchParams.get('scan');
          if (scanParam) input = scanParam;
        } catch(e) {}
      }

      // If it's JSON, try to extract permit from it
      try {
        const j = JSON.parse(input);
        if (j.v === 1 && j.p) input = j.p;
        else if (j._varspm && j.permit) input = j.permit;
      } catch(e) {}

      // Step 2: Look up the permit ref in visitors data
      const match = data.visitors.find(v =>
        v.permitRef === input ||
        v.name === input ||
        v.name.toLowerCase() === input.toLowerCase() ||
        (v.permitRef && input.includes(v.permitRef))
      );
      if (match) {
        // If visitor has qrPayload, use it for full details
        const qp = match.qrPayload || {};
        return {
          permit: match.permitRef || '',
          property: qp.property || 'Sky Tower',
          unit: match.flat || qp.unit || '',
          host: match.resident || qp.resident || '',
          visitor: match.name || '',
          phone: match.contact || qp.mobile || '',
          type: match.type || qp.type || '',
          guests: qp.guests || '0',
          vehicle: qp.vehicle || '',
          id: qp.idDoc || '',
          date: match.date || qp.date || '',
          time: match.time || qp.time || '',
          'valid until': qp.validUntil || '',
          status: match.status === 'Scheduled' ? 'PRE-APPROVED' : (match.status || 'PRE-APPROVED')
        };
      }

      // Step 3: Try matching in entryLog
      const logMatch = data.entryLog.find(e =>
        e.refId === input ||
        e.visitor === input ||
        e.visitor.toLowerCase() === input.toLowerCase()
      );
      if (logMatch) {
        return {
          permit: logMatch.refId || '',
          property: 'Sky Tower',
          unit: logMatch.flat || '',
          host: logMatch.host || '',
          visitor: logMatch.visitor || '',
          phone: logMatch.phone || '',
          type: logMatch.type || '',
          guests: '0',
          vehicle: '',
          id: logMatch.idDoc || '',
          date: '',
          time: logMatch.timeIn || '',
          'valid until': '',
          status: logMatch.status
        };
      }

      // Step 4: Return minimal data with just the permit ref
      return { permit: input, visitor: '', status: 'UNKNOWN' };
    } catch(e) {
      console.log('Parse error:', e);
      return {};
    }
  }, [scannedData, data]);

  const isExpired = React.useMemo(() => {
    if (!parsed['valid until']) return false;
    try {
      const validStr = parsed['valid until'];
      // Handle format: "DD Mon YYYY HH:MM:SS" or "DD Mon YYYY HH:MM" or "Until Cancelled"
      if (validStr === 'Until Cancelled') return false; // Multi-visit passes don't expire

      // Use proper Date parsing for Dubai timezone
      const expiryStr = validStr.replace(/HH:MM:SS|HH:MM/, '');
      const expiryDate = new Date(expiryStr);
      const nowDubai = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Dubai' }));
      return expiryDate < nowDubai;
    } catch(e) {}
    return false;
  }, [parsed]);

  // Check if visitor date is in the future — future visitors cannot be admitted/rejected/held
  const isFutureVisitor = React.useMemo(() => {
    const dateStr = parsed['date'];
    if (!dateStr) return false;
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      // Handle YYYY-MM-DD format
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr > todayStr;
      // Handle DD/MM/YYYY format
      const parts = dateStr.split('/');
      if (parts.length === 3) {
        const isoDate = parts[2] + '-' + parts[1].padStart(2,'0') + '-' + parts[0].padStart(2,'0');
        return isoDate > todayStr;
      }
    } catch(e) {}
    return false;
  }, [parsed]);

  const hasData = parsed['visitor'] || parsed['permit'];
  const visitorName = parsed['visitor'] || 'Unknown Visitor';
  const initials = visitorName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2);
  const status = isExpired ? 'expired' : (parsed['status'] === 'PRE-APPROVED' ? 'approved' : 'scheduled');
  const statusLabel = isExpired ? 'EXPIRED' : (parsed['status'] || 'PRE-APPROVED');

  const isGuest = (parsed['type'] || '').toLowerCase() === 'guest';

  const handleAction = (action) => {
    // For non-Guest visitors, require ID document before admitting
    if (!isGuest && action === 'admit') {
      if (!idDocType) { setIdError('Please select an ID document type'); return; }
      if (!idDocNumber.trim()) { setIdError('Please enter the document number'); return; }
    }
    const idDocFull = isGuest ? '' : (idDocType + (idDocNumber.trim() ? ': ' + idDocNumber.trim() : ''));
    onSave({
      visitor: visitorName,
      phone: parsed['phone'] || '',
      type: parsed['type'] || 'Guest',
      flat: parsed['unit'] || '',
      host: parsed['host'] || '',
      permit: parsed['permit'] || '',
      vehicle: parsed['vehicle'] || '',
      idDoc: idDocFull,
      date: parsed['date'] || '',
      time: parsed['time'] || '',
      guests: parsed['guests'] || '0',
      property: parsed['property'] || '',
      securityNotes,
      idVerified,
      vehicleVerified,
      gateUsed,
      action: action
    });
  };

  return (
    <div className="sec-scanner-overlay">
      <div className="sec-scanner-header">
        <div className="sec-scanner-title">{t('sec.visitorVerification')}</div>
        <button className="sec-scanner-close" onClick={onClose}>&times;</button>
      </div>

      <div className="sec-scanned-form">
        {!hasData && (
          <div style={{textAlign:'center',padding:'40px 20px'}}>
            <div style={{fontSize:48,marginBottom:16}}><svg width='32' height='32' viewBox='0 0 24 24' fill='none' stroke='#7a6040' stroke-width='1.5'><path d='M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z'/></svg></div>
            <div style={{fontSize:20,fontWeight:600,color:'#ffc107',marginBottom:8}}>{t('sec.noMatchingVisitor')}</div>
            <div style={{color:'#a89a92',fontSize:13,marginBottom:20}}>The scanned QR code or entered reference did not match any pre-approved visitor in the system.</div>
            <div style={{color:'#c4b8b0',fontSize:12,marginBottom:20,background:'#928989',padding:12,borderRadius:8,textAlign:'left',wordBreak:'break-all'}}>
              <div style={{color:'#8a7f76',marginBottom:4}}>{t('sec.scannedData')}</div>
              {scannedData}
            </div>
            <button onClick={onClose} style={{padding:'12px 32px',background:'#a89a92',border:'1px solid #555',color:'#fff',borderRadius:8,cursor:'pointer',fontSize:13}}>{t('sec.goBack')}</button>
          </div>
        )}

        {hasData && (
        <div className="sec-scanned-header">
          <div className="sec-scanned-badge">{initials}</div>
          <div>
            <div className="sec-scanned-name">{visitorName}</div>
            <div className="sec-scanned-permit">{parsed['permit'] || 'No permit ref'}</div>
            <div className={`sec-scanned-status ${status}`}>{statusLabel}</div>
          </div>
        </div>
        )}

        {hasData && isExpired && (
          <div style={{background:'rgba(244,67,54,.1)',border:'1px solid rgba(244,67,54,.3)',borderRadius:8,padding:12,marginBottom:16,color:'#f44336',fontSize:13,textAlign:'center'}}>
            This pass has expired. Please contact the resident for a new approval.
          </div>
        )}

        {hasData && (
        <React.Fragment>
        <div className="sec-scanned-grid">
          <div className="sec-scanned-field">
            <div className="sec-scanned-label">{t('sec.phone')}</div>
            <div className="sec-scanned-value">{parsed['phone'] || '—'}</div>
          </div>
          <div className="sec-scanned-field">
            <div className="sec-scanned-label">{t('sec.visitorTypeCol')}</div>
            <div className="sec-scanned-value">{parsed['type'] || '—'}</div>
          </div>
          <div className="sec-scanned-field">
            <div className="sec-scanned-label">{t('sec.towerBlock')}</div>
            <div className="sec-scanned-value">{(parsed['property'] || '—') + ' / ' + (parsed['unit'] || '—')}</div>
          </div>
          <div className="sec-scanned-field">
            <div className="sec-scanned-label">{t('sec.host')}</div>
            <div className="sec-scanned-value">{parsed['host'] || '—'}</div>
          </div>
          <div className="sec-scanned-field">
            <div className="sec-scanned-label">{t('sec.dateTime')}</div>
            <div className="sec-scanned-value">{(parsed['date'] || '—') + ' at ' + (parsed['time'] || '—')}</div>
          </div>
          <div className="sec-scanned-field">
            <div className="sec-scanned-label">{t('sec.validUntil')}</div>
            <div className="sec-scanned-value" style={isExpired ? {color:'#f44336',borderColor:'#f44336'} : {}}>{parsed['valid until'] || '—'}</div>
          </div>
          {(parsed['type'] || '').toLowerCase() === 'guest' ? (
            <div className="sec-scanned-field">
              <div className="sec-scanned-label">{t('sec.idDocument')}</div>
              <div className="sec-scanned-value" style={{color:'#a89a92',fontStyle:'italic'}}>{t('sec.notRequiredGuests')}</div>
            </div>
          ) : (
            <React.Fragment>
              <div className="sec-scanned-field">
                <div className="sec-scanned-label">{t('sec.idDocType')} <span style={{color:'#f44336'}}>*</span></div>
                <div style={{display:'flex',gap:6,marginTop:4}}>
                  {['Passport','Emirates ID','Driving License'].map(t => (
                    <button key={t} onClick={() => { setIdDocType(t); setIdError(''); }}
                      style={{flex:1,padding:'8px 4px',border: idDocType===t ? '2px solid #ae9751' : '1px solid #444',
                      borderRadius:6,background: idDocType===t ? 'rgba(174,151,81,.15)' : 'transparent',
                      color: idDocType===t ? '#ae9751' : '#999',fontSize:11,fontWeight: idDocType===t ? 600 : 400,cursor:'pointer'}}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div className="sec-scanned-field">
                <div className="sec-scanned-label">{t('sec.idDocNumber')} <span style={{color:'#f44336'}}>*</span></div>
                <input value={idDocNumber} onChange={e => { setIdDocNumber(e.target.value); setIdError(''); }}
                  placeholder="Enter document number..."
                  className="sec-scanned-input"
                  style={{padding:'8px 12px',marginTop:4}} />
              </div>
              {idError && <div style={{gridColumn:'1/-1',color:'#f44336',fontSize:12,marginTop:-8,marginBottom:4}}>{idError}</div>}
            </React.Fragment>
          )}
          <div className="sec-scanned-field">
            <div className="sec-scanned-label">{t('sec.vehicleNumber')}</div>
            <div className="sec-scanned-value">{parsed['vehicle'] || 'None'}</div>
          </div>
          <div className="sec-scanned-field">
            <div className="sec-scanned-label">{t('sec.additionalVisitors')}</div>
            <div className="sec-scanned-value">{parsed['guests'] || '0'}</div>
          </div>
          <div className="sec-scanned-field">
            <div className="sec-scanned-label">{t('sec.gate')}</div>
            <select
              className="sec-scanned-input"
              value={gateUsed}
              onChange={e => setGateUsed(e.target.value)}
              style={{padding:'8px 12px'}}
            >
              <option value="Main Gate">{t('sec.mainGate')}</option>
              <option value="Service Gate">{t('sec.serviceGate')}</option>
              <option value="Parking Gate">{t('sec.parkingGate')}</option>
            </select>
          </div>
        </div>

        <div style={{display:'flex',gap:16,marginBottom:16}}>
          <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',fontSize:13,color:'#c4b8b0'}}>
            <input type="checkbox" checked={idVerified} onChange={e => setIdVerified(e.target.checked)} style={{accentColor:'#ae9751',width:18,height:18}} />
            ID Verified
          </label>
          <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',fontSize:13,color:'#c4b8b0'}}>
            <input type="checkbox" checked={vehicleVerified} onChange={e => setVehicleVerified(e.target.checked)} style={{accentColor:'#ae9751',width:18,height:18}} />
            Vehicle Verified
          </label>
        </div>

        <div className="sec-scanned-field full" style={{marginBottom:16}}>
          <div className="sec-scanned-label">{t('sec.securityNotesOpt')}</div>
          <textarea
            className="sec-scanned-input"
            rows={3}
            placeholder="Add any observations, notes, or additional details..."
            value={securityNotes}
            onChange={e => setSecurityNotes(e.target.value)}
          />
        </div>

        <div className="sec-scanned-actions">
          {isFutureVisitor ? (
            <div style={{textAlign:'center',padding:'12px 16px',background:'#f5f0ec',borderRadius:8,color:'#7a6f66',fontSize:13,fontWeight:500}}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7a6f66" strokeWidth="1.5" style={{verticalAlign:'middle',marginRight:6}}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
              This visitor is pre-approved for a future date ({parsed['date']}). Actions will be available on the day of the visit.
            </div>
          ) : (
            <>
              <button className="sec-btn-admit" onClick={() => handleAction('admit')} disabled={isExpired}>
                {isExpired ? 'PASS EXPIRED' : 'ADMIT VISITOR'}
              </button>
              <button className="sec-btn-hold" onClick={() => handleAction('hold')}>{t('sec.hold')}</button>
              <button className="sec-btn-reject" onClick={() => handleAction('reject')}>{t('sec.rejected')}</button>
            </>
          )}
        </div>
        </React.Fragment>
        )}
      </div>
    </div>
  );
};

