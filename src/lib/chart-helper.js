// ==================== CHART HELPER (Chart.js wrapper) ====================
// Renders a Chart.js chart and tears it down when the config changes or the
// component unmounts. Hover tooltips + legend are interactive out of the box.

const ChartCanvas = ({ config, height }) => {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  useEffect(() => {
    if (!window.Chart || !canvasRef.current) return;
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
    try {
      chartRef.current = new window.Chart(canvasRef.current, config);
    } catch (e) { /* fail silently */ }
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, [JSON.stringify(config)]);
  return (
    <div style={{position:'relative',width:'100%',height: height || 280}}>
      <canvas ref={canvasRef}/>
    </div>
  );
};

function buildMonthlyBuckets(months = 12) {
  const today = new Date();
  const out = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    out.push({
      key: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'),
      label: d.toLocaleDateString('en', { month: 'short', year: '2-digit' }),
    });
  }
  return out;
}

