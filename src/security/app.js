const SecurityApp = ({ onLogout }) => {
  const { data, setData, showToast, t } = useApp();

  // Pull the signed-in guard's real name, building, address, and shift hours from
  // Supabase Auth + profile/assignment so the header displays true values instead of
  // the legacy 'Suresh Kumar / GRD-045 / Sky Tower / 06:00 — 14:00' placeholders.
  const [authGuard, setAuthGuard] = useState(null);
  useEffect(() => {
    if (!supabaseClient) return;
    let mounted = true;
    (async () => {
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        const userId = session && session.user && session.user.id;
        const role = session && session.user && session.user.app_metadata && session.user.app_metadata.role;
        if (!userId || role !== 'security') return;
        const [{ data: profile }, { data: sa }] = await Promise.all([
          supabaseClient.from('profiles').select('full_name,phone').eq('id', userId).maybeSingle(),
          supabaseClient.from('security_assignments').select('building_id,shift').eq('profile_id', userId).maybeSingle(),
        ]);
        if (!mounted) return;
        const { data: building } = (sa && sa.building_id)
          ? await supabaseClient.from('buildings').select('name,address').eq('id', sa.building_id).maybeSingle()
          : { data: null };
        if (!mounted) return;
        const shiftHours = sa && sa.shift === 'Day'   ? '06:00 — 18:00'
                         : sa && sa.shift === 'Night' ? '18:00 — 06:00'
                         : sa && sa.shift === '24h'   ? '24h coverage'
                         : '—';
        setAuthGuard({
          name: (profile && profile.full_name) || 'Suresh Kumar',
          id: 'GRD-' + (userId ? userId.slice(0, 6).toUpperCase() : '045'),
          phone: (profile && profile.phone) || null,
          shift: sa ? sa.shift : null,
          shiftHours,
          building: (building && building.name) || null,
          buildingAddress: (building && building.address) || null,
        });
      } catch (_) { /* keep fallback for demo logins */ }
    })();
    return () => { mounted = false; };
  }, []);
  const g_name = (authGuard && authGuard.name) || 'Suresh Kumar';
  const g_id = (authGuard && authGuard.id) || 'GRD-045';
  const g_phone = (authGuard && authGuard.phone) || '+971 50 456 7890';
  const g_shiftHours = (authGuard && authGuard.shiftHours) || '06:00 — 14:00';
  const g_building = authGuard && authGuard.building;
  const g_buildingAddress = authGuard && authGuard.buildingAddress;

  const [currentTab, setCurrentTab] = useState('dashboard');
  const [selectedVisitor, setSelectedVisitor] = useState(null);
  const [viewingVisitor, setViewingVisitor] = useState(null); // for detail view
  const [secChatChannel, setSecChatChannel] = useState('PMC'); // 'PMC' | 'HOS'
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState('xlsx'); // xlsx | csv | pdf
  const [exportTypes, setExportTypes] = useState({ INSIDE: true, SCHEDULED: true, CHECKED_OUT: true, REJECTED: true });
  const [exportDateFrom, setExportDateFrom] = useState('');
  const [exportDateTo, setExportDateTo] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [scannedData, setScannedData] = useState(null);
  const [showNewVisitorForm, setShowNewVisitorForm] = useState(false);
  const [showFullInsideList, setShowFullInsideList] = useState(false);
  const [secVisitorFilter, setSecVisitorFilter] = useState('ALL');
  const [insideFilterTab, setInsideFilterTab] = useState('ALL');
  const [entryLogPage, setEntryLogPage] = useState(0);
  const ENTRY_LOG_PER_PAGE = 8;
  const [visRegPage, setVisRegPage] = useState(0);
  const VIS_REG_PER_PAGE = 12;
  const [visRegSearch, setVisRegSearch] = useState('');
  const [visRegDateFrom, setVisRegDateFrom] = useState('');
  const [visRegDateTo, setVisRegDateTo] = useState('');
  const [selectedGate, setSelectedGate] = useState('Main Gate');
  const [secContactModal, setSecContactModal] = useState(null); // 'security' | 'pm' | null
  const [showSecNotifications, setShowSecNotifications] = useState(false);
  const [showSecProfile, setShowSecProfile] = useState(false);
  const [secProfilePanel, setSecProfilePanel] = useState(null); // 'profile' | 'settings' | 'shifts' | 'incidents' | 'policies' | 'help' | 'about'
  const [secPrefs, setSecPrefs] = useState({ notifSound: true, pushAlerts: true, darkMode: false, autoLogout: true, language: 'English' });
  const dismissedSecNotifIds = data.dismissedSecNotifIds || [];
  const [secFormStep, setSecFormStep] = useState('form'); // form | review
  const [secUnitFocused, setSecUnitFocused] = useState(false);
  const [showIdScanner, setShowIdScanner] = useState(false);
  const [idScanStatus, setIdScanStatus] = useState(''); // '' | 'opening' | 'ready' | 'capturing' | 'processing' | 'done' | 'error'
  const idScanVideoRef = React.useRef(null);
  const idScanCanvasRef = React.useRef(null);
  const idScanStreamRef = React.useRef(null);
  const idScanWorkerRef = React.useRef(null);
  const [newVisitorData, setNewVisitorData] = useState({
    visitorType: 'Resident Guest',
    entryType: 'Walk-in',
    fullName: '',
    company: '',
    mobile: '',
    idDocType: '',
    idDocNumber: '',
    flat: '',
    tower: 'Tower A',
    host: '',
    additionalVisitors: 0,
    vehicle: '',
    guardNotes: '',
    purpose: '',
    repeater: 'Single Visit'
  });
  const secQrRef = React.useRef(null);

  // i18n helpers (Arabic mode detection + type/time translation)
  const isArSec = t('sec.scanQR') !== 'Scan QR / Pre-Approved';
  const translateType = (vt) => {
    if (!vt) return vt;
    const s = String(vt);
    if (s === 'Resident Guest') return t('sec.residentGuest');
    if (s === 'Contractor / Worker' || s === 'Contractor/Worker') return t('sec.contractorWorker');
    if (s === 'Delivery / Courier' || s === 'Delivery/Courier') return t('sec.deliveryCourier');
    if (s === 'Domestic Staff') return t('sec.domesticStaff') || s;
    if (s === 'Service Vendor') return t('sec.serviceVendor') || s;
    if (s === 'Other / Misc.' || s === 'Other/Misc.') return t('sec.otherMisc') || s;
    if (s === 'Contractor') return t('sec.contractor');
    if (s === 'Guest') return t('sec.guest');
    if (s === 'Vendor') return t('sec.vendor');
    if (s === 'Facility Manager') return t('sec.facilityManager');
    return s;
  };
  const translateTimeSec = (tm) => {
    if (!tm || !isArSec) return tm || '—';
    return String(tm).replace(/\bAM\b/gi, 'ص').replace(/\bPM\b/gi, 'م');
  };

  // Security notifications computed from entry log + pending approvals
  const secNotifications = React.useMemo(() => {
    const notifs = [];
    (data.entryLog || []).slice(0, 15).forEach(e => {
      if (e.status === 'INSIDE' || e.status === 'PASSED SECURITY' || e.status === 'CLEARED') {
        notifs.push({
          id: 'entry-' + e.id,
          icon: '\u25CF', iconBg: '#e0e5db', iconColor: '#5a6b4f',
          title: e.visitor + ' ' + t('sec.entered'),
          body: (t('sec.viaLabel') || 'Via') + ' ' + (e.gate || t('sec.mainGate') || 'Main Gate') + ' ' + (t('sec.atLabel') || 'at') + ' ' + translateTimeSec(e.time),
          time: translateTimeSec(e.time)
        });
      }
      if (e.status === 'CHECKED OUT') {
        notifs.push({
          id: 'checkout-' + e.id,
          icon: '\u25CF', iconBg: '#eddbd9', iconColor: '#8b4a42',
          title: e.visitor + ' ' + t('sec.checkedOutLc'),
          body: (t('sec.checkedOutAt') || 'Checked out at') + ' ' + (translateTimeSec(e.timeOut) || '—'),
          time: translateTimeSec(e.timeOut || e.time)
        });
      }
    });
    (data.pendingApprovals || []).filter(p => !p.resolved).forEach(p => {
      notifs.push({
        id: 'pending-' + p.id,
        icon: '\u25CB', iconBg: '#ebe3d9', iconColor: '#7a6040',
        title: p.name + ' — ' + (t('sec.awaitingApprovalShort') || 'awaiting approval'),
        body: translateType(p.type || 'Visitor') + ' • ' + (p.flat || (t('sec.unknownUnit') || 'Unknown unit')),
        time: translateTimeSec(p.time) || (t('sec.now') || 'Now')
      });
    });
    // Static system notifications
    notifs.push({
      id: 'sys-shift', icon: '\u25CB', iconBg: '#e0dde5', iconColor: '#5a5470',
      title: t('sec.shiftChangeReminder') || 'Shift Change Reminder', body: (t('sec.nextShiftStarts') || 'Next shift starts at') + ' 14:00 — Rajesh Menon', time: '1' + (t('sec.hAgo') || 'h ago')
    });
    notifs.push({
      id: 'sys-maintenance', icon: '\u2014', iconBg: '#f3e5f5', iconColor: '#7b1fa2',
      title: t('sec.gateBMaintenance') || 'Gate B Maintenance', body: (t('sec.sideGateBMaint') || 'Side Gate B under maintenance until') + ' 16:00', time: '3' + (t('sec.hAgo') || 'h ago')
    });
    return notifs;
  }, [data.entryLog, data.pendingApprovals, isArSec]);

  const secUnreadCount = secNotifications.filter(n => !dismissedSecNotifIds.includes(n.id)).length;

  const dismissSecNotif = (id) => {
    const updated = [...dismissedSecNotifIds, id];
    setData(prev => ({ ...prev, dismissedSecNotifIds: updated }));
  };

  const clearAllSecNotifs = () => {
    const allIds = secNotifications.map(n => n.id);
    setData(prev => ({ ...prev, dismissedSecNotifIds: allIds }));
  };

  // ==================== EMIRATES ID SCANNER ====================
  const stopIdScanCamera = () => {
    if (idScanStreamRef.current) {
      idScanStreamRef.current.getTracks().forEach(t => t.stop());
      idScanStreamRef.current = null;
    }
  };



  const openIdScanner = async () => {
    setShowIdScanner(true);
    setIdScanStatus('opening');
    try {
      // Try rear camera first (mobile), fall back to any camera (desktop)
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
        });
      } catch (e) {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } }
        });
      }
      if (!idScanWorkerRef.current) {
        Tesseract.createWorker('eng').then(w => { idScanWorkerRef.current = w; }).catch(() => {});
      }
      idScanStreamRef.current = stream;
      if (idScanVideoRef.current) {
        idScanVideoRef.current.srcObject = stream;
        idScanVideoRef.current.play();
      }
      setIdScanStatus('ready');
    } catch (err) {
      console.error('Camera access denied:', err);
      setIdScanStatus('error');
      showToast('Camera access denied. Please allow camera permissions.');
    }
  };



  // Prepare canvas: crop to card area, rotate if needed, downscale, boost contrast
  const prepareCanvasForOCR = (video) => {
    const canvas = idScanCanvasRef.current;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    // Crop to the central 90% × 85% where the card guide is
    const cropX = Math.round(vw * 0.05);
    const cropY = Math.round(vh * 0.075);
    const cropW = Math.round(vw * 0.90);
    const cropH = Math.round(vh * 0.85);
    // Target max width 1000px for fast OCR (smaller = faster)
    const scale = Math.min(1, 1000 / cropW);
    const outW = Math.round(cropW * scale);
    const outH = Math.round(cropH * scale);

    // If cropped region is taller than wide (portrait photo of landscape card), rotate 90° CW
    if (cropH > cropW * 1.2) {
      canvas.width = outH;
      canvas.height = outW;
      const ctx = canvas.getContext('2d');
      ctx.save();
      ctx.translate(outH, 0);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, outW, outH);
      ctx.restore();
    } else {
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, outW, outH);
    }
    // Boost contrast — convert to grayscale with high contrast for better OCR
    const ctx = canvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      // Grayscale
      const g = d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114;
      // Boost contrast: stretch midtones
      const c = Math.min(255, Math.max(0, (g - 128) * 1.5 + 128));
      d[i] = d[i+1] = d[i+2] = c;
    }
    ctx.putImageData(imgData, 0, 0);
    return canvas;
  };

  const captureIdScan = async () => {
    if (!idScanVideoRef.current || !idScanCanvasRef.current) return;
    setIdScanStatus('capturing');
    const video = idScanVideoRef.current;
    const canvas = prepareCanvasForOCR(video);
    stopIdScanCamera();
    setIdScanStatus('processing');
    try {
      // Reuse pre-loaded worker, or create one if not ready yet
      let worker = idScanWorkerRef.current;
      if (!worker) worker = await Tesseract.createWorker('eng');
      idScanWorkerRef.current = worker;
      const { data: { text } } = await worker.recognize(canvas);
      console.log('[EID OCR]', text);

      // Single scan: extract Name + ID Number from front side
      const frontData = parseFrontSide(text);
      setNewVisitorData(prev => ({ ...prev, idDocType: 'Emirates ID' }));
      if (frontData.name) setNewVisitorData(prev => ({ ...prev, fullName: frontData.name }));
      if (frontData.idNumber) setNewVisitorData(prev => ({ ...prev, idDocNumber: frontData.idNumber }));
      setIdScanStatus('done');
      const msg = [frontData.name, frontData.idNumber].filter(Boolean).join(' — ');
      showToast(msg ? 'ID scanned — ' + msg : 'Scan complete — please verify data');
      terminateIdWorker();
      setTimeout(() => { setShowIdScanner(false); setIdScanStatus(''); }, 1200);
    } catch (err) {
      console.error('OCR error:', err);
      setIdScanStatus('error');
      showToast('Could not read ID. Please try again or enter manually.');
    }
  };

  const terminateIdWorker = () => {
    if (idScanWorkerRef.current) { idScanWorkerRef.current.terminate().catch(() => {}); idScanWorkerRef.current = null; }
  };

  const closeIdScanner = () => {
    stopIdScanCamera();
    terminateIdWorker();
    setShowIdScanner(false);
    setIdScanStatus('');
  };



  // ---- FRONT SIDE PARSER: Full Name + ID Number ----
  const parseFrontSide = (text) => {
    const result = { name: '', idNumber: '' };
    console.log('[EID FRONT raw]', JSON.stringify(text));

    // Step 0: Strip ALL non-Latin characters (Arabic, symbols, etc.) — keep only A-Z, a-z, 0-9, basic punctuation, spaces, newlines
    const latinOnly = text.replace(/[^\x00-\x7F]/g, '').replace(/[^\w\s\n\-.:\/]/g, ' ');
    const lines = latinOnly.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(l => l.length > 1);
    console.log('[EID FRONT latin lines]', JSON.stringify(lines));

    // Emirates ID number: 784-YYYY-NNNNNNN-N
    // OCR may insert spaces/dots between digits, so be very flexible
    const digitsOnly = latinOnly.replace(/[^0-9]/g, '');
    const idDigitMatch = digitsOnly.match(/784\d{12}/);
    if (idDigitMatch) {
      const d = idDigitMatch[0];
      result.idNumber = d.slice(0,3) + '-' + d.slice(3,7) + '-' + d.slice(7,14) + '-' + d.slice(14,15);
    }
    // Also try the formatted pattern in original text
    if (!result.idNumber) {
      const idMatch = latinOnly.match(/784[-\s.]?\d{4}[-\s.]?\d{7}[-\s.]?\d/);
      if (idMatch) {
        result.idNumber = idMatch[0].replace(/[\s.\-]/g, '').replace(/(\d{3})(\d{4})(\d{7})(\d)/, '$1-$2-$3-$4');
      }
    }

    // Labels that appear on Emirates ID
    const labelWords = /^(name|nationality|date|birth|sex|gender|expiry|expire|id|number|card|resident|authority|emirates|united|arab|ajnabi|issue|of|the|identity|uae|document|type|holder|place|no|sig|signature|m|f|male|female)$/i;
    const nextLabelPattern = /\b(nationality|date|birth|sex|gender|expiry|id\s*number|number|ajnabi|resident)\b/i;
    const hasArabic = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

    // Strategy 1: Find "Name" in raw OCR, extract English name before Arabic/labels
    const rawLines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const nameLineIdx = rawLines.findIndex(l => /\bname\b/i.test(l));
    if (nameLineIdx >= 0) {
      // Take name line + next line
      const nameZone = rawLines.slice(nameLineIdx, nameLineIdx + 2).join(' ');
      const afterLabel = nameZone.replace(/.*?\bname\b[:\s]*/i, '');
      // Cut at Arabic chars
      const arabicIdx = afterLabel.search(hasArabic);
      let namePart = arabicIdx >= 0 ? afterLabel.slice(0, arabicIdx) : afterLabel;
      // Cut at next label, date, or ID number
      const labelIdx = namePart.search(nextLabelPattern);
      if (labelIdx > 0) namePart = namePart.slice(0, labelIdx);
      const dateIdx = namePart.search(/\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/);
      if (dateIdx > 0) namePart = namePart.slice(0, dateIdx);
      const idInName = namePart.search(/784/);
      if (idInName > 0) namePart = namePart.slice(0, idInName);
      // Extract Latin-only words, 4+ chars, not labels
      const allWords = namePart.split(/[^a-zA-Z]+/).filter(w => w.length >= 4 && !labelWords.test(w));
      // Emirates ID: name is always First Last (2 words). Sometimes has middle name(s).
      // Problem: OCR-mangled Arabic can look like Latin words (e.g., "Oncol").
      // Solution: take first 2 words always. Only include 3rd/4th word if they are 7+ chars
      // (real middle/last names are long, OCR garbage from Arabic is usually shorter)
      const nameWords = [];
      for (let i = 0; i < allWords.length && nameWords.length < 4; i++) {
        if (nameWords.length < 2) {
          nameWords.push(allWords[i]); // always take first 2
        } else if (allWords[i].length >= 6) {
          nameWords.push(allWords[i]); // 3rd/4th only if 6+ chars (filters OCR garbage)
        } else {
          break; // short word after first 2 = probably garbage, stop
        }
      }
      if (nameWords.length >= 1) {
        result.name = nameWords.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      }
    }

    // Strategy 2: Fallback — first 2 long Latin words from any line
    if (!result.name) {
      for (const line of lines) {
        const words = line.split(/\s+/).filter(w => /^[A-Za-z]{4,}$/.test(w) && !labelWords.test(w));
        if (words.length >= 2) {
          result.name = words.slice(0, 2).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
          break;
        }
      }
    }

    return result;
  };



  const resetNewVisitorForm = () => {
    setSecFormStep('form');
    setNewVisitorData({
      visitorType: 'Resident Guest', entryType: 'Walk-in', fullName: '', company: '', mobile: '',
      idDocType: '', idDocNumber: '', flat: '', tower: 'Tower A', host: '',
      additionalVisitors: 0, vehicle: '', guardNotes: '', purpose: '', repeater: 'Single Visit'
    });
  };

  // Step 1: Validate and move to review
  const validateNewVisitorForm = () => {
    if (!newVisitorData.fullName.trim()) { showToast('Please enter visitor name'); return; }
    if (newVisitorData.visitorType !== 'Resident Guest' && !newVisitorData.company.trim()) { showToast('Please enter company name'); return; }
    if (!newVisitorData.mobile.trim()) { showToast('Please enter mobile number'); return; }
    if (!newVisitorData.flat.trim()) { showToast('Please enter flat/unit number'); return; }
    if (newVisitorData.visitorType !== 'Resident Guest' && !newVisitorData.idDocType) { showToast('ID document required for non-guest visitors'); return; }
    setSecFormStep('review');
  };

  // Step 2: Send visitor request → goes to resident pendingApprovals
  const submitNewVisitor = () => {
    const timeNow = new Date();
    const timeStr = timeNow.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Dubai' });
    const dateStr = timeNow.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'Asia/Dubai' });
    const isoDate = timeNow.getFullYear()+'-'+String(timeNow.getMonth()+1).padStart(2,'0')+'-'+String(timeNow.getDate()).padStart(2,'0');
    const permitRef = 'SEC-' + timeNow.getFullYear() + '-' + Math.floor(1000 + Math.random() * 9000);
    const idDocFull = newVisitorData.idDocType ? (newVisitorData.idDocType + (newVisitorData.idDocNumber ? ': ' + newVisitorData.idDocNumber : '')) : '';
    // For single-visit QR: set validity to end of current day (23:59:59 Dubai time)
    // For multiple-visit QR: set validity to "Until Cancelled" (no auto-expiry)
    const validUntil = newVisitorData.repeater === 'Single Visit'
      ? (dateStr + ' 23:59:59')
      : 'Until Cancelled';

    // Create pending approval for resident
    const pendingEntry = {
      id: Date.now(),
      name: newVisitorData.fullName.trim(),
      company: newVisitorData.company.trim(),
      type: newVisitorData.visitorType,
      flat: newVisitorData.flat.trim(),
      calledBy: 'Security Gate',
      timeWaiting: timeStr,
      source: 'security',
      permitRef: permitRef,
      contact: newVisitorData.mobile.trim(),
      entryType: newVisitorData.entryType,
      idDoc: idDocFull,
      vehicle: newVisitorData.vehicle.trim(),
      additionalVisitors: newVisitorData.additionalVisitors,
      guardNotes: newVisitorData.guardNotes.trim(),
      purpose: newVisitorData.purpose.trim() || ('Visitor visit'),
      host: newVisitorData.host.trim() || 'Resident',
      repeater: newVisitorData.repeater,
      validUntil: validUntil,
      securityStatus: 'Awaiting Resident Approval',
      createdAt: timeNow.toISOString(),
      date: dateStr,
      time: timeStr
    };

    // Also create a visitor entry with "Awaiting Approval" status for security tracking
    const visitorEntry = {
      id: Date.now() + 1,
      name: newVisitorData.fullName.trim(),
      company: newVisitorData.company.trim(),
      resident: newVisitorData.host.trim() || 'Resident',
      flat: newVisitorData.flat.trim(),
      contact: newVisitorData.mobile.trim(),
      type: newVisitorData.visitorType,
      gate: 'Main Gate',
      status: 'Awaiting Approval',
      time: timeStr,
      date: dateStr,
      permitRef: permitRef,
      duration: '—',
      repeater: newVisitorData.repeater,
      validUntil: validUntil,
      qrPayload: {
        permit: permitRef,
        property: 'Sky Tower - The Pinnacle Residences',
        unit: newVisitorData.flat.trim(),
        resident: newVisitorData.host.trim() || 'Resident',
        visitor: newVisitorData.fullName.trim(),
        company: newVisitorData.company.trim(),
        mobile: newVisitorData.mobile.trim(),
        type: newVisitorData.visitorType,
        entry: newVisitorData.entryType,
        guests: newVisitorData.additionalVisitors + 1,
        vehicle: newVisitorData.vehicle.trim() || 'N/A',
        idDoc: idDocFull,
        date: dateStr,
        time: timeStr,
        validUntil: validUntil,
        repeater: newVisitorData.repeater,
        status: 'AWAITING APPROVAL'
      }
    };

    // Log entry with awaiting status
    const logEntry = {
      id: Date.now() + 2,
      refId: permitRef,
      visitor: newVisitorData.fullName.trim(),
      company: newVisitorData.company.trim(),
      phone: newVisitorData.mobile.trim(),
      initials: newVisitorData.fullName.trim().split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2),
      type: newVisitorData.visitorType,
      flat: newVisitorData.flat.trim(),
      host: newVisitorData.host.trim() || 'Resident',
      purpose: newVisitorData.purpose.trim() || ('Visitor visit'),
      timeIn: timeStr,
      timeOut: '',
      duration: '—',
      idDoc: idDocFull,
      status: 'AWAITING APPROVAL',
      securityNotes: newVisitorData.guardNotes.trim(),
      gateUsed: 'Main Gate',
      date: isoDate,
      registeredDate: isoDate,
      dateIn: isoDate,
      dateOut: ''
    };

    setData(prev => ({
      ...prev,
      visitors: [visitorEntry, ...prev.visitors],
      entryLog: [logEntry, ...prev.entryLog],
      pendingApprovals: [pendingEntry, ...prev.pendingApprovals]
    }));

    showToast('Visitor request sent to resident for approval');
    resetNewVisitorForm();
    setShowNewVisitorForm(false);
  };

  // Security-side override: approve a pending visitor and move them to "Visitors Inside"
  const handleSecApprove = (p) => {
    const timeNow = new Date();
    const timeStr = timeNow.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Dubai' });
    setData(prev => ({
      ...prev,
      // Mark pending approval as resolved (approved by security)
      pendingApprovals: prev.pendingApprovals.map(x => x.id === p.id ? { ...x, resolved: 'approved-by-security' } : x),
      // Flip matching visitor row to Inside so they appear in "Visitors Inside Now"
      visitors: prev.visitors.map(v =>
        (v.permitRef && v.permitRef === p.permitRef) || (v.name === p.name && v.flat === p.flat && v.status === 'Awaiting Approval')
          ? { ...v, status: 'Inside', time: v.time || timeStr, approvedBy: 'Security' }
          : v
      ),
      // Update matching entry log row so it shows in Visitor Log as APPROVED by security
      entryLog: prev.entryLog.map(e =>
        (e.refId && e.refId === p.permitRef) || (e.visitor === p.name && e.flat === p.flat && e.status === 'AWAITING APPROVAL')
          ? { ...e, status: 'APPROVED BY SECURITY', timeIn: e.timeIn || timeStr }
          : e
      )
    }));
    showToast(p.name + ' approved by security — moved to Visitors Inside');
  };

  // Security-side override: reject a pending visitor
  const handleSecReject = (p) => {
    setData(prev => ({
      ...prev,
      pendingApprovals: prev.pendingApprovals.map(x => x.id === p.id ? { ...x, resolved: 'rejected-by-security' } : x),
      visitors: prev.visitors.map(v =>
        (v.permitRef && v.permitRef === p.permitRef) || (v.name === p.name && v.flat === p.flat && v.status === 'Awaiting Approval')
          ? { ...v, status: 'Rejected', rejectedBy: 'Security' }
          : v
      ),
      entryLog: prev.entryLog.map(e =>
        (e.refId && e.refId === p.permitRef) || (e.visitor === p.name && e.flat === p.flat && e.status === 'AWAITING APPROVAL')
          ? { ...e, status: 'REJECTED BY SECURITY' }
          : e
      )
    }));
    showToast(p.name + ' rejected by security');
  };

  // Live clock from device — updates every second
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const clockTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true, timeZone: 'Asia/Dubai' });
  const clockDate = now.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Dubai' }).toUpperCase();
  // Shift timer — assumes 06:00 start in Abu Dhabi timezone
  const abuDhabiNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Dubai' }));
  const shiftStart = new Date(abuDhabiNow); shiftStart.setHours(6, 0, 0, 0);
  const shiftElapsed = Math.max(0, Math.floor((abuDhabiNow - shiftStart) / 60000));
  const shiftHours = Math.floor(shiftElapsed / 60);
  const shiftMins = shiftElapsed % 60;
  const shiftStr = shiftHours + 'h ' + shiftMins + 'm';

  // Look up full visitor data (with qrPayload) by permit ref or name
  const findFullVisitor = (entry) => {
    if (!entry) return null;
    // Try matching by permit ref first
    if (entry.refId) {
      const match = data.visitors.find(v => v.permitRef === entry.refId);
      if (match) return { ...match, _entry: entry };
    }
    // Try matching by visitor name
    const name = entry.visitor || entry.name;
    if (name) {
      const match = data.visitors.find(v => v.name === name);
      if (match) return { ...match, _entry: entry };
    }
    // Fall back to synthesizing a detail object from the entry log itself so
    // that rows which only exist in entryLog (e.g. seeded rows) still open the
    // detail modal. Field names are mapped to the shape renderVisitorDetail expects.
    return {
      permitRef: entry.refId || '—',
      name: entry.visitor || entry.name || '—',
      contact: entry.phone || entry.contact || '—',
      type: entry.type || '—',
      flat: entry.flat || '—',
      resident: entry.host || entry.resident || '—',
      host: entry.host || '—',
      date: entry.date || entry.registeredDate || entry.visitDate || '—',
      time: entry.timeIn || entry.time || '—',
      timeIn: entry.timeIn || '',
      timeOut: entry.timeOut || '',
      duration: entry.duration || '',
      gate: entry.gateUsed || entry.gate || 'Main Gate',
      status: entry.status || '—',
      purpose: entry.purpose || '—',
      idDoc: entry.idDoc || '—',
      company: entry.company || '',
      qrPayload: null,
      _entry: entry
    };
  };

  // QR for security visitor detail — just permit ref
  const getSecQrImgUrl = (permit) => 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' + encodeURIComponent(permit || 'UNKNOWN');

  useEffect(() => {
    if (viewingVisitor && viewingVisitor.qrPayload && secQrRef.current) {
      const vp = viewingVisitor.qrPayload;
      secQrRef.current.innerHTML = '<img src="' + getSecQrImgUrl(vp.permit) + '" width="280" height="280" style="display:block;margin:0 auto;" crossorigin="anonymous" />';
    }
  }, [viewingVisitor]);

  const handleQrScanned = (qrText) => {
    setShowScanner(false);
    setScannedData(qrText);
  };

  const handleVisitorSave = (info) => {
    const now = new Date();
    const timeStr = formatTime12(now);
    const isoDate = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
    const statusMap = { admit: 'Passed Security', hold: 'On Hold', reject: 'Denied Entry' };
    const newStatus = statusMap[info.action] || 'CLEARED';

    const logEntry = {
      id: 'LOG-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
      refId: info.permit,
      visitor: info.visitor,
      phone: info.phone,
      initials: info.visitor.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2),
      type: info.type,
      flat: info.flat,
      host: info.host,
      purpose: info.type + ' visit',
      timeIn: timeStr,
      timeOut: '',
      duration: '—',
      idDoc: info.idDoc,
      status: newStatus,
      securityNotes: info.securityNotes,
      idVerified: info.idVerified,
      vehicleVerified: info.vehicleVerified,
      gateUsed: info.gateUsed,
      date: isoDate,
      registeredDate: isoDate,
      dateIn: isoDate,
      dateOut: ''
    };

    const insideEntry = info.action === 'admit' ? {
      id: data.insideVisitors.length + 100,
      name: info.visitor,
      initials: info.visitor.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2),
      type: info.type,
      inTime: timeStr,
      duration: 'Just now',
      host: info.host,
      scanLog: [{timestamp: timeStr, action: 'entry_scan', status: 'Passed Security'}]
    } : null;

    // Update matching visitor status in visitors list + record security action time
    const updatedVisitors = data.visitors.map(v => {
      if (v.permitRef === info.permit) {
        const updates = {
          status: info.action === 'admit' ? 'Passed Security' : (info.action === 'hold' ? 'On Hold' : 'Denied Entry'),
          securityActionTime: timeStr,
          securityActionDate: formatDateShort(now)
        };
        if (info.action === 'admit') updates.securityPassedTime = timeStr;
        if (info.action === 'hold') updates.securityHoldTime = timeStr;
        if (info.action === 'reject') updates.securityRejectTime = timeStr;
        return { ...v, ...updates };
      }
      return v;
    });

    // Check if an entry with this refId already exists in entryLog (pre-scheduled entries)
    const existingIdx = data.entryLog.findIndex(e => e.refId === info.permit);
    let updatedEntryLog;
    if (existingIdx >= 0) {
      // Update existing entry in place instead of creating a duplicate
      updatedEntryLog = data.entryLog.map(e => {
        if (e.refId === info.permit) {
          return { ...e, status: newStatus, timeIn: timeStr, securityNotes: info.securityNotes, idDoc: info.idDoc, idVerified: info.idVerified, vehicleVerified: info.vehicleVerified, gateUsed: info.gateUsed };
        }
        return e;
      });
    } else {
      // No existing entry — prepend new one
      updatedEntryLog = [logEntry, ...data.entryLog];
    }

    setData(prev => ({
      ...prev,
      visitors: updatedVisitors,
      entryLog: updatedEntryLog,
      insideVisitors: insideEntry ? [insideEntry, ...prev.insideVisitors] : prev.insideVisitors
    }));

    setScannedData(null);
    const actionLabels = { admit: 'admitted', hold: 'placed on hold', reject: 'rejected' };
    showToast(info.visitor + ' has been ' + (actionLabels[info.action] || 'processed'));
  };

  // Visitor detail view for Security app
  const renderVisitorDetail = () => {
    if (!viewingVisitor) return null;
    const vp = viewingVisitor.qrPayload;
    // Prefer the exact entry the user clicked (stored on _entry by findFullVisitor),
    // and fall back to a permitRef match for legacy detail objects.
    const entry = viewingVisitor._entry || data.entryLog.find(e => e.refId === viewingVisitor.permitRef) || {};
    return (
      <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'#f2efec',zIndex:1000,overflowY:'auto',padding:16}}>
        <div style={{maxWidth:500,margin:'0 auto'}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:20}}>
            <button onClick={() => setViewingVisitor(null)} style={{background:'none',border:'none',fontSize:18,cursor:'pointer',color:'#1a1a1a'}}>← Back</button>
            <h3 style={{fontSize:16,fontWeight:600,color:'#1a1a1a',margin:0}}>{t('sec.visitorDetails')}</h3>
          </div>

          <div style={{background:'#fff',border:'1px solid #ebe7e3',borderRadius:8,padding:20,textAlign:'center',marginBottom:16}}>
            {(() => {
              const vs = viewingVisitor.status;
              const vd = viewingVisitor.date || (vp && vp.date) || '';
              const nowStr = new Date().toISOString().split('T')[0];
              let pd = vd;
              if (vd && !(/^\d{4}-\d{2}-\d{2}$/.test(vd))) { const pp = vd.split('/'); if (pp.length === 3) pd = pp[2]+'-'+pp[1].padStart(2,'0')+'-'+pp[0].padStart(2,'0'); }
              const isPast = pd && pd < nowStr;
              const isFuture = pd && pd > nowStr;
              let badgeBg, badgeColor, badgeLabel;
              if (isFuture) { badgeBg = '#ccc8c1'; badgeColor = '#4a4540'; badgeLabel = '✓ Pre-Approved'; }
              else if (isPast) {
                if (vs === 'Pre-Approved' || vs === 'Scheduled' || vs === 'Pending') { badgeBg = '#e8e3de'; badgeColor = '#8a7f76'; badgeLabel = 'No Show'; }
                else if (vs === 'Inside' || vs === 'Passed Security') { badgeBg = '#d5d0ca'; badgeColor = '#6b6560'; badgeLabel = '→ Checked Out'; }
                else if (vs === 'Rejected' || vs === 'Denied Entry' || vs === 'On Hold') { badgeBg = '#d4b8b4'; badgeColor = '#7a3b33'; badgeLabel = '✕ Rejected'; }
                else { badgeBg = '#d5d0ca'; badgeColor = '#6b6560'; badgeLabel = '→ Checked Out'; }
              } else {
                if (vs === 'Inside' || vs === 'Passed Security') { badgeBg = '#c5cebf'; badgeColor = '#3a4a30'; badgeLabel = '✓ Inside'; }
                else if (vs === 'Rejected' || vs === 'Denied Entry') { badgeBg = '#d4b8b4'; badgeColor = '#7a3b33'; badgeLabel = '✕ Rejected'; }
                else if (vs === 'On Hold') { badgeBg = '#d6ccb8'; badgeColor = '#6b5a3a'; badgeLabel = '⏸ On Hold'; }
                else if (vs === 'Checked Out' || vs === 'Exited') { badgeBg = '#d5d0ca'; badgeColor = '#6b6560'; badgeLabel = '→ Checked Out'; }
                else { badgeBg = '#ccc8c1'; badgeColor = '#4a4540'; badgeLabel = '✓ Pre-Approved'; }
              }
              return <div style={{background:badgeBg,color:badgeColor,padding:'8px 20px',borderRadius:20,display:'inline-block',fontSize:12,fontWeight:600,letterSpacing:'0.04em',marginBottom:16}}>{badgeLabel}</div>;
            })()}
            {vp ? (
              <div ref={secQrRef} style={{display:'flex',justifyContent:'center',marginBottom:12}}></div>
            ) : (
              <div style={{padding:16,color:'#a89a92',fontSize:12}}>{t('sec.qrNotAvailable')}</div>
            )}
            <div style={{fontSize:13,fontWeight:600,color:'#1a1a1a',marginBottom:4}}>{viewingVisitor.permitRef || '—'}</div>
            <div style={{fontSize:12,color:'#a89a92'}}>{viewingVisitor.name}</div>
          </div>

          <div style={{background:'#fff',border:'1px solid #ebe7e3',borderRadius:8,padding:16,marginBottom:16}}>
            <div style={{fontSize:11,color:'#1a1a1a',letterSpacing:'0.06em',textTransform:'uppercase',marginBottom:12,fontWeight:600}}>{t('sec.visitorInformation')}</div>
            {(() => {
              // Merge every field we know about from the detail object and the clicked entry.
              const statusUpper = ((entry.status || viewingVisitor.status || '') + '').toUpperCase().trim();
              const isInsideDetail = statusUpper === 'PASSED SECURITY' || statusUpper === 'CLEARED' || statusUpper === 'INSIDE' || statusUpper === 'RESIDENT APPROVED' || statusUpper === 'APPROVED BY SECURITY' || statusUpper === 'APPROVED';
              const isScheduledDetail = statusUpper === 'SCHEDULED' || statusUpper === 'PRE-APPROVED' || statusUpper === 'PENDING' || statusUpper === 'AWAITING APPROVAL';
              const detailTimeIn = entry.timeIn || viewingVisitor.timeIn || viewingVisitor.time || '—';
              // A visitor who is still INSIDE (or only SCHEDULED) has no check-out time yet.
              const detailTimeOut = (isInsideDetail || isScheduledDetail) ? '—' : (entry.timeOut || viewingVisitor.timeOut || '—');
              const detailDuration = (isInsideDetail || isScheduledDetail)
                ? '—'
                : ((entry.timeIn && entry.timeOut ? computeDuration(entry.timeIn, entry.timeOut, entry.dateIn || entry.registeredDate || entry.date || '', entry.dateOut || '') : '') || entry.duration || viewingVisitor.duration || '—');
              const rows = [
                ['Permit Ref', viewingVisitor.permitRef || entry.refId || '—'],
                ['Name', viewingVisitor.name || entry.visitor || '—'],
                ['Phone', viewingVisitor.contact || entry.phone || (vp && vp.mobile) || '—'],
                ['Type', viewingVisitor.type || entry.type || '—'],
                ['Company', viewingVisitor.company || entry.company || '—'],
                ['Unit', viewingVisitor.flat || entry.flat || '—'],
                ['Host', viewingVisitor.resident || viewingVisitor.host || entry.host || (vp && vp.resident) || '—'],
                ['Purpose', viewingVisitor.purpose || entry.purpose || '—'],
                ['ID Document', viewingVisitor.idDoc || entry.idDoc || (vp && vp.idDoc) || '—'],
                ['Vehicle', vp ? (vp.vehicle || '—') : '—'],
                ['Date Entered', (() => { const d = entry.dateIn || viewingVisitor.dateIn || entry.registeredDate || entry.date || ''; if (!d) return '—'; try { const dt = new Date(d.includes('-') ? d+'T00:00:00' : d); if (isNaN(dt)) return d; return dt.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:'Asia/Dubai'}); } catch(e) { return d; } })()],
                ['Time In', detailTimeIn || '—'],
                ['Date Exit', (() => { const sn = ((entry.status||'').toUpperCase()); const isCo = sn === 'CHECKED OUT' || sn === 'EXITED'; const d = entry.dateOut || viewingVisitor.dateOut || (isCo ? (entry.dateIn || entry.registeredDate || entry.date || '') : ''); if (!d) return '—'; try { const dt = new Date(d.includes('-') ? d+'T00:00:00' : d); if (isNaN(dt)) return d; return dt.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:'Asia/Dubai'}); } catch(e) { return d; } })()],
                ['Check Out Time', detailTimeOut],
                ['Duration', detailDuration],
                ['Valid Until', vp ? (vp.validUntil || '—') : '—'],
                ['Gate', viewingVisitor.gate || entry.gateUsed || 'Main Gate'],
                ['Status', entry.status || viewingVisitor.status || '—'],
              ].filter(([, val]) => val !== undefined && val !== null && val !== '');
              return rows.map(([label, val], i) => (
                <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom: i < rows.length - 1 ? '1px solid #e0e0e0' : 'none'}}>
                  <span style={{fontSize:12,color:'#a89a92'}}>{label}</span>
                  <span style={{fontSize:12,color:'#1a1a1a',fontWeight:500,textAlign:'right',maxWidth:'60%'}}>{val}</span>
                </div>
              ));
            })()}
          </div>

          <button onClick={() => setViewingVisitor(null)} style={{width:'100%',padding:12,background:'#928989',color:'#fff',border:'none',borderRadius:6,fontSize:14,fontWeight:600,cursor:'pointer'}}>
            Close
          </button>
        </div>
      </div>
    );
  };

  // Filtered database export — format + visitor types + date range
  // Includes VARS branded header, metadata block, and full data columns
  const handleExportFullDatabase = () => {
    try {
      const normSt = (e) => (e.status||'').toUpperCase().trim();
      const isIn = (s) => s === 'PASSED SECURITY' || s === 'CLEARED' || s === 'INSIDE' || s === 'RESIDENT APPROVED' || s === 'APPROVED BY SECURITY' || s === 'APPROVED';
      const isCo = (s) => s === 'CHECKED OUT' || s === 'EXITED';
      const isSch = (s) => s === 'SCHEDULED' || s === 'PRE-APPROVED' || s === 'PENDING' || s === 'AWAITING APPROVAL';
      const isRej = (s) => s === 'REJECTED' || s === 'REJECTED BY SECURITY' || s === 'DENIED ENTRY' || s === 'ON HOLD' || s === 'FLAGGED';
      const formatUnitExp = (f) => { if (f === null || f === undefined) return ''; const str = String(f).trim(); if (!str) return ''; const m = str.match(/^[A-Za-z]+[-\s]?(\d+[A-Za-z]?)$/); return m ? m[1] : str; };
      const formatTimeExp = (t) => { if (!t) return ''; const str = String(t).trim(); const ap = str.match(/^(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)$/); if (ap) return String(parseInt(ap[1],10)).padStart(2,'0')+':'+ap[2]+' '+ap[3].toUpperCase(); const h24 = str.match(/^(\d{1,2}):(\d{2})$/); if (h24) { const h = parseInt(h24[1],10); const suf = h >= 12 ? 'PM' : 'AM'; const hr = ((h+11)%12)+1; return String(hr).padStart(2,'0')+':'+h24[2]+' '+suf; } return str; };
      const entryDateStr = (e) => e.registeredDate || e.visitDate || e.date || '';
      // Parse idDoc into { type, number } — supports "EMIRATES ID: 784-1990-1234567-1" or plain "EMIRATES ID"
      const parseIdDoc = (val) => {
        if (!val) return { type: '—', number: '—' };
        const str = String(val).trim();
        if (!str) return { type: '—', number: '—' };
        const m = str.match(/^(.+?):\s*(.+)$/);
        if (m) return { type: m[1].trim().toUpperCase(), number: m[2].trim() };
        return { type: str.toUpperCase(), number: '—' };
      };
      // Generate deterministic synthetic ID number from name+type for seed rows missing real numbers
      const synthId = (name, type) => {
        if (!name) return '—';
        const t = (type||'').toUpperCase();
        let h = 0; for (let i = 0; i < name.length; i++) { h = ((h << 5) - h + name.charCodeAt(i)) | 0; }
        const n = Math.abs(h);
        if (t.includes('EMIRATES') || t.includes('ID CARD')) return '784-' + (1970 + (n % 45)) + '-' + String(n % 9999999).padStart(7,'0') + '-' + (n % 9);
        if (t.includes('PASSPORT')) { const L = 'ABCDEFGHIJKLMNPQRSTUVWXYZ'; return L[n%25] + L[(n>>3)%25] + String(n % 9999999).padStart(7,'0'); }
        if (t.includes('WORK') || t.includes('TRADE') || t.includes('LICENCE') || t.includes('LICENSE')) return 'WP-' + String(n % 999999).padStart(6,'0');
        return String(n % 9999999999).padStart(9,'0');
      };
      // filter entry log based on export modal selections
      let rows = (data.entryLog || []).filter(e => {
        const s = normSt(e);
        if (isIn(s) && !exportTypes.INSIDE) return false;
        if (isCo(s) && !exportTypes.CHECKED_OUT) return false;
        if (isSch(s) && !exportTypes.SCHEDULED) return false;
        if (isRej(s) && !exportTypes.REJECTED) return false;
        if (!isIn(s) && !isCo(s) && !isSch(s) && !isRej(s)) return false;
        return true;
      });
      if (exportDateFrom) rows = rows.filter(e => { const d = entryDateStr(e); return d && d >= exportDateFrom; });
      if (exportDateTo) rows = rows.filter(e => { const d = entryDateStr(e); return d && d <= exportDateTo; });
      if (rows.length === 0) {
        showToast('No records match the selected filters');
        return;
      }
      const statusLabel = (s0) => { const s = normSt({status:s0}); if (isIn(s)) return 'INSIDE'; if (isCo(s)) return 'CHECKED OUT'; if (isSch(s)) return 'SCHEDULED'; if (isRej(s)) return 'REJECTED'; return s0||''; };

      // ===== Expanded column set — now includes Date Entered & Date Exit =====
      const fmtExpDate = (d) => { if(!d) return '—'; try { const dt = new Date(d.includes('-') ? d+'T00:00:00' : d); if(isNaN(dt)) return d; return dt.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}); } catch(e) { return d; } };
      const cols = ['#','Ref ID','Visitor Name','Phone','Visitor Type','Company','Host','Unit','Gate','Purpose','ID Document','ID Number','Date Entered','Time In','Date Exit','Check Out','Duration','Status'];
      const aoa = rows.map((e, i) => {
        const parsed = parseIdDoc(e.idDoc);
        const idNumber = parsed.number !== '—' ? parsed.number : synthId(e.visitor, parsed.type);
        const entryDt = e.dateIn || e.registeredDate || e.visitDate || e.date || '';
        const ns = (e.status || '').toUpperCase().replace(/\s+/g,' ');
        const isCoExp = ns === 'CHECKED OUT' || ns === 'EXITED';
        const exitDt = e.dateOut || (isCoExp ? entryDt : '');
        const expDuration = e.timeIn && e.timeOut ? (computeDuration(e.timeIn, e.timeOut, entryDt, exitDt) || e.duration || '—') : (e.duration || '—');
        return [
          i + 1,
          e.refId || e.id || '—',
          e.visitor || '—',
          e.phone || '—',
          e.type || '—',
          e.company || '—',
          e.host || '—',
          formatUnitExp(e.flat) || '—',
          e.gateUsed || e.gate || 'Main Gate',
          e.purpose || '—',
          parsed.type,
          idNumber,
          fmtExpDate(entryDt),
          formatTimeExp(e.timeIn) || '—',
          fmtExpDate(exitDt),
          formatTimeExp(e.timeOut) || '—',
          expDuration,
          statusLabel(e.status)
        ];
      });

      // ===== Metadata block =====
      const now = new Date();
      const pad = (n) => String(n).padStart(2,'0');
      const generatedAt = now.getFullYear() + '-' + pad(now.getMonth()+1) + '-' + pad(now.getDate()) + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes()) + ' GST';
      const propertyName = 'VARS Property Management — Sky Tower';
      const propertyLocation = 'Al Reem Island, Shams Abu Dhabi, Abu Dhabi, UAE';
      const securityUser = 'Suresh Kumar (Security Officer)';
      const gateUsed = selectedGate || 'All Gates';
      const rangeLine = (exportDateFrom || exportDateTo) ? ((exportDateFrom||'…') + '  →  ' + (exportDateTo||'…')) : 'All dates';
      const selectedTypes = Object.keys(exportTypes).filter(k => exportTypes[k]).map(k => k.replace('_',' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())).join(', ') || '—';
      // Breakdown
      const bIn = rows.filter(e => isIn(normSt(e))).length;
      const bCo = rows.filter(e => isCo(normSt(e))).length;
      const bSch = rows.filter(e => isSch(normSt(e))).length;
      const bRej = rows.filter(e => isRej(normSt(e))).length;
      const breakdown = 'Inside ' + bIn + '  ·  Checked Out ' + bCo + '  ·  Scheduled ' + bSch + '  ·  Rejected ' + bRej;

      const metadataRows = [
        ['VARS — VISITOR DATABASE EXPORT'],
        [],
        ['Generated', generatedAt],
        ['Property', propertyName],
        ['Location', propertyLocation],
        ['Security Officer', securityUser],
        ['Gate', gateUsed],
        ['Date Range', rangeLine],
        ['Visitor Types', selectedTypes],
        ['Total Records', String(rows.length)],
        ['Breakdown', breakdown],
        [],
      ];

      const today = formatDate(new Date()).replace(/\s+/g,'-');
      const baseName = 'VARS_Visitors_' + today;

      if (exportFormat === 'xlsx') {
        // Use xlsx-js-style global (loaded from xlsx-js-style bundle — overrides XLSX)
        // Column widths — wide enough to avoid truncation
        // Column A is widened to fit metadata labels (longest: "Security Officer" ~16 chars)
        const colWidths = [
          {wch:20},  // # / Metadata labels
          {wch:14},  // Ref ID
          {wch:30},  // Visitor Name
          {wch:22},  // Phone
          {wch:22},  // Visitor Type
          {wch:28},  // Company
          {wch:24},  // Host
          {wch:10},  // Unit
          {wch:16},  // Gate
          {wch:26},  // Purpose
          {wch:18},  // ID Document
          {wch:26},  // ID Number
          {wch:14},  // Date Entered
          {wch:13},  // Time In
          {wch:14},  // Date Exit
          {wch:13},  // Check Out
          {wch:12},  // Duration
          {wch:15},  // Status
        ];

        // ===== VARS site colour palette =====
        const COLOR = {
          brand:    '928989', // --bg-warm-dark
          textDark: '1A1A1A', // --text-dark
          textMute: '8A8A8A', // --text-muted
          borderLt: 'EBE7E3', // --border-light
          borderMd: 'D5CFC8', // --border-medium
          bgPage:   'F5F3F0', // --bg-page
          bgSurf:   'FAF8F6', // --bg-surface
          bgCard:   'FFFFFF'
        };
        const FONT = 'Helvetica Neue';

        // Build rows as object arrays with style — we'll manually construct cell dicts
        const wb = XLSX.utils.book_new();
        const ws = {};

        // Helper to set a styled cell
        const setCell = (r, c, value, style) => {
          const addr = XLSX.utils.encode_cell({ r, c });
          const isNum = typeof value === 'number';
          ws[addr] = { t: isNum ? 'n' : 's', v: value == null ? '' : value, s: style || {} };
        };

        let r = 0;
        const nCols = cols.length;
        const metaMerges = [];

        // ===== Logo + Title (rows 0-1) =====
        // Col A merged across rows 0-1 as a brand "V" shield logo cell
        setCell(r, 0, 'V', {
          font: { name: FONT, sz: 36, bold: true, color: { rgb: 'FFFFFF' } },
          fill: { patternType: 'solid', fgColor: { rgb: COLOR.brand } },
          alignment: { horizontal: 'center', vertical: 'center' },
          border: {
            top:    { style: 'medium', color: { rgb: COLOR.brand } },
            bottom: { style: 'medium', color: { rgb: COLOR.brand } },
            left:   { style: 'medium', color: { rgb: COLOR.brand } },
            right:  { style: 'medium', color: { rgb: COLOR.brand } },
          },
        });
        // Placeholder cell below for the merge
        setCell(r + 1, 0, '', {
          fill: { patternType: 'solid', fgColor: { rgb: COLOR.brand } },
        });
        metaMerges.push({ s: { r: 0, c: 0 }, e: { r: 1, c: 0 } });

        // Title row — "VARS" large wordmark in col B, merged across remaining cols
        setCell(r, 1, 'VARS', {
          font: { name: FONT, sz: 22, bold: true, color: { rgb: COLOR.textDark } },
          fill: { patternType: 'solid', fgColor: { rgb: COLOR.bgSurf } },
          alignment: { horizontal: 'left', vertical: 'center', indent: 1 },
        });
        for (let c = 2; c < nCols; c++) {
          setCell(r, c, '', { fill: { patternType: 'solid', fgColor: { rgb: COLOR.bgSurf } } });
        }
        metaMerges.push({ s: { r: 0, c: 1 }, e: { r: 0, c: nCols - 1 } });
        r++;

        // Subtitle row — "VISITOR DATABASE EXPORT · Property Management Software"
        setCell(r, 1, 'VISITOR DATABASE EXPORT  ·  PROPERTY MANAGEMENT SOFTWARE', {
          font: { name: FONT, sz: 9, bold: true, color: { rgb: COLOR.textMute } },
          fill: { patternType: 'solid', fgColor: { rgb: COLOR.bgSurf } },
          alignment: { horizontal: 'left', vertical: 'center', indent: 1 },
        });
        for (let c = 2; c < nCols; c++) {
          setCell(r, c, '', { fill: { patternType: 'solid', fgColor: { rgb: COLOR.bgSurf } } });
        }
        metaMerges.push({ s: { r: 1, c: 1 }, e: { r: 1, c: nCols - 1 } });
        r++;
        r++; // blank spacer

        // ===== Metadata rows (label | value | ...) =====
        // Labels now left-aligned since col A is wide
        const metaLabelStyle = {
          font: { name: FONT, sz: 9, bold: true, color: { rgb: COLOR.textMute } },
          alignment: { horizontal: 'left', vertical: 'center', indent: 1 },
        };
        const metaValueStyle = {
          font: { name: FONT, sz: 10, color: { rgb: COLOR.textDark } },
          alignment: { horizontal: 'left', vertical: 'center', wrapText: false, indent: 1 },
        };
        const metaPairs = [
          ['GENERATED', generatedAt],
          ['PROPERTY', propertyName],
          ['LOCATION', propertyLocation],
          ['SECURITY OFFICER', securityUser],
          ['GATE', gateUsed],
          ['DATE RANGE', rangeLine],
          ['VISITOR TYPES', selectedTypes],
          ['TOTAL RECORDS', String(rows.length)],
          ['BREAKDOWN', breakdown],
        ];

        metaPairs.forEach(pair => {
          setCell(r, 0, pair[0], metaLabelStyle);
          setCell(r, 1, pair[1], metaValueStyle);
          // Merge value across remaining columns
          metaMerges.push({ s: { r, c: 1 }, e: { r, c: nCols - 1 } });
          r++;
        });

        r++; // blank spacer
        const headerRowIdx = r;

        // ===== Column header row =====
        const headerStyle = {
          font: { name: FONT, sz: 9, bold: true, color: { rgb: 'FFFFFF' } },
          fill: { patternType: 'solid', fgColor: { rgb: COLOR.brand } },
          alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
          border: {
            top:    { style: 'thin', color: { rgb: COLOR.brand } },
            bottom: { style: 'thin', color: { rgb: COLOR.brand } },
            left:   { style: 'thin', color: { rgb: COLOR.brand } },
            right:  { style: 'thin', color: { rgb: COLOR.brand } },
          },
        };
        cols.forEach((col, c) => setCell(r, c, col, headerStyle));
        r++;

        // ===== Data rows =====
        const cellBorder = {
          top:    { style: 'hair', color: { rgb: COLOR.borderLt } },
          bottom: { style: 'hair', color: { rgb: COLOR.borderLt } },
          left:   { style: 'hair', color: { rgb: COLOR.borderLt } },
          right:  { style: 'hair', color: { rgb: COLOR.borderLt } },
        };
        const dataStyleOdd = {
          font: { name: FONT, sz: 9, color: { rgb: COLOR.textDark } },
          alignment: { horizontal: 'left', vertical: 'center', wrapText: false },
          border: cellBorder,
          fill: { patternType: 'solid', fgColor: { rgb: 'FFFFFF' } },
        };
        const dataStyleEven = {
          font: { name: FONT, sz: 9, color: { rgb: COLOR.textDark } },
          alignment: { horizontal: 'left', vertical: 'center', wrapText: false },
          border: cellBorder,
          fill: { patternType: 'solid', fgColor: { rgb: COLOR.bgSurf } },
        };
        const numStyleOdd = { ...dataStyleOdd, alignment: { horizontal: 'right', vertical: 'center' } };
        const numStyleEven = { ...dataStyleEven, alignment: { horizontal: 'right', vertical: 'center' } };

        aoa.forEach((row, idx) => {
          const isEven = idx % 2 === 1;
          row.forEach((val, c) => {
            const isNumber = typeof val === 'number';
            const base = isNumber ? (isEven ? numStyleEven : numStyleOdd) : (isEven ? dataStyleEven : dataStyleOdd);
            // Colour-code Status column
            if (c === 17) { // Status column index
              const s = String(val||'').toUpperCase();
              let bg = base.fill.fgColor.rgb;
              let fg = COLOR.textDark;
              let bold = true;
              if (s === 'INSIDE') { bg = 'D6E9D5'; fg = '2D5A2D'; }
              else if (s === 'CHECKED OUT') { bg = 'E4E4E4'; fg = '4A4A4A'; }
              else if (s === 'SCHEDULED') { bg = 'FFE8CC'; fg = '8A5A1A'; }
              else if (s === 'REJECTED') { bg = 'F5D6D6'; fg = '8A2A2A'; }
              setCell(r, c, val, {
                ...base,
                font: { name: FONT, sz: 9, bold, color: { rgb: fg } },
                fill: { patternType: 'solid', fgColor: { rgb: bg } },
                alignment: { horizontal: 'center', vertical: 'center' },
              });
            } else {
              setCell(r, c, val, base);
            }
          });
          r++;
        });

        r++; // blank
        // Footer
        setCell(r, 0, '— End of report · ' + rows.length + ' records · Generated by VARS Property Management —', {
          font: { name: FONT, sz: 9, italic: true, color: { rgb: COLOR.textMute } },
          alignment: { horizontal: 'left', indent: 1 },
        });
        metaMerges.push({ s: { r, c: 0 }, e: { r, c: nCols - 1 } });
        r++;

        // ===== Sheet config =====
        ws['!ref'] = XLSX.utils.encode_range({ s: { c: 0, r: 0 }, e: { c: nCols - 1, r: r } });
        ws['!cols'] = colWidths;
        ws['!merges'] = metaMerges;
        // Row heights
        ws['!rows'] = [];
        ws['!rows'][0] = { hpt: 32 }; // title row (logo top half + VARS wordmark)
        ws['!rows'][1] = { hpt: 20 }; // subtitle row (logo bottom half)
        // Metadata rows — slightly taller for breathing room
        for (let mr = 3; mr < 3 + metaPairs.length; mr++) ws['!rows'][mr] = { hpt: 18 };
        ws['!rows'][headerRowIdx] = { hpt: 24 }; // column header row
        // Hide gridlines + freeze panes below the header
        ws['!sheetView'] = [{ showGridLines: false }];
        ws['!freeze'] = { xSplit: 0, ySplit: headerRowIdx + 1 };
        // Also set the standard views block for frozen panes
        if (!ws['!views']) ws['!views'] = [{ showGridLines: false, state: 'frozen', ySplit: headerRowIdx + 1, topLeftCell: XLSX.utils.encode_cell({ r: headerRowIdx + 1, c: 0 }) }];

        XLSX.utils.book_append_sheet(wb, ws, 'Visitors');
        setTimeout(() => { XLSX.writeFile(wb, baseName + '.xlsx'); showToast('Exported ' + rows.length + ' records to Excel'); }, 100);

      } else if (exportFormat === 'csv') {
        // CSV — plain text with an ASCII VARS logo banner at the top.
        // CSV format does not support colours, fonts, borders or column widths —
        // the banner is rendered as text block letters so the brand shows up in
        // any CSV viewer (Excel, Numbers, Notepad, terminal, etc.).
        const esc = (v) => { const s = String(v==null?'':v); return /[",\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s; };
        const lines = [];
        // ASCII VARS logo banner — block letters
        const logoBanner = [
          '##########################################################',
          '##                                                      ##',
          '##    #     #     #####      ######     ######          ##',
          '##    #     #    #     #     #     #   #                ##',
          '##    #     #    #     #     #     #   #                ##',
          '##    #     #    #######     ######     #####           ##',
          '##     #   #     #     #     #    #          #          ##',
          '##      # #      #     #     #     #        #           ##',
          '##       #       #     #     #      #  #####            ##',
          '##                                                      ##',
          '##     VARS  ·  VISITOR DATABASE EXPORT                 ##',
          '##     Property Management Software                     ##',
          '##########################################################',
        ];
        logoBanner.forEach(line => lines.push(esc(line)));
        lines.push('');
        metadataRows.forEach(r => { lines.push(r.map(esc).join(',')); });
        lines.push(cols.map(esc).join(','));
        aoa.forEach(r => { lines.push(r.map(esc).join(',')); });
        lines.push('');
        lines.push(esc('— End of report · ' + rows.length + ' records · Generated by VARS Property Management —'));
        const csv = lines.join('\n');
        const blob = new Blob(['\ufeff'+csv], {type:'text/csv;charset=utf-8'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = baseName + '.csv';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 500);
        showToast('Exported ' + rows.length + ' records to CSV');

      } else if (exportFormat === 'pdf') {
        // Direct PDF download using jsPDF + autoTable — no print window, no popup
        const jsPDFCtor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
        if (!jsPDFCtor) { showToast('PDF library failed to load — please reload the page'); return; }
        const doc = new jsPDFCtor({ orientation: 'landscape', unit: 'pt', format: 'a4' });
        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();
        const marginX = 28;
        let y = 28;

        // ===== VARS brand header =====
        // Shield logo (warm grey)
        doc.setFillColor(146, 137, 137); // #928989
        doc.roundedRect(marginX, y, 32, 32, 3, 3, 'F');
        // White V-shield shape inside
        doc.setFillColor(255, 255, 255);
        // Approximate the V shape: rect(100x100) — path coordinates scaled to 32px inside
        const sx = marginX, sy = y, s = 32;
        const pt = (px, py) => [sx + (px/100)*s, sy + (py/100)*s];
        const path = [[33.3,16.7],[50,16.7],[58.1,25.2],[66.7,33.3],[66.7,83.3],[50,83.3],[33.3,66.7]];
        // Draw filled polygon via triangle fan
        for (let i = 1; i < path.length - 1; i++) {
          const a = pt(path[0][0], path[0][1]);
          const b = pt(path[i][0], path[i][1]);
          const c = pt(path[i+1][0], path[i+1][1]);
          doc.triangle(a[0], a[1], b[0], b[1], c[0], c[1], 'F');
        }

        // VARS wordmark
        doc.setTextColor(26, 26, 26); // #1a1a1a
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(22);
        doc.text('VARS', marginX + 42, y + 20);

        doc.setFontSize(8);
        doc.setTextColor(90, 90, 90); // #5a5a5a
        doc.setFont('helvetica', 'bold');
        doc.text('VISITOR DATABASE EXPORT', marginX + 42, y + 32);

        // Right-aligned generation timestamp
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(138, 138, 138); // #8a8a8a
        doc.text('Generated ' + generatedAt, pageW - marginX, y + 20, { align: 'right' });
        doc.text('VARS v1.0 · Property Management', pageW - marginX, y + 32, { align: 'right' });

        // Divider line
        y += 44;
        doc.setDrawColor(146, 137, 137); // #928989
        doc.setLineWidth(1.2);
        doc.line(marginX, y, pageW - marginX, y);
        y += 12;

        // ===== Metadata block (2-col grid) =====
        doc.setFillColor(250, 248, 246); // #faf8f6
        doc.setDrawColor(235, 231, 227); // #ebe7e3
        doc.setLineWidth(0.5);
        const metaBoxH = 74;
        doc.roundedRect(marginX, y, pageW - marginX*2, metaBoxH, 4, 4, 'FD');

        const metaPairs = [
          ['Property', propertyName],
          ['Security Officer', securityUser],
          ['Location', propertyLocation],
          ['Gate', gateUsed],
          ['Date Range', rangeLine],
          ['Total Records', String(rows.length)],
          ['Visitor Types', selectedTypes],
          ['Breakdown', breakdown],
        ];
        const colW = (pageW - marginX*2 - 24) / 2;
        const cellH = 16;
        let my = y + 12;
        metaPairs.forEach((pair, i) => {
          const colIdx = i % 2;
          const rowIdx = Math.floor(i / 2);
          const cellX = marginX + 12 + colIdx * colW;
          const cellY = y + 12 + rowIdx * cellH;
          // Label
          doc.setFontSize(7);
          doc.setTextColor(138, 138, 138);
          doc.setFont('helvetica', 'bold');
          doc.text(pair[0].toUpperCase(), cellX, cellY);
          // Value
          doc.setFontSize(9);
          doc.setTextColor(26, 26, 26);
          doc.setFont('helvetica', 'normal');
          const maxValW = colW - 90;
          const valStr = doc.splitTextToSize(String(pair[1]||''), maxValW).slice(0,1).join('');
          doc.text(valStr, cellX + 82, cellY);
        });
        y += metaBoxH + 12;

        // ===== Data table via autoTable =====
        if (!doc.autoTable) { showToast('PDF table plugin failed to load'); return; }
        doc.autoTable({
          startY: y,
          head: [cols],
          body: aoa.map(r => r.map(v => v==null?'':String(v))),
          theme: 'grid',
          styles: {
            font: 'helvetica',
            fontSize: 6.5,
            cellPadding: 3,
            textColor: [26, 26, 26],
            lineColor: [235, 231, 227],
            lineWidth: 0.3,
            overflow: 'linebreak'
          },
          headStyles: {
            fillColor: [146, 137, 137], // #928989
            textColor: [255, 255, 255],
            fontSize: 6.5,
            fontStyle: 'bold',
            halign: 'left',
            cellPadding: 4,
            lineColor: [146, 137, 137]
          },
          alternateRowStyles: {
            fillColor: [250, 248, 246] // #faf8f6
          },
          columnStyles: {
            0: { cellWidth: 18, halign: 'right' },   // #
            1: { cellWidth: 42 },                    // Ref
            2: { cellWidth: 72 },                    // Visitor
            3: { cellWidth: 62 },                    // Phone
            4: { cellWidth: 58 },                    // Type
            5: { cellWidth: 68 },                    // Company
            6: { cellWidth: 62 },                    // Host
            7: { cellWidth: 28 },                    // Unit
            8: { cellWidth: 42 },                    // Gate
            9: { cellWidth: 58 },                    // Purpose
            10: { cellWidth: 44 },                   // ID Doc
            11: { cellWidth: 62 },                   // ID Number
            12: { cellWidth: 36 },                   // Time In
            13: { cellWidth: 36 },                   // Check Out
            14: { cellWidth: 30 },                   // Duration
            15: { cellWidth: 40 },                   // Status
            16: { cellWidth: 42 },                   // Date
          },
          margin: { left: marginX, right: marginX, bottom: 36 },
          didDrawPage: (hookData) => {
            // Footer on every page
            const footerY = pageH - 20;
            doc.setDrawColor(235, 231, 227);
            doc.setLineWidth(0.4);
            doc.line(marginX, footerY - 10, pageW - marginX, footerY - 10);
            doc.setFontSize(7);
            doc.setTextColor(138, 138, 138);
            doc.setFont('helvetica', 'normal');
            doc.text('VARS Property Management · Confidential · For authorised personnel only', marginX, footerY);
            const pageStr = 'Page ' + doc.internal.getNumberOfPages() + ' · ' + rows.length + ' records';
            doc.text(pageStr, pageW - marginX, footerY, { align: 'right' });
          }
        });

        doc.save(baseName + '.pdf');
        showToast('Exported ' + rows.length + ' records to PDF');
      }
      setShowExportModal(false);
    } catch (error) {
      showToast('Error exporting database: ' + (error.message || 'Please try again'));
    }
  };

  // Action for checkout
  // Compute duration between entry and exit, accounting for different dates.
  // Accepts: computeDuration(timeIn, timeOut) for same-day, or
  //          computeDuration(timeIn, timeOut, dateIn, dateOut) for cross-day.
  // Returns a string like "2h 15m", "1d 3h 47m", or "45m".
  const computeDuration = (timeIn, timeOut, dateIn, dateOut) => {
    const toMin = (t) => {
      if (!t && t !== 0) return null;
      const str = String(t).trim();
      if (!str) return null;
      // 12h with optional seconds: "1:00 PM", "01:00:30 pm", "1:00PM"
      const ap = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM|am|pm|a\.m\.|p\.m\.)$/);
      if (ap) {
        let h = parseInt(ap[1], 10) % 12;
        const isPm = ap[3].toUpperCase().replace(/\./g,'').startsWith('P');
        if (isPm) h += 12;
        return h * 60 + parseInt(ap[2], 10);
      }
      // 24h: "13:00", "13:00:30"
      const h24 = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
      if (h24) return parseInt(h24[1], 10) * 60 + parseInt(h24[2], 10);
      // Hour only with AM/PM: "1 PM"
      const hOnly = str.match(/^(\d{1,2})\s*(AM|PM|am|pm)$/);
      if (hOnly) {
        let h = parseInt(hOnly[1], 10) % 12;
        if (hOnly[2].toUpperCase() === 'PM') h += 12;
        return h * 60;
      }
      // Date string fallback
      const d = new Date(str);
      if (!isNaN(d.getTime())) return d.getHours() * 60 + d.getMinutes();
      return null;
    };
    const a = toMin(timeIn);
    const b = toMin(timeOut);
    if (a == null || b == null) return '';
    // Calculate day difference if dates provided
    let dayDiffMin = 0;
    if (dateIn && dateOut && dateIn !== dateOut) {
      try {
        const d1 = new Date(dateIn + 'T00:00:00');
        const d2 = new Date(dateOut + 'T00:00:00');
        if (!isNaN(d1) && !isNaN(d2)) {
          const diffMs = d2.getTime() - d1.getTime();
          dayDiffMin = Math.round(diffMs / 60000); // days in minutes
        }
      } catch(e) {}
    }
    let diff = dayDiffMin + b - a;
    if (diff < 0) diff += 24 * 60; // crossed midnight (no dates provided)
    const days = Math.floor(diff / (24 * 60));
    const rem = diff % (24 * 60);
    const h = Math.floor(rem / 60);
    const m = rem % 60;
    let parts = [];
    if (days > 0) parts.push(days + 'd');
    if (h > 0) parts.push(h + 'h');
    if (m > 0) parts.push(m + 'm');
    return parts.join(' ') || '0m';
  };

  const handleCheckout = (entry) => {
    const now = new Date();
    const timeOut = formatTime12(now);
    const dateOutIso = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
    const dateInIso = entry.dateIn || entry.registeredDate || entry.visitDate || entry.date || dateOutIso;
    const duration = computeDuration(entry.timeIn, timeOut, dateInIso, dateOutIso) || entry.duration || '';
    setData(prev => ({
      ...prev,
      entryLog: prev.entryLog.map(e => e.id === entry.id ? {...e, status:'CHECKED OUT', timeOut, dateOut: dateOutIso, duration} : e),
      insideVisitors: prev.insideVisitors.filter(v => v.name !== entry.visitor),
      visitors: prev.visitors.map(v => v.name === entry.visitor && v.status === 'Inside' ? {...v, status:'Checked Out', dateOut: dateOutIso} : v)
    }));
    showToast(entry.visitor + ' checked out' + (duration ? ' · ' + duration : ''));
  };

  const renderContent = () => {
    if(currentTab === 'dashboard') {
      const activePending = (data.pendingApprovals || []).filter(p => !p.resolved);
      // Case-insensitive status helpers — single source of truth for counts
      const dashNormStatus = (e) => (e.status||'').toUpperCase().trim();
      const dashIsInside = (e) => { const s = dashNormStatus(e); return s === 'PASSED SECURITY' || s === 'CLEARED' || s === 'INSIDE' || s === 'RESIDENT APPROVED' || s === 'APPROVED BY SECURITY' || s === 'APPROVED'; };
      const dashIsCheckedOut = (e) => { const s = dashNormStatus(e); return s === 'CHECKED OUT' || s === 'EXITED'; };
      const dashIsScheduled = (e) => { const s = dashNormStatus(e); return s === 'SCHEDULED' || s === 'PRE-APPROVED' || s === 'PENDING' || s === 'AWAITING APPROVAL'; };
      const dashIsRejected = (e) => { const s = dashNormStatus(e); return s === 'REJECTED' || s === 'REJECTED BY SECURITY' || s === 'DENIED ENTRY' || s === 'ON HOLD' || s === 'FLAGGED'; };
      // ===== Filter by TODAY only — dashboard shows current day activity =====
      const now = new Date();
      const todayIso = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
      const entryDate = (e) => e.dateIn || e.visitDate || e.registeredDate || e.date || '';
      const todayLog = data.entryLog.filter(e => entryDate(e) === todayIso);
      // Derive all counts from today's entries only
      const clearedCount = todayLog.filter(dashIsInside).length;
      const pendingCount = activePending.length;
      const scheduledCount = todayLog.filter(dashIsScheduled).length;
      const flaggedCount = todayLog.filter(dashIsRejected).length;
      const checkedOutCount = todayLog.filter(dashIsCheckedOut).length;
      const rejectedCountToday = todayLog.filter(dashIsRejected).length;
      const totalInside = clearedCount + pendingCount;
      // Total Today = only entries whose date matches today
      const totalToday = todayLog.length;
      // Visitors Inside middle column is now derived directly from entryLog so its
      // count, its filter chips, and the "Visitors Inside" KPI on the left always
      // agree. Each inside entry is normalized into the shape the card renderer
      // expects (name/initials/type/inTime/duration/host).
      const getInitialsFromName = (n) => (n||'').split(/\s+/).filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0,2);
      // Visitors Inside — derived from today's log only
      const insideFromLog = todayLog.filter(dashIsInside).map(e => ({
        id: e.id,
        entryId: e.id,
        name: e.visitor || e.name || '—',
        initials: e.initials || getInitialsFromName(e.visitor || e.name || ''),
        type: e.type || 'Visitor',
        inTime: e.timeIn || '',
        duration: e.duration || '',
        host: e.host || '—',
        _raw: e
      }));
      const typeIsGuest = (t) => { const s = (t||'').toLowerCase(); return s.includes('guest') || s.includes('vip') || s.includes('resident'); };
      const typeIsVendor = (t) => { const s = (t||'').toLowerCase(); return s.includes('delivery') || s.includes('courier') || s.includes('contractor') || s.includes('vendor') || s.includes('service') || s.includes('cleaning') || s.includes('maintenance') || s.includes('worker'); };
      const typeIsStaff = (t) => { const s = (t||'').toLowerCase(); return s.includes('staff') || s.includes('employee'); };
      const guestCount = insideFromLog.filter(v => typeIsGuest(v.type)).length;
      const deliveryCount = insideFromLog.filter(v => (v.type||'').toLowerCase().includes('delivery')).length;
      const contractorCount = insideFromLog.filter(v => (v.type||'').toLowerCase().includes('contractor')).length;
      const serviceCount = insideFromLog.filter(v => typeIsVendor(v.type)).length;
      // Inside visitors filtered by tab — uses the same insideFromLog so counts stay in sync
      const filteredInside = insideFilterTab === 'ALL' ? insideFromLog :
        insideFilterTab === 'GUESTS' ? insideFromLog.filter(v => typeIsGuest(v.type)) :
        insideFilterTab === 'VENDORS' ? insideFromLog.filter(v => typeIsVendor(v.type)) :
        insideFromLog.filter(v => typeIsStaff(v.type));
      // Entry log on dashboard — today's entries only, paginated
      const totalLogPages = Math.max(1, Math.ceil(todayLog.length / ENTRY_LOG_PER_PAGE));
      const pagedLog = todayLog.slice(entryLogPage * ENTRY_LOG_PER_PAGE, (entryLogPage + 1) * ENTRY_LOG_PER_PAGE);

      return (
        <div>
          {/* § 01 — PRIMARY CONTROLS */}
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
            <div>
              <div style={{fontSize:13,fontWeight:600,color:'#1a1a1a'}}>{t('sec.primaryControls')}</div>
              <div style={{fontSize:10,color:'#a89a92',marginTop:2}}>{t('sec.quickActions')}</div>
            </div>
          </div>
          <div className="sec-quick-actions">
            <div className="sec-quick-action-btn" onClick={() => { resetNewVisitorForm(); setShowNewVisitorForm(true); }} style={{cursor:'pointer',position:'relative'}}>
              <div style={{width:40,height:40,borderRadius:'50%',background:'#e8e3de',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 10px'}}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" strokeWidth="2" strokeLinecap="round"><circle cx="10" cy="8" r="3.5"/><path d="M4 20v-1a4 4 0 014-4h4a4 4 0 014 4v1"/><line x1="19.5" y1="3" x2="19.5" y2="9"/><line x1="16.5" y1="6" x2="22.5" y2="6"/></svg>
              </div>
              <div className="label">{t('sec.newVisitorEntry')}</div>
              <div className="shortcut">{t('sec.newVisitorEntryDesc')}</div>

            </div>
            <div className="sec-quick-action-btn" onClick={() => setShowScanner(true)} style={{cursor:'pointer',position:'relative'}}>
              <div style={{width:40,height:40,borderRadius:'50%',background:'#e8e3de',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 10px'}}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
              </div>
              <div className="label">{t('sec.scanQR')}</div>
              <div className="shortcut">{t('sec.scanQRDesc')}</div>

            </div>
          </div>

          {/* New: pre-approvals from visits table (Supabase Auth users only) */}
          <UpcomingVisitsPanel/>

          {/* 3-COLUMN GRID */}
          <div className="sec-grid-3">
            {/* LEFT COLUMN — Today's Summary */}
            <div className="sec-column">
              <div className="sec-kpi-block">
                <div style={{marginBottom:14}}>
                  <div className="sec-kpi-label" style={{marginBottom:4}}>{t('sec.todaysSummary')}</div>
                  <div style={{fontSize:10,color:'#a89a92'}}>{t('sec.activityOverview')}</div>
                </div>

                {/* Total — sandy tile, black number */}
                <div onClick={() => { const t = new Date(); const ts = t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0'); setVisRegDateFrom(ts); setVisRegDateTo(ts); setVisRegPage(0); setSecVisitorFilter('ALL'); setCurrentTab('visitors'); }}
                  style={{background:'#e8e3de',borderRadius:6,padding:'14px 16px',marginBottom:12,display:'flex',justifyContent:'space-between',alignItems:'center',cursor:'pointer',border:'1px solid #d5cfc8'}}
                  onMouseEnter={e => e.currentTarget.style.background='#ddd6cc'}
                  onMouseLeave={e => e.currentTarget.style.background='#e8e3de'}>
                  <div>
                    <div style={{fontSize:10,color:'#7a6e60',letterSpacing:'0.06em',textTransform:'uppercase',marginBottom:4,fontWeight:600}}>{t('sec.totalToday')}</div>
                    <div style={{fontSize:32,fontWeight:700,color:'#1a1a1a',lineHeight:1}}>{totalToday}</div>
                  </div>
                  <div style={{fontSize:10,color:'#7a6e60',textAlign:'right'}}>{t('sec.allMovements')}</div>
                </div>

                {/* Breakdown rows — all sandy/grey, clickable */}
                {[
                  { label: t('sec.visInside'), count: clearedCount, filter: 'INSIDE', icon: (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#928989" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  )},
                  { label: t('sec.visCheckedOut'), count: checkedOutCount, filter: 'CHECKED_OUT', icon: (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#928989" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
                  )},
                  { label: t('sec.visScheduled'), count: scheduledCount, filter: 'SCHEDULED', icon: (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#928989" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  )},
                  { label: t('sec.visRejected'), count: rejectedCountToday, filter: 'REJECTED', icon: (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#928989" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                  )},
                ].map(row => (
                  <div key={row.label}
                    onClick={() => { const t = new Date(); const ts = t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0'); setVisRegDateFrom(ts); setVisRegDateTo(ts); setVisRegPage(0); setSecVisitorFilter(row.filter); setCurrentTab('visitors'); }}
                    style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 14px',background:'#f5f3f0',borderRadius:4,marginBottom:8,cursor:'pointer',border:'1px solid transparent',transition:'all .15s'}}
                    onMouseEnter={e => { e.currentTarget.style.background='#ebe7e3'; e.currentTarget.style.borderColor='#d5cfc8'; }}
                    onMouseLeave={e => { e.currentTarget.style.background='#f5f3f0'; e.currentTarget.style.borderColor='transparent'; }}>
                    <div style={{display:'flex',alignItems:'center',gap:10}}>
                      <div style={{width:28,height:28,borderRadius:6,background:'#fff',display:'flex',alignItems:'center',justifyContent:'center',border:'1px solid #ebe7e3'}}>
                        {row.icon}
                      </div>
                      <span style={{fontSize:12,color:'#1a1a1a',fontWeight:500}}>{row.label}</span>
                    </div>
                    <span style={{fontSize:18,fontWeight:700,color:'#928989'}}>{row.count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* MIDDLE COLUMN — Visitors Inside */}
            <div className="sec-column">
              <div className="sec-kpi-block">
                <div className="sec-kpi-label" style={{marginBottom:8}}>{t('sec.visitorsInside')}</div>
                <div style={{display:'flex',gap:6,marginBottom:12}}>
                  {['ALL','GUESTS','VENDORS','STAFF'].map(f => {
                    const lbl = f === 'ALL' ? t('sec.all') : f === 'GUESTS' ? t('sec.guests') : f === 'VENDORS' ? t('sec.vendors') : t('sec.staff');
                    return (
                      <button key={f} onClick={() => setInsideFilterTab(f)} className={`sec-filter-chip ${insideFilterTab===f?'active':''}`} style={{flex:1}}>{lbl}</button>
                    );
                  })}
                </div>
                {filteredInside.length === 0 ? (
                  <div style={{textAlign:'center',padding:'20px 0',color:'#a89a92',fontSize:12}}>{t('sec.noVisitorsCategory')}</div>
                ) : filteredInside.slice(0,4).map(v => (
                  <div key={v.id} className="sec-visitor-now-card">
                    <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
                      <div style={{width:32,height:32,borderRadius:'50%',background:'#e8e3de',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:600,color:'#1a1a1a'}}>
                        {v.initials}
                      </div>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:600,fontSize:12,color:'#1a1a1a'}}>{v.name}</div>
                        <div style={{fontSize:10,color:'#a89a92'}}>{v.type}</div>
                      </div>
                      <div style={{textAlign:'right'}}>
                        <div style={{fontSize:10,color:'#a89a92'}}>{v.inTime}</div>
                        <div style={{fontSize:10,color:'#1a1a1a'}}>{v.duration}</div>
                      </div>
                    </div>
                    <div style={{fontSize:10,color:'#a89a92',marginBottom:8}}>{t('sec.host')}: {v.host}</div>
                    <button className="sec-quick-checkout-btn" onClick={() => {
                      const nowD = new Date();
                      const nowStr = formatTime12(nowD);
                      const dateOutIso = nowD.getFullYear()+'-'+String(nowD.getMonth()+1).padStart(2,'0')+'-'+String(nowD.getDate()).padStart(2,'0');
                      setData(prev => ({
                        ...prev,
                        insideVisitors: prev.insideVisitors.filter(iv => iv.name !== v.name),
                        entryLog: prev.entryLog.map(e => e.id === v.entryId ? {...e, status:'CHECKED OUT', timeOut: nowStr, dateOut: dateOutIso, duration: computeDuration(e.timeIn, nowStr, e.dateIn || e.registeredDate || e.date || dateOutIso, dateOutIso) || e.duration || ''} : e)
                      }));
                      showToast(v.name + ' checked out');
                    }}>{t('sec.quickCheckout')}</button>
                  </div>
                ))}
                <button className="sec-view-all-btn" onClick={() => { setSecVisitorFilter('INSIDE'); setVisRegDateFrom(''); setVisRegDateTo(''); setVisRegPage(0); setCurrentTab('visitors'); }}>{t('sec.viewAllInside')}{insideFromLog.length > 0 ? ' (' + insideFromLog.length + ')' : ''}</button>
              </div>
            </div>

            {/* RIGHT COLUMN — Pending Approvals */}
            <div className="sec-column">
              <div className="sec-kpi-block">
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                  <div className="sec-kpi-label" style={{margin:0}}>{t('sec.pendingApprovals')}</div>
                  <span style={{background:'#ebe3d9',color:'#7a6040',padding:'3px 10px',borderRadius:10,fontSize:11,fontWeight:600}}>{activePending.length} {t('sec.waiting')}</span>
                </div>
                {activePending.length === 0 ? (
                  <div style={{textAlign:'center',padding:'20px 0',color:'#a89a92',fontSize:12}}>{t('sec.noPendingApprovals')}</div>
                ) : (
                  <div style={{maxHeight:520,overflowY:'auto',paddingRight:4}}>
                    {activePending.map(p => (
                      <div key={p.id} className="sec-pending-card">
                        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
                          <div style={{width:32,height:32,borderRadius:'50%',background:'#e8e3de',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:600,color:'#1a1a1a'}}>
                            {(p.name || '').split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2)}
                          </div>
                          <div style={{flex:1,minWidth:0}}>
                            <div className="name">{p.name}</div>
                            <div className="details">{translateType(p.type)} • {t('sec.unit')} {p.flat} • {translateTimeSec(p.time || p.timeWaiting) || t('sec.justNow')}</div>
                          </div>
                        </div>
                        <div style={{display:'flex',alignItems:'center',gap:6,padding:'6px 8px',background:'#fff6e8',border:'1px solid #f0e0c0',borderRadius:4,marginBottom:8}}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#b58437" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                          <span style={{fontSize:10,color:'#7a6040',fontWeight:600,letterSpacing:'0.02em'}}>{t('sec.awaitingApproval')}</span>
                        </div>
                        <div className="action-buttons">
                          <button className="approve-btn" onClick={() => handleSecApprove(p)} style={{fontSize:10,display:'flex',alignItems:'center',justifyContent:'center',gap:4}}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg> {t('sec.approveBySecurity')}
                          </button>
                          <button className="reject-btn" onClick={() => handleSecReject(p)} style={{fontSize:10,display:'flex',alignItems:'center',justifyContent:'center',gap:4}}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> {t('sec.rejectBySecurity')}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* UTILITY ACTIONS — Clickable contact cards */}
          <div className="sec-utility-cards" style={{gridTemplateColumns:'repeat(2,1fr)'}}>
            <div className="sec-utility-card" onClick={() => setSecContactModal('security')} style={{textAlign:'left',padding:'16px 18px',cursor:'pointer'}}>
              <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:10}}>
                <div style={{width:38,height:38,borderRadius:'50%',background:'#928989',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,color:'#fff',fontSize:13,fontWeight:700}}>KR</div>
                <div>
                  <div style={{fontSize:10,color:'#a89a92',letterSpacing:'0.04em',marginBottom:1}}>{t('sec.securityHead')}</div>
                  <div style={{fontSize:13,fontWeight:700,color:'#1a1a1a'}}>Khalid Al-Rashidi</div>
                </div>
              </div>
              <div style={{borderTop:'1px solid #f0f0f0',paddingTop:10,fontSize:11,color:'#a89a92'}}>{t('sec.tapToView')}</div>
            </div>
            <div className="sec-utility-card" onClick={() => setSecContactModal('pm')} style={{textAlign:'left',padding:'16px 18px',cursor:'pointer'}}>
              <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:10}}>
                <div style={{width:38,height:38,borderRadius:'50%',background:'#928989',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,color:'#fff',fontSize:13,fontWeight:700}}>NS</div>
                <div>
                  <div style={{fontSize:10,color:'#a89a92',letterSpacing:'0.04em',marginBottom:1}}>{t('sec.propertyManager')}</div>
                  <div style={{fontSize:13,fontWeight:700,color:'#1a1a1a'}}>Nitin Sharma</div>
                </div>
              </div>
              <div style={{borderTop:'1px solid #f0f0f0',paddingTop:10,fontSize:11,color:'#a89a92'}}>{t('sec.tapToView')}</div>
            </div>
          </div>

          {/* Head of Security Contact Modal — sandy app style */}
          {secContactModal === 'security' && (
            <div style={{position:'fixed',inset:0,background:'rgba(26,26,26,0.45)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:20}} onClick={() => setSecContactModal(null)}>
              <div style={{background:'#faf8f5',borderRadius:12,maxWidth:400,width:'100%',overflow:'hidden',boxShadow:'0 20px 60px rgba(0,0,0,0.25)',border:'1px solid #ebe7e3'}} onClick={e => e.stopPropagation()}>
                {/* Banner with avatar */}
                <div style={{background:'linear-gradient(180deg,#ebe3d9 0%, #faf8f5 100%)',padding:'22px 22px 18px',position:'relative'}}>
                  <button onClick={() => setSecContactModal(null)} style={{position:'absolute',top:14,right:14,background:'rgba(255,255,255,0.6)',border:'1px solid #e5e0d8',width:26,height:26,borderRadius:'50%',cursor:'pointer',color:'#5a5a5a',display:'flex',alignItems:'center',justifyContent:'center'}}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                  <div style={{fontSize:9,fontWeight:700,color:'#7a6040',letterSpacing:'0.12em',marginBottom:10}}>{t('sec.headOfSecurity')}</div>
                  <div style={{display:'flex',alignItems:'center',gap:14}}>
                    <div style={{width:56,height:56,borderRadius:'50%',background:'#fff',border:'2px solid #ebe3d9',color:'#7a6040',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,fontWeight:700,flexShrink:0,boxShadow:'0 2px 8px rgba(122,96,64,0.12)'}}>KR</div>
                    <div style={{minWidth:0}}>
                      <div style={{fontWeight:700,fontSize:15,color:'#1a1a1a'}}>Khalid Al-Rashidi</div>
                      <div style={{fontSize:11,color:'#8a8078',marginTop:2}}>{t('sec.chiefOfficerCard')}</div>
                      <div style={{fontSize:10,color:'#a89a92',marginTop:3,display:'flex',alignItems:'center',gap:4}}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#5a6b4f" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        Shift 06:00 – 18:00
                      </div>
                    </div>
                  </div>
                </div>
                {/* Contact rows */}
                <div style={{padding:'16px 20px 20px',display:'flex',flexDirection:'column',gap:8}}>
                  <a href="tel:+971508001122" style={{display:'flex',alignItems:'center',gap:12,padding:'12px 14px',background:'#fff',border:'1px solid #ebe7e3',borderRadius:8,textDecoration:'none',color:'#1a1a1a'}}>
                    <div style={{width:34,height:34,borderRadius:8,background:'#f0ece5',display:'flex',alignItems:'center',justifyContent:'center',color:'#6a5a45',flexShrink:0}}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.11 2 2 0 014.11 2h3a2 2 0 012 1.72 12.05 12.05 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.05 12.05 0 002.81.7A2 2 0 0122 16.92z"/></svg>
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:10,fontWeight:700,color:'#8a8078',letterSpacing:'0.06em'}}>{t('sec.phoneCall')}</div>
                      <div style={{fontSize:13,fontWeight:600,color:'#1a1a1a',marginTop:1}}>+971 50 800 1122</div>
                    </div>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a89a92" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                  </a>
                  <a href="https://wa.me/971508001122" target="_blank" style={{display:'flex',alignItems:'center',gap:12,padding:'12px 14px',background:'#fff',border:'1px solid #ebe7e3',borderRadius:8,textDecoration:'none',color:'#1a1a1a'}}>
                    <div style={{width:34,height:34,borderRadius:8,background:'#e0e5db',display:'flex',alignItems:'center',justifyContent:'center',color:'#5a6b4f',flexShrink:0}}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:10,fontWeight:700,color:'#8a8078',letterSpacing:'0.06em'}}>{t('sec.whatsapp')}</div>
                      <div style={{fontSize:13,fontWeight:600,color:'#1a1a1a',marginTop:1}}>+971 50 800 1122</div>
                    </div>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a89a92" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                  </a>
                  <a href="mailto:k.rashidi@skytower.ae" style={{display:'flex',alignItems:'center',gap:12,padding:'12px 14px',background:'#fff',border:'1px solid #ebe7e3',borderRadius:8,textDecoration:'none',color:'#1a1a1a'}}>
                    <div style={{width:34,height:34,borderRadius:8,background:'#ebe3d9',display:'flex',alignItems:'center',justifyContent:'center',color:'#7a6040',flexShrink:0}}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 7L2 7"/></svg>
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:10,fontWeight:700,color:'#8a8078',letterSpacing:'0.06em'}}>{t('sec.email')}</div>
                      <div style={{fontSize:13,fontWeight:600,color:'#1a1a1a',marginTop:1,overflow:'hidden',textOverflow:'ellipsis'}}>k.rashidi@skytower.ae</div>
                    </div>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a89a92" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* Property Manager Contact Modal — sandy app style */}
          {secContactModal === 'pm' && (
            <div style={{position:'fixed',inset:0,background:'rgba(26,26,26,0.45)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:20}} onClick={() => setSecContactModal(null)}>
              <div style={{background:'#faf8f5',borderRadius:12,maxWidth:400,width:'100%',overflow:'hidden',boxShadow:'0 20px 60px rgba(0,0,0,0.25)',border:'1px solid #ebe7e3'}} onClick={e => e.stopPropagation()}>
                {/* Banner with avatar */}
                <div style={{background:'linear-gradient(180deg,#e0e5db 0%, #faf8f5 100%)',padding:'22px 22px 18px',position:'relative'}}>
                  <button onClick={() => setSecContactModal(null)} style={{position:'absolute',top:14,right:14,background:'rgba(255,255,255,0.6)',border:'1px solid #e5e0d8',width:26,height:26,borderRadius:'50%',cursor:'pointer',color:'#5a5a5a',display:'flex',alignItems:'center',justifyContent:'center'}}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                  <div style={{fontSize:9,fontWeight:700,color:'#5a6b4f',letterSpacing:'0.12em',marginBottom:10}}>{t('sec.propertyManager')}</div>
                  <div style={{display:'flex',alignItems:'center',gap:14}}>
                    <div style={{width:56,height:56,borderRadius:'50%',background:'#fff',border:'2px solid #e0e5db',color:'#5a6b4f',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,fontWeight:700,flexShrink:0,boxShadow:'0 2px 8px rgba(90,107,79,0.12)'}}>NS</div>
                    <div style={{minWidth:0}}>
                      <div style={{fontWeight:700,fontSize:15,color:'#1a1a1a'}}>Nitin Sharma</div>
                      <div style={{fontSize:11,color:'#8a8078',marginTop:2}}>{t('sec.propertyManagerCard')}</div>
                      <div style={{fontSize:10,color:'#a89a92',marginTop:3,display:'flex',alignItems:'center',gap:4}}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#5a6b4f" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                        Al Reem Island, Abu Dhabi
                      </div>
                    </div>
                  </div>
                </div>
                {/* Contact rows */}
                <div style={{padding:'16px 20px 20px',display:'flex',flexDirection:'column',gap:8}}>
                  <a href="tel:+971552003344" style={{display:'flex',alignItems:'center',gap:12,padding:'12px 14px',background:'#fff',border:'1px solid #ebe7e3',borderRadius:8,textDecoration:'none',color:'#1a1a1a'}}>
                    <div style={{width:34,height:34,borderRadius:8,background:'#f0ece5',display:'flex',alignItems:'center',justifyContent:'center',color:'#6a5a45',flexShrink:0}}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.11 2 2 0 014.11 2h3a2 2 0 012 1.72 12.05 12.05 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.05 12.05 0 002.81.7A2 2 0 0122 16.92z"/></svg>
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:10,fontWeight:700,color:'#8a8078',letterSpacing:'0.06em'}}>{t('sec.phoneCall')}</div>
                      <div style={{fontSize:13,fontWeight:600,color:'#1a1a1a',marginTop:1}}>+971 55 200 3344</div>
                    </div>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a89a92" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                  </a>
                  <a href="https://wa.me/971552003344" target="_blank" style={{display:'flex',alignItems:'center',gap:12,padding:'12px 14px',background:'#fff',border:'1px solid #ebe7e3',borderRadius:8,textDecoration:'none',color:'#1a1a1a'}}>
                    <div style={{width:34,height:34,borderRadius:8,background:'#e0e5db',display:'flex',alignItems:'center',justifyContent:'center',color:'#5a6b4f',flexShrink:0}}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:10,fontWeight:700,color:'#8a8078',letterSpacing:'0.06em'}}>{t('sec.whatsapp')}</div>
                      <div style={{fontSize:13,fontWeight:600,color:'#1a1a1a',marginTop:1}}>+971 55 200 3344</div>
                    </div>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a89a92" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                  </a>
                  <a href="mailto:n.sharma@skytower.ae" style={{display:'flex',alignItems:'center',gap:12,padding:'12px 14px',background:'#fff',border:'1px solid #ebe7e3',borderRadius:8,textDecoration:'none',color:'#1a1a1a'}}>
                    <div style={{width:34,height:34,borderRadius:8,background:'#ebe3d9',display:'flex',alignItems:'center',justifyContent:'center',color:'#7a6040',flexShrink:0}}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 7L2 7"/></svg>
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:10,fontWeight:700,color:'#8a8078',letterSpacing:'0.06em'}}>{t('sec.email')}</div>
                      <div style={{fontSize:13,fontWeight:600,color:'#1a1a1a',marginTop:1,overflow:'hidden',textOverflow:'ellipsis'}}>n.sharma@skytower.ae</div>
                    </div>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a89a92" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    if(currentTab === 'visitors') {
      const allEntries = data.entryLog;
      // Normalize statuses case-insensitively so dashboard counts and filters stay in sync
      const normStatus = (e) => (e.status||'').toUpperCase().trim();
      const isInside = (e) => { const s = normStatus(e); return s === 'PASSED SECURITY' || s === 'CLEARED' || s === 'INSIDE' || s === 'RESIDENT APPROVED' || s === 'APPROVED BY SECURITY' || s === 'APPROVED'; };
      const isCheckedOut = (e) => { const s = normStatus(e); return s === 'CHECKED OUT' || s === 'EXITED'; };
      const isScheduled = (e) => { const s = normStatus(e); return s === 'SCHEDULED' || s === 'PRE-APPROVED' || s === 'PENDING' || s === 'AWAITING APPROVAL'; };
      const isRejected = (e) => { const s = normStatus(e); return s === 'REJECTED' || s === 'REJECTED BY SECURITY' || s === 'DENIED ENTRY' || s === 'ON HOLD' || s === 'FLAGGED'; };

      // Date helpers
      const todayStr = (() => { const d = new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); })();
      const entryDate = (e) => {
        const d = e.dateIn || e.registeredDate || e.visitDate || e.date || '';
        if (d) return d;
        if (e.id && typeof e.id === 'number' && e.id > 1600000000000) {
          const dt = new Date(e.id);
          return dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0');
        }
        return '';
      };

      // Apply date filter first, then compute counts on date-filtered set
      let dateFiltered = allEntries;
      if (visRegDateFrom) {
        dateFiltered = dateFiltered.filter(e => entryDate(e) >= visRegDateFrom);
      }
      if (visRegDateTo) {
        dateFiltered = dateFiltered.filter(e => entryDate(e) <= visRegDateTo);
      }

      // Tab counts reflect date-filtered entries (so "Checked Out 6" matches Today's Summary)
      const insideCount = dateFiltered.filter(isInside).length;
      const checkedOutCount = dateFiltered.filter(isCheckedOut).length;
      const scheduledCount = dateFiltered.filter(isScheduled).length;
      const rejectedCount = dateFiltered.filter(isRejected).length;
      const secFilterOptions = [
        { key: 'ALL', label: 'ALL', count: dateFiltered.length },
        { key: 'INSIDE', label: 'INSIDE', count: insideCount },
        { key: 'CHECKED_OUT', label: 'CHECKED OUT', count: checkedOutCount },
        { key: 'SCHEDULED', label: 'SCHEDULED', count: scheduledCount },
        { key: 'REJECTED', label: 'REJECTED', count: rejectedCount }
      ];
      // Apply status filter on the date-filtered set
      let filteredEntries = secVisitorFilter === 'ALL' ? dateFiltered :
        secVisitorFilter === 'INSIDE' ? dateFiltered.filter(isInside) :
        secVisitorFilter === 'CHECKED_OUT' ? dateFiltered.filter(isCheckedOut) :
        secVisitorFilter === 'SCHEDULED' ? dateFiltered.filter(isScheduled) :
        secVisitorFilter === 'REJECTED' ? dateFiltered.filter(isRejected) :
        secVisitorFilter === 'EXITED' ? dateFiltered.filter(isCheckedOut) :
        dateFiltered;
      // Search filter
      if (visRegSearch.trim()) {
        const q = visRegSearch.trim().toLowerCase();
        filteredEntries = filteredEntries.filter(e =>
          (e.visitor||'').toLowerCase().includes(q) ||
          (e.flat||'').toLowerCase().includes(q) ||
          (e.refId||'').toLowerCase().includes(q) ||
          (e.host||'').toLowerCase().includes(q)
        );
      }
      // If the selected "from" date is strictly in the future, narrow to SCHEDULED only
      if (visRegDateFrom && visRegDateFrom > todayStr) {
        filteredEntries = filteredEntries.filter(isScheduled);
      }
      // Sort by time entered — earliest first, latest last (ascending)
      const timeToMinutes = (t) => {
        if (!t) return Number.MAX_SAFE_INTEGER;
        const str = String(t).trim();
        const ap = str.match(/^(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)$/);
        if (ap) {
          let h = parseInt(ap[1], 10) % 12;
          if (ap[3].toUpperCase() === 'PM') h += 12;
          return h * 60 + parseInt(ap[2], 10);
        }
        const h24 = str.match(/^(\d{1,2}):(\d{2})$/);
        if (h24) return parseInt(h24[1], 10) * 60 + parseInt(h24[2], 10);
        return Number.MAX_SAFE_INTEGER;
      };
      filteredEntries = [...filteredEntries].sort((a, b) => {
        const da = entryDate(a); const db = entryDate(b);
        if (da !== db) return da < db ? -1 : 1;
        return timeToMinutes(a.timeIn) - timeToMinutes(b.timeIn);
      });
      const totalVisRegPages = Math.max(1, Math.ceil(filteredEntries.length / VIS_REG_PER_PAGE));
      const pagedEntries = filteredEntries.slice(visRegPage * VIS_REG_PER_PAGE, (visRegPage + 1) * VIS_REG_PER_PAGE);
      const getInitials = (name) => (name||'').split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2);
      // Standardize unit numbers: strip letter prefix so "B-102" → "102", "A-1201" → "1201"
      const formatUnit = (f) => {
        if (f === null || f === undefined) return '—';
        const str = String(f).trim();
        if (!str) return '—';
        const m = str.match(/^[A-Za-z]+[-\s]?(\d+[A-Za-z]?)$/);
        if (m) return m[1];
        return str;
      };
      // Standardize time: always display as "HH:MM AM/PM", converting 24h format when needed
      const formatTimeDisplay = (t) => {
        if (t === null || t === undefined) return '—';
        const str = String(t).trim();
        if (!str || str === '—') return '—';
        const ampm = str.match(/^(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)$/);
        if (ampm) return String(parseInt(ampm[1],10)).padStart(2,'0') + ':' + ampm[2] + ' ' + ampm[3].toUpperCase();
        const h24 = str.match(/^(\d{1,2}):(\d{2})$/);
        if (h24) {
          const h = parseInt(h24[1], 10);
          const mm = h24[2];
          const suffix = h >= 12 ? 'PM' : 'AM';
          const hr = ((h + 11) % 12) + 1;
          return String(hr).padStart(2,'0') + ':' + mm + ' ' + suffix;
        }
        return str;
      };
      const getStatusStyle = (status) => {
        const s = (status||'').toUpperCase();
        // Approved visitors are treated as INSIDE — once a resident/security approves them, they're considered on-site.
        if (s === 'PASSED SECURITY' || s === 'CLEARED' || s === 'INSIDE' || s === 'RESIDENT APPROVED' || s === 'APPROVED BY SECURITY' || s === 'APPROVED') return {bg:'#e0e5db',color:'#5a6b4f',border:'#cdd5c6',label:'INSIDE'};
        if (s === 'SCHEDULED' || s === 'PRE-APPROVED' || s === 'PENDING' || s === 'AWAITING APPROVAL') return {bg:'#f0ece5',color:'#6a5a45',border:'#d5cfc8',label:'SCHEDULED'};
        if (s === 'CHECKED OUT' || s === 'EXITED') return {bg:'#f5f3f0',color:'#8a8078',border:'#e5e0d8',label:'CHECKED OUT'};
        if (s === 'REJECTED' || s === 'REJECTED BY SECURITY' || s === 'DENIED ENTRY') return {bg:'#eddbd9',color:'#8b4a42',border:'#deccca',label:'REJECTED'};
        if (s === 'ON HOLD' || s === 'FLAGGED') return {bg:'#f0e2d0',color:'#7a4a1a',border:'#dcc4a0',label:'FLAGGED'};
        return {bg:'#f0ece5',color:'#a89a92',border:'#e5e0d8',label:status};
      };
      return (
        <div>
          {/* Header row */}
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:20,flexWrap:'wrap',gap:12}}>
            <div>
              <div style={{display:'flex',alignItems:'center',gap:12}}>
                <div style={{fontSize:18,fontWeight:700,color:'#1a1a1a'}}>{t('sec.allVisitorsRegistry')}</div>
              </div>
              <div style={{fontSize:12,color:'#a89a92',marginTop:4}}>{t('sec.completeLog')}</div>
            </div>
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              <button onClick={() => { setExportDateFrom(visRegDateFrom||''); setExportDateTo(visRegDateTo||''); setShowExportModal(true); }} style={{background:'#928989',border:'none',color:'#fff',padding:'8px 14px',borderRadius:4,fontSize:11,cursor:'pointer',display:'flex',alignItems:'center',gap:6,fontWeight:600}}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> {t('sec.exportDatabase').toUpperCase()}
              </button>
            </div>
          </div>

          {/* Filter tabs + Search */}
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16,flexWrap:'wrap',gap:12}}>
            <div className="sec-filter-row" style={{marginBottom:0}}>
              {secFilterOptions.map(f => (
                <div key={f.key} onClick={() => { setSecVisitorFilter(f.key); setVisRegPage(0); }}
                  className={`sec-filter-chip ${secVisitorFilter===f.key?'active':''}`}
                  style={{cursor:'pointer',display:'flex',alignItems:'center',gap:6}}>
                  {f.label}
                  <span style={{background: secVisitorFilter===f.key ? '#d0d0d0' : '#f0f0f0',padding:'1px 6px',borderRadius:3,fontSize:9,fontWeight:600}}>{f.count}</span>
                </div>
              ))}
            </div>
            <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
              <div style={{position:'relative'}}>
                <input value={visRegSearch} onChange={e => { setVisRegSearch(e.target.value); setVisRegPage(0); }}
                  placeholder={t('sec.searchPlaceholder')}
                  style={{padding:'8px 12px 8px 32px',background:'#fff',border:'1px solid #d5cfc8',borderRadius:4,color:'#1a1a1a',fontSize:12,width:200,boxSizing:'border-box',outline:'none'}}/>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8a8a8a" strokeWidth="2" style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)'}}><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:6,background:'#fff',border:'1px solid #d5cfc8',borderRadius:4,padding:'4px 10px'}}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8a8a8a" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                <input type="date" value={visRegDateFrom} onChange={e => { setVisRegDateFrom(e.target.value); setVisRegPage(0); }}
                  style={{border:'none',background:'transparent',color:'#1a1a1a',fontSize:11,outline:'none',cursor:'pointer'}}/>
                <span style={{color:'#a89a92',fontSize:11}}>-</span>
                <input type="date" value={visRegDateTo} onChange={e => { setVisRegDateTo(e.target.value); setVisRegPage(0); }}
                  style={{border:'none',background:'transparent',color:'#1a1a1a',fontSize:11,outline:'none',cursor:'pointer'}}/>
              </div>
            </div>
          </div>

          {/* Full table — Entry Log style */}
          <div className="sec-entry-log">
            {/* Mobile: card layout */}
            <div className="sec-entry-log-mobile">
              {pagedEntries.map((e,i) => {
                const mSts = getStatusStyle(e.status);
                const mIsScheduled = mSts.label === 'SCHEDULED';
                const mIsInside = mSts.label === 'INSIDE';
                // INSIDE visitors have no check-out time yet — only show timeIn.
                const mTimeLabel = mIsScheduled
                  ? ('Expected ' + (formatTimeDisplay(e.timeIn) || '—'))
                  : mIsInside
                    ? (formatTimeDisplay(e.timeIn) || '—')
                    : (formatTimeDisplay(e.timeIn) + (e.timeOut ? ' → ' + formatTimeDisplay(e.timeOut) + ' · ' + (computeDuration(e.timeIn, e.timeOut, e.dateIn || e.registeredDate || e.date || '', e.dateOut || '') || e.duration || '') : ''));
                return (
                <div key={e.id} style={{background:'#fff',border:'1px solid #ebe7e3',borderRadius:6,padding:12,marginBottom:8,cursor:'pointer'}} onClick={() => setViewingVisitor(findFullVisitor(e))}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                    <div style={{fontWeight:600,fontSize:13,color:'#1a1a1a'}}>{e.visitor}</div>
                    <span style={{background:mSts.bg,color:mSts.color,border:`1px solid ${mSts.border||mSts.bg}`,padding:'3px 8px',borderRadius:3,fontSize:9,fontWeight:700,display:'inline-block',letterSpacing:'0.03em',whiteSpace:'nowrap'}}>{mSts.label}</span>
                  </div>
                  <div style={{fontSize:11,color:'#a89a92'}}>{translateType(e.type)} • {formatUnit(e.flat)} • {(() => { const d = e.dateIn || e.registeredDate || e.visitDate || e.date || ''; if (!d) return ''; try { const dt = new Date(d+'T00:00:00'); if (isNaN(dt)) return d; return dt.toLocaleDateString('en-GB',{day:'2-digit',month:'short'}); } catch(x) { return d; } })()} {translateTimeSec(mTimeLabel)} • {t('sec.host')}: {e.host || '—'}</div>
                </div>
                );
              })}
            </div>
            {/* Desktop: full table */}
            <table className="sec-entry-log-table sec-entry-log-desktop">
              <thead>
                <tr>
                  <th style={{width:30}}>#</th>
                  <th>{t('sec.visitorNameCol')}</th>
                  <th>{t('sec.visitorTypeCol')}</th>
                  <th>{t('sec.unitNoShort')}</th>
                  <th>{secVisitorFilter === 'SCHEDULED' ? t('sec.scheduledDate') : t('sec.dateEntered')}</th>
                  <th>{secVisitorFilter === 'SCHEDULED' ? t('sec.scheduledTime') : t('sec.timeEntered')}</th>
                  <th>{secVisitorFilter === 'SCHEDULED' ? t('sec.scheduledExit') : t('sec.dateExit')}</th>
                  <th>{t('sec.checkOutTime')}</th>
                  <th>{t('sec.duration')}</th>
                  <th>{t('sec.gate')}</th>
                  <th>{t('sec.hostResident')}</th>
                  <th>{t('sec.status')}</th>
                  <th style={{width:100}}>{t('sec.action')}</th>
                </tr>
              </thead>
              <tbody>
                {pagedEntries.map((e,i) => {
                  const sts = getStatusStyle(e.status);
                  const isLogInside = sts.label === 'INSIDE';
                  const isLogScheduled = sts.label === 'SCHEDULED';
                  // Format ISO date (YYYY-MM-DD) → "12 Apr 2026"
                  const fmtDateCell = (d) => { if (!d) return '—'; try { const dt = new Date(d + 'T00:00:00'); if (isNaN(dt)) return d; return dt.toLocaleDateString('en-GB', {day:'2-digit',month:'short',year:'numeric',timeZone:'Asia/Dubai'}); } catch(e) { return d; } };
                  const entryDateVal = e.dateIn || e.registeredDate || e.visitDate || e.date || (() => { if (e.id && typeof e.id === 'number' && e.id > 1600000000000) { const d = new Date(e.id); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); } return ''; })();
                  const exitDateVal = e.dateOut || (sts.label === 'CHECKED OUT' ? entryDateVal : '');
                  return (
                  <tr key={e.id} style={{cursor:'pointer'}} onClick={() => setViewingVisitor(findFullVisitor(e))}>
                    <td style={{color:'#a89a92'}}>{visRegPage * VIS_REG_PER_PAGE + i + 1}</td>
                    <td style={{fontWeight:500,color:'#1a1a1a'}}>{e.visitor}</td>
                    <td style={{color:'#a89a92'}}>{e.type || '—'}</td>
                    <td style={{color:'#a89a92'}}>{formatUnit(e.flat)}</td>
                    <td style={{color:'#a89a92'}}>{fmtDateCell(entryDateVal)}</td>
                    <td style={{color:'#a89a92'}}>{formatTimeDisplay(e.timeIn) || '—'}</td>
                    <td style={{color:'#a89a92'}}>{(isLogInside || isLogScheduled) ? '—' : fmtDateCell(exitDateVal)}</td>
                    <td style={{color:'#a89a92'}}>{(isLogInside || isLogScheduled) ? '—' : (formatTimeDisplay(e.timeOut) || '—')}</td>
                    <td style={{color:'#a89a92'}}>{(isLogInside || isLogScheduled) ? '—' : (e.timeOut ? (computeDuration(e.timeIn, e.timeOut, e.dateIn || entryDateVal, e.dateOut || exitDateVal) || e.duration || '—') : (e.duration || '—'))}</td>
                    <td style={{color:'#a89a92'}}>{e.gateUsed || e.gate || 'Main Gate'}</td>
                    <td style={{color:'#a89a92'}}>{e.host || '—'}</td>
                    <td>
                      <span style={{background:sts.bg,color:sts.color,border:`1px solid ${sts.border||sts.bg}`,padding:'4px 10px',borderRadius:4,fontSize:10,fontWeight:700,display:'inline-block',letterSpacing:'0.03em',whiteSpace:'nowrap'}}>
                        {sts.label}
                      </span>
                    </td>
                    <td onClick={(ev) => ev.stopPropagation()}>
                      {isLogInside ? (
                        <button onClick={() => handleCheckout(e)} style={{background:'#928989',border:'none',color:'#fff',padding:'4px 8px',borderRadius:3,fontSize:9,cursor:'pointer',display:'inline-flex',alignItems:'center',gap:4,whiteSpace:'nowrap'}}>
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg> {t('sec.checkOutBtn')}
                        </button>
                      ) : (
                        <span style={{color:'#c8c0b8',fontSize:11}}>—</span>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filteredEntries.length === 0 && <div style={{textAlign:'center',color:'#a89a92',padding:32,fontSize:13}}>{t('sec.noEntriesMatch')}</div>}

          {/* Pagination footer */}
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:16,flexWrap:'wrap',gap:8}}>
            <div style={{fontSize:11,color:'#a89a92'}}>
              SHOWING {pagedEntries.length > 0 ? (visRegPage * VIS_REG_PER_PAGE + 1) + '–' + Math.min((visRegPage + 1) * VIS_REG_PER_PAGE, filteredEntries.length) : '0'} OF {filteredEntries.length} ENTRIES · ALL STATUSES · SORTED: TIME IN (EARLIEST FIRST)
            </div>
            <div style={{display:'flex',gap:6,alignItems:'center'}}>
              <button disabled={visRegPage === 0} onClick={() => setVisRegPage(p => p - 1)}
                style={{background:'#fff',border:'1px solid #d5cfc8',color: visRegPage === 0 ? '#8a8a8a' : '#1a1a1a',padding:'6px 12px',borderRadius:4,fontSize:10,cursor: visRegPage === 0 ? 'default' : 'pointer',display:'flex',alignItems:'center',gap:4}}>
                ← PREV
              </button>
              {Array.from({length: Math.min(totalVisRegPages, 3)}, (_, i) => {
                const pg = totalVisRegPages <= 3 ? i : Math.max(0, Math.min(visRegPage - 1, totalVisRegPages - 3)) + i;
                return (
                  <button key={pg} onClick={() => setVisRegPage(pg)}
                    style={{background: pg === visRegPage ? '#1a1a1a' : '#fff', border:'1px solid ' + (pg === visRegPage ? '#1a1a1a' : '#d0d0d0'), color: pg === visRegPage ? '#fff' : '#1a1a1a', padding:'6px 10px', borderRadius:4, fontSize:10, cursor:'pointer', fontWeight: pg === visRegPage ? 700 : 400, minWidth:30}}>
                    {pg + 1}
                  </button>
                );
              })}
              <button disabled={visRegPage >= totalVisRegPages - 1} onClick={() => setVisRegPage(p => p + 1)}
                style={{background:'#fff',border:'1px solid #d5cfc8',color: visRegPage >= totalVisRegPages - 1 ? '#8a8a8a' : '#1a1a1a',padding:'6px 12px',borderRadius:4,fontSize:10,cursor: visRegPage >= totalVisRegPages - 1 ? 'default' : 'pointer',display:'flex',alignItems:'center',gap:4}}>
                NEXT →
              </button>
            </div>
          </div>

        </div>
      );
    }

    if(currentTab === 'messages') {
      const secGuardId = data.currentUser?.id || 'GRD-001';
      // channel = 'PMC' or 'HOS' (Head of Security). Legacy messages without channel default to 'PMC'.
      const msgChannel = (m) => m.channel || 'PMC';
      const allMyMessages = (data.chatMessages || []).filter(m => m.guardId === secGuardId);
      const channels = [
        { key: 'PMC', label: t('sec.propertyManagerLabel') || 'Property Manager', sub: t('sec.pmcSub') || 'PMC', color: '#e0e5db', iconBg:'#5a6b4f', initials:'PM' },
        { key: 'HOS', label: t('sec.headOfSecurityLabel') || 'Head of Security', sub: t('sec.chiefOfficerSub') || 'Chief Officer', color: '#ebe3d9', iconBg:'#7a6040', initials:'HS' }
      ];
      const currentChannel = channels.find(c => c.key === secChatChannel) || channels[0];
      const channelMessages = allMyMessages.filter(m => msgChannel(m) === secChatChannel)
        .sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));
      const lastByChannel = (key) => {
        const arr = allMyMessages.filter(m => msgChannel(m) === key).sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
        return arr[0];
      };
      const unreadByChannel = (key) => allMyMessages.filter(m => msgChannel(m) === key && m.from !== 'Security' && !m.read).length;
      const sendMessage = () => {
        const inp = document.getElementById('sec-chat-input');
        if (!inp) return;
        const v = inp.value.trim();
        if (!v) return;
        setData({ ...data, chatMessages: [...(data.chatMessages||[]), {
          id: 'msg-' + Date.now(),
          from: 'Security',
          to: secChatChannel,
          channel: secChatChannel,
          guardId: secGuardId,
          text: v,
          timestamp: new Date().toISOString(),
          senderName: 'Guard (Security)'
        }]});
        inp.value = '';
      };
      return (
        <div style={{padding:16}}>
          <h3 style={{marginBottom:16,color:'#1a1a1a'}}>{t('sec.messages')}</h3>
          <div style={{display:'flex',gap:12,background:'#fff',borderRadius:8,border:'1px solid #ebe7e3',overflow:'hidden',minHeight:480}}>

            {/* Channel list */}
            <div style={{width:260,borderRight:'1px solid #ebe7e3',background:'#fafaf8',display:'flex',flexDirection:'column'}}>
              <div style={{padding:'14px 16px',borderBottom:'1px solid #ebe7e3',fontSize:10,fontWeight:700,color:'#5a5a5a',letterSpacing:'0.06em'}}>{t('sec.conversations')}</div>
              {channels.map(ch => {
                const last = lastByChannel(ch.key);
                const unread = unreadByChannel(ch.key);
                const active = secChatChannel === ch.key;
                return (
                  <div key={ch.key} onClick={() => setSecChatChannel(ch.key)}
                    style={{padding:'12px 16px',borderBottom:'1px solid #ebe7e3',cursor:'pointer',background: active ? '#fff' : 'transparent',borderLeft: active ? '3px solid #1a1a1a' : '3px solid transparent',display:'flex',alignItems:'center',gap:10}}>
                    <div style={{width:36,height:36,borderRadius:'50%',background:ch.color,color:ch.iconBg,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,flexShrink:0,border:'1px solid '+ch.iconBg+'30'}}>
                      {ch.initials}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:6}}>
                        <div style={{fontSize:12,fontWeight:600,color:'#1a1a1a',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{ch.label}</div>
                        {last && <div style={{fontSize:9,color:'#a89a92',flexShrink:0}}>{formatTime24(new Date(last.timestamp))}</div>}
                      </div>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:2,gap:6}}>
                        <div style={{fontSize:10,color:'#a89a92',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                          {last ? (last.from === 'Security' ? (t('sec.youLabel') || 'You') + ': ' : '') + last.text : ch.sub}
                        </div>
                        {unread > 0 && <span style={{background:'#1a1a1a',color:'#fff',fontSize:9,fontWeight:700,borderRadius:10,padding:'2px 6px',minWidth:16,textAlign:'center',flexShrink:0}}>{unread}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Chat panel */}
            <div style={{flex:1,display:'flex',flexDirection:'column',minWidth:0}}>
              {/* Chat header */}
              <div style={{padding:'14px 20px',borderBottom:'1px solid #ebe7e3',display:'flex',alignItems:'center',gap:10}}>
                <div style={{width:32,height:32,borderRadius:'50%',background:currentChannel.color,color:currentChannel.iconBg,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,border:'1px solid '+currentChannel.iconBg+'30'}}>
                  {currentChannel.initials}
                </div>
                <div>
                  <div style={{fontSize:13,fontWeight:700,color:'#1a1a1a'}}>{currentChannel.label}</div>
                  <div style={{fontSize:10,color:'#a89a92',display:'flex',alignItems:'center',gap:4}}>
                    <span style={{width:6,height:6,borderRadius:'50%',background:'#5a6b4f',display:'inline-block'}}></span>
                    {t('sec.online')} · {currentChannel.sub}
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div style={{flex:1,padding:20,overflowY:'auto',background:'#fafaf8'}}>
                {channelMessages.length > 0 ? (
                  <div style={{display:'flex',flexDirection:'column',gap:10}}>
                    {channelMessages.map(msg => {
                      const mine = msg.from === 'Security';
                      return (
                        <div key={msg.id} style={{display:'flex',justifyContent: mine ? 'flex-end' : 'flex-start'}}>
                          <div style={{maxWidth:'72%',background: mine ? '#1a1a1a' : '#fff',color: mine ? '#fff' : '#1a1a1a',padding:'10px 14px',borderRadius: mine ? '12px 12px 2px 12px' : '12px 12px 12px 2px',fontSize:12,border: mine ? 'none' : '1px solid #ebe7e3',boxShadow: mine ? 'none' : '0 1px 2px rgba(0,0,0,0.03)'}}>
                            {!mine && <div style={{fontWeight:700,fontSize:9,marginBottom:3,color:currentChannel.iconBg,letterSpacing:'0.03em'}}>{msg.senderName || currentChannel.label}</div>}
                            <div style={{lineHeight:1.4}}>{msg.text}</div>
                            <div style={{fontSize:9,marginTop:4,opacity:0.6,textAlign:'right'}}>{formatTime24(new Date(msg.timestamp))}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{textAlign:'center',color:'#a89a92',paddingTop:80,fontSize:12}}>
                    {t('sec.noMessagesYet')} {currentChannel.label}
                  </div>
                )}
              </div>

              {/* Input */}
              <div style={{padding:14,borderTop:'1px solid #ebe7e3',display:'flex',gap:8,background:'#fff'}}>
                <input type="text" id="sec-chat-input"
                  placeholder={t('sec.messagePlaceholder') + ' ' + currentChannel.label + '...'}
                  style={{flex:1,background:'#fafaf8',border:'1px solid #ebe7e3',borderRadius:20,padding:'10px 16px',fontSize:12,outline:'none',color:'#1a1a1a'}}
                  onKeyPress={e => { if(e.key === 'Enter') sendMessage(); }} />
                <button onClick={sendMessage}
                  style={{background:'#928989',color:'#fff',border:'none',borderRadius:20,padding:'10px 20px',cursor:'pointer',fontSize:11,fontWeight:700,letterSpacing:'0.03em',display:'flex',alignItems:'center',gap:6}}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                  {t('sec.send')}
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="sec-app">
      {viewingVisitor && renderVisitorDetail()}
      {showExportModal && (
        <div onClick={() => setShowExportModal(false)} style={{position:'fixed',inset:0,background:'rgba(26,26,26,0.55)',backdropFilter:'blur(4px)',WebkitBackdropFilter:'blur(4px)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:16,fontFamily:"'Helvetica Now Text','Inter',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif",letterSpacing:'-0.01em'}}>
          <div onClick={ev => ev.stopPropagation()} style={{background:'var(--bg-card,#fff)',borderRadius:'var(--radius-lg,14px)',width:'100%',maxWidth:460,padding:0,boxShadow:'var(--shadow-lg,0 8px 32px rgba(146,137,137,0.14)), 0 24px 80px rgba(26,26,26,0.22)',border:'1px solid var(--border-light,#ebe7e3)',overflow:'hidden',fontFamily:'inherit'}}>
            {/* Branded header */}
            <div style={{background:'var(--bg-surface,#faf8f6)',borderBottom:'1px solid var(--border-light,#ebe7e3)',padding:'18px 24px',display:'flex',alignItems:'center',gap:14}}>
              <div style={{width:36,height:36,borderRadius:8,background:'var(--bg-warm-dark,#928989)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,boxShadow:'0 2px 6px rgba(146,137,137,0.25)'}}>
                <svg width="22" height="22" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="VARS">
                  <path d="M33.3 16.7 L50 16.7 L58.1 25.2 L66.7 33.3 L66.7 83.3 L50 83.3 L33.3 66.7 Z" fill="#ffffff"/>
                </svg>
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:15,fontWeight:500,color:'var(--text-dark,#1a1a1a)',letterSpacing:'-0.02em',lineHeight:1.2}}>{t('sec.exportDatabase')}</div>
                <div style={{fontSize:10,color:'var(--text-muted,#8a8a8a)',letterSpacing:'0.08em',textTransform:'uppercase',marginTop:3,fontWeight:500}}>{t('sec.varsRecords')}</div>
              </div>
              <button onClick={() => setShowExportModal(false)} aria-label="Close"
                style={{background:'transparent',border:'1px solid var(--border-medium,#d5cfc8)',cursor:'pointer',padding:6,color:'var(--accent-warm,#a89a92)',borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',transition:'all .15s'}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            {/* Body */}
            <div style={{padding:'20px 24px 4px'}}>
              <div style={{fontSize:12,color:'var(--text-secondary,rgba(26,26,26,0.55))',marginBottom:20,lineHeight:1.5,letterSpacing:'-0.005em'}}>
                Download the full visitor database including IDs, documents, and host details. Choose your format, filter by type, and narrow by date.
              </div>

              {/* Format */}
              <div style={{marginBottom:18}}>
                <div style={{fontSize:9,fontWeight:600,color:'var(--text-muted,#8a8a8a)',letterSpacing:'0.12em',marginBottom:9,textTransform:'uppercase'}}>{t('sec.format')}</div>
                <div style={{display:'flex',gap:8}}>
                  {[
                    {key:'xlsx',label:'Excel',sub:'.xlsx'},
                    {key:'csv',label:'CSV',sub:'.csv'},
                    {key:'pdf',label:'PDF',sub:'.pdf'}
                  ].map(f => {
                    const active = exportFormat===f.key;
                    return (
                      <button key={f.key} onClick={() => setExportFormat(f.key)}
                        style={{flex:1,padding:'11px 8px',background: active?'var(--bg-page,#f5f3f0)':'#fff',color:'var(--text-dark,#1a1a1a)',border:'1px solid '+(active?'var(--bg-warm-dark,#928989)':'var(--border-medium,#d5cfc8)'),borderRadius:'var(--radius-sm,6px)',fontSize:12,fontWeight: active?500:400,cursor:'pointer',letterSpacing:'-0.01em',fontFamily:'inherit',boxShadow: active?'var(--shadow-sm,0 1px 3px rgba(146,137,137,0.08))':'none',transition:'all .15s',display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
                        <span>{f.label}</span>
                        <span style={{fontSize:9,color:'var(--text-muted,#8a8a8a)',letterSpacing:'0.04em',fontWeight:400}}>{f.sub}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Visitor types */}
              <div style={{marginBottom:18}}>
                <div style={{fontSize:9,fontWeight:600,color:'var(--text-muted,#8a8a8a)',letterSpacing:'0.12em',marginBottom:9,textTransform:'uppercase'}}>{t('sec.visitorTypes')}</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
                  {[
                    {key:'INSIDE',label:'Inside'},
                    {key:'SCHEDULED',label:'Scheduled'},
                    {key:'CHECKED_OUT',label:'Checked Out'},
                    {key:'REJECTED',label:'Rejected'}
                  ].map(t => {
                    const active = exportTypes[t.key];
                    return (
                      <label key={t.key} onClick={() => setExportTypes(prev => ({...prev, [t.key]: !prev[t.key]}))}
                        style={{display:'flex',alignItems:'center',gap:9,padding:'9px 12px',border:'1px solid '+(active?'var(--bg-warm-dark,#928989)':'var(--border-medium,#d5cfc8)'),borderRadius:'var(--radius-sm,6px)',background: active?'var(--bg-page,#f5f3f0)':'#fff',cursor:'pointer',fontSize:12,color:'var(--text-dark,#1a1a1a)',fontWeight: active?500:400,letterSpacing:'-0.01em',fontFamily:'inherit',transition:'all .15s'}}>
                        <div style={{width:14,height:14,borderRadius:3,border:'1.5px solid '+(active?'var(--bg-warm-dark,#928989)':'var(--border-medium,#d5cfc8)'),background: active?'var(--bg-warm-dark,#928989)':'#fff',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition:'all .15s'}}>
                          {active && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                        </div>
                        {t.label}
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Date range */}
              <div style={{marginBottom:22}}>
                <div style={{fontSize:9,fontWeight:600,color:'var(--text-muted,#8a8a8a)',letterSpacing:'0.12em',marginBottom:9,textTransform:'uppercase'}}>{t('sec.dateRange')}</div>
                <div style={{display:'flex',gap:8,alignItems:'center'}}>
                  <input type="date" value={exportDateFrom} onChange={e => setExportDateFrom(e.target.value)}
                    style={{flex:1,padding:'9px 11px',border:'1px solid var(--border-medium,#d5cfc8)',borderRadius:'var(--radius-sm,6px)',fontSize:12,color:'var(--text-dark,#1a1a1a)',outline:'none',background:'#fff',fontFamily:'inherit',letterSpacing:'-0.01em'}}/>
                  <span style={{color:'var(--accent-warm,#a89a92)',fontSize:12}}>→</span>
                  <input type="date" value={exportDateTo} onChange={e => setExportDateTo(e.target.value)}
                    style={{flex:1,padding:'9px 11px',border:'1px solid var(--border-medium,#d5cfc8)',borderRadius:'var(--radius-sm,6px)',fontSize:12,color:'var(--text-dark,#1a1a1a)',outline:'none',background:'#fff',fontFamily:'inherit',letterSpacing:'-0.01em'}}/>
                </div>
                <div style={{fontSize:10,color:'var(--text-muted,#8a8a8a)',marginTop:7,letterSpacing:'-0.005em'}}>{t('sec.dateRangeHint')}</div>
              </div>
            </div>

            {/* Footer / Actions */}
            <div style={{display:'flex',gap:8,justifyContent:'flex-end',padding:'14px 24px 20px',borderTop:'1px solid var(--border-light,#ebe7e3)',background:'var(--bg-surface,#faf8f6)'}}>
              <button onClick={() => setShowExportModal(false)}
                style={{padding:'10px 18px',background:'#fff',border:'1px solid var(--border-medium,#d5cfc8)',borderRadius:'var(--radius-sm,6px)',fontSize:12,fontWeight:500,color:'var(--text-dark,#1a1a1a)',cursor:'pointer',letterSpacing:'-0.01em',fontFamily:'inherit',transition:'all .15s'}}>
                Cancel
              </button>
              <button onClick={handleExportFullDatabase}
                style={{padding:'10px 20px',background:'var(--bg-warm-dark,#928989)',border:'1px solid var(--bg-warm-dark,#928989)',borderRadius:'var(--radius-sm,6px)',fontSize:12,fontWeight:500,color:'#fff',cursor:'pointer',letterSpacing:'-0.01em',fontFamily:'inherit',display:'flex',alignItems:'center',gap:7,boxShadow:'var(--shadow-sm,0 1px 3px rgba(146,137,137,0.08))',transition:'all .15s'}}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Export Database
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="sec-header">
        {/* Building + Gate */}
        <div style={{display:'flex',alignItems:'center',gap:14}}>
          <div style={{width:40,height:40,background:'#f2efec',border:'1px solid #ebe7e3',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" strokeWidth="1.5"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6"/></svg>
          </div>
          <div>
            <div style={{fontSize:15,fontWeight:700,color:'#1a1a1a',lineHeight:1.2}}>{g_building || t('sec.skyTower')}</div>
            <div style={{fontSize:11,color:'#a89a92',marginTop:2}}>{g_buildingAddress || t('sec.locationFull')}</div>
            <div style={{marginTop:8,position:'relative',display:'inline-block'}}>
              <select
                value={selectedGate}
                onChange={e => setSelectedGate(e.target.value)}
                style={{appearance:'none',WebkitAppearance:'none',background:'#928989',color:'#fff',border:'none',borderRadius:4,padding:'4px 28px 4px 10px',fontSize:11,fontWeight:600,cursor:'pointer',outline:'none',letterSpacing:'0.03em'}}>
                <option value="Main Gate">{t('sec.mainGate')}</option>
                <option value="Side Gate A">{t('sec.sideGateA')}</option>
                <option value="Side Gate B">{t('sec.sideGateB')}</option>
                <option value="Emergency Exit">{t('sec.emergencyExit')}</option>
                <option value="Parking Gate">{t('sec.parkingGate')}</option>
              </select>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',pointerEvents:'none'}}><polyline points="6 9 12 15 18 9"/></svg>
            </div>
          </div>
        </div>
        {/* Clock */}
        <div style={{textAlign:'center'}}>
          <div style={{fontSize:10,color:'#a89a92',letterSpacing:'0.06em',marginBottom:2}}>{clockDate}</div>
          <div style={{fontSize:36,fontWeight:300,color:'#1a1a1a',letterSpacing:'0.04em',lineHeight:1}}>{clockTime.replace(/:\d{2}\s/, ' ').split(' ')[0]}</div>
          <div style={{fontSize:14,color:'#a89a92',marginTop:2}}>{clockTime.includes('AM') ? 'AM' : 'PM'}</div>
        </div>
        {/* Guard on Duty + Shift Status */}
        <div style={{textAlign:'right'}}>
          <div style={{fontSize:10,color:'#a89a92',letterSpacing:'0.06em'}}>{t('sec.guardOnDuty')}</div>
          <div style={{fontSize:14,fontWeight:600,color:'#1a1a1a'}}>{g_name}</div>
          <div style={{fontSize:10,color:'#a89a92'}}>{`${t('sec.id')}: ${g_id}`}</div>
          <div style={{fontSize:10,color:'#a89a92'}}>{`${t('sec.shiftLabel')}: ${g_shiftHours}`}</div>
        </div>
        {/* Icons */}
        <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:8}}>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <LanguageSwitcher compact/>
            {/* Account Icon — resident app style */}
            <div style={{position:'relative',zIndex:999}}>
              <div onClick={() => { setShowSecProfile(!showSecProfile); setShowSecNotifications(false); }} style={{width:36,height:36,borderRadius:'50%',background:'#e8e3de',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a89a92" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/></svg>
              </div>
              {showSecProfile && (
                <div onClick={e => e.stopPropagation()} style={{position:'absolute',top:44,right:0,width:280,background:'#fff',borderRadius:12,boxShadow:'0 8px 32px rgba(0,0,0,.15)',border:'1px solid #ebe7e3',zIndex:999,overflow:'hidden'}}>
                  {/* Profile header — matches resident profile page */}
                  <div style={{padding:'24px 16px 20px',textAlign:'center',borderBottom:'1px solid #ebe7e3'}}>
                    <div style={{width:60,height:60,borderRadius:'50%',border:'2px solid #d0d0d0',background:'#f2efec',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 12px'}}>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="1.2"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/></svg>
                    </div>
                    <div style={{fontSize:16,fontWeight:600,color:'#1a1a1a',marginBottom:2}}>{g_name}</div>
                    <div style={{fontSize:12,color:'#a89a92',marginBottom:2}}>{t('sec.securityGuard')}</div>
                    <div style={{fontSize:11,color:'#c4b8b0'}}>{`${t('sec.id')}: ${g_id} — ${t('sec.shiftLabel')}: ${g_shiftHours}`}</div>
                  </div>
                  {/* Menu items — resident profile style with icon circles + chevrons */}
                  <div style={{padding:'8px 12px',maxHeight:380,overflowY:'auto'}}>
                    {[
                      {key:'profile', label:t('sec.profileSettings'), icon:(<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7a6f66" strokeWidth="1.5"><path d="M12 2L4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3z"/><path d="M9 12l2 2 4-4"/></svg>)},
                      {key:'help', label:t('sec.helpSupport'), icon:(<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7a6f66" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>)},
                      {key:'shifts', label:t('sec.shiftSchedule'), icon:(<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7a6f66" strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>)},
                      {key:'policies', label:t('sec.accessPolicies'), icon:(<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7a6f66" strokeWidth="1.5"><path d="M12 2l9 4.5v5c0 5-3.5 9.5-9 11-5.5-1.5-9-6-9-11v-5L12 2z"/></svg>)},
                      {key:'about', label:t('sec.aboutVars'), icon:(<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7a6f66" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>)}
                    ].map((item, i, arr) => (
                      <div key={item.key} onClick={() => { setSecProfilePanel(item.key); setShowSecProfile(false); }} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 4px',borderBottom: i < arr.length - 1 ? '1px solid #f0f0f0' : 'none',cursor:'pointer'}}>
                        <div style={{width:32,height:32,borderRadius:'50%',background:'#f2efec',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{item.icon}</div>
                        <div style={{flex:1,fontSize:13,fontWeight:500,color:'#1a1a1a'}}>{item.label}</div>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                      </div>
                    ))}
                  </div>
                  {/* Logout — resident style */}
                  <div style={{padding:'4px 12px 12px'}}>
                    <div onClick={() => { setShowSecProfile(false); onLogout(); }} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 4px',cursor:'pointer',borderTop:'1px solid #f0f0f0'}}>
                      <div style={{width:32,height:32,borderRadius:'50%',background:'#fff5f5',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c62828" strokeWidth="1.5"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                      </div>
                      <div style={{flex:1,fontSize:13,fontWeight:500,color:'#8b4a42'}}>{t('sec.logout')}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            {/* Notification Bell — resident app style */}
            <div style={{position:'relative',zIndex:999}}>
              <div onClick={() => { setShowSecNotifications(!showSecNotifications); setShowSecProfile(false); }} style={{width:34,height:34,borderRadius:'50%',border:'1px solid #d5cfc8',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',position:'relative',background:'#fff'}}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7a6f66" strokeWidth="1.5"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
                {secUnreadCount > 0 && (
                  <div style={{position:'absolute',top:-2,right:-2,width:16,height:16,background:'#8b4a42',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,color:'#fff',fontWeight:700,border:'2px solid #fff'}}>{secUnreadCount > 9 ? '9+' : secUnreadCount}</div>
                )}
              </div>
              {showSecNotifications && (
                <div onClick={e => e.stopPropagation()} style={{position:'absolute',top:44,right:0,width:360,maxHeight:440,background:'#fff',borderRadius:12,boxShadow:'0 8px 32px rgba(0,0,0,.15)',border:'1px solid #ebe7e3',zIndex:999,overflow:'hidden',display:'flex',flexDirection:'column'}}>
                  {/* Header with filter chip — like announcements page */}
                  <div style={{padding:'16px 16px 12px',borderBottom:'1px solid #ebe7e3'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                      <span style={{fontSize:16,fontWeight:600,color:'#1a1a1a'}}>{t('sec.notifications')}</span>
                      {secUnreadCount > 0 && (
                        <span onClick={clearAllSecNotifs} style={{fontSize:11,color:'#a89a92',cursor:'pointer'}}>{t('sec.markAllRead')}</span>
                      )}
                    </div>
                    <div style={{display:'flex',gap:6}}>
                      <span style={{background:'#e8e3de',borderRadius:20,padding:'4px 12px',fontSize:11,color:'#1a1a1a',fontWeight:500}}>
                        {t('sec.unread')} {secUnreadCount > 0 && <span style={{marginLeft:4,fontWeight:700}}>{secUnreadCount}</span>}
                      </span>
                    </div>
                  </div>
                  {/* Notification cards — announcement card style */}
                  <div style={{overflowY:'auto',flex:1,maxHeight:370,padding:'8px 12px'}}>
                    {secNotifications.length === 0 ? (
                      <div style={{padding:30,textAlign:'center',color:'#a89a92',fontSize:13}}>{t('sec.noNotifs')}</div>
                    ) : secNotifications.map(n => {
                      const isRead = dismissedSecNotifIds.includes(n.id);
                      return (
                        <div key={n.id} onClick={() => dismissSecNotif(n.id)} style={{background:isRead ? '#fff' : '#f5f5f5',borderRadius:10,padding:'14px 16px',marginBottom:10,cursor:'pointer',border:isRead ? '1px solid #f0f0f0' : '1px solid transparent',transition:'all .15s'}}>
                          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:6}}>
                            <div style={{display:'flex',alignItems:'center',gap:8,flex:1}}>
                              <div style={{width:28,height:28,borderRadius:'50%',background:n.iconBg,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,flexShrink:0}}>{n.icon}</div>
                              <div style={{fontSize:13,fontWeight:isRead ? 400 : 600,color:'#1a1a1a',lineHeight:1.3}}>{n.title}</div>
                            </div>
                            {!isRead && <div style={{width:7,height:7,borderRadius:'50%',background:'#8b4a42',flexShrink:0,marginTop:6}}/>}
                          </div>
                          <div style={{fontSize:12,color:'#7a6f66',lineHeight:1.5,marginBottom:6,paddingLeft:36}}>{n.body}</div>
                          <div style={{fontSize:11,color:'#c4b8b0',paddingLeft:36}}>{n.time}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="sec-tabs" style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div style={{display:'flex',gap:8}}>
          <button className={`sec-tab ${currentTab==='dashboard'?'active':''}`} onClick={() => setCurrentTab('dashboard')}>{t('sec.mainDashboard')}</button>
          <button className={`sec-tab ${currentTab==='visitors'?'active':''}`} onClick={() => setCurrentTab('visitors')}>{t('sec.allVisitors')}</button>
          <button className={`sec-tab ${currentTab==='messages'?'active':''}`} onClick={() => setCurrentTab('messages')}>{t('sec.messages')}</button>
        </div>
      </div>

      <div className="sec-main-content">
        {renderContent()}
      </div>

      {/* Click-away to close dropdowns */}
      {(showSecNotifications || showSecProfile) && (
        <div onClick={() => { setShowSecNotifications(false); setShowSecProfile(false); }} style={{position:'fixed',top:0,left:0,right:0,bottom:0,zIndex:999}} />
      )}

      {/* Security Profile Sub-Panel Modal */}
      {secProfilePanel && (() => {
        const panelTitles = {
          profile: t('sec.profileSettings'),
          settings: t('sec.generalSettings') || 'General Settings',
          help: t('sec.helpSupport'),
          shifts: t('sec.shiftSchedule'),
          incidents: t('sec.incidentLog') || 'Incident Log',
          policies: t('sec.accessPolicies'),
          about: t('sec.aboutVars')
        };
        const rowStyle = {display:'flex',justifyContent:'space-between',alignItems:'center',padding:'14px 0',borderBottom:'1px solid #f0ece5'};
        const labelStyle = {fontSize:12,color:'#8a7f77',fontWeight:500};
        const valueStyle = {fontSize:13,color:'#1a1a1a',fontWeight:500};
        const sectionTitle = {fontSize:11,color:'#a89a92',fontWeight:600,letterSpacing:'0.08em',textTransform:'uppercase',marginTop:20,marginBottom:8};
        const Toggle = ({on, onToggle}) => (
          <div onClick={onToggle} style={{width:36,height:20,borderRadius:10,background:on?'#928989':'#e5e0d8',position:'relative',cursor:'pointer',transition:'background .2s'}}>
            <div style={{position:'absolute',top:2,left:on?18:2,width:16,height:16,borderRadius:'50%',background:'#fff',boxShadow:'0 1px 3px rgba(0,0,0,.2)',transition:'left .2s'}}/>
          </div>
        );
        return (
        <div onClick={() => setSecProfilePanel(null)} style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(26,26,26,.4)',zIndex:2000,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
          <div onClick={e => e.stopPropagation()} style={{background:'#faf7f2',borderRadius:12,width:'100%',maxWidth:560,maxHeight:'85vh',overflow:'hidden',display:'flex',flexDirection:'column',boxShadow:'0 20px 60px rgba(0,0,0,.25)'}}>
            {/* Header */}
            <div style={{padding:'20px 24px',borderBottom:'1px solid #ebe7e3',display:'flex',alignItems:'center',justifyContent:'space-between',background:'linear-gradient(135deg,#f5ede1 0%,#ebe3d9 100%)'}}>
              <div style={{display:'flex',alignItems:'center',gap:12}}>
                <div onClick={() => setSecProfilePanel(null)} style={{width:32,height:32,borderRadius:'50%',background:'rgba(255,255,255,.6)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
                </div>
                <div style={{fontSize:16,fontWeight:600,color:'#1a1a1a'}}>{panelTitles[secProfilePanel]}</div>
              </div>
              <div onClick={() => setSecProfilePanel(null)} style={{width:32,height:32,borderRadius:'50%',background:'rgba(255,255,255,.6)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </div>
            </div>
            {/* Content */}
            <div style={{padding:'20px 24px 24px',overflowY:'auto',flex:1}}>
              {secProfilePanel === 'profile' && (
                <div>
                  <div style={{display:'flex',alignItems:'center',gap:16,paddingBottom:20,borderBottom:'1px solid #f0ece5'}}>
                    <div style={{width:64,height:64,borderRadius:'50%',background:'#f2efec',border:'2px solid #d5cfc8',display:'flex',alignItems:'center',justifyContent:'center'}}>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#a89a92" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/></svg>
                    </div>
                    <div>
                      <div style={{fontSize:16,fontWeight:600,color:'#1a1a1a'}}>{g_name}</div>
                      <div style={{fontSize:12,color:'#8a7f77'}}>{t('sec.seniorGuard')}</div>
                      <div style={{fontSize:11,color:'#a89a92',marginTop:2}}>{`${g_id} · ${t('sec.mainGate')}`}</div>
                    </div>
                  </div>
                  <div style={sectionTitle}>{t('sec.personal')}</div>
                  <div style={rowStyle}><span style={labelStyle}>{t('sec.fullNameLabel')}</span><span style={valueStyle}>{g_name}</span></div>
                  <div style={rowStyle}><span style={labelStyle}>{t('sec.employeeId')}</span><span style={valueStyle}>{g_id}</span></div>
                  <div style={rowStyle}><span style={labelStyle}>{t('sec.phone')}</span><span style={valueStyle}>{g_phone}</span></div>
                  <div style={rowStyle}><span style={labelStyle}>{t('sec.emailLabel')}</span><span style={valueStyle}>s.kumar@vars.live</span></div>
                  <div style={sectionTitle}>{t('sec.duty')}</div>
                  <div style={rowStyle}><span style={labelStyle}>{t('sec.designation')}</span><span style={valueStyle}>{t('sec.seniorGuard')}</span></div>
                  <div style={rowStyle}><span style={labelStyle}>{t('sec.shiftLabel')}</span><span style={valueStyle}>{t('sec.morningShift')}</span></div>
                  <div style={rowStyle}><span style={labelStyle}>{t('sec.assignedGate')}</span><span style={valueStyle}>{t('sec.mainGate')}</span></div>
                  <div style={rowStyle}><span style={labelStyle}>{t('sec.supervisor')}</span><span style={valueStyle}>Ahmed Al-Falasi</span></div>
                  <div style={sectionTitle}>{t('sec.credentials')}</div>
                  <div style={rowStyle}><span style={labelStyle}>{t('sec.siraLicence')}</span><span style={valueStyle}>{t('sec.validExp')} 12 Mar 2027</span></div>
                  <div style={rowStyle}><span style={labelStyle}>{t('sec.firstAid')}</span><span style={valueStyle}>{t('sec.certified')}</span></div>
                  <div style={{...rowStyle,borderBottom:'none'}}><span style={labelStyle}>{t('sec.joined')}</span><span style={valueStyle}>08 Jan 2022</span></div>
                </div>
              )}
              {secProfilePanel === 'settings' && (
                <div>
                  <div style={sectionTitle}>{t('sec.notifications')}</div>
                  <div style={rowStyle}><span style={labelStyle}>{t('sec.pushAlerts')}</span><Toggle on={secPrefs.pushAlerts} onToggle={() => setSecPrefs(p => ({...p, pushAlerts: !p.pushAlerts}))}/></div>
                  <div style={rowStyle}><span style={labelStyle}>{t('sec.notifSound')}</span><Toggle on={secPrefs.notifSound} onToggle={() => setSecPrefs(p => ({...p, notifSound: !p.notifSound}))}/></div>
                  <div style={sectionTitle}>{t('sec.display')}</div>
                  <div style={rowStyle}><span style={labelStyle}>{t('sec.darkMode')}</span><Toggle on={secPrefs.darkMode} onToggle={() => setSecPrefs(p => ({...p, darkMode: !p.darkMode}))}/></div>
                  <div style={rowStyle}><span style={labelStyle}>{t('sec.language')}</span><span style={valueStyle}>{secPrefs.language}</span></div>
                  <div style={sectionTitle}>{t('sec.session')}</div>
                  <div style={rowStyle}><span style={labelStyle}>{t('sec.autoLogout')}</span><Toggle on={secPrefs.autoLogout} onToggle={() => setSecPrefs(p => ({...p, autoLogout: !p.autoLogout}))}/></div>
                  <div style={{...rowStyle,borderBottom:'none'}}><span style={labelStyle}>{t('sec.changePassword')}</span><span style={{...valueStyle,color:'#6a5a45',cursor:'pointer'}}>{t('sec.changeArrow')}</span></div>
                </div>
              )}
              {secProfilePanel === 'shifts' && (
                <div>
                  <div style={sectionTitle}>{t('sec.thisWeek')}</div>
                  {(() => {
                    const dayLabel = (code) => t('sec.day' + code);
                    const shiftLabel = (code) => code === 'Off' ? t('sec.off') : t('sec.morningShift');
                    const gateLabel = (code) => code === '—' ? '—' : code === 'Main Gate' ? t('sec.mainGate') : code === 'Service Gate' ? t('sec.serviceGate') : code;
                    const statusLabel = (code) => code === 'Done' ? t('sec.shiftStatusDone') : code === 'Today' ? t('sec.shiftStatusToday') : code === 'Rest' ? t('sec.shiftStatusRest') : t('sec.shiftStatusUpcoming');
                    return [
                      {dayCode:'Mon', dayDate:'07 Apr', shift:'Morning', gate:'Main Gate', status:'Done'},
                      {dayCode:'Tue', dayDate:'08 Apr', shift:'Morning', gate:'Main Gate', status:'Done'},
                      {dayCode:'Wed', dayDate:'09 Apr', shift:'Morning', gate:'Main Gate', status:'Done'},
                      {dayCode:'Thu', dayDate:'10 Apr', shift:'Morning', gate:'Main Gate', status:'Today'},
                      {dayCode:'Fri', dayDate:'11 Apr', shift:'Off', gate:'—', status:'Rest'},
                      {dayCode:'Sat', dayDate:'12 Apr', shift:'Morning', gate:'Service Gate', status:'Upcoming'},
                      {dayCode:'Sun', dayDate:'13 Apr', shift:'Morning', gate:'Main Gate', status:'Upcoming'}
                    ].map((s,i) => (
                      <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 14px',background:s.status==='Today'?'#f5ede1':'#fff',border:'1px solid #ebe7e3',borderRadius:8,marginBottom:8}}>
                        <div>
                          <div style={{fontSize:13,fontWeight:600,color:'#1a1a1a'}}>{dayLabel(s.dayCode)} {s.dayDate}</div>
                          <div style={{fontSize:11,color:'#8a7f77',marginTop:2}}>{shiftLabel(s.shift)} · {gateLabel(s.gate)}</div>
                        </div>
                        <span style={{fontSize:10,fontWeight:700,padding:'4px 10px',borderRadius:4,background:s.status==='Today'?'#6a5a45':s.status==='Rest'?'#f0ece5':'#e5e0d8',color:s.status==='Today'?'#fff':'#6a5a45',letterSpacing:'0.05em'}}>{statusLabel(s.status)}</span>
                      </div>
                    ));
                  })()}
                </div>
              )}
              {secProfilePanel === 'incidents' && (
                <div>
                  <div style={sectionTitle}>{t('sec.recentIncidents')}</div>
                  {(() => {
                    const typeLabel = (code) => code === 'Unauthorized' ? t('sec.incUnauthorized') : code === 'LostChild' ? t('sec.incLostChild') : code === 'Suspicious' ? t('sec.incSuspicious') : t('sec.incNoise');
                    const gateLabelI = (code) => code === 'Main Gate' ? t('sec.mainGate') : code === 'Service Gate' ? t('sec.serviceGate') : code;
                    const sevLabel = (code) => code === 'High' ? t('sec.sevHigh') : code === 'Medium' ? t('sec.sevMedium') : t('sec.sevLow');
                    return [
                      {date:'09 Apr, 11:42', typeCode:'Unauthorized', gate:'Service Gate', severity:'High'},
                      {date:'07 Apr, 14:05', typeCode:'LostChild', gate:'Main Gate', severity:'Medium'},
                      {date:'05 Apr, 22:18', typeCode:'Suspicious', gate:'Main Gate', severity:'High'},
                      {date:'02 Apr, 09:30', typeCode:'Noise', gate:'Tower B', severity:'Low'}
                    ].map((it,i) => (
                      <div key={i} style={{padding:'14px',background:'#fff',border:'1px solid #ebe7e3',borderRadius:8,marginBottom:8}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                          <div style={{fontSize:13,fontWeight:600,color:'#1a1a1a'}}>{typeLabel(it.typeCode)}</div>
                          <span style={{fontSize:9,fontWeight:700,padding:'3px 8px',borderRadius:3,background:it.severity==='High'?'#eddbd9':it.severity==='Medium'?'#f0e2d0':'#e0e5db',color:it.severity==='High'?'#8b4a42':it.severity==='Medium'?'#7a4a1a':'#5a6b4f'}}>{sevLabel(it.severity)}</span>
                        </div>
                        <div style={{fontSize:11,color:'#8a7f77'}}>{it.date} · {gateLabelI(it.gate)}</div>
                      </div>
                    ));
                  })()}
                </div>
              )}
              {secProfilePanel === 'policies' && (
                <div>
                  <div style={sectionTitle}>{t('sec.accessPolicies')}</div>
                  {[
                    {titleKey:'sec.policyVisitor', bodyKey:'sec.policyVisitorBody'},
                    {titleKey:'sec.policyDelivery', bodyKey:'sec.policyDeliveryBody'},
                    {titleKey:'sec.policyContractor', bodyKey:'sec.policyContractorBody'},
                    {titleKey:'sec.policyEmergency', bodyKey:'sec.policyEmergencyBody'},
                    {titleKey:'sec.policyCctv', bodyKey:'sec.policyCctvBody'}
                  ].map((p,i) => (
                    <div key={i} style={{padding:'14px',background:'#fff',border:'1px solid #ebe7e3',borderRadius:8,marginBottom:8}}>
                      <div style={{fontSize:13,fontWeight:600,color:'#1a1a1a',marginBottom:4}}>{t(p.titleKey)}</div>
                      <div style={{fontSize:12,color:'#6a5a45',lineHeight:1.5}}>{t(p.bodyKey)}</div>
                    </div>
                  ))}
                </div>
              )}
              {secProfilePanel === 'help' && (
                <div>
                  <div style={sectionTitle}>{t('sec.quickHelp')}</div>
                  {[
                    {qKey:'sec.helpQ1', aKey:'sec.helpA1'},
                    {qKey:'sec.helpQ2', aKey:'sec.helpA2'},
                    {qKey:'sec.helpQ3', aKey:'sec.helpA3'},
                    {qKey:'sec.helpQ4', aKey:'sec.helpA4'}
                  ].map((f,i) => (
                    <div key={i} style={{padding:'14px',background:'#fff',border:'1px solid #ebe7e3',borderRadius:8,marginBottom:8}}>
                      <div style={{fontSize:13,fontWeight:600,color:'#1a1a1a',marginBottom:6}}>{t(f.qKey)}</div>
                      <div style={{fontSize:12,color:'#6a5a45',lineHeight:1.5}}>{t(f.aKey)}</div>
                    </div>
                  ))}
                  <div style={sectionTitle}>{t('sec.contactSupport')}</div>
                  <div style={rowStyle}><span style={labelStyle}>{t('sec.helpDesk')}</span><span style={valueStyle}>+971 4 555 0199</span></div>
                  <div style={rowStyle}><span style={labelStyle}>{t('sec.emailLabel')}</span><span style={valueStyle}>support@vars.live</span></div>
                  <div style={{...rowStyle,borderBottom:'none'}}><span style={labelStyle}>{t('sec.hours')}</span><span style={valueStyle}>24/7</span></div>
                </div>
              )}
              {secProfilePanel === 'about' && (
                <div style={{textAlign:'center',padding:'20px 0'}}>
                  <div style={{display:'inline-flex',alignItems:'center',justifyContent:'center',marginBottom:16}}>
                    <svg width="72" height="72" viewBox="0 0 100 100" fill="none"><rect width="100" height="100" rx="4" fill="#928989"/><path d="M33.3 16.7 L50 16.7 L58.1 25.2 L66.7 33.3 L66.7 83.3 L50 83.3 L33.3 66.7 Z" fill="#ffffff"/></svg>
                  </div>
                  <div style={{fontSize:18,fontWeight:700,color:'#1a1a1a',letterSpacing:'0.04em'}}>{t('sec.aboutAppName')}</div>
                  <div style={{fontSize:12,color:'#8a7f77',marginBottom:16}}>{t('sec.aboutDesc')}</div>
                  <div style={{textAlign:'left',maxWidth:360,margin:'0 auto'}}>
                    <div style={rowStyle}><span style={labelStyle}>{t('sec.version')}</span><span style={valueStyle}>3.2.1</span></div>
                    <div style={rowStyle}><span style={labelStyle}>{t('sec.build')}</span><span style={valueStyle}>2026.04.10</span></div>
                    <div style={rowStyle}><span style={labelStyle}>{t('sec.module')}</span><span style={valueStyle}>{t('sec.moduleSecurity')}</span></div>
                    <div style={{...rowStyle,borderBottom:'none'}}><span style={labelStyle}>{t('sec.licensedTo')}</span><span style={valueStyle}>{t('sec.varsResidences')}</span></div>
                  </div>
                  <div style={{fontSize:10,color:'#a89a92',marginTop:20}}>{t('sec.copyright')}</div>
                </div>
              )}
            </div>
          </div>
        </div>
        );
      })()}

      {showScanner && (
        <QrScannerModal
          onClose={() => setShowScanner(false)}
          onScanned={handleQrScanned}
        />
      )}

      {scannedData && (
        <ScannedVisitorForm
          scannedData={scannedData}
          onClose={() => setScannedData(null)}
          onSave={handleVisitorSave}
        />
      )}

      {/* New Visitor Entry Form */}
      {showNewVisitorForm && (
        <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'#f2efec',zIndex:1000,overflowY:'auto'}}>
          <div style={{maxWidth:900,margin:'0 auto',padding:20}}>
            {/* Header */}
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24}}>
              <div>
                <h2 style={{fontSize:18,fontWeight:600,color:'#1a1a1a',margin:0}}>{t('sec.newVisitorRequest')}</h2>
                <div style={{fontSize:12,color:'#a89a92',marginTop:2}}>{secFormStep === 'form' ? t('sec.createRequest') : 'Review & Send'}</div>
              </div>
              <div style={{display:'flex',gap:8}}>
                {secFormStep === 'review' && (
                  <button onClick={() => setSecFormStep('form')} style={{background:'#fff',color:'#1a1a1a',border:'1px solid #ebe7e3',padding:'8px 20px',borderRadius:4,fontSize:12,cursor:'pointer',fontWeight:500}}>{t('sec.backToEdit')}</button>
                )}
                <button onClick={() => { resetNewVisitorForm(); setShowNewVisitorForm(false); }} style={{background:'#fff',color:'#1a1a1a',border:'1px solid #ebe7e3',padding:'8px 20px',borderRadius:4,fontSize:12,cursor:'pointer',fontWeight:500}}>{t('sec.cancel')}</button>
              </div>
            </div>

            {secFormStep === 'form' ? (
              <>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
                  {/* Section 01 — Visitor Identity */}
                  <div style={{background:'#fff',border:'1px solid #ebe7e3',borderRadius:6,padding:20}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
                      <div style={{fontSize:12,fontWeight:600,color:'#1a1a1a',display:'flex',alignItems:'center',gap:8}}><span style={{background:'#e8e3de',padding:'2px 8px',borderRadius:3,fontSize:10,color:'#a89a92'}}>01</span> {t('sec.visitorIdentity')}</div>
                    </div>

                    {/* Scan Emirates ID button */}
                    <div style={{marginBottom:18}}>
                      <button onClick={openIdScanner}
                        style={{width:'100%',padding:'12px 16px',background:'linear-gradient(135deg,#ece7e0 0%,#e0d9cf 100%)',color:'#1a1a1a',border:'1px solid #d8d0c6',borderRadius:6,fontSize:12,fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:10,letterSpacing:'0.03em',transition:'all .15s'}}
                        onMouseEnter={e => { e.currentTarget.style.background='linear-gradient(135deg,#e5dfd7 0%,#d9d1c6 100%)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background='linear-gradient(135deg,#ece7e0 0%,#e0d9cf 100%)'; }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" strokeWidth="1.5">
                          <rect x="2" y="2" width="6" height="6" rx="1"/><rect x="16" y="2" width="6" height="6" rx="1"/>
                          <rect x="2" y="16" width="6" height="6" rx="1"/><rect x="16" y="16" width="6" height="6" rx="1"/>
                          <circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>
                        </svg>
                        {t('sec.scanEmiratesId')}
                      </button>
                      <div style={{fontSize:10,color:'#a89a92',textAlign:'center',marginTop:6}}>{t('sec.scanEmiratesIdHint')}</div>
                    </div>

                    <div style={{height:1,background:'#ebe7e3',marginBottom:16}}></div>

                    {/* Visitor Type */}
                    <div style={{marginBottom:16}}>
                      <label style={{fontSize:10,color:'#a89a92',letterSpacing:'0.06em',textTransform:'uppercase',display:'block',marginBottom:8}}>{t('sec.visitorTypeReq')}</label>
                      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
                        {['Resident Guest','Contractor / Worker','Delivery / Courier','Domestic Staff','Service Vendor','Other / Misc.'].map(t => (
                          <div key={t} onClick={() => setNewVisitorData({...newVisitorData, visitorType: t, idDocType: t === 'Resident Guest' ? '' : newVisitorData.idDocType, company: t === 'Resident Guest' ? '' : newVisitorData.company})}
                            style={{padding:'10px 6px',border: newVisitorData.visitorType === t ? '1.5px solid #1a1a1a' : '1px solid #d0d0d0',borderRadius:4,textAlign:'center',cursor:'pointer',background: newVisitorData.visitorType === t ? '#f0f0f0' : 'transparent',fontSize:11,color: newVisitorData.visitorType === t ? '#1a1a1a' : '#8a8a8a'}}>
                            {t}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Full Name */}
                    <div style={{marginBottom:16}}>
                      <label style={{fontSize:10,color:'#a89a92',letterSpacing:'0.06em',textTransform:'uppercase',display:'block',marginBottom:6}}>{t('sec.fullNameReq')}</label>
                      <input value={newVisitorData.fullName} onChange={e => setNewVisitorData({...newVisitorData, fullName: e.target.value})}
                        placeholder={t('sec.phEnterName')}
                        style={{width:'100%',padding:'10px 12px',background:'#fff',border:'1px solid #d5cfc8',borderRadius:4,color:'#1a1a1a',fontSize:13,boxSizing:'border-box',outline:'none'}}/>
                    </div>

                    {/* Company Name — required for all types except Resident Guest */}
                    {newVisitorData.visitorType !== 'Resident Guest' && (
                      <div style={{marginBottom:16}}>
                        <label style={{fontSize:10,color:'#a89a92',letterSpacing:'0.06em',textTransform:'uppercase',display:'block',marginBottom:6}}>{t('sec.companyName')}</label>
                        <input value={newVisitorData.company} onChange={e => setNewVisitorData({...newVisitorData, company: e.target.value})}
                          placeholder={t('sec.phEnterCompany')}
                          style={{width:'100%',padding:'10px 12px',background:'#fff',border:'1px solid #d5cfc8',borderRadius:4,color:'#1a1a1a',fontSize:13,boxSizing:'border-box',outline:'none'}}/>
                      </div>
                    )}

                    {/* Mobile Number */}
                    <div style={{marginBottom:16}}>
                      <label style={{fontSize:10,color:'#a89a92',letterSpacing:'0.06em',textTransform:'uppercase',display:'block',marginBottom:6}}>{t('sec.mobileNumberReq')}</label>
                      <input value={newVisitorData.mobile} onChange={e => setNewVisitorData({...newVisitorData, mobile: e.target.value})}
                        placeholder="+971 XX XXX XXXX"
                        style={{width:'100%',padding:'10px 12px',background:'#fff',border:'1px solid #d5cfc8',borderRadius:4,color:'#1a1a1a',fontSize:13,boxSizing:'border-box',outline:'none'}}/>
                    </div>

                    {/* ID Document Type — optional for Resident Guest, required for others */}
                    <div style={{marginBottom:16}}>
                      <label style={{fontSize:10,color:'#a89a92',letterSpacing:'0.06em',textTransform:'uppercase',display:'block',marginBottom:8}}>
                        {t('sec.idDocType')} {newVisitorData.visitorType !== 'Resident Guest' ? '*' : '(Optional)'}
                      </label>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                        {['Passport','Emirates ID'].map(t => (
                          <div key={t} onClick={() => setNewVisitorData({...newVisitorData, idDocType: newVisitorData.idDocType === t ? '' : t})}
                            style={{padding:10,border: newVisitorData.idDocType === t ? '1.5px solid #1a1a1a' : '1px solid #d0d0d0',borderRadius:4,textAlign:'center',cursor:'pointer',background: newVisitorData.idDocType === t ? '#f0f0f0' : 'transparent',fontSize:12,color: newVisitorData.idDocType === t ? '#1a1a1a' : '#8a8a8a'}}>
                            {t}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Document Number */}
                    {newVisitorData.idDocType && (
                      <div style={{marginBottom:16}}>
                        <label style={{fontSize:10,color:'#a89a92',letterSpacing:'0.06em',textTransform:'uppercase',display:'block',marginBottom:6}}>Document Number{newVisitorData.visitorType !== 'Resident Guest' ? ' *' : ''}</label>
                        <input value={newVisitorData.idDocNumber} onChange={e => setNewVisitorData({...newVisitorData, idDocNumber: e.target.value})}
                          placeholder={t('sec.phEnterDocNum')}
                          style={{width:'100%',padding:'10px 12px',background:'#fff',border:'1px solid #d5cfc8',borderRadius:4,color:'#1a1a1a',fontSize:13,boxSizing:'border-box',outline:'none'}}/>
                      </div>
                    )}

                  </div>

                  {/* Section 02 — Visit Details */}
                  <div style={{background:'#fff',border:'1px solid #ebe7e3',borderRadius:6,padding:20}}>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:20}}>
                      <div style={{fontSize:12,fontWeight:600,color:'#1a1a1a',display:'flex',alignItems:'center',gap:8}}><span style={{background:'#e8e3de',padding:'2px 8px',borderRadius:3,fontSize:10,color:'#a89a92'}}>02</span> {t('sec.visitDetails')}</div>
                                          </div>

                    {/* Flat / Unit */}
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
                      <div style={{position:'relative'}}>
                        <label style={{fontSize:10,color:'#a89a92',letterSpacing:'0.06em',textTransform:'uppercase',display:'block',marginBottom:6}}>{t('sec.unitNo')} *</label>
                        <input value={newVisitorData.flat}
                          onChange={e => {
                            const val = e.target.value;
                            const resident = RESIDENT_BY_UNIT[val.trim()];
                            setNewVisitorData({
                              ...newVisitorData,
                              flat: val,
                              host: resident ? resident.fullName : newVisitorData.host,
                              tower: resident ? resident.tower : newVisitorData.tower
                            });
                            setSecUnitFocused(true);
                          }}
                          onFocus={() => setSecUnitFocused(true)}
                          onBlur={() => setTimeout(() => setSecUnitFocused(false), 150)}
                          placeholder={t('sec.phTypeUnit')}
                          style={{width:'100%',padding:'10px 12px',background:'#fff',border:'1px solid #d5cfc8',borderRadius:4,color:'#1a1a1a',fontSize:13,boxSizing:'border-box',outline:'none'}}/>
                        {secUnitFocused && newVisitorData.flat && (() => {
                          const matches = UNITS_DATABASE.filter(u => u.startsWith(newVisitorData.flat.trim())).slice(0,5);
                          if (matches.length === 0) return null;
                          if (matches.length === 1 && matches[0] === newVisitorData.flat.trim()) return null;
                          return (
                            <div style={{position:'absolute',top:'100%',left:0,right:0,marginTop:4,background:'#fff',border:'1px solid #d5cfc8',borderRadius:4,boxShadow:'0 4px 12px rgba(0,0,0,0.08)',zIndex:10,maxHeight:220,overflowY:'auto'}}>
                              {matches.map(u => {
                                const res = RESIDENT_BY_UNIT[u];
                                return (
                                  <div key={u}
                                    onMouseDown={e => {
                                      e.preventDefault();
                                      setNewVisitorData({
                                        ...newVisitorData,
                                        flat: u,
                                        host: res ? res.fullName : newVisitorData.host,
                                        tower: res ? res.tower : newVisitorData.tower
                                      });
                                      setSecUnitFocused(false);
                                    }}
                                    style={{padding:'10px 12px',fontSize:12,color:'#1a1a1a',cursor:'pointer',borderBottom:'1px solid #f0ece8'}}
                                    onMouseEnter={e => e.currentTarget.style.background='#f5f3f0'}
                                    onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                                    <span style={{fontWeight:600}}>Unit {u}</span>
                                    <span style={{color:'#a89a92'}}> / {res ? res.fullName : 'Vacant'}</span>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>
                      <div>
                        <label style={{fontSize:10,color:'#a89a92',letterSpacing:'0.06em',textTransform:'uppercase',display:'block',marginBottom:6}}>{t('sec.towerBlock')}</label>
                        <select value={newVisitorData.tower} onChange={e => setNewVisitorData({...newVisitorData, tower: e.target.value})}
                          style={{width:'100%',padding:'10px 12px',background:'#fff',border:'1px solid #d5cfc8',borderRadius:4,color:'#1a1a1a',fontSize:13,boxSizing:'border-box',outline:'none'}}>
                          <option>{t('pm.towerA')}</option><option>{t('pm.towerB')}</option><option>{t('pm.towerC')}</option><option>{t('pm.towerD')}</option>
                        </select>
                      </div>
                    </div>

                    {/* Host / Resident */}
                    <div style={{marginBottom:16}}>
                      <label style={{fontSize:10,color:'#a89a92',letterSpacing:'0.06em',textTransform:'uppercase',display:'block',marginBottom:6}}>{t('sec.residentName')} *</label>
                      <input value={newVisitorData.host} onChange={e => setNewVisitorData({...newVisitorData, host: e.target.value})}
                        placeholder={t('sec.phAutoPopulated')}
                        style={{width:'100%',padding:'10px 12px',background:'#fff',border:'1px solid #d5cfc8',borderRadius:4,color:'#1a1a1a',fontSize:13,boxSizing:'border-box',outline:'none'}}/>
                    </div>

                    {/* Repeater */}
                    <div style={{marginBottom:16}}>
                      <label style={{fontSize:10,color:'#a89a92',letterSpacing:'0.06em',textTransform:'uppercase',display:'block',marginBottom:8}}>{t('sec.visitFrequency')}</label>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                        {['Single Visit','Multiple Entry'].map(r => (
                          <div key={r} onClick={() => setNewVisitorData({...newVisitorData, repeater: r})}
                            style={{padding:10,border: newVisitorData.repeater === r ? '1.5px solid #1a1a1a' : '1px solid #d0d0d0',borderRadius:4,textAlign:'center',cursor:'pointer',background: newVisitorData.repeater === r ? '#f0f0f0' : 'transparent',fontSize:12,color: newVisitorData.repeater === r ? '#1a1a1a' : '#8a8a8a'}}>
                            {r}
                          </div>
                        ))}
                      </div>
                      <div style={{fontSize:10,color:'#a89a92',marginTop:4}}>
                        {newVisitorData.repeater === 'Single Visit' ? t('sec.validForToday') : 'Valid until cancelled by resident'}
                      </div>
                    </div>

                    {/* Additional Visitors + Vehicle */}
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
                      <div>
                        <label style={{fontSize:10,color:'#a89a92',letterSpacing:'0.06em',textTransform:'uppercase',display:'block',marginBottom:6}}>{t('sec.additionalVisitors')}</label>
                        <div style={{display:'flex',alignItems:'center',gap:0}}>
                          <button onClick={() => setNewVisitorData({...newVisitorData, additionalVisitors: Math.max(0, newVisitorData.additionalVisitors - 1)})}
                            style={{width:36,height:36,background:'#fff',border:'1px solid #d5cfc8',borderRadius:'4px 0 0 4px',color:'#1a1a1a',fontSize:16,cursor:'pointer'}}>-</button>
                          <div style={{width:48,height:36,background:'#e8e3de',border:'1px solid #d5cfc8',borderLeft:'none',borderRight:'none',display:'flex',alignItems:'center',justifyContent:'center',color:'#1a1a1a',fontSize:14,fontWeight:600}}>{newVisitorData.additionalVisitors}</div>
                          <button onClick={() => setNewVisitorData({...newVisitorData, additionalVisitors: newVisitorData.additionalVisitors + 1})}
                            style={{width:36,height:36,background:'#fff',border:'1px solid #d5cfc8',borderRadius:'0 4px 4px 0',color:'#1a1a1a',fontSize:16,cursor:'pointer'}}>+</button>
                        </div>
                        <div style={{fontSize:10,color:'#a89a92',marginTop:4}}>{t('sec.totalVisitors')} {1 + newVisitorData.additionalVisitors}</div>
                      </div>
                      <div>
                        <label style={{fontSize:10,color:'#a89a92',letterSpacing:'0.06em',textTransform:'uppercase',display:'block',marginBottom:6}}>{t('sec.vehicleNumber')}</label>
                        <input value={newVisitorData.vehicle} onChange={e => setNewVisitorData({...newVisitorData, vehicle: e.target.value})}
                          placeholder="e.g. AB 12345 — leave blank if no"
                          style={{width:'100%',padding:'10px 12px',background:'#fff',border:'1px solid #d5cfc8',borderRadius:4,color:'#1a1a1a',fontSize:13,boxSizing:'border-box',outline:'none'}}/>
                      </div>
                    </div>

                    {/* Guard Notes */}
                    <div>
                      <label style={{fontSize:10,color:'#a89a92',letterSpacing:'0.06em',textTransform:'uppercase',display:'block',marginBottom:6}}>{t('sec.entryRemarks')}</label>
                      <textarea value={newVisitorData.guardNotes} onChange={e => setNewVisitorData({...newVisitorData, guardNotes: e.target.value})}
                        placeholder={t('sec.phObservations')}
                        rows={3}
                        style={{width:'100%',padding:'10px 12px',background:'#fff',border:'1px solid #d5cfc8',borderRadius:4,color:'#1a1a1a',fontSize:13,boxSizing:'border-box',outline:'none',resize:'vertical',fontFamily:'inherit'}}/>
                    </div>
                  </div>
                </div>

                {/* Review Button */}
                <button onClick={validateNewVisitorForm}
                  style={{width:'100%',padding:16,background:'#928989',color:'#fff',border:'none',borderRadius:4,fontSize:15,fontWeight:700,cursor:'pointer',marginTop:20,letterSpacing:'0.04em'}}>
                  {t('sec.reviewRequest')}
                </button>
              </>
            ) : (
              /* REVIEW STEP */
              <div style={{maxWidth:600,margin:'0 auto'}}>
                <div style={{background:'#fff',border:'1px solid #ebe7e3',borderRadius:8,overflow:'hidden',marginBottom:20}}>
                  {/* Review Header */}
                  <div style={{background:'#e8e3de',padding:'16px 20px',borderBottom:'1px solid #d0d0d0'}}>
                    <div style={{display:'flex',alignItems:'center',gap:12}}>
                      <div style={{width:44,height:44,borderRadius:'50%',background:'#928989',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,fontWeight:700,color:'#fff'}}>
                        {newVisitorData.fullName.trim().split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2)}
                      </div>
                      <div>
                        <div style={{fontSize:16,fontWeight:600,color:'#1a1a1a'}}>{newVisitorData.fullName}</div>
                        <div style={{fontSize:12,color:'#1a1a1a'}}>{newVisitorData.visitorType}</div>
                      </div>
                    </div>
                  </div>

                  {/* Review Details */}
                  <div style={{padding:20}}>
                    {[
                      ...(newVisitorData.visitorType !== 'Resident Guest' ? [['Company', newVisitorData.company || '—']] : []),
                      ['Mobile', newVisitorData.mobile],
                      ['ID Document', newVisitorData.idDocType ? (newVisitorData.idDocType + (newVisitorData.idDocNumber ? ': ' + newVisitorData.idDocNumber : '')) : 'Not provided'],
                      ['Unit', newVisitorData.flat + ' — ' + newVisitorData.tower],
                      ['Host / Resident', newVisitorData.host || 'Resident'],
                      ['Visit Frequency', newVisitorData.repeater],
                      ['Additional Visitors', newVisitorData.additionalVisitors > 0 ? '+' + newVisitorData.additionalVisitors + ' (' + (1 + newVisitorData.additionalVisitors) + ' total)' : 'None'],
                      ['Vehicle', newVisitorData.vehicle || 'No vehicle'],
                      ['Guard Notes', newVisitorData.guardNotes || '—']
                    ].map(([label, val], i) => (
                      <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'10px 0',borderBottom: i < 9 ? '1px solid #e0e0e0' : 'none'}}>
                        <span style={{fontSize:12,color:'#a89a92'}}>{label}</span>
                        <span style={{fontSize:12,color:'#1a1a1a',fontWeight:500,textAlign:'right',maxWidth:'60%'}}>{val}</span>
                      </div>
                    ))}
                  </div>

                  {/* Status indicator */}
                  <div style={{padding:'12px 20px',background:'#e0e5db',borderTop:'1px solid #c8e6c9',display:'flex',alignItems:'center',gap:8}}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2e7d32" strokeWidth="2"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="M9 12l2 2 4-4"/></svg>
                    <span style={{fontSize:11,color:'#5a6b4f'}}>{t('sec.requestSentToResident')}</span>
                  </div>
                </div>

                {/* Send Button */}
                <button onClick={submitNewVisitor}
                  style={{width:'100%',padding:16,background:'#928989',color:'#fff',border:'none',borderRadius:6,fontSize:15,fontWeight:700,cursor:'pointer',letterSpacing:'0.04em'}}>
                  {t('sec.newVisitorRequest')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Emirates ID Scanner Modal — Two-Step (Front + Back) */}
      {showIdScanner && (
        <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.85)',zIndex:2000,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
          {/* Header */}
          <div style={{position:'absolute',top:0,left:0,right:0,display:'flex',justifyContent:'space-between',alignItems:'center',padding:'16px 24px',zIndex:2001}}>
            <div>
              <div style={{fontSize:16,fontWeight:600,color:'#fff'}}>{t('sec.scanIdTitle')}</div>
              <div style={{fontSize:11,color:'rgba(255,255,255,0.6)',marginTop:2}}>
                {idScanStatus === 'opening' ? t('sec.openingCamera')
                  : idScanStatus === 'ready' ? t('sec.idFrameHint')
                  : idScanStatus === 'capturing' ? 'Capturing...'
                  : idScanStatus === 'processing' ? t('sec.readingId')
                  : idScanStatus === 'done' ? t('sec.idScannedSuccess')
                  : idScanStatus === 'error' ? t('sec.cameraError')
                  : ''}
              </div>
            </div>
            <button onClick={closeIdScanner} style={{background:'rgba(255,255,255,0.15)',border:'none',color:'#fff',width:36,height:36,borderRadius:'50%',fontSize:18,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>✕</button>
          </div>

          {/* Camera viewfinder */}
          <div style={{position:'relative',width:'92%',maxWidth:640,aspectRatio:'86/54',borderRadius:12,overflow:'hidden',border:'2px solid rgba(255,255,255,0.2)'}}>
            <video ref={idScanVideoRef} autoPlay playsInline muted
              style={{width:'100%',height:'100%',objectFit:'cover',display: idScanStatus === 'ready' || idScanStatus === 'capturing' ? 'block' : 'none'}}/>

            {/* Viewfinder overlay — card outline guide */}
            {(idScanStatus === 'ready' || idScanStatus === 'capturing') && (
              <div style={{position:'absolute',top:0,left:0,right:0,bottom:0,display:'flex',alignItems:'center',justifyContent:'center',pointerEvents:'none'}}>
                <div style={{width:'90%',height:'85%',border:'2px dashed rgba(255,255,255,0.5)',borderRadius:10,position:'relative'}}>
                  <div style={{position:'absolute',top:-24,left:'50%',transform:'translateX(-50)',background:'rgba(0,0,0,0.7)',padding:'5px 14px',borderRadius:4,fontSize:11,color:'rgba(255,255,255,0.9)',whiteSpace:'nowrap',fontWeight:500}}>
                    {t('sec.alignIdHint')}
                  </div>
                  {/* Corner markers */}
                  {[[0,0,'borderTop','borderLeft'],[1,0,'borderTop','borderRight'],[0,1,'borderBottom','borderLeft'],[1,1,'borderBottom','borderRight']].map(([x,y,bv,bh], i) => (
                    <div key={i} style={{position:'absolute',[y?'bottom':'top']:-2,[x?'right':'left']:-2,width:20,height:20,[bv]:'3px solid #fff',[bh]:'3px solid #fff',borderRadius: x === y ? (x ? '0 0 0 0' : '0 0 0 0') : '0'}}/>
                  ))}
                </div>
              </div>
            )}

            {/* Processing overlay */}
            {idScanStatus === 'processing' && (
              <div style={{width:'100%',height:'100%',background:'rgba(0,0,0,0.7)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:16}}>
                <div style={{width:48,height:48,border:'3px solid rgba(255,255,255,0.2)',borderTopColor:'#fff',borderRadius:'50%',animation:'spin 1s linear infinite'}}/>
                <div style={{color:'#fff',fontSize:14,fontWeight:500}}>{t('sec.readingId')}</div>
                <div style={{color:'rgba(255,255,255,0.5)',fontSize:11}}>{t('sec.extractingName')}</div>
              </div>
            )}

            {/* Done overlay */}
            {idScanStatus === 'done' && (
              <div style={{width:'100%',height:'100%',background:'rgba(0,0,0,0.7)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:12}}>
                <div style={{width:56,height:56,borderRadius:'50%',background:'#4caf50',display:'flex',alignItems:'center',justifyContent:'center'}}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <div style={{color:'#fff',fontSize:16,fontWeight:600}}>{t('sec.idScannedSuccess')}</div>
              </div>
            )}

            {/* Error */}
            {idScanStatus === 'error' && (
              <div style={{width:'100%',height:'100%',background:'rgba(0,0,0,0.7)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:12}}>
                <div style={{width:56,height:56,borderRadius:'50%',background:'#d32f2f',display:'flex',alignItems:'center',justifyContent:'center'}}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </div>
                <div style={{color:'#fff',fontSize:14}}>{t('sec.cameraError')}</div>
                <button onClick={() => { closeIdScanner(); }} style={{background:'rgba(255,255,255,0.15)',border:'1px solid rgba(255,255,255,0.3)',color:'#fff',padding:'8px 20px',borderRadius:4,fontSize:12,cursor:'pointer',marginTop:8}}>{t('sec.close')}</button>
              </div>
            )}

            {/* Opening */}
            {idScanStatus === 'opening' && (
              <div style={{width:'100%',height:'100%',background:'rgba(0,0,0,0.9)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:12}}>
                <div style={{width:40,height:40,border:'3px solid rgba(255,255,255,0.2)',borderTopColor:'#fff',borderRadius:'50%',animation:'spin 1s linear infinite'}}/>
                <div style={{color:'rgba(255,255,255,0.7)',fontSize:13}}>{t('sec.openingCamera')}</div>
              </div>
            )}
          </div>

          {/* Hidden canvas for image capture */}
          <canvas ref={idScanCanvasRef} style={{display:'none'}}/>

          {/* Capture button */}
          {idScanStatus === 'ready' && (
            <button onClick={captureIdScan}
              style={{marginTop:24,width:72,height:72,borderRadius:'50%',border:'4px solid rgba(255,255,255,0.4)',background:'rgba(255,255,255,0.15)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',transition:'all .2s'}}
              onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,0.3)'; e.currentTarget.style.transform='scale(1.05)'; }}
              onMouseLeave={e => { e.currentTarget.style.background='rgba(255,255,255,0.15)'; e.currentTarget.style.transform='scale(1)'; }}>
              <div style={{width:52,height:52,borderRadius:'50%',background:'#fff'}}/>
            </button>
          )}

          {/* Instructions */}
          {idScanStatus === 'ready' && (
            <div style={{marginTop:16,textAlign:'center',color:'rgba(255,255,255,0.5)',fontSize:11,maxWidth:300}}>
              {t('sec.holdIdHint')}
            </div>
          )}
        </div>
      )}

      {/* Full Inside List Overlay */}
      {showFullInsideList && (() => {
        const nowTime = new Date();
        const insideVisitors = data.visitors.filter(v => v.status === 'Inside');
        return (
          <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'#f2efec',zIndex:1000,overflowY:'auto'}}>
            <div style={{maxWidth:900,margin:'0 auto',padding:20}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
                <div>
                  <h2 style={{fontSize:18,fontWeight:600,color:'#1a1a1a',margin:0}}>{t('sec.personsInside')}</h2>
                  <div style={{fontSize:12,color:'#a89a92',marginTop:2}}>{insideVisitors.length} visitor{insideVisitors.length !== 1 ? 's' : ''} in the building</div>
                </div>
                <button onClick={() => setShowFullInsideList(false)} style={{background:'#fff',color:'#1a1a1a',border:'1px solid #ebe7e3',padding:'8px 20px',borderRadius:4,fontSize:12,cursor:'pointer',fontWeight:500}}>{t('sec.close')}</button>
              </div>

              {insideVisitors.length === 0 ? (
                <div style={{textAlign:'center',color:'#a89a92',padding:40}}>{t('sec.noVisitorsInside')}</div>
              ) : (
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                  <thead>
                    <tr style={{borderBottom:'1px solid #ebe7e3'}}>
                      <th style={{textAlign:'left',padding:'10px 8px',color:'#a89a92',fontSize:10,letterSpacing:'0.04em',fontWeight:600}}>#</th>
                      <th style={{textAlign:'left',padding:'10px 8px',color:'#a89a92',fontSize:10,letterSpacing:'0.04em',fontWeight:600}}>{t('sec.visitorCol')}</th>
                      <th style={{textAlign:'left',padding:'10px 8px',color:'#a89a92',fontSize:10,letterSpacing:'0.04em',fontWeight:600}}>{t('sec.typeCol')}</th>
                      <th style={{textAlign:'left',padding:'10px 8px',color:'#a89a92',fontSize:10,letterSpacing:'0.04em',fontWeight:600}}>{t('sec.unitHost')}</th>
                      <th style={{textAlign:'left',padding:'10px 8px',color:'#a89a92',fontSize:10,letterSpacing:'0.04em',fontWeight:600}}>{t('sec.entryTime')}</th>
                      <th style={{textAlign:'left',padding:'10px 8px',color:'#a89a92',fontSize:10,letterSpacing:'0.04em',fontWeight:600}}>{t('sec.duration')}</th>
                      <th style={{textAlign:'left',padding:'10px 8px',color:'#a89a92',fontSize:10,letterSpacing:'0.04em',fontWeight:600}}>{t('sec.status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {insideVisitors.map((v, i) => {
                      let durationStr = '—';
                      if (v.securityPassedTime) {
                        try {
                          const today = nowTime.toLocaleDateString('en-GB', { timeZone: 'Asia/Dubai' });
                          const entryDate = new Date(today + ' ' + v.securityPassedTime);
                          const diffMs = nowTime - entryDate;
                          if (diffMs > 0) {
                            const diffMins = Math.floor(diffMs / 60000);
                            if (diffMins < 60) durationStr = diffMins + ' min';
                            else durationStr = Math.floor(diffMins / 60) + 'h ' + (diffMins % 60) + 'm';
                          } else { durationStr = 'Just now'; }
                        } catch(e) { durationStr = '—'; }
                      }
                      return (
                        <tr key={v.id || i} style={{borderBottom:'1px solid #ebe7e3',cursor:'pointer'}} onClick={() => { setViewingVisitor(v); setShowFullInsideList(false); }}>
                          <td style={{padding:'12px 8px',color:'#a89a92'}}>{i + 1}</td>
                          <td style={{padding:'12px 8px',color:'#1a1a1a',fontWeight:500}}>{v.name}</td>
                          <td style={{padding:'12px 8px',color:'#a89a92'}}>{v.type}</td>
                          <td style={{padding:'12px 8px',color:'#a89a92'}}>{v.flat || v.unit || '—'}{v.resident ? ' / ' + v.resident : ''}</td>
                          <td style={{padding:'12px 8px',color:'#1a1a1a',fontWeight:500}}>{v.securityPassedTime || v.time || '—'}</td>
                          <td style={{padding:'12px 8px',color:'#a89a92'}}>{durationStr}</td>
                          <td style={{padding:'12px 8px'}}><span style={{background:'#e0e5db',color:'#5a6b4f',padding:'2px 8px',borderRadius:3,fontSize:10,fontWeight:600}}>{t('sec.inside').toUpperCase()}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
};

// ==================== SUPABASE + REAL-TIME SYNC ====================
