// ==================== POST-LOGIN WELCOME SPLASH ====================
// Quiet "loading" surface shown for ~1.6s after sign-in before the
// dashboard takes over. No headline, no welcome copy — just a tiled
// repeat of the VARS door mark on a pale warm background, with each
// tile carrying a tiny per-position shift in tone, angle and offset so
// the wall reads as a soft texture rather than a flat grid. Buys the
// rest of the app a beat to fetch + render.
//
// Lifecycle is the same as before: show → fade → call onDone(). Tap
// to skip. userName / roleLabel props are accepted but no longer used —
// the splash is now intentionally anonymous.

const PostLoginWelcome = ({ onDone }) => {
  const [stage, setStage] = useState('show');
  useEffect(() => {
    const t1 = setTimeout(() => setStage('fading'), 1600);
    const t2 = setTimeout(() => { onDone && onDone(); }, 2300);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  const skip = () => {
    setStage('fading');
    setTimeout(() => onDone && onDone(), 500);
  };

  // ----- Tile geometry --------------------------------------------------
  // 8 columns × 14 rows = 112 tiles. Alternate rows are nudged half a
  // column right (staggered brick layout) so the eye reads it as texture
  // instead of a strict grid. Per-tile size + spacing tuned so a normal
  // viewport shows ~7 columns at minimum and the tiles never feel sparse.
  const COLS = 8;
  const ROWS = 14;
  const tiles = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      // Deterministic per-tile variance (no Math.random — keeps SSR-ish
      // re-renders stable and the build cache happy).
      const seed = r * 31 + c * 17;
      // Three subtle pale tones cycled by seed.
      const fills    = ['#e3dccf', '#d8d0c1', '#ccc4b5'];
      const fill     = fills[seed % fills.length];
      // Each tile rocks ±5° around vertical; small enough to read as
      // hand-placed rather than glitchy.
      const tilt     = ((seed % 11) - 5);
      // Vertical micro-offset 0–3px so the row doesn't sit on one line.
      const lift     = (seed % 4);
      // Slight scale variance so the wall has hierarchy.
      const scale    = 0.92 + ((seed % 7) / 100); // 0.92–0.98
      tiles.push({ r, c, fill, tilt, lift, scale });
    }
  }

  return (
    <div onClick={skip}
      style={{position:'fixed',inset:0,zIndex:10000,cursor:'pointer',
        // Very pale warm wash so the door tiles barely stand off the
        // surface — quiet, not assertive.
        background: '#F4EEE4',
        overflow:'hidden',
        opacity: stage === 'fading' ? 0 : 1,
        transition: 'opacity .6s ease',
        pointerEvents: stage === 'fading' ? 'none' : 'auto'}}>
      {/* Tile field — absolute positioning so the row stagger + per-tile
          rotation works without fighting CSS grid. The whole field sits
          inside an inset wrapper so tiles never clip the screen edge.   */}
      <div style={{position:'absolute',inset:'-4% -2%',display:'grid',
        gridTemplateColumns:`repeat(${COLS}, 1fr)`,
        gridTemplateRows:`repeat(${ROWS}, 1fr)`,
        gap:'8px 14px'}}>
        {tiles.map((t, idx) => (
          <div key={idx}
            style={{
              display:'flex',alignItems:'center',justifyContent:'center',
              transform: `translateX(${t.r % 2 ? '14px' : '0'}) translateY(${t.lift}px)`,
              // Stagger the fade-in by row+col so the wall fills in like
              // a wave instead of all at once. Total stagger maxes at
              // about 0.6s which keeps it under the 1.6s splash window.
              opacity: 0,
              animation: `vars-tile-in .55s cubic-bezier(.2,.7,.2,1) forwards`,
              animationDelay: `${(t.r * 0.035 + t.c * 0.025).toFixed(2)}s`,
            }}>
            <svg viewBox="0 0 100 100" width="48" height="48"
              style={{
                transform: `rotate(${t.tilt}deg) scale(${t.scale})`,
                filter: 'drop-shadow(0 1px 0 rgba(255,255,255,0.6)) drop-shadow(0 2px 4px rgba(91,72,52,0.06))',
              }}>
              <path d="M33.3 16.7 L50 16.7 L58.1 25.2 L66.7 33.3 L66.7 83.3 L50 83.3 L33.3 66.7 Z" fill={t.fill}/>
            </svg>
          </div>
        ))}
      </div>

      {/* Soft vignette so the centre of the screen is brightest — gives
          a focal point without any text actually being there. */}
      <div style={{position:'absolute',inset:0,pointerEvents:'none',
        background:'radial-gradient(45% 35% at 50% 50%, rgba(244,238,228,0.0) 0%, rgba(244,238,228,0.55) 100%)'}}/>

      {/* Three pale slate dots — only diegetic motion on screen. Confirms
          the app is doing something instead of frozen, without saying so. */}
      <div style={{position:'absolute',left:'50%',bottom:'10%',transform:'translateX(-50%)',display:'flex',gap:9}}>
        {[0,1,2].map(i => (
          <span key={i} style={{width:7,height:7,borderRadius:'50%',background:'#3E4C59',display:'inline-block',opacity:0.5,animation:`vars-tile-dot 1.2s ease-in-out ${i*0.15}s infinite`}}/>
        ))}
      </div>

      <style>{`
        @keyframes vars-tile-in  { 0% { opacity: 0; transform: translateY(8px); } 100% { opacity: 1; transform: translateY(0); } }
        @keyframes vars-tile-dot { 0%, 100% { opacity: 0.25; transform: scale(0.85); } 50% { opacity: 0.7; transform: scale(1); } }
      `}</style>
    </div>
  );
};
