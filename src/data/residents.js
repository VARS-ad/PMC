// ==================== RESIDENTS DATABASE (100 residents) ====================
// Persisted to Supabase via initialData.residents. Unit → Resident lookup drives auto-populate of
// the Host/Resident field in the visitor entry forms.
const RESIDENTS_DATABASE = (() => {
  const firstNames = ['Ahmed','Fatima','Omar','Aisha','Khalid','Mariam','Yousef','Layla','Hassan','Noor',
                      'Ibrahim','Zahra','Mohammed','Hanan','Ali','Sara','Saif','Dalia','Rashid','Leena',
                      'Faisal','Huda','Tariq','Yasmin','Nasser'];
  const lastNames  = ['Al-Mansoori','Al-Nahyan','Al-Maktoum','Al-Qasimi','Al-Ahmadi','Al-Falasi','Al-Zaabi','Al-Suwaidi','Al-Mazrouei','Al-Blooshi',
                      'Al-Ketbi','Al-Kaabi','Al-Tunaiji','Al-Dhaheri','Al-Shamsi','Al-Nuaimi','Al-Hammadi','Al-Marri','Al-Amiri','Al-Romaithi',
                      'Al-Rashedi','Al-Hosani','Al-Jaberi','Al-Bastaki','Al-Awadhi'];
  const towers = ['Tower A','Tower B','Tower C','Tower D'];
  const list = [];
  for (let i = 0; i < 100; i++) {
    const fn = firstNames[i % firstNames.length];
    const ln = lastNames[Math.floor(i / firstNames.length) % lastNames.length];
    const unit = UNITS_DATABASE[i]; // residents occupy the first 100 units (100..1009)
    const tower = towers[i % towers.length];
    const phone = '+971 5' + (i % 9) + ' ' + String(100 + i).padStart(3,'0') + ' ' + String((1000 + i*137) % 10000).toString().padStart(4,'0');
    list.push({
      id: 'RES-' + String(i+1).padStart(3,'0'),
      firstName: fn,
      lastName: ln,
      fullName: fn + ' ' + ln,
      unit,
      tower,
      phone,
      email: fn.toLowerCase() + '.' + ln.toLowerCase().replace(/[^a-z]/g,'') + '@residents.vars.ae',
    });
  }
  return list;
})();

// Fast unit → resident lookup
const RESIDENT_BY_UNIT = RESIDENTS_DATABASE.reduce((acc, r) => { acc[r.unit] = r; return acc; }, {});

