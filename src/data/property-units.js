// ==================== PROPERTY UNITS DATABASE ====================
// Authoritative source of truth for Sky Tower — The Pinnacle Residences.
// 100 physical units across 4 towers × 5 floors × 5 units.
// Each unit carries occupancy status, owner/tenant, type, size, value, and lease window.
// Used by the PM Dashboard KPIs and the All Residents / Properties pages.
const PROPERTY_UNITS_DATABASE = (() => {
  const towers = ['A','B','C','D'];
  const typesBySeed = ['1BR','2BR','2BR','3BR','3BR','Penthouse','2BR','1BR','3BR','2BR'];
  const sizeByType = { '1BR': 78, '2BR': 118, '3BR': 168, 'Penthouse': 285 };
  const priceByType = { '1BR': 1_250_000, '2BR': 2_100_000, '3BR': 3_250_000, 'Penthouse': 6_800_000 };
  const rentByType  = { '1BR': 7_500,     '2BR': 11_500,    '3BR': 16_800,    'Penthouse': 34_000 };

  const firstNames = ['Ahmed','Fatima','Omar','Aisha','Khalid','Mariam','Yousef','Layla','Hassan','Noor',
                      'Ibrahim','Zahra','Mohammed','Hanan','Ali','Sara','Saif','Dalia','Rashid','Leena',
                      'Faisal','Huda','Tariq','Yasmin','Nasser','Amira','Abdullah','Maryam','Jamal','Reem'];
  const lastNames  = ['Al-Mansoori','Al-Nahyan','Al-Maktoum','Al-Qasimi','Al-Falasi','Al-Zaabi','Al-Suwaidi','Al-Mazrouei',
                      'Al-Ketbi','Al-Kaabi','Al-Tunaiji','Al-Dhaheri','Al-Shamsi','Al-Nuaimi','Al-Hammadi','Al-Amiri',
                      'Al-Hosani','Al-Jaberi','Al-Bastaki','Al-Awadhi','Al-Breiki','Al-Farsi','Al-Remeithi','Al-Ali'];

  // Status mix for 100 units — realistic occupancy ~85%
  //   Occupied: 85  ·  Vacant: 6  ·  For Rent: 5  ·  For Sale: 4
  const statusPlan = [];
  for (let i = 0; i < 85; i++) statusPlan.push('Occupied');
  for (let i = 0; i < 6;  i++) statusPlan.push('Vacant');
  for (let i = 0; i < 5;  i++) statusPlan.push('For Rent');
  for (let i = 0; i < 4;  i++) statusPlan.push('For Sale');
  // Deterministic shuffle (Fisher–Yates with seeded RNG)
  let seed = 19840411;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  for (let i = statusPlan.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [statusPlan[i], statusPlan[j]] = [statusPlan[j], statusPlan[i]];
  }

  const list = [];
  let idx = 0;
  for (let t = 0; t < towers.length; t++) {          // 4 towers
    for (let f = 1; f <= 5; f++) {                    // 5 floors per tower
      for (let u = 1; u <= 5; u++) {                  // 5 units per floor
        const tower = towers[t];
        const flat = tower + '-' + String(f).padStart(2,'0') + String(u).padStart(2,'0');
        const type = typesBySeed[(t*25 + (f-1)*5 + (u-1)) % typesBySeed.length];
        const size = sizeByType[type];
        const price = priceByType[type];
        const rent = rentByType[type];
        const status = statusPlan[idx];
        const isOccupied = status === 'Occupied';
        const fn = firstNames[(t*7 + f*3 + u) % firstNames.length];
        const ln = lastNames[(t*11 + f*5 + u*2) % lastNames.length];
        const ownerName = isOccupied ? (u % 3 === 0 ? 'Ms. ' : 'Mr. ') + fn + ' ' + ln : null;
        const ownerPhone = isOccupied ? '+971 5' + ((t+f+u) % 9) + ' ' + String(100 + idx).padStart(3,'0') + ' ' + String((1000 + idx*137) % 10000).toString().padStart(4,'0') : null;
        const occupants = isOccupied ? 1 + ((t + f + u) % 5) : 0;
        // Lease window for occupied (tenants) and For Rent (last tenant history)
        const leaseMonths = 12 + ((idx * 7) % 24);
        const leaseStartYear = 2023 + ((idx * 3) % 3);
        const leaseStartMonth = 1 + ((idx * 5) % 12);
        const leaseStart = leaseStartYear + '-' + String(leaseStartMonth).padStart(2,'0') + '-01';
        const leaseEnd = (leaseStartYear + Math.floor((leaseStartMonth + leaseMonths - 1) / 12)) + '-' + String(((leaseStartMonth + leaseMonths - 1) % 12) + 1).padStart(2,'0') + '-01';
        list.push({
          id: 'U-' + String(idx + 1).padStart(4,'0'),
          flat,
          tower,
          floor: f,
          unitNumber: u,
          type,
          sizeSqm: size,
          status,                       // Occupied · Vacant · For Rent · For Sale
          ownerName,
          ownerPhone,
          occupants,
          valueAed: price,
          monthlyRentAed: rent,
          leaseStart: isOccupied ? leaseStart : null,
          leaseEnd: isOccupied ? leaseEnd : null,
          verified: isOccupied ? (idx % 4 !== 0) : false,
          residentId: isOccupied ? 'RES-' + String(idx + 1).padStart(3,'0') : null,
        });
        idx++;
      }
    }
  }
  return list;
})();

// Aggregate totals derived from the authoritative units database
const PROPERTY_UNITS_STATS = {
  total:    PROPERTY_UNITS_DATABASE.length,
  occupied: PROPERTY_UNITS_DATABASE.filter(u => u.status === 'Occupied').length,
  vacant:   PROPERTY_UNITS_DATABASE.filter(u => u.status === 'Vacant').length,
  forRent:  PROPERTY_UNITS_DATABASE.filter(u => u.status === 'For Rent').length,
  forSale:  PROPERTY_UNITS_DATABASE.filter(u => u.status === 'For Sale').length,
};

