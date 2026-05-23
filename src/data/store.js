// ==================== DATA STORE ====================
const initialData = {
  currentUser: { name: 'Hassan Al-PM', email: 'hassan@pinnaclepm.ae', phone: '+971 50 999 0001', role: 'Property Manager' },
  property: { name: 'VARS Property Management', location: 'Abu Dhabi, UAE', timezone: 'Asia/Dubai (GMT+4)', towers: 5, totalFlats: 4740, occupiedFlats: 4110 },
  // Full units catalog + residents — persisted to Supabase via app_state
  unitsCatalog: UNITS_DATABASE,
  residents: RESIDENTS_DATABASE,
  // Authoritative property units database — drives PM Dashboard KPIs
  propertyUnits: PROPERTY_UNITS_DATABASE,
  kpis: { totalResidences: PROPERTY_UNITS_STATS.total, occupiedFlats: PROPERTY_UNITS_STATS.occupied, visitorsInside: 86, activeServiceReq: 15, scheduledVisits: 12, unackAlerts: 3, pendingApprovals: 7 },
  towers: [
    { name: 'The Pinnacle Residences', location: 'Al Reem Island', totalFlats: 1240, occupied: 1087 },
    { name: 'Al Raha Gardens', location: 'Al Raha Beach', totalFlats: 680, occupied: 598 },
    { name: 'Saadiyat Grove Residences', location: 'Saadiyat Island', totalFlats: 920, occupied: 814 },
    { name: 'Yas Bay Residences', location: 'Yas Island', totalFlats: 340, occupied: 291 },
    { name: 'Bloom Living', location: 'Casares, Abu Dhabi', totalFlats: 1560, occupied: 1320 }
  ],
  visitors: [
    { id: 1, name: 'James Harrison', resident: 'Mr. Khalid Al-Mansoori', flat: 'A-1204', contact: '+971 50 123 4567', type: 'Guest', gate: 'Main Gate', status: 'Inside', time: '09:14', date: '05 Apr', dateIn: '2026-04-05', dateOut: '', permitRef: 'VIS-2026-0001', duration: '2 hours', qrCode: 'Pre-approved' },
    { id: 2, name: 'ProServ Cleaning Co.', resident: 'Ms. Amira Belhasa', flat: 'B-0803', contact: '+971 50 234 5678', type: 'Vendor', gate: 'Main Gate', status: 'Inside', time: '09:32', date: '05 Apr', dateIn: '2026-04-05', dateOut: '', permitRef: 'VIS-2026-0002', duration: '2 hours', qrCode: 'Pre-approved' },
    { id: 3, name: 'Ahmad Al-Sayed', resident: 'Mr. Hassan Al-Farsi', flat: 'C-0501', contact: '+971 55 345 6789', type: 'Guest', gate: 'Gate no. 2', status: 'Inside', time: '08:55', date: '05 Apr', dateIn: '2026-04-05', dateOut: '', permitRef: 'VIS-2026-0003', duration: '3 hours', qrCode: 'Pre-approved' },
    { id: 4, name: 'Emirates Move & Pack', resident: 'Ms. Noor Abdullah', flat: 'A-0202', contact: '+971 4 456 7890', type: 'Contractor', gate: 'Main Gate', status: 'Pending', time: '10:01', date: '05 Apr', dateIn: '2026-04-05', dateOut: '', permitRef: 'VIS-2026-0004', duration: '4 hours', qrCode: 'Pending' },
    { id: 5, name: 'Sofia Mendes', resident: 'Mr. Omar Khouri', flat: 'D-1102', contact: '+971 56 567 8901', type: 'Guest', gate: 'Gate no. 2', status: 'Inside', time: '10:15', date: '05 Apr', dateIn: '2026-04-05', dateOut: '', permitRef: 'VIS-2026-0005', duration: '1 hour', qrCode: 'Pre-approved' },
    { id: 6, name: 'TechServ IT Solutions', resident: 'Dr. Fatima Al-Ali', flat: 'B-0405', contact: '+971 55 678 9012', type: 'Vendor', gate: 'Gate no. 2', status: 'Pending', time: '10:22', date: '06 Apr', dateIn: '2026-04-06', dateOut: '', permitRef: 'VIS-2026-0006', duration: '2 hours', qrCode: 'Pending' },
    { id: 7, name: 'Leila Nassif', resident: 'Mr. Yusuf Al-Breiki', flat: 'C-1001', contact: '+971 50 789 0123', type: 'Guest', gate: 'Main Gate', status: 'Checked Out', time: '08:30', date: '04 Apr', dateIn: '2026-04-04', dateOut: '2026-04-04', permitRef: 'VIS-2026-0007', duration: '2 hours', qrCode: 'Pre-approved' },
    { id: 8, name: 'AquaFix Plumbing', resident: 'Ms. Rania Saab', flat: 'A-0708', contact: '+971 4 890 1234', type: 'Contractor', gate: 'Main Gate', status: 'Inside', time: '07:45', date: '05 Apr', dateIn: '2026-04-05', dateOut: '', permitRef: 'VIS-2026-0008', duration: '3 hours', qrCode: 'Pre-approved' },
    { id: 9, name: 'Nour Al-Rashid', resident: 'Mr. Saif Al-Mazrouei', flat: 'C-0904', contact: '+971 56 901 2345', type: 'Guest', gate: 'Main Gate', status: 'Scheduled', time: '11:00', date: '14 Apr', dateIn: '2026-04-14', dateOut: '', permitRef: 'VIS-2026-0009', duration: '2 hours', qrCode: 'Pre-approved' },
    { id: 10, name: 'MaintenancePro Handyman', resident: 'Ms. Maha Al-Tunaiji', flat: 'B-1201', contact: '+971 50 012 3456', type: 'Contractor', gate: 'Main Gate', status: 'Scheduled', time: '13:00', date: '15 Apr', dateIn: '2026-04-15', dateOut: '', permitRef: 'VIS-2026-0010', duration: '2 hours', qrCode: 'Pending' }
  ],
  payments: [
    { id: 1, name: 'James Harrison', flat: 'A-1204', amount: 4500, status: 'Paid', time: '09:14' },
    { id: 2, name: 'ProServ Cleaning Co.', flat: 'B-0803', amount: 65300, status: 'Paid', time: '09:32' },
    { id: 3, name: 'Ahmad Al-Sayed', flat: 'C-0501', amount: 500, status: 'Paid', time: '08:55' },
    { id: 4, name: 'Emirates Move & Pack', flat: 'A-0202', amount: 6520, status: 'Unpaid', time: '10:01' },
    { id: 5, name: 'Sofia Mendes', flat: 'D-1102', amount: 8420, status: 'Paid', time: '10:15' }
  ],
  serviceRequests: [
    // === Past (completed) ===
    { id: 'SR-1080', type: 'AC Repair',    flat: 'A-0302', resident: 'Ms. Dina Al-Farsi',       date: '08 Apr', time: '09:00', status: 'Completed', notes: 'Compressor replaced, unit tested OK' },
    { id: 'SR-1081', type: 'Plumbing',     flat: 'B-0601', resident: 'Mr. Rashid Al-Ketbi',     date: '09 Apr', time: '10:30', status: 'Completed', notes: 'Kitchen sink leak fixed, new gasket installed' },
    { id: 'SR-1082', type: 'Electrical',   flat: 'C-0201', resident: 'Dr. Leila Al-Hosani',     date: '10 Apr', time: '14:00', status: 'Completed', notes: 'Bedroom circuit breaker replaced' },
    { id: 'SR-1083', type: 'Move-Out',     flat: 'A-1204', resident: 'Mr. Khalid Al-Mansoori',  date: '11 Apr', time: '10:00', status: 'Completed', notes: 'Unit inspection passed, deposit cleared' },
    { id: 'SR-1084', type: 'Handyman',     flat: 'D-0304', resident: 'Ms. Zainab Al-Maktoumi',  date: '12 Apr', time: '11:00', status: 'Completed', notes: 'Bathroom door hinge repaired' },
    // === 13 Apr (today) ===
    { id: 'SR-1085', type: 'AC Repair',    flat: 'C-0304', resident: 'Mr. Tariq Al-Nuaimi',     date: '13 Apr', time: '09:00', status: 'In Progress', notes: 'Technician on site, checking compressor' },
    { id: 'SR-1086', type: 'Plumbing',     flat: 'B-0601', resident: 'Mr. Rashid Al-Ketbi',     date: '13 Apr', time: '10:30', status: 'Pending Approval', notes: 'Bathroom pipe leak reported' },
    { id: 'SR-1087', type: 'Pest Control', flat: 'C-0201', resident: 'Dr. Leila Al-Hosani',     date: '13 Apr', time: '14:00', status: 'Scheduled', notes: 'Ant infestation in kitchen area' },
    // === 14 Apr ===
    { id: 'SR-1088', type: 'Electrical',   flat: 'A-0405', resident: 'Dr. Huda Al-Breiki',      date: '14 Apr', time: '09:00', status: 'Scheduled', notes: 'Power outlet sparking in kitchen' },
    { id: 'SR-1089', type: 'Installation', flat: 'D-0304', resident: 'Ms. Zainab Al-Maktoumi',  date: '14 Apr', time: '11:00', status: 'Pending Approval', notes: 'Request to install dishwasher' },
    // === 15 Apr ===
    { id: 'SR-1090', type: 'Handyman',     flat: 'D-1102', resident: 'Ms. Maha Al-Mazrouei',    date: '15 Apr', time: '09:00', status: 'Scheduled', notes: 'Wardrobe sliding door off track' },
    { id: 'SR-1091', type: 'AC Repair',    flat: 'B-0405', resident: 'Dr. Fatima Al-Ali',       date: '15 Apr', time: '15:00', status: 'Pending Approval', notes: 'AC making loud noise, possible fan issue' },
    // === 16 Apr ===
    { id: 'SR-1092', type: 'Plumbing',     flat: 'A-0301', resident: 'Mr. Khaled Al-Qasimi',    date: '16 Apr', time: '08:30', status: 'Scheduled', notes: 'Low water pressure in master bathroom' },
    { id: 'SR-1093', type: 'Move-In',      flat: 'B-0903', resident: 'Mr. Omar Al-Muraikhi',    date: '16 Apr', time: '14:00', status: 'Scheduled', notes: 'New tenant moving in, furniture delivery expected' },
    // === 17 Apr ===
    { id: 'SR-1094', type: 'Electrical',   flat: 'C-0502', resident: 'Ms. Hana Al-Nuaimi',      date: '17 Apr', time: '10:00', status: 'Scheduled', notes: 'Balcony light not working' },
    { id: 'SR-1095', type: 'Pest Control', flat: 'A-0501', resident: 'Mr. Abdullah Al-Shamsi',  date: '17 Apr', time: '14:00', status: 'Scheduled', notes: 'Follow-up spray treatment' },
    // === 18 Apr ===
    { id: 'SR-1096', type: 'AC Repair',    flat: 'A-0204', resident: 'Mr. Youssef Al-Kaabi',    date: '18 Apr', time: '09:00', status: 'Pending Approval', notes: 'AC not cooling, temperature stuck at 28C' },
    { id: 'SR-1097', type: 'Handyman',     flat: 'D-0802', resident: 'Ms. Layla Al-Hosani',     date: '18 Apr', time: '16:00', status: 'Scheduled', notes: 'Bedroom window handle broken' },
    // === 19 Apr ===
    { id: 'SR-1098', type: 'Move-Out',     flat: 'B-1204', resident: 'Mr. Faisal Al-Mansoori',  date: '19 Apr', time: '11:00', status: 'Pending Approval', notes: 'Lease ending, inspection needed' },
    // === 20 Apr ===
    { id: 'SR-1099', type: 'Plumbing',     flat: 'C-1001', resident: 'Mr. Yusuf Al-Breiki',     date: '20 Apr', time: '09:30', status: 'Scheduled', notes: 'Guest bathroom faucet dripping' },
  ],
  amenityBookings: [],
  dismissedNotifIds: [],
  dismissedSecNotifIds: [],
  servicePersonnel: [
    { id: 1, name: 'Ali Hassan (Handyman)', specialty: 'General Maintenance' },
    { id: 2, name: 'CoolAir Technicians', specialty: 'HVAC / AC' },
    { id: 3, name: 'ProFix Plumbing', specialty: 'Plumbing' },
    { id: 4, name: 'Emirates Move & Pack', specialty: 'Move-In / Move-Out' },
    { id: 5, name: 'CleanServ Team', specialty: 'Cleaning / Pest' },
    { id: 6, name: 'ElectroPro UAE', specialty: 'Electrical' }
  ],
  announcements: [
    { id: 1, title: 'Pool Maintenance — Temporary Closure', body: 'Swimming pool closed for maintenance on April 12. Expected reopening April 14. We apologise for the inconvenience.', audience: 'All Residents', author: 'Hassan Al-PM', created: '05 Apr, 09:44', status: 'Live', priority: 'High', ackRequired: true, delivered: 1240, read: 847, acknowledged: 723 },
    { id: 2, title: 'Elevator Servicing — Tower B', body: 'Elevator servicing Saturday morning 07 Apr, 09:00–13:00. Please use Tower A elevators during this period.', audience: 'Tower B', author: 'Hassan Al-PM', created: '05 Apr, 10:01', status: 'Live', priority: 'Normal', ackRequired: false, delivered: 620, read: 410, acknowledged: 0 },
    { id: 3, title: 'Community BBQ — Friday Evening', body: 'Join us this Friday at 7 PM on the Marina Deck for a community BBQ. Food and beverages provided. Families welcome!', audience: 'All Residents', author: 'Hassan Al-PM', created: '03 Apr, 14:00', status: 'Sent', priority: 'Normal', ackRequired: false, delivered: 1240, read: 1102, acknowledged: 0 },
    { id: 4, title: 'Visitor Policy Update', body: 'Starting April 10, all visitors must present a valid ID at the gate. Pre-approved guests will receive a QR code for faster entry.', audience: 'All Residents + Guards', author: 'Admin', created: '01 Apr, 11:00', status: 'Sent', priority: 'High', ackRequired: true, delivered: 1268, read: 1254, acknowledged: 1231 },
    { id: 5, title: 'Water Supply Interruption — Tower C', body: 'Scheduled water supply maintenance on April 15, 10:00–14:00 for Tower C. Please store water in advance.', audience: 'Tower C', author: 'Hassan Al-PM', created: '05 Apr, 08:30', status: 'Live', priority: 'Normal', ackRequired: false, delivered: 310, read: 180, acknowledged: 0 },
    { id: 6, title: 'Parking Garage Deep Clean', body: 'Basement parking levels B1 and B2 will undergo deep cleaning on April 11, 08:00–16:00. Please park on street level or B3.', audience: 'All Residents', author: 'Hassan Al-PM', created: '06 Apr, 11:30', status: 'Live', priority: 'Normal', ackRequired: false, delivered: 1240, read: 670, acknowledged: 0 },
    { id: 7, title: 'Fire Drill — All Towers', body: 'Mandatory fire drill on April 14 at 10:00 AM. All residents must evacuate to designated assembly points. Instructions will be posted on each floor.', audience: 'All Residents', author: 'Admin', created: '07 Apr, 09:00', status: 'Sent', priority: 'High', ackRequired: true, delivered: 1268, read: 990, acknowledged: 845 },
    { id: 8, title: 'Gym Equipment Upgrade', body: 'New cardio and strength equipment arriving April 16. Gym will be closed April 15–16 for installation.', audience: 'All Residents', author: 'Hassan Al-PM', created: '07 Apr, 15:00', status: 'Live', priority: 'Normal', ackRequired: false, delivered: 1240, read: 520, acknowledged: 0 }
  ],
  guards: [
    { id: 'GRD-001', name: 'Ahmed Khalil', shift: 'Morning', shiftTime: '06:00–14:00', gate: 'Main Gate', company: 'SecureGuard LLC', contact: '+971 55 111 2222', status: 'On Duty', verified: true },
    { id: 'GRD-002', name: 'Mohammed Al-Said', shift: 'Morning', shiftTime: '06:00–14:00', gate: 'Tower B Lobby', company: 'SecureGuard LLC', contact: '+971 55 222 3333', status: 'On Duty', verified: true },
    { id: 'GRD-003', name: 'Ibrahim Hassan', shift: 'Afternoon', shiftTime: '14:00–22:00', gate: 'Visitor Gate', company: 'PrimeSecurity Co.', contact: '+971 55 333 4444', status: 'Off Duty', verified: true },
    { id: 'GRD-004', name: 'Youssef Al-Qasim', shift: 'Night', shiftTime: '22:00–06:00', gate: 'Parking Gate', company: 'SecureGuard LLC', contact: '+971 55 444 5555', status: 'Off Duty', verified: false },
    { id: 'GRD-005', name: 'Tariq Bin Saeed', shift: 'Afternoon', shiftTime: '14:00–22:00', gate: 'Delivery Gate', company: 'PrimeSecurity Co.', contact: '+971 55 555 6666', status: 'On Duty', verified: true }
  ],
  residents: [
    { id: 'RES-001', name: 'Mr. Ahmed Al-Mansoori', flat: 'A-0101', coResidents: 7, contact: '+971 56 979401611', moveInDate: '6 Mar 2024', status: 'Pending', policy: 'Enhanced', absence: 'None', packageAutoAccept: false, visitorPreApproval: false, emailNotifications: false, pushNotifications: true },
    { id: 'RES-002', name: 'Ms. Fatima Al-Neyadi', flat: 'A-0102', coResidents: 4, contact: '+971 56 297418057', moveInDate: '19 Feb 2024', status: 'Verified', policy: 'Standard', absence: 'None', packageAutoAccept: true, visitorPreApproval: true, emailNotifications: true, pushNotifications: true },
    { id: 'RES-003', name: 'Mr. Hassan Al-Mazrouei', flat: 'A-0103', coResidents: 8, contact: '+971 52 256331366', moveInDate: '10 Feb 2025', status: 'Verified', policy: 'Standard', absence: '9–25 Apr', packageAutoAccept: true, visitorPreApproval: true, emailNotifications: true, pushNotifications: true },
    { id: 'RES-004', name: 'Ms. Noor Al-Remeithi', flat: 'A-0104', coResidents: 4, contact: '+971 51 309531932', moveInDate: '7 Jun 2024', status: 'Pending', policy: 'Custom', absence: 'None', packageAutoAccept: true, visitorPreApproval: true, emailNotifications: true, pushNotifications: true },
    { id: 'RES-005', name: 'Mr. Saif Al-Dhaheri', flat: 'A-0105', coResidents: 6, contact: '+971 55 595276311', moveInDate: '9 Dec 2023', status: 'Active', policy: 'Custom', absence: '13–30 Apr', packageAutoAccept: true, visitorPreApproval: true, emailNotifications: true, pushNotifications: true },
    { id: 'RES-006', name: 'Dr. Amira Al-Bloushi', flat: 'A-0201', coResidents: 6, contact: '+971 51 207949054', moveInDate: '25 Feb 2024', status: 'Pending', policy: 'Custom', absence: 'None', packageAutoAccept: false, visitorPreApproval: true, emailNotifications: true, pushNotifications: true },
    { id: 'RES-007', name: 'Mr. Tariq Al-Zaabi', flat: 'A-0202', coResidents: 8, contact: '+971 55 614610722', moveInDate: '24 Dec 2024', status: 'Verified', policy: 'Standard', absence: 'None', packageAutoAccept: true, visitorPreApproval: true, emailNotifications: true, pushNotifications: true },
    { id: 'RES-008', name: 'Ms. Rania Al-Ameri', flat: 'A-0203', coResidents: 4, contact: '+971 51 399203528', moveInDate: '3 Dec 2024', status: 'Pending', policy: 'Enhanced', absence: 'None', packageAutoAccept: true, visitorPreApproval: true, emailNotifications: true, pushNotifications: false },
    { id: 'RES-009', name: 'Mr. Youssef Al-Kaabi', flat: 'A-0204', coResidents: 9, contact: '+971 52 191170768', moveInDate: '24 May 2024', status: 'Verified', policy: 'Custom', absence: 'None', packageAutoAccept: true, visitorPreApproval: true, emailNotifications: true, pushNotifications: true },
    { id: 'RES-010', name: 'Ms. Hana Al-Nuaimi', flat: 'A-0205', coResidents: 2, contact: '+971 51 597789502', moveInDate: '3 Sep 2024', status: 'Active', policy: 'Enhanced', absence: 'None', packageAutoAccept: false, visitorPreApproval: true, emailNotifications: false, pushNotifications: true },
    { id: 'RES-011', name: 'Mr. Khaled Al-Qasimi', flat: 'A-0301', coResidents: 5, contact: '+971 54 476071813', moveInDate: '4 Jan 2023', status: 'Pending', policy: 'Standard', absence: '11–21 Apr', packageAutoAccept: true, visitorPreApproval: true, emailNotifications: false, pushNotifications: false },
    { id: 'RES-012', name: 'Ms. Dina Al-Farsi', flat: 'A-0302', coResidents: 6, contact: '+971 55 630535717', moveInDate: '10 Jun 2024', status: 'Active', policy: 'Enhanced', absence: 'None', packageAutoAccept: false, visitorPreApproval: false, emailNotifications: true, pushNotifications: true },
    { id: 'RES-013', name: 'Mr. Omar Al-Muraikhi', flat: 'A-0303', coResidents: 6, contact: '+971 55 327811066', moveInDate: '16 Jul 2023', status: 'Active', policy: 'Custom', absence: 'None', packageAutoAccept: true, visitorPreApproval: true, emailNotifications: false, pushNotifications: true },
    { id: 'RES-014', name: 'Dr. Leila Al-Hosani', flat: 'A-0304', coResidents: 7, contact: '+971 56 402307612', moveInDate: '27 May 2023', status: 'Verified', policy: 'Enhanced', absence: '6–29 Apr', packageAutoAccept: true, visitorPreApproval: true, emailNotifications: false, pushNotifications: true },
    { id: 'RES-015', name: 'Mr. Ibrahim Al-Suwaidi', flat: 'A-0305', coResidents: 1, contact: '+971 56 172716180', moveInDate: '14 Jun 2024', status: 'Pending', policy: 'Standard', absence: 'None', packageAutoAccept: true, visitorPreApproval: true, emailNotifications: false, pushNotifications: false },
    { id: 'RES-016', name: 'Ms. Zainab Al-Maktoumi', flat: 'A-0401', coResidents: 6, contact: '+971 51 622962438', moveInDate: '23 Jul 2024', status: 'Verified', policy: 'Enhanced', absence: 'None', packageAutoAccept: true, visitorPreApproval: false, emailNotifications: true, pushNotifications: true },
    { id: 'RES-017', name: 'Mr. Rashid Al-Ketbi', flat: 'A-0402', coResidents: 3, contact: '+971 55 645531495', moveInDate: '25 Feb 2023', status: 'Verified', policy: 'Custom', absence: 'None', packageAutoAccept: false, visitorPreApproval: false, emailNotifications: true, pushNotifications: true },
    { id: 'RES-018', name: 'Ms. Maha Al-Mazrouei', flat: 'A-0403', coResidents: 9, contact: '+971 54 173657021', moveInDate: '22 Jun 2024', status: 'Pending', policy: 'Enhanced', absence: '6–30 Apr', packageAutoAccept: true, visitorPreApproval: true, emailNotifications: false, pushNotifications: false },
    { id: 'RES-019', name: 'Mr. Faisal Al-Mansoori', flat: 'A-0404', coResidents: 2, contact: '+971 54 610789079', moveInDate: '9 Aug 2024', status: 'Verified', policy: 'Custom', absence: 'None', packageAutoAccept: true, visitorPreApproval: true, emailNotifications: true, pushNotifications: false },
    { id: 'RES-020', name: 'Dr. Huda Al-Breiki', flat: 'A-0405', coResidents: 5, contact: '+971 52 489598122', moveInDate: '6 Jan 2023', status: 'Pending', policy: 'Enhanced', absence: 'None', packageAutoAccept: true, visitorPreApproval: true, emailNotifications: false, pushNotifications: true },
    { id: 'RES-021', name: 'Mr. Abdullah Al-Shamsi', flat: 'A-0501', coResidents: 4, contact: '+971 52 545303516', moveInDate: '3 May 2023', status: 'Pending', policy: 'Standard', absence: 'None', packageAutoAccept: true, visitorPreApproval: false, emailNotifications: false, pushNotifications: true },
    { id: 'RES-022', name: 'Ms. Noura Al-Hamairi', flat: 'A-0502', coResidents: 3, contact: '+971 51 610306437', moveInDate: '4 Nov 2023', status: 'Active', policy: 'Standard', absence: 'None', packageAutoAccept: true, visitorPreApproval: true, emailNotifications: false, pushNotifications: true },
    { id: 'RES-023', name: 'Mr. Saeed Al-Neyadi', flat: 'A-0503', coResidents: 1, contact: '+971 54 324560358', moveInDate: '11 May 2023', status: 'Active', policy: 'Enhanced', absence: 'None', packageAutoAccept: false, visitorPreApproval: true, emailNotifications: false, pushNotifications: true },
    { id: 'RES-024', name: 'Ms. Azza Al-Zaabi', flat: 'A-0504', coResidents: 6, contact: '+971 50 428051013', moveInDate: '3 Jan 2024', status: 'Pending', policy: 'Standard', absence: '2–30 Apr', packageAutoAccept: true, visitorPreApproval: true, emailNotifications: true, pushNotifications: false },
    { id: 'RES-025', name: 'Mr. Mohammed Al-Kaabi', flat: 'A-0505', coResidents: 2, contact: '+971 50 174443493', moveInDate: '6 Jan 2024', status: 'Active', policy: 'Custom', absence: 'None', packageAutoAccept: false, visitorPreApproval: true, emailNotifications: true, pushNotifications: true },
    { id: 'RES-026', name: 'Dr. Samira Al-Bloushi', flat: 'A-0601', coResidents: 1, contact: '+971 50 720809810', moveInDate: '26 Jul 2024', status: 'Verified', policy: 'Custom', absence: 'None', packageAutoAccept: true, visitorPreApproval: true, emailNotifications: true, pushNotifications: true },
    { id: 'RES-027', name: 'Mr. Jamal Al-Ketbi', flat: 'A-0602', coResidents: 9, contact: '+971 54 349538886', moveInDate: '16 Jul 2024', status: 'Active', policy: 'Enhanced', absence: 'None', packageAutoAccept: true, visitorPreApproval: true, emailNotifications: false, pushNotifications: true },
    { id: 'RES-028', name: 'Ms. Mariam Al-Nuaimi', flat: 'A-0603', coResidents: 5, contact: '+971 55 458047215', moveInDate: '4 Aug 2024', status: 'Verified', policy: 'Custom', absence: 'None', packageAutoAccept: false, visitorPreApproval: false, emailNotifications: false, pushNotifications: true },
    { id: 'RES-029', name: 'Mr. Karim Al-Qasimi', flat: 'A-0604', coResidents: 7, contact: '+971 53 231822996', moveInDate: '1 Jul 2023', status: 'Active', policy: 'Standard', absence: 'None', packageAutoAccept: false, visitorPreApproval: true, emailNotifications: false, pushNotifications: true },
    { id: 'RES-030', name: 'Ms. Layla Al-Hosani', flat: 'A-0605', coResidents: 7, contact: '+971 53 811017597', moveInDate: '24 Oct 2023', status: 'Active', policy: 'Custom', absence: 'None', packageAutoAccept: true, visitorPreApproval: true, emailNotifications: false, pushNotifications: true },
    { id: 'RES-031', name: 'Mr. Hamad Al-Suwaidi', flat: 'A-0701', coResidents: 5, contact: '+971 53 588171895', moveInDate: '26 Nov 2023', status: 'Verified', policy: 'Custom', absence: '1–24 Apr', packageAutoAccept: true, visitorPreApproval: false, emailNotifications: true, pushNotifications: true },
    { id: 'RES-032', name: 'Ms. Reem Al-Maktoumi', flat: 'A-0702', coResidents: 2, contact: '+971 51 757985492', moveInDate: '18 May 2024', status: 'Pending', policy: 'Enhanced', absence: 'None', packageAutoAccept: true, visitorPreApproval: true, emailNotifications: true, pushNotifications: true },
    { id: 'RES-033', name: 'Mr. Nasser Al-Falasi', flat: 'A-0703', coResidents: 1, contact: '+971 52 394512554', moveInDate: '22 Jul 2024', status: 'Pending', policy: 'Enhanced', absence: 'None', packageAutoAccept: false, visitorPreApproval: true, emailNotifications: false, pushNotifications: false },
    { id: 'RES-034', name: 'Dr. Aisha Al-Mansoori', flat: 'A-0704', coResidents: 4, contact: '+971 53 185916505', moveInDate: '4 May 2023', status: 'Pending', policy: 'Standard', absence: '13–24 Apr', packageAutoAccept: true, visitorPreApproval: false, emailNotifications: true, pushNotifications: true },
    { id: 'RES-035', name: 'Mr. Suhail Al-Muraikhi', flat: 'A-0705', coResidents: 9, contact: '+971 52 899405314', moveInDate: '10 Dec 2024', status: 'Pending', policy: 'Custom', absence: 'None', packageAutoAccept: true, visitorPreApproval: true, emailNotifications: true, pushNotifications: false },
    { id: 'RES-036', name: 'Ms. Nawal Al-Farsi', flat: 'A-0801', coResidents: 6, contact: '+971 50 203436723', moveInDate: '4 Oct 2023', status: 'Active', policy: 'Custom', absence: 'None', packageAutoAccept: true, visitorPreApproval: true, emailNotifications: false, pushNotifications: true },
    { id: 'RES-037', name: 'Mr. Adel Al-Shams', flat: 'A-0802', coResidents: 3, contact: '+971 51 296421664', moveInDate: '19 Jul 2024', status: 'Verified', policy: 'Enhanced', absence: 'None', packageAutoAccept: true, visitorPreApproval: true, emailNotifications: true, pushNotifications: true },
    { id: 'RES-038', name: 'Ms. Salma Al-Dhaheri', flat: 'A-0803', coResidents: 5, contact: '+971 50 702690673', moveInDate: '22 Oct 2024', status: 'Pending', policy: 'Custom', absence: 'None', packageAutoAccept: false, visitorPreApproval: true, emailNotifications: true, pushNotifications: true },
    { id: 'RES-039', name: 'Mr. Jassim Al-Ameri', flat: 'A-0804', coResidents: 4, contact: '+971 56 814433659', moveInDate: '11 Jan 2024', status: 'Verified', policy: 'Enhanced', absence: 'None', packageAutoAccept: false, visitorPreApproval: true, emailNotifications: true, pushNotifications: false },
    { id: 'RES-040', name: 'Dr. Haya Al-Breiki', flat: 'A-0805', coResidents: 5, contact: '+971 56 288184410', moveInDate: '12 Dec 2024', status: 'Pending', policy: 'Standard', absence: 'None', packageAutoAccept: true, visitorPreApproval: true, emailNotifications: false, pushNotifications: true },
    { id: 'RES-041', name: 'Mr. Waleed Al-Kaabi', flat: 'A-0901', coResidents: 2, contact: '+971 50 356728043', moveInDate: '17 Nov 2024', status: 'Active', policy: 'Custom', absence: 'None', packageAutoAccept: true, visitorPreApproval: true, emailNotifications: false, pushNotifications: true },
    { id: 'RES-042', name: 'Ms. Nuha Al-Hosani', flat: 'A-0902', coResidents: 7, contact: '+971 50 795690106', moveInDate: '20 Aug 2024', status: 'Active', policy: 'Enhanced', absence: 'None', packageAutoAccept: true, visitorPreApproval: true, emailNotifications: true, pushNotifications: true },
    { id: 'RES-043', name: 'Mr. Majed Al-Neyadi', flat: 'A-0903', coResidents: 5, contact: '+971 55 861654138', moveInDate: '1 Dec 2024', status: 'Pending', policy: 'Standard', absence: 'None', packageAutoAccept: true, visitorPreApproval: false, emailNotifications: true, pushNotifications: true },
    { id: 'RES-044', name: 'Ms. Amina Al-Bloushi', flat: 'A-0904', coResidents: 4, contact: '+971 54 916011366', moveInDate: '13 Oct 2023', status: 'Pending', policy: 'Custom', absence: 'None', packageAutoAccept: true, visitorPreApproval: true, emailNotifications: false, pushNotifications: true },
    { id: 'RES-045', name: 'Mr. Younis Al-Ketbi', flat: 'A-0905', coResidents: 5, contact: '+971 54 505393406', moveInDate: '2 Nov 2023', status: 'Active', policy: 'Standard', absence: 'None', packageAutoAccept: true, visitorPreApproval: true, emailNotifications: false, pushNotifications: true },
    { id: 'RES-046', name: 'Ms. Habiba Al-Zaabi', flat: 'A-1001', coResidents: 6, contact: '+971 53 637001298', moveInDate: '20 Sep 2024', status: 'Pending', policy: 'Standard', absence: 'None', packageAutoAccept: true, visitorPreApproval: true, emailNotifications: false, pushNotifications: false },
    { id: 'RES-047', name: 'Mr. Ramzi Al-Muraikhi', flat: 'A-1002', coResidents: 2, contact: '+971 51 216263616', moveInDate: '5 Sep 2024', status: 'Pending', policy: 'Custom', absence: 'None', packageAutoAccept: false, visitorPreApproval: true, emailNotifications: true, pushNotifications: true },
    { id: 'RES-048', name: 'Dr. Silma Al-Qasimi', flat: 'A-1003', coResidents: 5, contact: '+971 53 971520185', moveInDate: '6 May 2024', status: 'Pending', policy: 'Custom', absence: 'None', packageAutoAccept: true, visitorPreApproval: true, emailNotifications: false, pushNotifications: true },
    { id: 'RES-049', name: 'Mr. Amin Al-Farsi', flat: 'A-1004', coResidents: 7, contact: '+971 52 836173322', moveInDate: '10 Jul 2024', status: 'Verified', policy: 'Custom', absence: '12–23 Apr', packageAutoAccept: false, visitorPreApproval: true, emailNotifications: false, pushNotifications: true },
    { id: 'RES-050', name: 'Ms. Wafa Al-Remeithi', flat: 'A-1005', coResidents: 2, contact: '+971 50 780739538', moveInDate: '28 Apr 2024', status: 'Verified', policy: 'Enhanced', absence: '1–26 Apr', packageAutoAccept: true, visitorPreApproval: true, emailNotifications: true, pushNotifications: false }
  ],

  escalations: [
    { id: 'ESC-018', type: 'SLA Breach', severity: 'Critical', title: 'SLA Breach — SR-1087 Move-Out', flat: 'A-1204', created: '05 Apr, 13:00', assigned: 'PM Hassan', status: 'Unresolved', sla: '18h overdue' },
    { id: 'ESC-017', type: 'Compliance', severity: 'High', title: 'Expired Compliance — Guard GRD-004', flat: '', created: '05 Apr, 08:00', assigned: 'Security Admin', status: 'In Review', sla: '2h remaining' },
    { id: 'ESC-016', type: 'Security', severity: 'Critical', title: 'Security Alert — Unauthorised access attempt', flat: 'B-0100', created: '05 Apr, 09:55', assigned: 'PM Hassan', status: 'Unresolved', sla: 'Active' },
    { id: 'ESC-015', type: 'Approval', severity: '', title: 'Unacknowledged Approval — Visitor pending 2h+', flat: '', created: '05 Apr, 07:30', assigned: '', status: 'Resolved', sla: '' }
  ],
  activityFeed: [
    { text: 'Visitor checked in — Flat A-1204 (James Harrison)', time: '10:15', type: 'green' },
    { text: 'Service request approved — Flat B-0803 (AC Repair)', time: '10:08', type: 'blue' },
    { text: 'Guard override used — Flat C-0501', time: '09:58', type: 'yellow' },
    { text: 'Announcement sent — Pool maintenance notice', time: '09:44', type: 'blue' },
    { text: 'Package delivered — Flat D-1102 (Amazon)', time: '09:31', type: 'green' },
    { text: 'New visitor approved by resident — Flat A-0202', time: '09:14', type: 'green' },
    { text: 'Escalation raised — SLA breach on SR-1087', time: '08:50', type: 'red' }
  ],
  todaySchedule: [
    { time: '11:00', name: 'Tech Support — Etisalat', flat: 'A-0302', type: 'Vendor' },
    { time: '13:00', name: 'Nour Al-Rashid (Guest)', flat: 'C-0904', type: 'Guest' },
    { time: '14:30', name: 'Handyman — MaintenancePro', flat: 'B-1201', type: 'Contractor' },
    { time: '16:00', name: 'Architect Consultation', flat: 'D-0506', type: 'Vendor' }
  ],
  settings: {
    notifications: {
      newVisitorCheckin: { push: true, email: false },
      pendingApprovalTimeout: { push: true, email: true },
      guardOverrideUsed: { push: true, email: true },
      newServiceRequest: { push: true, email: false },
      slaBreachWarning: { push: true, email: true },
      lowAckRate: { push: false, email: true },
      newEscalation: { push: true, email: true },
      escalationUnresolved: { push: true, email: true }
    },
    accessPolicy: {
      visitorPreApproval: true, userTimingPreApproval: true, residentOverride: true,
      additionalNotification: true, guardOverride: true, autoApproveReturning: false,
      requireIdContractors: true, enableQrPrepass: true, twoFactorMoveInOut: true
    },
    packagePrefs: {
      amazon: true, noon: true, dhl: true, fedex: true, aramex: true, deliveroo: false,
      pickupWindow: 'Within 48 hours'
    },
    propertySettings: { name: 'The Pinnacle Residences', location: 'Al Reem Island, Abu Dhabi', timezone: 'Asia/Dubai (GMT+4)', totalTowers: 4 },
    general: { language: 'English', dateFormat: 'DD/MM/YYYY', timeFormat: '24-hour', timezone: 'UTC+04:00', defaultPageSize: '10 rows' }
  },
  household: [
    { id: 1, name: 'Zainab', phone: '+12 123 456 789', relation: 'Sister', status: 'Active', idDocType: 'Emirates ID', docNumber: '784-1990-1234567-1', vehicleNumber: '' },
    { id: 2, name: 'Faiza', phone: '+12 123 456 789', relation: 'Mother', status: 'Active', idDocType: 'Emirates ID', docNumber: '784-1965-9876543-1', vehicleNumber: 'ABU 12345' },
  ],
  regularVisitors: [
    { id: 1, name: 'Asma', phone: '+12 123 456 789', role: 'Maid', schedule: 'Mon, Wed, Fri', hours: '9:00 AM to 17:00 PM', status: 'Active', idDocType: 'Emirates ID', docNumber: '784-1985-5551234-1', vehicleNumber: '' },
    { id: 2, name: 'Ibrahim', phone: '+12 123 456 789', role: 'Nanny', schedule: 'Mon to Fri', hours: '9:00 AM to 17:00 PM', status: 'Active', idDocType: 'Emirates ID', docNumber: '784-1992-3334567-1', vehicleNumber: '' },
    { id: 3, name: 'Hamza', phone: '+12 123 456 789', role: 'Driver', schedule: 'Mon to Fri', hours: '9:00 AM to 18:00 PM', status: 'Active', idDocType: 'Emirates ID', docNumber: '784-1988-7779876-1', vehicleNumber: 'DXB 54321' }
  ],
  pendingApprovals: [
    { id: 1, name: 'Marcus Johnson', type: 'Guest', flat: 'B-102', timeWaiting: '04:57', calledBy: 'Nitin Sharma' },
    { id: 2, name: 'Emirates Delivery Co.', type: 'Delivery', flat: 'B-102', timeWaiting: '02:15', calledBy: 'Gate Guard' },
    { id: 3, name: 'SafeServ Security', type: 'Service Vendor', flat: 'B-102', timeWaiting: '01:30', calledBy: 'Security' },
    { id: 4, name: 'Priyas Friend', type: 'Guest', flat: 'B-102', timeWaiting: '00:45', calledBy: 'Priya Sharma' }
  ],
  insideVisitors: [
    { id: 1, initials: 'JH', name: 'James Harrison', type: 'Guest', inTime: '08:30', duration: '1h 45m', host: 'Nitin Sharma' },
    { id: 2, initials: 'ES', name: 'Emirates Service', type: 'Service', inTime: '09:15', duration: '1h 20m', host: 'Facility Mgr' },
    { id: 3, initials: 'MD', name: 'Mohammad Driver', type: 'Staff', inTime: '07:00', duration: '3h 30m', host: 'Household' },
    { id: 4, initials: 'LC', name: 'Lana Cooper', type: 'Guest', inTime: '09:45', duration: '30m', host: 'Priya Sharma' }
  ],
  todayScheduleSecurity: [
    { time: '10:00', description: 'Package delivery', flat: 'B-102', type: 'Delivery' },
    { time: '11:30', description: 'AC technician visit', flat: 'B-102', type: 'Service' },
    { time: '13:00', description: 'Guest visit', flat: 'B-102', type: 'Guest' },
    { time: '15:30', description: 'Maid entry', flat: 'B-102', type: 'Staff' }
  ],
  entryLog: [
    { id: 1, refId: 'VIS-001', visitor: 'James Harrison', phone: '+971 50 111 1111', initials: 'JH', type: 'Guest', flat: 'B-102', host: 'Nitin Sharma', purpose: 'Social Visit', timeIn: '08:30', timeOut: '10:15', duration: '1h 45m', idDoc: 'PASSPORT', status: 'INSIDE', date: '2026-04-05', dateIn: '2026-04-05', dateOut: '' },
    { id: 2, refId: 'VIS-002', visitor: 'ProServ Cleaning', phone: '+971 4 222 3333', initials: 'PS', type: 'Vendor', flat: 'B-102', host: 'Facility Manager', purpose: 'Cleaning Service', timeIn: '09:15', timeOut: '', duration: '1h 20m', idDoc: 'ID CARD', status: 'INSIDE', date: '2026-04-05', dateIn: '2026-04-05', dateOut: '' },
    { id: 3, refId: 'VIS-003', visitor: 'Marcus Johnson', phone: '+971 50 333 3333', initials: 'MJ', type: 'Guest', flat: 'B-102', host: 'Nitin Sharma', purpose: 'Meeting', timeIn: '10:30', timeOut: '', duration: '0h 00m', idDoc: 'PASSPORT', status: 'PENDING', date: '2026-04-05', dateIn: '2026-04-05', dateOut: '' },
    { id: 4, refId: 'VIS-004', visitor: 'Lana Cooper', phone: '+971 55 444 4444', initials: 'LC', type: 'Guest', flat: 'B-102', host: 'Priya Sharma', purpose: 'Social', timeIn: '09:45', timeOut: '10:00', duration: '0h 15m', idDoc: 'EMIRATES ID', status: 'APPROVED', date: '2026-04-05', dateIn: '2026-04-05', dateOut: '2026-04-05' },
    { id: 5, refId: 'VIS-005', visitor: 'Ahmed Al-Mansoori', phone: '+971 55 555 5555', initials: 'AM', type: 'Guest', flat: 'B-102', host: 'Nitin Sharma', purpose: 'Business', timeIn: '07:00', timeOut: '08:45', duration: '1h 45m', idDoc: 'EMIRATES ID', status: 'APPROVED', date: '2026-04-05', dateIn: '2026-04-05', dateOut: '2026-04-05' },
    { id: 6, refId: 'VIS-006', visitor: 'Youssef Contractor', phone: '+971 50 666 6666', initials: 'YC', type: 'Contractor', flat: 'B-102', host: 'Facility Mgr', purpose: 'Maintenance', timeIn: '11:00', timeOut: '12:30', duration: '1h 30m', idDoc: 'ID CARD', status: 'APPROVED', date: '2026-04-05', dateIn: '2026-04-05', dateOut: '2026-04-05' }
  ],
  chatRooms: [
    { id: 'pm-guard-001', participants: [{ id: 'pm-1', name: 'Hassan Al-PM', role: 'Property Manager' }, { id: 'guard-001', name: 'Ahmed Khalil', role: 'Security Guard' }], lastMessage: 'Check visitor at main gate', lastMessageTime: '14:32', unreadCount: 0 },
    { id: 'pm-res-001', participants: [{ id: 'pm-1', name: 'Hassan Al-PM', role: 'Property Manager' }, { id: 'res-001', name: 'Mr. Khalid Al-Mansoori', role: 'Resident' }], lastMessage: 'Service request approved', lastMessageTime: '13:45', unreadCount: 0 },
    { id: 'guard-res-001', participants: [{ id: 'guard-001', name: 'Ahmed Khalil', role: 'Security Guard' }, { id: 'res-001', name: 'Mr. Khalid Al-Mansoori', role: 'Resident' }], lastMessage: 'Your guest has been cleared', lastMessageTime: '12:15', unreadCount: 0 }
  ],
  chatMessages: [
    { id: 1, roomId: 'pm-guard-001', senderId: 'pm-1', senderName: 'Hassan Al-PM', senderRole: 'Property Manager', text: 'Can you check the visitor at main gate?', timestamp: '14:30', read: true },
    { id: 2, roomId: 'pm-guard-001', senderId: 'guard-001', senderName: 'Ahmed Khalil', senderRole: 'Security Guard', text: 'On it, checking credentials now', timestamp: '14:31', read: true },
    { id: 3, roomId: 'pm-guard-001', senderId: 'guard-001', senderName: 'Ahmed Khalil', senderRole: 'Security Guard', text: 'Check visitor at main gate', timestamp: '14:32', read: true },
    { id: 4, roomId: 'pm-res-001', senderId: 'pm-1', senderName: 'Hassan Al-PM', senderRole: 'Property Manager', text: 'Hi Mr. Al-Mansoori, your service request has been approved', timestamp: '13:45', read: true },
    { id: 5, roomId: 'guard-res-001', senderId: 'guard-001', senderName: 'Ahmed Khalil', senderRole: 'Security Guard', text: 'Your guest has been cleared', timestamp: '12:15', read: true }
  ],
  documents: [
    { id: 'DOC-001', name: 'Ahmed Khalil — National ID', type: 'pdf', owner: 'GRD-001', ownerName: 'Ahmed Khalil', category: 'guard', size: '1.2 MB', uploadedAt: '01 Mar 2026', status: 'verified' },
    { id: 'DOC-002', name: 'Ahmed Khalil — Guard Licence', type: 'pdf', owner: 'GRD-001', ownerName: 'Ahmed Khalil', category: 'guard', size: '0.8 MB', uploadedAt: '01 Mar 2026', status: 'verified' },
    { id: 'DOC-003', name: 'Ahmed Khalil — Work Permit', type: 'pdf', owner: 'GRD-001', ownerName: 'Ahmed Khalil', category: 'guard', size: '0.6 MB', uploadedAt: '01 Mar 2026', status: 'verified' },
    { id: 'DOC-004', name: 'Mohammed Al-Said — National ID', type: 'pdf', owner: 'GRD-002', ownerName: 'Mohammed Al-Said', category: 'guard', size: '1.0 MB', uploadedAt: '02 Mar 2026', status: 'verified' },
    { id: 'DOC-005', name: 'Mohammed Al-Said — Work Permit', type: 'pdf', owner: 'GRD-002', ownerName: 'Mohammed Al-Said', category: 'guard', size: '0.5 MB', uploadedAt: '02 Mar 2026', status: 'verified' },
    { id: 'DOC-006', name: 'Mohammed Al-Said — Guard Licence', type: 'pdf', owner: 'GRD-002', ownerName: 'Mohammed Al-Said', category: 'guard', size: '0.7 MB', uploadedAt: '02 Mar 2026', status: 'verified' },
    { id: 'DOC-007', name: 'Ibrahim Hassan — National ID', type: 'pdf', owner: 'GRD-003', ownerName: 'Ibrahim Hassan', category: 'guard', size: '1.3 MB', uploadedAt: '03 Mar 2026', status: 'verified' },
    { id: 'DOC-008', name: 'Ibrahim Hassan — Guard Licence', type: 'pdf', owner: 'GRD-003', ownerName: 'Ibrahim Hassan', category: 'guard', size: '0.9 MB', uploadedAt: '03 Mar 2026', status: 'verified' },
    { id: 'DOC-009', name: 'Ibrahim Hassan — Work Permit', type: 'pdf', owner: 'GRD-003', ownerName: 'Ibrahim Hassan', category: 'guard', size: '0.4 MB', uploadedAt: '04 Mar 2026', status: 'verified' },
    { id: 'DOC-010', name: 'Youssef Al-Qasim — National ID', type: 'pdf', owner: 'GRD-004', ownerName: 'Youssef Al-Qasim', category: 'guard', size: '1.1 MB', uploadedAt: '05 Mar 2026', status: 'pending' },
    { id: 'DOC-011', name: 'Youssef Al-Qasim — Guard Licence', type: 'pdf', owner: 'GRD-004', ownerName: 'Youssef Al-Qasim', category: 'guard', size: '0.6 MB', uploadedAt: '05 Mar 2026', status: 'pending' },
    { id: 'DOC-012', name: 'Tariq Bin Saeed — National ID', type: 'pdf', owner: 'GRD-005', ownerName: 'Tariq Bin Saeed', category: 'guard', size: '1.0 MB', uploadedAt: '06 Mar 2026', status: 'verified' },
    { id: 'DOC-013', name: 'Tariq Bin Saeed — Guard Licence', type: 'pdf', owner: 'GRD-005', ownerName: 'Tariq Bin Saeed', category: 'guard', size: '0.8 MB', uploadedAt: '06 Mar 2026', status: 'verified' },
    { id: 'DOC-014', name: 'Tariq Bin Saeed — Work Permit', type: 'pdf', owner: 'GRD-005', ownerName: 'Tariq Bin Saeed', category: 'guard', size: '0.5 MB', uploadedAt: '07 Mar 2026', status: 'verified' }
  ]
};

