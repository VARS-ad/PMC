// ==================== UNITS DATABASE ====================
// Floors 1-10, each with units ending 00-10 (e.g. 100-110, 200-210, ..., 1000-1010) — 110 units total
const UNITS_DATABASE = Array.from({length:10},(_,i)=>{
  const floor = (i+1)*100;
  return Array.from({length:11},(_,j)=>String(floor+j));
}).flat();

