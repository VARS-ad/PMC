// ==================== SEED: VISITOR REGISTRY (online database) ====================
// Builds ~60 realistic entry-log rows relative to today so the All Visitors page
// always has historic, current, and future data. Stable SEED-xxx ids make the
// one-time migration idempotent — re-running never creates duplicates, and any
// additional visitors added through the app are merged in on top.
// Version includes today's date so seed rows regenerate with current-day offsets each day
const SEED_ENTRY_LOG_VERSION = 'v4-' + (() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); })();
const buildSeedEntryLog = () => {
  const today = new Date();
  const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const offset = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return iso(d); };
  const initials = (name) => name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const t12 = (h, m = 0) => { const ap = h >= 12 ? 'PM' : 'AM'; const hr = ((h + 11) % 12) + 1; return String(hr).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ' ' + ap; };
  const dur = (hIn, mIn, hOut, mOut) => { const a = hIn * 60 + mIn, b = hOut * 60 + mOut; const mins = Math.max(0, b - a); return Math.floor(mins / 60) + 'h ' + String(mins % 60).padStart(2, '0') + 'm'; };

  // Dynamic INSIDE times: spread 10 visitors between 7:00 AM and current time (never future)
  const nowHr = today.getHours(), nowMn = today.getMinutes();
  const nowTotalMin = nowHr * 60 + nowMn;
  const startMin = 7 * 60; // 7:00 AM
  const availMin = Math.max(nowTotalMin - startMin, 60); // at least 60 min range
  const insideSlot = (idx) => {
    const m = startMin + Math.floor((availMin * idx) / 10) + Math.floor(idx * 3.7); // slight jitter
    const clamped = Math.min(m, nowTotalMin - 5); // always at least 5 min before now
    const h = Math.floor(Math.max(clamped, startMin) / 60);
    const mn = Math.max(clamped, startMin) % 60;
    return t12(h, mn);
  };

  const rows = [
    // ===== 10 × INSIDE today — times computed dynamically to always be before current time =====
    { visitor: 'Ali Hassan Rashid',     type: 'Resident Guest',     flat: 'A-1201', host: 'Nitin Sharma',       phone: '+971 50 111 2233', company: '',                          timeIn: insideSlot(0),  timeOut: '', duration: '—', status: 'Passed Security', gateUsed: 'Main Gate',    idDoc: 'EMIRATES ID', purpose: 'Social Visit',    date: offset(0) },
    { visitor: 'DHL Express Courier',   type: 'Delivery / Courier', flat: 'B-305',  host: 'Zahra Al-Nahyan',    phone: '+971 4 800 1001',  company: 'DHL Express',                timeIn: insideSlot(1),  timeOut: '', duration: '—', status: 'Passed Security', gateUsed: 'Service Gate', idDoc: 'WORK ID',     purpose: 'Parcel Delivery', date: offset(0) },
    { visitor: 'Modern Plumbing Co',    type: 'Contractor / Worker',flat: 'C-605',  host: 'Layla Abdullah',     phone: '+971 50 244 1800', company: 'Modern Plumbing LLC',        timeIn: insideSlot(2),  timeOut: '', duration: '—', status: 'Passed Security', gateUsed: 'Service Gate', idDoc: 'TRADE LICENCE', purpose: 'Leak Repair',    date: offset(0) },
    { visitor: 'Fatima Al-Khouri',      type: 'Resident Guest',     flat: 'C-1805', host: 'Fatima Al-Saeed',    phone: '+971 55 776 9911', company: '',                          timeIn: insideSlot(3),  timeOut: '', duration: '—', status: 'Passed Security', gateUsed: 'Main Gate',    idDoc: 'EMIRATES ID', purpose: 'Family Visit',    date: offset(0) },
    { visitor: 'Emirates Post',         type: 'Delivery / Courier', flat: 'B-703',  host: 'Omar Farooq',        phone: '+971 600 599 999', company: 'Emirates Post',              timeIn: insideSlot(4),  timeOut: '', duration: '—', status: 'Passed Security', gateUsed: 'Service Gate', idDoc: 'WORK ID',     purpose: 'Registered Mail', date: offset(0) },
    { visitor: 'Elite HVAC Services',   type: 'Contractor / Worker',flat: 'A-908',  host: 'Aisha Al-Marzooqi',  phone: '+971 4 333 7788',  company: 'Elite HVAC Services LLC',    timeIn: insideSlot(5),  timeOut: '', duration: '—', status: 'Passed Security', gateUsed: 'Service Gate', idDoc: 'TRADE LICENCE', purpose: 'AC Maintenance', date: offset(0) },
    { visitor: 'Raj Mehta',             type: 'Resident Guest',     flat: 'B-1102', host: 'Raj Patel',          phone: '+971 56 121 4455', company: '',                          timeIn: insideSlot(6),  timeOut: '', duration: '—', status: 'Passed Security', gateUsed: 'Main Gate',    idDoc: 'PASSPORT',    purpose: 'Lunch Meeting',   date: offset(0) },
    { visitor: 'Noon Delivery',         type: 'Delivery / Courier', flat: 'A-2203', host: 'Sara Khalifa',       phone: '+971 4 209 9999',  company: 'Noon.com',                    timeIn: insideSlot(7),  timeOut: '', duration: '—', status: 'Passed Security', gateUsed: 'Service Gate', idDoc: 'WORK ID',     purpose: 'Grocery Delivery',date: offset(0) },
    { visitor: 'Dubai Gas Technician',  type: 'Vendor',             flat: 'B-401',  host: 'Mohammed Al-Rashid', phone: '+971 4 296 3131',  company: 'Dubai Gas Distribution',     timeIn: insideSlot(8),  timeOut: '', duration: '—', status: 'Passed Security', gateUsed: 'Service Gate', idDoc: 'WORK ID',     purpose: 'Gas Inspection',  date: offset(0) },
    { visitor: 'Yuki Tanaka',           type: 'Resident Guest',     flat: 'A-1707', host: 'Daniel Chen',        phone: '+81 90 1234 5678', company: '',                          timeIn: insideSlot(9),  timeOut: '', duration: '—', status: 'Passed Security', gateUsed: 'Main Gate',    idDoc: 'PASSPORT',    purpose: 'Friend Visit',    date: offset(0) },

    // ===== 15 × SCHEDULED (future, next 14 days) =====
    { visitor: 'Careem Now',            type: 'Delivery / Courier', flat: 'B-102',  host: 'Nitin Sharma',       phone: '+971 4 420 5566',  company: 'Careem Now',                 timeIn: '', timeOut: '', duration: '—', status: 'Scheduled', gateUsed: 'Service Gate', idDoc: 'WORK ID',     purpose: 'Pharmacy Delivery',date: offset(1) },
    { visitor: 'Layla Ibrahim',         type: 'Resident Guest',     flat: 'C-304',  host: 'Ahmed Tariq',        phone: '+971 50 889 1122', company: '',                          timeIn: '', timeOut: '', duration: '—', status: 'Scheduled', gateUsed: 'Main Gate',    idDoc: 'EMIRATES ID', purpose: 'Evening Visit',   date: offset(1) },
    { visitor: 'Etisalat Technician',   type: 'Vendor',             flat: 'A-501',  host: 'Priya Sharma',       phone: '+971 800 101',     company: 'Etisalat e&',                timeIn: '', timeOut: '', duration: '—', status: 'Scheduled', gateUsed: 'Service Gate', idDoc: 'WORK ID',     purpose: 'Internet Install',date: offset(2) },
    { visitor: 'ProFix Electrical',     type: 'Contractor / Worker',flat: 'B-1504', host: 'Yasmin Hassan',      phone: '+971 50 339 7710', company: 'ProFix Electrical LLC',      timeIn: '', timeOut: '', duration: '—', status: 'Scheduled', gateUsed: 'Service Gate', idDoc: 'TRADE LICENCE', purpose: 'Rewiring',       date: offset(2) },
    { visitor: 'Aramex',                type: 'Delivery / Courier', flat: 'C-1805', host: 'Fatima Al-Saeed',    phone: '+971 600 544 000', company: 'Aramex',                      timeIn: '', timeOut: '', duration: '—', status: 'Scheduled', gateUsed: 'Service Gate', idDoc: 'WORK ID',     purpose: 'International Pkg',date: offset(3) },
    { visitor: 'Hassan Al-Maktoum',     type: 'Resident Guest',     flat: 'A-908',  host: 'Aisha Al-Marzooqi',  phone: '+971 50 200 3040', company: '',                          timeIn: '', timeOut: '', duration: '—', status: 'Scheduled', gateUsed: 'Main Gate',    idDoc: 'EMIRATES ID', purpose: 'Dinner',          date: offset(3) },
    { visitor: 'Smart Home Installers', type: 'Vendor',             flat: 'A-1707', host: 'Daniel Chen',        phone: '+971 4 447 8800',  company: 'Smart Home Dubai',           timeIn: '', timeOut: '', duration: '—', status: 'Scheduled', gateUsed: 'Service Gate', idDoc: 'TRADE LICENCE', purpose: 'Smart Lock Install',date: offset(4) },
    { visitor: 'Talabat Rider',         type: 'Delivery / Courier', flat: 'B-305',  host: 'Zahra Al-Nahyan',    phone: '+971 4 444 1818',  company: 'Talabat',                    timeIn: '', timeOut: '', duration: '—', status: 'Scheduled', gateUsed: 'Service Gate', idDoc: 'WORK ID',     purpose: 'Food Delivery',   date: offset(5) },
    { visitor: 'Imran Qureshi',         type: 'Resident Guest',     flat: 'B-1102', host: 'Raj Patel',          phone: '+92 300 444 5566', company: '',                          timeIn: '', timeOut: '', duration: '—', status: 'Scheduled', gateUsed: 'Main Gate',    idDoc: 'PASSPORT',    purpose: 'Weekend Stay',    date: offset(6) },
    { visitor: 'Culligan Water',        type: 'Vendor',             flat: 'C-605',  host: 'Layla Abdullah',     phone: '+971 4 510 1000',  company: 'Culligan Middle East',       timeIn: '', timeOut: '', duration: '—', status: 'Scheduled', gateUsed: 'Service Gate', idDoc: 'WORK ID',     purpose: 'Filter Change',   date: offset(7) },
    { visitor: 'Premium Flooring LLC',  type: 'Contractor / Worker',flat: 'A-2203', host: 'Sara Khalifa',       phone: '+971 50 881 3322', company: 'Premium Flooring LLC',       timeIn: '', timeOut: '', duration: '—', status: 'Scheduled', gateUsed: 'Service Gate', idDoc: 'TRADE LICENCE', purpose: 'Marble Polishing',date: offset(8) },
    { visitor: 'Deliveroo Rider',       type: 'Delivery / Courier', flat: 'B-401',  host: 'Mohammed Al-Rashid', phone: '+971 4 505 2020',  company: 'Deliveroo',                   timeIn: '', timeOut: '', duration: '—', status: 'Scheduled', gateUsed: 'Service Gate', idDoc: 'WORK ID',     purpose: 'Dinner Delivery', date: offset(9) },
    { visitor: 'Mariam Al-Suwaidi',     type: 'Resident Guest',     flat: 'C-304',  host: 'Ahmed Tariq',        phone: '+971 55 901 2345', company: '',                          timeIn: '', timeOut: '', duration: '—', status: 'Scheduled', gateUsed: 'Main Gate',    idDoc: 'EMIRATES ID', purpose: 'Family Gathering',date: offset(10) },
    { visitor: 'Sky Paint LLC',         type: 'Contractor / Worker',flat: 'A-501',  host: 'Priya Sharma',       phone: '+971 50 777 6600', company: 'Sky Paint LLC',              timeIn: '', timeOut: '', duration: '—', status: 'Scheduled', gateUsed: 'Service Gate', idDoc: 'TRADE LICENCE', purpose: 'Interior Paint',  date: offset(12) },
    { visitor: 'FedEx Courier',         type: 'Delivery / Courier', flat: 'B-703',  host: 'Omar Farooq',        phone: '+971 4 805 0555',  company: 'FedEx',                       timeIn: '', timeOut: '', duration: '—', status: 'Scheduled', gateUsed: 'Service Gate', idDoc: 'WORK ID',     purpose: 'Express Package', date: offset(14) },

    // ===== 15 × CHECKED OUT (5 today, dynamic times + 10 past 14 days) =====
    // Today's checked-out: all times must be before current time
    // coSlot(idx, count) spreads checked-out pairs in early morning before INSIDE visitors
    ...(() => {
      const coData = [
        { visitor: 'Karim Jabri',    type: 'Resident Guest',     flat: 'B-102',  host: 'Nitin Sharma',       phone: '+971 50 661 2280', company: '',             gateUsed: 'Main Gate',    idDoc: 'EMIRATES ID', purpose: 'Breakfast' },
        { visitor: 'Hub Delivery',   type: 'Delivery / Courier', flat: 'A-1201', host: 'Nitin Sharma',       phone: '+971 4 220 3030',  company: 'Hub Delivery', gateUsed: 'Service Gate', idDoc: 'WORK ID',     purpose: 'Grocery Drop' },
        { visitor: 'Sanjay Iyer',    type: 'Resident Guest',     flat: 'B-1102', host: 'Raj Patel',          phone: '+971 56 700 8833', company: '',             gateUsed: 'Main Gate',    idDoc: 'PASSPORT',    purpose: 'Coffee' },
        { visitor: 'Zomato Rider',   type: 'Delivery / Courier', flat: 'A-501',  host: 'Priya Sharma',       phone: '+971 4 509 1200',  company: 'Zomato',       gateUsed: 'Service Gate', idDoc: 'WORK ID',     purpose: 'Lunch Delivery' },
        { visitor: 'Khaled Al-Amiri',type: 'Resident Guest',     flat: 'B-401',  host: 'Mohammed Al-Rashid', phone: '+971 55 300 1144', company: '',             gateUsed: 'Main Gate',    idDoc: 'EMIRATES ID', purpose: 'Brief Meeting' },
      ];
      // Each pair: enter between 6:00 and (now - 30min), leave 10-90 min after entry
      const coStart = 6 * 60; // 6:00 AM
      const coEnd = Math.max(nowTotalMin - 30, coStart + 60);
      const coSpan = coEnd - coStart;
      return coData.map((d, idx) => {
        const inMin = coStart + Math.floor((coSpan * idx) / coData.length) + idx * 7;
        const stayMin = [15, 12, 25, 13, 20][idx]; // realistic durations
        const outMin = Math.min(inMin + stayMin + Math.floor(idx * 18), nowTotalMin - 10);
        const hIn = Math.floor(inMin / 60), mIn = inMin % 60;
        const hOut = Math.floor(Math.max(outMin, inMin + 10) / 60), mOut = Math.max(outMin, inMin + 10) % 60;
        return { ...d, timeIn: t12(hIn, mIn), timeOut: t12(hOut, mOut), duration: dur(hIn, mIn, hOut, mOut), status: 'Checked Out', date: offset(0) };
      });
    })(),
    { visitor: 'Rania Khoury',          type: 'Resident Guest',     flat: 'C-1805', host: 'Fatima Al-Saeed',    phone: '+961 3 778 990',   company: '',                          timeIn: t12(14, 20), timeOut: t12(18, 0),  duration: dur(14,20,18,0), status: 'Checked Out', gateUsed: 'Main Gate',    idDoc: 'PASSPORT',    purpose: 'Afternoon Tea',  date: offset(-1) },
    { visitor: 'Aramex',                type: 'Delivery / Courier', flat: 'B-305',  host: 'Zahra Al-Nahyan',    phone: '+971 600 544 000', company: 'Aramex',                      timeIn: t12(11, 50), timeOut: t12(12, 5),  duration: dur(11,50,12,5), status: 'Checked Out', gateUsed: 'Service Gate', idDoc: 'WORK ID',     purpose: 'Express Pkg',    date: offset(-1) },
    { visitor: 'Elite HVAC Services',   type: 'Contractor / Worker',flat: 'A-2203', host: 'Sara Khalifa',       phone: '+971 4 333 7788',  company: 'Elite HVAC Services LLC',    timeIn: t12(9, 0),   timeOut: t12(13, 30), duration: dur(9,0,13,30),  status: 'Checked Out', gateUsed: 'Service Gate', idDoc: 'TRADE LICENCE', purpose: 'AC Install',    date: offset(-2) },
    { visitor: 'Hiroshi Sato',          type: 'Resident Guest',     flat: 'A-1707', host: 'Daniel Chen',        phone: '+81 80 5555 0001', company: '',                          timeIn: t12(16, 30), timeOut: t12(22, 15), duration: dur(16,30,22,15),status: 'Checked Out', gateUsed: 'Main Gate',    idDoc: 'PASSPORT',    purpose: 'Dinner Party',   date: offset(-2) },
    { visitor: 'Dubai Gas Distribution',type: 'Vendor',             flat: 'B-703',  host: 'Omar Farooq',        phone: '+971 4 296 3131',  company: 'Dubai Gas Distribution',     timeIn: t12(10, 0),  timeOut: t12(11, 45), duration: dur(10,0,11,45), status: 'Checked Out', gateUsed: 'Service Gate', idDoc: 'WORK ID',     purpose: 'Cylinder Delivery',date: offset(-3) },
    { visitor: 'Ibrahim Al-Shamsi',     type: 'Resident Guest',     flat: 'B-1504', host: 'Yasmin Hassan',      phone: '+971 50 555 7700', company: '',                          timeIn: t12(18, 0),  timeOut: t12(21, 30), duration: dur(18,0,21,30), status: 'Checked Out', gateUsed: 'Main Gate',    idDoc: 'EMIRATES ID', purpose: 'Family Dinner',  date: offset(-4) },
    { visitor: 'Noon.com Delivery',     type: 'Delivery / Courier', flat: 'C-605',  host: 'Layla Abdullah',     phone: '+971 4 209 9999',  company: 'Noon.com',                    timeIn: t12(15, 10), timeOut: t12(15, 22), duration: dur(15,10,15,22),status: 'Checked Out', gateUsed: 'Service Gate', idDoc: 'WORK ID',     purpose: 'Electronics',    date: offset(-5) },
    { visitor: 'Sky Paint LLC',         type: 'Contractor / Worker',flat: 'A-908',  host: 'Aisha Al-Marzooqi',  phone: '+971 50 777 6600', company: 'Sky Paint LLC',              timeIn: t12(8, 30),  timeOut: t12(17, 0),  duration: dur(8,30,17,0),  status: 'Checked Out', gateUsed: 'Service Gate', idDoc: 'TRADE LICENCE', purpose: 'Ceiling Paint', date: offset(-6) },
    { visitor: 'Emirates Post',         type: 'Delivery / Courier', flat: 'C-304',  host: 'Ahmed Tariq',        phone: '+971 600 599 999', company: 'Emirates Post',              timeIn: t12(13, 40), timeOut: t12(13, 55), duration: dur(13,40,13,55),status: 'Checked Out', gateUsed: 'Service Gate', idDoc: 'WORK ID',     purpose: 'Registered Mail',date: offset(-7) },
    { visitor: 'Chen Wei',              type: 'Resident Guest',     flat: 'A-1707', host: 'Daniel Chen',        phone: '+86 138 0013 8000',company: '',                          timeIn: t12(9, 0),   timeOut: t12(20, 15), duration: dur(9,0,20,15),  status: 'Checked Out', gateUsed: 'Main Gate',    idDoc: 'PASSPORT',    purpose: 'Business Meeting',date: offset(-9) },

    // ===== 10 × REJECTED (3 today, dynamic times + 7 past 14 days) =====
    ...(() => {
      const rejData = [
        { visitor: 'Unknown Courier',       type: 'Delivery / Courier', flat: 'B-102',  host: 'Nitin Sharma',       phone: '—',                company: 'Unverified',    gateUsed: 'Service Gate', idDoc: 'NONE',        purpose: 'Unsolicited Delivery' },
        { visitor: 'Rashid (ex-contractor)',type: 'Contractor / Worker',flat: 'A-1201', host: 'Nitin Sharma',       phone: '+971 50 000 1111', company: 'Former Vendor', gateUsed: 'Service Gate', idDoc: 'EMIRATES ID', purpose: 'No Work Order' },
        { visitor: 'Tariq Bin Faisal',      type: 'Other / Misc.',      flat: 'C-1805', host: 'Fatima Al-Saeed',    phone: '+971 56 000 2222', company: '',              gateUsed: 'Main Gate',    idDoc: 'EMIRATES ID', purpose: 'Resident Not Home' },
      ];
      const rejStart = 6 * 60 + 30; // 6:30 AM
      const rejEnd = Math.max(nowTotalMin - 15, rejStart + 30);
      const rejSpan = rejEnd - rejStart;
      return rejData.map((d, idx) => {
        const m = rejStart + Math.floor((rejSpan * idx) / rejData.length) + idx * 11;
        const clamped = Math.min(m, nowTotalMin - 10);
        const h = Math.floor(Math.max(clamped, rejStart) / 60);
        const mn = Math.max(clamped, rejStart) % 60;
        return { ...d, timeIn: t12(h, mn), timeOut: '', duration: '—', status: 'Rejected', date: offset(0) };
      });
    })(),
    { visitor: 'Anonymous Delivery',    type: 'Delivery / Courier', flat: 'B-703',  host: 'Omar Farooq',        phone: '—',                company: 'Unverified',                 timeIn: t12(11, 10), timeOut: '', duration: '—', status: 'Rejected', gateUsed: 'Service Gate', idDoc: 'NONE',        purpose: 'No ID Provided', date: offset(-1) },
    { visitor: 'Faisal Omar',           type: 'Resident Guest',     flat: 'A-501',  host: 'Priya Sharma',       phone: '+971 55 432 1100', company: '',                          timeIn: t12(19, 30), timeOut: '', duration: '—', status: 'Rejected', gateUsed: 'Main Gate',    idDoc: 'EMIRATES ID', purpose: 'Resident Declined',date: offset(-2) },
    { visitor: 'FlyJet Movers',         type: 'Contractor / Worker',flat: 'B-1504', host: 'Yasmin Hassan',      phone: '+971 4 222 0000',  company: 'FlyJet Movers LLC',          timeIn: t12(12, 0),  timeOut: '', duration: '—', status: 'Rejected', gateUsed: 'Service Gate', idDoc: 'TRADE LICENCE', purpose: 'No Prior Notice',date: offset(-4) },
    { visitor: 'Unregistered Vendor',   type: 'Vendor',             flat: 'C-605',  host: 'Layla Abdullah',     phone: '—',                company: 'Unverified',                 timeIn: t12(15, 45), timeOut: '', duration: '—', status: 'Rejected', gateUsed: 'Service Gate', idDoc: 'NONE',        purpose: 'Unknown Company',date: offset(-6) },
    { visitor: 'Mohammed Al-Khayyat',   type: 'Resident Guest',     flat: 'B-401',  host: 'Mohammed Al-Rashid', phone: '+971 50 880 9900', company: '',                          timeIn: t12(22, 30), timeOut: '', duration: '—', status: 'Rejected', gateUsed: 'Main Gate',    idDoc: 'EMIRATES ID', purpose: 'Late Hour Denied',date: offset(-8) },
    { visitor: 'Xpress Cargo',          type: 'Delivery / Courier', flat: 'A-908',  host: 'Aisha Al-Marzooqi',  phone: '+971 4 111 3333',  company: 'Xpress Cargo',               timeIn: t12(9, 20),  timeOut: '', duration: '—', status: 'Rejected', gateUsed: 'Service Gate', idDoc: 'WORK ID',     purpose: 'Wrong Address',  date: offset(-10) },
    { visitor: 'Suspicious Visitor',    type: 'Other / Misc.',      flat: 'A-2203', host: 'Sara Khalifa',       phone: '—',                company: '',                          timeIn: t12(23, 50), timeOut: '', duration: '—', status: 'Rejected', gateUsed: 'Main Gate',    idDoc: 'NONE',        purpose: 'Flagged On Watchlist',date: offset(-12) },

    // ===== 10 × older CHECKED OUT (historic, 10-30 days ago) =====
    { visitor: 'Amira Nasser',          type: 'Resident Guest',     flat: 'B-1102', host: 'Raj Patel',          phone: '+971 50 445 1122', company: '',                          timeIn: t12(17, 0),  timeOut: t12(23, 30), duration: dur(17,0,23,30), status: 'Checked Out', gateUsed: 'Main Gate',    idDoc: 'EMIRATES ID', purpose: 'Birthday Dinner',date: offset(-11) },
    { visitor: 'Aramex International',  type: 'Delivery / Courier', flat: 'C-1805', host: 'Fatima Al-Saeed',    phone: '+971 600 544 000', company: 'Aramex',                      timeIn: t12(10, 0),  timeOut: t12(10, 12), duration: dur(10,0,10,12), status: 'Checked Out', gateUsed: 'Service Gate', idDoc: 'WORK ID',     purpose: 'Intl Package',   date: offset(-13) },
    { visitor: 'Du Network Tech',       type: 'Vendor',             flat: 'A-501',  host: 'Priya Sharma',       phone: '+971 800 155',     company: 'Du Telecom',                  timeIn: t12(14, 0),  timeOut: t12(16, 45), duration: dur(14,0,16,45), status: 'Checked Out', gateUsed: 'Service Gate', idDoc: 'WORK ID',     purpose: 'Router Swap',    date: offset(-15) },
    { visitor: 'Anjali Rao',            type: 'Resident Guest',     flat: 'A-1201', host: 'Nitin Sharma',       phone: '+91 98 1234 5678', company: '',                          timeIn: t12(18, 30), timeOut: t12(21, 0),  duration: dur(18,30,21,0), status: 'Checked Out', gateUsed: 'Main Gate',    idDoc: 'PASSPORT',    purpose: 'Dinner',         date: offset(-17) },
    { visitor: 'ProFix Electrical',     type: 'Contractor / Worker',flat: 'B-401',  host: 'Mohammed Al-Rashid', phone: '+971 50 339 7710', company: 'ProFix Electrical LLC',      timeIn: t12(9, 30),  timeOut: t12(15, 0),  duration: dur(9,30,15,0),  status: 'Checked Out', gateUsed: 'Service Gate', idDoc: 'TRADE LICENCE', purpose: 'Panel Upgrade', date: offset(-19) },
    { visitor: 'Yasmin Al-Kaabi',       type: 'Resident Guest',     flat: 'C-304',  host: 'Ahmed Tariq',        phone: '+971 55 998 0011', company: '',                          timeIn: t12(11, 0),  timeOut: t12(14, 30), duration: dur(11,0,14,30), status: 'Checked Out', gateUsed: 'Main Gate',    idDoc: 'EMIRATES ID', purpose: 'Brunch',         date: offset(-21) },
    { visitor: 'DHL Express',           type: 'Delivery / Courier', flat: 'A-1707', host: 'Daniel Chen',        phone: '+971 4 800 1001',  company: 'DHL Express',                timeIn: t12(12, 40), timeOut: t12(12, 55), duration: dur(12,40,12,55),status: 'Checked Out', gateUsed: 'Service Gate', idDoc: 'WORK ID',     purpose: 'Signature Required',date: offset(-23) },
    { visitor: 'Marco Rossi',           type: 'Resident Guest',     flat: 'B-305',  host: 'Zahra Al-Nahyan',    phone: '+39 333 444 5555', company: '',                          timeIn: t12(19, 0),  timeOut: t12(23, 15), duration: dur(19,0,23,15), status: 'Checked Out', gateUsed: 'Main Gate',    idDoc: 'PASSPORT',    purpose: 'Dinner',         date: offset(-25) },
    { visitor: 'Modern Cleaning LLC',   type: 'Contractor / Worker',flat: 'C-605',  host: 'Layla Abdullah',     phone: '+971 4 558 9900',  company: 'Modern Cleaning LLC',        timeIn: t12(8, 0),   timeOut: t12(12, 30), duration: dur(8,0,12,30),  status: 'Checked Out', gateUsed: 'Service Gate', idDoc: 'TRADE LICENCE', purpose: 'Deep Clean',    date: offset(-28) },
    { visitor: 'Talabat Rider',         type: 'Delivery / Courier', flat: 'B-703',  host: 'Omar Farooq',        phone: '+971 4 444 1818',  company: 'Talabat',                    timeIn: t12(20, 10), timeOut: t12(20, 22), duration: dur(20,10,20,22),status: 'Checked Out', gateUsed: 'Service Gate', idDoc: 'WORK ID',     purpose: 'Dinner Delivery',date: offset(-30) },
  ];

  return rows.map((r, i) => ({
    id: 'SEED-' + String(i + 1).padStart(3, '0'),
    refId: 'VIS-' + String(10000 + i),
    initials: initials(r.visitor),
    registeredDate: r.date,
    visitDate: r.date,
    // Full date fields: dateIn = day visitor entered, dateOut = day visitor left
    dateIn: r.date,
    dateOut: (r.status === 'Checked Out') ? r.date : '',
    idVerified: r.status !== 'Rejected',
    vehicleVerified: r.type === 'Delivery / Courier' || r.type === 'Contractor / Worker' || r.type === 'Vendor',
    _seed: true,
    ...r
  }));
};

