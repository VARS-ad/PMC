// ==================== DATE FORMATTING HELPERS ====================
const formatDate = (date) => {
  if (!date) return '';
  if (typeof date === 'string' && !date.includes('-') && !date.includes('/')) return date;
  const d = new Date(date);
  if (isNaN(d)) return date;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Dubai' });
};

const formatDateShort = (date) => {
  if (!date) return '';
  if (typeof date === 'string' && !date.includes('-') && !date.includes('/')) return date;
  const d = new Date(date);
  if (isNaN(d)) return date;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'Asia/Dubai' });
};

const formatDateTime = (date) => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d)) return date;
  const datePart = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Dubai' });
  const timePart = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Dubai' });
  return datePart + ', ' + timePart;
};

const formatTime24 = (date) => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d)) return date;
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Dubai' });
};

const formatTime12 = (date) => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d)) return date;
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Dubai' });
};

