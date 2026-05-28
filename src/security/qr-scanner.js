// ==================== SECURITY APP COMPONENTS ====================
// ==================== QR SCANNER COMPONENT ====================
const QrScannerModal = ({ onClose, onScanned }) => {
  const scannerRef = React.useRef(null);
  const html5QrCodeRef = React.useRef(null);
  const [error, setError] = React.useState('');
  const [manualInput, setManualInput] = React.useState('');
  const [showManual, setShowManual] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;
    const startScanner = async () => {
      if (!scannerRef.current) return;
      // Lazy-load html5-qrcode on first use (saved ~50KB from initial page load)
      try { await ensureQrScanner(); } catch (_) {
        if (mounted) { setError('QR scanner library failed to load. Use manual entry.'); setShowManual(true); }
        return;
      }
      if (!mounted) return;
      try {
        const html5QrCode = new Html5Qrcode('sec-qr-reader');
        html5QrCodeRef.current = html5QrCode;
        await html5QrCode.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            if (!mounted) return;
            // Create scan log entry with timestamp
            const scanTimestamp = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true, timeZone: 'Asia/Dubai' });
            const scanEntry = { timestamp: scanTimestamp, data: decodedText, type: 'QR_SCAN' };
            // Allow multiple scans - do NOT stop the scanner, just log the scan
            onScanned(decodedText, scanEntry);
            // Continue scanning for more entries (removed html5QrCode.stop())
          },
          () => {}
        );
      } catch (err) {
        console.log('QR scanner error:', err);
        if (mounted) {
          setError('Camera not available — use manual entry below.');
          setShowManual(true);
        }
      }
    };
    // Small delay to ensure DOM is ready
    const timer = setTimeout(startScanner, 300);
    return () => {
      mounted = false;
      clearTimeout(timer);
      if (html5QrCodeRef.current) {
        try { html5QrCodeRef.current.stop().catch(() => {}); } catch(e) {}
      }
    };
  }, []);

  const handleManualSubmit = () => {
    if (manualInput.trim()) onScanned(manualInput.trim());
  };

  return (
    <div className="sec-scanner-overlay">
      <div className="sec-scanner-header">
        <div className="sec-scanner-title">{t('sec.scanVisitorQR')}</div>
        <button className="sec-scanner-close" onClick={onClose}>&times;</button>
      </div>

      {!showManual && (
        <React.Fragment>
          <div className="sec-scanner-camera">
            <div id="sec-qr-reader" ref={scannerRef} style={{width:'100%'}}></div>
          </div>
          <div className="sec-scanner-hint">{t('sec.qrPositionHint')}</div>
        </React.Fragment>
      )}

      {error && <div style={{color:'#ffc107',fontSize:13,marginBottom:16,textAlign:'center'}}>{error}</div>}

      {showManual && (
        <div style={{width:'100%',maxWidth:500}}>
          <div style={{color:'#c4b8b0',fontSize:13,marginBottom:4}}>{t('sec.enterPermitRef')}</div>
          <div style={{color:'#a89a92',fontSize:11,marginBottom:12}}>e.g. VIS-2026-0009 or paste the full QR code data</div>
          <textarea
            className="sec-scanned-input"
            rows={3}
            placeholder="Enter permit ref (e.g. VIS-2026-0009) or visitor name..."
            value={manualInput}
            onChange={e => setManualInput(e.target.value)}
          />
          <button
            onClick={handleManualSubmit}
            style={{marginTop:12,width:'100%',padding:14,background:'linear-gradient(135deg,#ae9751,#c9b06b)',color:'#1a1a1a',border:'none',borderRadius:8,fontSize:14,fontWeight:600,cursor:'pointer',letterSpacing:1}}
          >{t('sec.lookupVisitor')}</button>
        </div>
      )}

      {!showManual && (
        <button
          onClick={() => setShowManual(true)}
          style={{marginTop:12,background:'none',border:'1px solid #555',color:'#c4b8b0',padding:'10px 24px',borderRadius:8,fontSize:12,cursor:'pointer'}}
        >{t('sec.enterManually')}</button>
      )}
    </div>
  );
};

// ==================== SCANNED VISITOR FORM ====================
