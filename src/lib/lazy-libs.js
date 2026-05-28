// Lazy CDN loaders — saves ~480KB from the initial page load.
// Each helper returns a cached promise so the script only downloads once
// per session, no matter how many times the helper is called.

function _loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load ' + src));
    document.head.appendChild(s);
  });
}

// ----- html5-qrcode (~50KB) — used only by the security QR scanner -----
let _qrScannerLoaded = null;
function ensureQrScanner() {
  if (typeof Html5Qrcode !== 'undefined') return Promise.resolve();
  if (_qrScannerLoaded) return _qrScannerLoaded;
  _qrScannerLoaded = _loadScript('https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js')
    .catch(err => { _qrScannerLoaded = null; throw err; });
  return _qrScannerLoaded;
}

// ----- jsPDF + jspdf-autotable (~430KB) — used by every PDF export -----
let _pdfLoaded = null;
function ensurePdf() {
  const hasCtor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
  if (hasCtor && typeof window.jspdf?.autoTable === 'undefined') {
    // jsPDF is present but autoTable plugin isn't yet; chain the plugin
    if (_pdfLoaded) return _pdfLoaded;
  } else if (hasCtor) {
    return Promise.resolve();
  }
  if (_pdfLoaded) return _pdfLoaded;
  _pdfLoaded = _loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js')
    .then(() => _loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js'))
    .catch(err => { _pdfLoaded = null; throw err; });
  return _pdfLoaded;
}
