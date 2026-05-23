// ==================== SHARED COMPONENTS ====================
const Toggle = ({ value, onChange }) => (
  <div className={`toggle ${value ? 'on' : ''}`} onClick={() => onChange(!value)}>
    <div className="knob"/>
  </div>
);

const StatusBadge = ({ status }) => {
  const cls = status.toLowerCase().replace(/\s+/g,'-');
  return <span className={`status ${cls}`}>{status}</span>;
};

const Pagination = ({ total, pageSize, page, onPageChange }) => {
  const totalPages = Math.ceil(total / pageSize);
  return (
    <div className="pagination">
      <div style={{display:'flex',alignItems:'center',gap:8}}>
        <span>Rows per page:</span>
        <div className="page-sizes">
          {[10,25,50].map(s => <div key={s} className={`page-size ${pageSize===s?'active':''}`}>{s}</div>)}
        </div>
      </div>
      <span>{(page-1)*pageSize+1}–{Math.min(page*pageSize,total)} of {total}</span>
      <div className="page-nav">
        <button onClick={()=>onPageChange(Math.max(1,page-1))} disabled={page===1}>&lt;</button>
        <button onClick={()=>onPageChange(Math.min(totalPages,page+1))} disabled={page===totalPages}>&gt;</button>
      </div>
    </div>
  );
};

const MiniCalendar = ({ selectedDate, onDateSelect, eventDayMap }) => {
  const now = new Date();
  const todayDate = now.getDate();
  const todayMonth = now.getMonth();
  const todayYear = now.getFullYear();

  const sel = selectedDate ? new Date(selectedDate) : now;
  const [calMonth, setCalMonth] = useState(sel.getMonth());
  const [calYear, setCalYear] = useState(sel.getFullYear());

  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const monthName = new Date(calYear, calMonth).toLocaleString('en-US', { month: 'long' });
  const dayHeaders = ['S','M','T','W','T','F','S'];

  const selDay = sel.getDate();
  const selMonth = sel.getMonth();
  const selYear = sel.getFullYear();

  const handlePrev = () => { if (calMonth === 0) { setCalMonth(11); setCalYear(calYear - 1); } else setCalMonth(calMonth - 1); };
  const handleNext = () => { if (calMonth === 11) { setCalMonth(0); setCalYear(calYear + 1); } else setCalMonth(calMonth + 1); };

  // Build event type map for dots: { dayNumber: 'type' }
  const getEventType = (day) => {
    if (!eventDayMap) return null;
    return eventDayMap[calYear + '-' + String(calMonth+1).padStart(2,'0') + '-' + String(day).padStart(2,'0')] || null;
  };

  const typeColors = {
    'Move-In': '#928989', 'Move-Out': '#928989',
    'Installation': '#8a8a8a',
    'Handyman': '#c0c0c0', 'Electrical': '#c0c0c0', 'Plumbing': '#c0c0c0',
    'AC Repair': '#c0c0c0',
    'Pest Control': '#e8e3de',
  };

  return (
    <div className="mini-cal">
      <div className="cal-header">
        <h3>{monthName} {calYear}</h3>
        <div className="cal-nav"><button onClick={handlePrev}>&lt;</button><button onClick={handleNext}>&gt;</button></div>
      </div>
      <div className="cal-grid">
        {dayHeaders.map(d => <div key={d} className="cal-day-header">{d}</div>)}
        {Array.from({length:firstDay}).map((_,i) => <div key={`e${i}`} className="cal-day other-month"/>)}
        {Array.from({length:daysInMonth}).map((_,i) => {
          const day = i + 1;
          const isToday = day === todayDate && calMonth === todayMonth && calYear === todayYear;
          const isSelected = day === selDay && calMonth === selMonth && calYear === selYear;
          const evtType = getEventType(day);
          const dotColor = evtType ? (typeColors[evtType] || '#c0c0c0') : null;
          return (
            <div key={day}
              className={`cal-day ${isToday ? 'today' : ''} ${isSelected && !isToday ? 'selected' : ''}`}
              style={{cursor:'pointer', position:'relative'}}
              onClick={() => onDateSelect && onDateSelect(new Date(calYear, calMonth, day))}>
              {day}
              {dotColor && !isToday && !isSelected && <span style={{position:'absolute',bottom:2,left:'50%',transform:'translateX(-50%)',width:4,height:4,borderRadius:'50%',background:dotColor}}/>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

