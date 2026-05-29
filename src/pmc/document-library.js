// ==================== DOCUMENT LIBRARY ====================
// Single page that surfaces every attachment in the system grouped by
// Building → Unit → Type (Title deed / Photo / Layout / Other). PMC
// can also bulk-generate placeholder title-deed PDFs and unit photos
// from this page, with all files uploaded to the existing
// `unit-attachments` Supabase storage bucket and linked through the
// public.unit_attachments table.

const DocumentLibrary_BUCKET = 'unit-attachments';

// ---- Helpers shared by every PDF generator -------------------------------
function _pdfBase() {
  const jsPDFCtor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
  if (!jsPDFCtor) throw new Error('PDF library not loaded');
  const doc = new jsPDFCtor({ unit: 'pt', format: 'a4' });
  return { doc, W: doc.internal.pageSize.getWidth(), H: doc.internal.pageSize.getHeight() };
}
function _drawHeaderBand(doc, W, title, subtitle) {
  doc.setFillColor(244, 238, 228); doc.rect(0, 0, W, 110, 'F');
  doc.setFillColor(62, 76, 89);    doc.rect(0, 90, W, 4, 'F');
  doc.setTextColor(19, 31, 35);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(22);
  doc.text(title, 48, 56);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.setTextColor(97, 112, 125);
  doc.text(subtitle, 48, 76);
}
function _drawWatermark(doc, W, H) {
  doc.setTextColor(220, 220, 220);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(80);
  doc.text('DEMO', W / 2 - 90, H / 2 + 30, { angle: 25 });
}
function _drawFooter(doc, W, H, lines) {
  doc.setDrawColor(62, 76, 89);
  doc.line(48, H - 96, W - 48, H - 96);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.setTextColor(97, 112, 125);
  lines.forEach((line, i) => doc.text(line, 48, H - 76 + i * 14));
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.setTextColor(19, 31, 35);
  doc.text('Signature: __________________________', 48, H - 32);
}

// ---- Client-side title-deed PDF (per UNIT) -------------------------------
// One PDF per unit so each individual Q-101 / B-201 has its own deed showing
// the asset block + the unit's own owner record. A diagonal "DEMO" watermark
// makes it visually obvious this isn't a real legal document.
async function generateTitleDeedPdf({ building, unit }) {
  const { doc, W, H } = _pdfBase();
  _drawHeaderBand(doc, W, 'TITLE DEED', 'UAE Property Registry · Demo Issuance');

  // Right-side metadata (per unit)
  doc.setTextColor(19, 31, 35);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  doc.text('Deed No.', W - 200, 46);
  doc.text('Unit',     W - 200, 64);
  doc.text('Issued',   W - 200, 82);
  doc.setFont('helvetica', 'normal');
  const deedNo = 'TD-' + (building.name || '').replace(/[^A-Z0-9]/gi, '').slice(0, 8).toUpperCase()
               + '-' + (unit.unit_number || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  doc.text(deedNo, W - 150, 46);
  doc.text(String(unit.unit_number || '—'), W - 150, 64);
  doc.text(new Date().toISOString().slice(0, 10), W - 150, 82);

  // ----- Section helpers -----
  let y = 150;
  const sectionTitle = (label) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.setTextColor(97, 112, 125);
    doc.text(label.toUpperCase(), 48, y);
    doc.setDrawColor(230, 234, 233); doc.line(48, y + 6, W - 48, y + 6);
    y += 26;
    doc.setTextColor(19, 31, 35);
  };
  const row = (label, value) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.setTextColor(97, 112, 125);
    doc.text(label, 48, y);
    doc.setTextColor(19, 31, 35);
    doc.setFont('helvetica', 'bold');
    const wrapped = doc.splitTextToSize(String(value == null || value === '' ? '—' : value), W - 220);
    doc.text(wrapped, 220, y);
    y += 12 * wrapped.length + 6;
  };

  // ----- Section: Asset -----
  sectionTitle('Asset');
  row('Building / Plot', building.name);
  row('Type',            building.property_type);
  row('Address',         building.address);
  row('Plot area',       building.plot_area_sqft ? Number(building.plot_area_sqft).toLocaleString() + ' sqft' : null);
  row('GLA',             building.gross_leasable_area_sqft ? Number(building.gross_leasable_area_sqft).toLocaleString() + ' sqft' : null);

  // ----- Section: Unit -----
  y += 8;
  sectionTitle('Unit');
  row('Unit number',    unit.unit_number);
  row('Floor',          unit.floor != null ? unit.floor : null);

  // ----- Section: Registered Owner (from THIS unit's owner_*) -----
  if (unit.owner_name || unit.owner_phone || unit.owner_email) {
    y += 8;
    sectionTitle('Registered Owner');
    row('Name',          unit.owner_name);
    row('Phone',         unit.owner_phone);
    row('Email',         unit.owner_email);
    row('Passport',      unit.owner_passport_number);
    row('Emirates ID',   unit.owner_emirates_id);
    row('Purchase date', unit.purchase_date);
  }

  _drawFooter(doc, W, H, [
    'Issued for: VARS Property Manager · Demo Workspace',
    'This deed is generated for demonstration purposes and carries no legal weight.',
  ]);
  _drawWatermark(doc, W, H);
  return doc.output('blob');
}

// ---- Client-side floor-plan PDF ------------------------------------------
// One per UNIT. Draws a schematic top-down room layout that varies by
// property_type — residential = bedrooms+living+kitchen+bath, commercial =
// open floor + meeting + reception, villa = multi-zone, commercial-land =
// plot outline + buildable envelope. Pure jsPDF vector drawing; no canvas.
async function generateFloorPlanPdf({ building, unit }) {
  const { doc, W, H } = _pdfBase();
  _drawHeaderBand(doc, W, 'FLOOR PLAN', (building.name || '') + ' · Unit ' + (unit.unit_number || '—'));
  // Right-side metadata
  doc.setTextColor(19, 31, 35);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  doc.text('Sheet',  W - 200, 46);
  doc.text('Scale',  W - 200, 64);
  doc.text('Issued', W - 200, 82);
  doc.setFont('helvetica', 'normal');
  doc.text('FP-' + (unit.unit_number || '').toUpperCase(), W - 150, 46);
  doc.text('NTS · For Demo', W - 150, 64);
  doc.text(new Date().toISOString().slice(0, 10), W - 150, 82);

  // ----- Drawing area -----
  const planX = 56, planY = 150, planW = W - 112, planH = H - 230;
  const propType = (building.property_type || 'Residential');

  // Outer wall
  doc.setDrawColor(62, 76, 89); doc.setLineWidth(2.5);
  doc.rect(planX, planY, planW, planH);
  doc.setLineWidth(1);

  // Inner partitions + labels by type
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  doc.setTextColor(62, 76, 89);
  const room = (x, y, w, h, label, sublabel) => {
    doc.setDrawColor(150, 160, 168);
    doc.rect(x, y, w, h);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.setTextColor(19, 31, 35);
    doc.text(label, x + 12, y + 24);
    if (sublabel) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      doc.setTextColor(97, 112, 125);
      doc.text(sublabel, x + 12, y + 40);
    }
  };

  if (propType === 'Residential') {
    // 4-zone layout: living + kitchen on top, two bedrooms below with bath strip
    const midX = planX + planW * 0.6;
    const midY = planY + planH * 0.5;
    room(planX,  planY,  planW * 0.6, planH * 0.5, 'Living', '~22 m²');
    room(midX,   planY,  planW * 0.4, planH * 0.5, 'Kitchen', '~10 m²');
    room(planX,  midY,   planW * 0.45, planH * 0.5, 'Bedroom 1', '~14 m²');
    room(planX + planW * 0.45, midY, planW * 0.35, planH * 0.5, 'Bedroom 2', '~12 m²');
    room(planX + planW * 0.80, midY, planW * 0.20, planH * 0.5, 'Bath', '~5 m²');
  } else if (propType === 'Commercial') {
    // Open office + meeting room + pantry + reception
    room(planX, planY, planW * 0.55, planH * 0.7, 'Open Workspace', '~110 m²');
    room(planX + planW * 0.55, planY, planW * 0.45, planH * 0.35, 'Meeting Room', '~22 m²');
    room(planX + planW * 0.55, planY + planH * 0.35, planW * 0.45, planH * 0.35, 'Pantry & Print', '~14 m²');
    room(planX, planY + planH * 0.70, planW, planH * 0.30, 'Reception · Lobby', '~36 m²');
  } else if (propType === 'Villa') {
    // Ground floor (left) + Garden (right)
    room(planX, planY, planW * 0.55, planH * 0.5, 'Living + Dining', '~38 m²');
    room(planX, planY + planH * 0.5, planW * 0.35, planH * 0.5, 'Master Bedroom', '~24 m²');
    room(planX + planW * 0.35, planY + planH * 0.5, planW * 0.20, planH * 0.5, 'Bath', '~8 m²');
    room(planX + planW * 0.55, planY, planW * 0.45, planH, 'Garden + Pool', '~80 m²');
  } else {
    // Commercial Land — plot outline with sub-zones
    room(planX, planY, planW * 0.5, planH * 0.5, 'Yard A', 'Storage');
    room(planX + planW * 0.5, planY, planW * 0.5, planH * 0.5, 'Yard B', 'Logistics');
    room(planX, planY + planH * 0.5, planW * 0.4, planH * 0.5, 'Office', 'Single-storey');
    room(planX + planW * 0.4, planY + planH * 0.5, planW * 0.6, planH * 0.5, 'Open Lot', 'Buildable Area');
  }

  // N-arrow
  doc.setDrawColor(62, 76, 89);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
  doc.setTextColor(62, 76, 89);
  doc.text('N', W - 80, planY + 14);
  doc.line(W - 76, planY + 18, W - 76, planY + 50);
  doc.line(W - 76, planY + 18, W - 80, planY + 26);
  doc.line(W - 76, planY + 18, W - 72, planY + 26);

  _drawFooter(doc, W, H, [
    'Schematic floor plan, dimensions are nominal and not to scale.',
    'Generated by VARS Property Manager · Demo Workspace.',
  ]);
  _drawWatermark(doc, W, H);
  return doc.output('blob');
}

// ---- Client-side tenancy / service agreement PDF -------------------------
// One per UNIT, dropped under kind='other'. Uses the unit's tenant
// (residential = resident_assignments; non-residential = units.tenant_*).
async function generateAgreementPdf({ building, unit, tenant }) {
  const { doc, W, H } = _pdfBase();
  const isCommercial = building.property_type === 'Commercial' || building.property_type === 'Commercial Land';
  const title = isCommercial ? 'LEASE AGREEMENT' : 'TENANCY CONTRACT';
  _drawHeaderBand(doc, W, title, (building.name || '') + ' · Unit ' + (unit.unit_number || '—'));

  // Right-side metadata
  doc.setTextColor(19, 31, 35);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  doc.text('Contract',  W - 200, 46);
  doc.text('Effective', W - 200, 64);
  doc.text('Expires',   W - 200, 82);
  doc.setFont('helvetica', 'normal');
  doc.text(String((tenant && tenant.contract_number) || 'CN-' + (unit.unit_number || '').toUpperCase()), W - 150, 46);
  doc.text(String((tenant && tenant.lease_start) || '—'), W - 150, 64);
  doc.text(String((tenant && tenant.lease_end) || '—'), W - 150, 82);

  let y = 150;
  const sectionTitle = (label) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.setTextColor(97, 112, 125);
    doc.text(label.toUpperCase(), 48, y);
    doc.setDrawColor(230, 234, 233); doc.line(48, y + 6, W - 48, y + 6);
    y += 24;
  };
  const row = (label, value) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.setTextColor(97, 112, 125);
    doc.text(label, 48, y);
    doc.setTextColor(19, 31, 35);
    doc.setFont('helvetica', 'bold');
    const wrapped = doc.splitTextToSize(String(value == null || value === '' ? '—' : value), W - 220);
    doc.text(wrapped, 220, y);
    y += 12 * wrapped.length + 6;
  };
  const para = (text) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.setTextColor(19, 31, 35);
    const wrapped = doc.splitTextToSize(text, W - 96);
    doc.text(wrapped, 48, y);
    y += 12 * wrapped.length + 4;
  };

  sectionTitle('Premises');
  row('Building / Plot', building.name);
  row('Unit',            unit.unit_number + (unit.floor != null ? ' · Floor ' + unit.floor : ''));
  row('Address',         building.address);

  y += 6;
  sectionTitle('Landlord');
  row('Name',  unit.owner_name);
  row('Phone', unit.owner_phone);
  row('Email', unit.owner_email);

  y += 6;
  sectionTitle(isCommercial ? 'Tenant' : 'Resident');
  row('Name',          (tenant && tenant.name) || '—');
  row('Email',         (tenant && tenant.email) || '—');
  row('Phone',         (tenant && tenant.phone) || '—');
  row('Tenure',        (tenant && tenant.tenure) || '—');

  y += 6;
  sectionTitle('Financial Terms');
  const monthly = tenant && tenant.monthly_payment_aed;
  row('Monthly payment', monthly ? 'AED ' + Number(monthly).toLocaleString() : '—');
  row('Annual rent',     monthly ? 'AED ' + (Number(monthly) * 12).toLocaleString() : '—');
  if (tenant && tenant.cheques_per_year) row('Cheques per year', tenant.cheques_per_year);

  y += 10;
  sectionTitle('Clauses');
  para('1. The Landlord agrees to let, and the Tenant agrees to take, the above-described premises for the term specified, subject to the terms and conditions of this agreement.');
  para('2. The monthly payment shall be settled in advance via the cheque schedule above. Late payments incur a 1% per-month service charge calculated on the outstanding balance.');
  para('3. The Tenant shall keep the premises in good order, allow scheduled maintenance access on 48-hour notice, and shall not sublet without the Landlord’s written consent.');
  para('4. Either party may terminate this contract before the renewal anchor with 60 days’ written notice, subject to any early-termination fees set out in the schedule.');

  _drawFooter(doc, W, H, [
    'Demo template — actual tenancy contracts must be Ejari/Tawtheeq registered.',
    'Generated by VARS Property Manager · Demo Workspace.',
  ]);
  _drawWatermark(doc, W, H);
  return doc.output('blob');
}

// ---- Client-side placeholder unit photo ----------------------------------
// Draws a 1200x800 canvas with a soft warm-grey background, an asset
// title, and a unit-number label centred. Exports as JPEG so file sizes
// stay manageable across hundreds of units.
async function generateUnitPhotoBlob({ building, unit }) {
  return new Promise((resolve) => {
    const W = 1200, H = 800;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    // Soft gradient background
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#f4eee4');
    grad.addColorStop(1, '#dbc5ae');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
    // Decorative diagonal stripes
    ctx.fillStyle = 'rgba(62,76,89,0.06)';
    for (let i = -H; i < W; i += 80) {
      ctx.fillRect(i, 0, 40, H);
    }
    // Slate badge
    ctx.fillStyle = '#3E4C59';
    ctx.fillRect(80, 80, 200, 60);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px Helvetica, Arial, sans-serif';
    ctx.fillText('VARS · DEMO', 100, 118);
    // Main title (building)
    ctx.fillStyle = '#131F23';
    ctx.font = 'bold 64px Helvetica, Arial, sans-serif';
    ctx.fillText(building.name || 'Asset', 80, H / 2 - 40);
    // Unit chip
    ctx.fillStyle = '#fff';
    ctx.fillRect(80, H / 2 + 10, 360, 80);
    ctx.strokeStyle = '#3E4C59'; ctx.lineWidth = 2;
    ctx.strokeRect(80, H / 2 + 10, 360, 80);
    ctx.fillStyle = '#131F23';
    ctx.font = 'bold 44px Helvetica, Arial, sans-serif';
    ctx.fillText('Unit ' + (unit.unit_number || '—'), 100, H / 2 + 64);
    // Floor caption
    ctx.fillStyle = '#61707D';
    ctx.font = '24px Helvetica, Arial, sans-serif';
    ctx.fillText('Floor ' + (unit.floor != null ? unit.floor : '—'), 80, H / 2 + 130);
    // Property-type tag bottom-right
    ctx.fillStyle = 'rgba(62,76,89,0.85)';
    ctx.fillRect(W - 340, H - 100, 260, 60);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px Helvetica, Arial, sans-serif';
    ctx.fillText((building.property_type || 'Asset').toUpperCase(), W - 320, H - 60);
    canvas.toBlob(b => resolve(b), 'image/jpeg', 0.85);
  });
}

// ---- Client-side invoice PDF ---------------------------------------------
// One PDF per public.invoices row, uploaded into the existing
// invoice-attachments bucket with kind='invoice'. Mirrors a UAE-style
// rent invoice: header band, billed-to + premises block, single-line
// rental item, totals box, payment notes (cheque schedule when present),
// DEMO watermark.
async function generateInvoicePdf({ building, unit, invoice, tenant }) {
  const { doc, W, H } = _pdfBase();
  _drawHeaderBand(doc, W, 'TAX INVOICE', (building.name || '') + ' · Unit ' + (unit.unit_number || '—'));

  doc.setTextColor(19, 31, 35);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  doc.text('Invoice', W - 200, 46);
  doc.text('Due',     W - 200, 64);
  doc.text('Status',  W - 200, 82);
  doc.setFont('helvetica', 'normal');
  doc.text(String(invoice.invoice_number || invoice.id.slice(0, 8)), W - 150, 46);
  doc.text(String(invoice.due_date || '—'), W - 150, 64);
  doc.text(String(invoice.status || '—'), W - 150, 82);

  let y = 150;
  const sectionTitle = (label) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.setTextColor(97, 112, 125);
    doc.text(label.toUpperCase(), 48, y);
    doc.setDrawColor(230, 234, 233); doc.line(48, y + 6, W - 48, y + 6);
    y += 24;
  };
  const row = (label, value) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.setTextColor(97, 112, 125);
    doc.text(label, 48, y);
    doc.setTextColor(19, 31, 35);
    doc.setFont('helvetica', 'bold');
    const wrapped = doc.splitTextToSize(String(value == null || value === '' ? '—' : value), W - 220);
    doc.text(wrapped, 220, y);
    y += 12 * wrapped.length + 6;
  };

  sectionTitle('Billed to');
  row('Name',          (tenant && tenant.name) || '—');
  row('Email',         (tenant && tenant.email) || '—');
  row('Phone',         (tenant && tenant.phone) || '—');

  y += 6;
  sectionTitle('Premises');
  row('Building / Plot', building.name);
  row('Unit',            unit.unit_number + (unit.floor != null ? ' · Floor ' + unit.floor : ''));
  row('Address',         building.address);

  y += 12;
  // Line items table
  doc.setFillColor(244, 238, 228); doc.rect(48, y - 14, W - 96, 22, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
  doc.setTextColor(97, 112, 125);
  doc.text('DESCRIPTION', 56, y);
  doc.text('PERIOD',      W - 280, y);
  doc.text('AMOUNT (AED)', W - 120, y, { align: 'left' });
  y += 24;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
  doc.setTextColor(19, 31, 35);
  doc.text(invoice.description || ('Monthly rent · ' + building.name), 56, y);
  const due = invoice.due_date ? new Date(invoice.due_date) : null;
  const periodLabel = due ? due.toLocaleString('en-GB', { month: 'long', year: 'numeric' }) : '—';
  doc.text(periodLabel, W - 280, y);
  const amt = Number(invoice.amount_aed || 0);
  doc.setFont('helvetica', 'bold');
  doc.text(amt.toLocaleString(), W - 120, y, { align: 'left' });
  y += 14;
  doc.setDrawColor(220, 220, 220); doc.line(48, y, W - 48, y);

  // Total row
  y += 22;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
  doc.setTextColor(19, 31, 35);
  doc.text('Total Due', W - 280, y);
  doc.text('AED ' + amt.toLocaleString(), W - 120, y, { align: 'left' });

  // Payment notes
  y += 28;
  sectionTitle('Payment notes');
  if (tenant && tenant.cheques_per_year) {
    row('Cheque schedule', tenant.cheques_per_year + ' cheque' + (tenant.cheques_per_year === 1 ? '' : 's') + ' per year');
  }
  row('Method', 'Post-dated cheque or bank transfer');
  if (invoice.status === 'Paid') {
    row('Settled on', invoice.created_at ? invoice.created_at.slice(0, 10) : '—');
  } else if (invoice.status === 'Overdue') {
    row('Action', 'OVERDUE — please settle within 7 days to avoid late charges.');
  } else {
    row('Action', 'Please settle before the due date above.');
  }

  _drawFooter(doc, W, H, [
    'Generated by VARS Property Manager · Demo Workspace.',
    'Demo invoice — for testing purposes only. Real invoices are issued via the operator portal.',
  ]);
  _drawWatermark(doc, W, H);
  return doc.output('blob');
}

const DocumentLibraryPage = ({ embedded } = {}) => {
  const { selectedProperties } = useApp();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [buildings, setBuildings] = useState([]);
  const [units, setUnits] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [expanded, setExpanded] = useState({});      // { [buildingId]: bool }
  const [search, setSearch] = useState('');
  const [filterKind, setFilterKind] = useState('all');
  const [genStatus, setGenStatus] = useState(null);  // { phase, current, total }
  const [signedUrls, setSignedUrls] = useState({}); // attachmentId -> url

  const reload = async () => {
    setLoading(true); setError(null);
    if (!supabaseClient) { setError('Supabase not initialised'); setLoading(false); return; }
    try {
      const [{ data: bs }, { data: us }, { data: atts }] = await Promise.all([
        supabaseClient.from('buildings').select('id,name,address,property_type,plot_area_sqft,gross_leasable_area_sqft,villa_count').order('name'),
        supabaseClient.from('units').select('id,building_id,unit_number,floor,owner_name,owner_phone,owner_email,owner_passport_number,owner_emirates_id,purchase_date').order('unit_number'),
        supabaseClient.from('unit_attachments').select('id,unit_id,kind,filename,storage_path,created_at').order('created_at', { ascending: false }),
      ]);
      setBuildings(bs || []);
      setUnits(us || []);
      setAttachments(atts || []);
    } catch (e) {
      setError(String(e.message || e));
    }
    setLoading(false);
  };
  useEffect(() => { reload(); }, []);

  // --- Open a file: lazy signed-URL ------------------------------------
  const openAttachment = async (att) => {
    let url = signedUrls[att.id];
    if (!url) {
      const { data, error: e } = await supabaseClient.storage.from(DocumentLibrary_BUCKET).createSignedUrl(att.storage_path, 600);
      if (e) { alert('Could not open: ' + e.message); return; }
      url = data.signedUrl;
      setSignedUrls(prev => ({ ...prev, [att.id]: url }));
    }
    window.open(url, '_blank', 'noopener');
  };

  // --- Bulk generators --------------------------------------------------
  // Every generator iterates per UNIT, skips units that already have an
  // attachment of that kind, batches to MAX_BATCH per click so a single
  // run doesn't tie up the browser for too long, and reloads at the end.
  const MAX_BATCH = 80;

  // For Residential we hydrate a tenant block from resident_assignments
  // + profiles so the tenancy contract has real names; for non-residential
  // we read from units.tenant_*. Loaded lazily on first use.
  const [residentByUnit, setResidentByUnit] = useState(null);
  const loadResidentMap = async () => {
    if (residentByUnit) return residentByUnit;
    const unitIds = units.map(u => u.id);
    if (unitIds.length === 0) { setResidentByUnit({}); return {}; }
    const { data: assigns } = await supabaseClient
      .from('resident_assignments')
      .select('profile_id, unit_id, tenure, lease_start, lease_end, monthly_payment_aed, cheques_per_year, contract_number')
      .in('unit_id', unitIds);
    const profIds = Array.from(new Set((assigns || []).map(a => a.profile_id).filter(Boolean)));
    let profileById = {};
    if (profIds.length > 0) {
      const { data: profs } = await supabaseClient.from('profiles').select('id, full_name, phone').in('id', profIds);
      (profs || []).forEach(p => { profileById[p.id] = p; });
    }
    const map = {};
    for (const a of (assigns || [])) {
      const p = profileById[a.profile_id] || {};
      map[a.unit_id] = {
        name: p.full_name || '', phone: p.phone || '', email: '',
        tenure: a.tenure || '', lease_start: a.lease_start || '', lease_end: a.lease_end || '',
        monthly_payment_aed: a.monthly_payment_aed,
        cheques_per_year: a.cheques_per_year, contract_number: a.contract_number || '',
      };
    }
    setResidentByUnit(map);
    return map;
  };

  // Shared per-unit worker. `kind` is the unit_attachments.kind value,
  // `mime` is the upload content-type, `makeBlob({building,unit,tenant})`
  // returns a Blob, `filenameFor(unit)` returns the user-facing filename.
  const _runPerUnit = async ({ label, kind, mime, makeBlob, filenameFor, needsTenant }) => {
    const tenantMap = needsTenant ? await loadResidentMap() : null;
    const todo = units.filter(u => !attachments.some(a => a.kind === kind && a.unit_id === u.id));
    const batch = todo.slice(0, MAX_BATCH);
    if (batch.length === 0) {
      setGenStatus({ phase: 'Every unit already has a ' + label + '.', current: 0, total: 0 });
      setTimeout(() => setGenStatus(null), 2000);
      return;
    }
    setGenStatus({ phase: 'Generating ' + label + 's…', current: 0, total: batch.length });
    let done = 0, errors = 0;
    for (const u of batch) {
      const b = buildings.find(bb => bb.id === u.building_id);
      if (!b) { done++; continue; }
      try {
        setGenStatus({ phase: 'Rendering ' + label + ' · ' + b.name + ' · ' + (u.unit_number || ''), current: done, total: batch.length });
        let tenant = null;
        if (needsTenant) {
          tenant = tenantMap[u.id] || (u.tenant_name ? {
            name: u.tenant_name, email: u.tenant_email || '', phone: u.tenant_phone || '',
            tenure: u.tenant_tenure || '', lease_start: u.tenant_lease_start, lease_end: u.tenant_lease_end,
            monthly_payment_aed: u.tenant_monthly_payment_aed, contract_number: u.tenant_contract_number,
          } : null);
        }
        const blob = await makeBlob({ building: b, unit: u, tenant });
        const filename = filenameFor(u, b);
        const path = u.id + '/' + kind + '-' + Date.now() + '-' + filename;
        const { error: upErr } = await supabaseClient.storage.from(DocumentLibrary_BUCKET).upload(path, blob, { contentType: mime, upsert: false });
        if (upErr) throw upErr;
        const { error: insErr } = await supabaseClient.from('unit_attachments').insert({
          unit_id: u.id, kind, filename, storage_path: path,
        });
        if (insErr) throw insErr;
        done++;
      } catch (e) {
        errors++; done++;
        console.error(label + ' for ' + u.unit_number + ' failed:', e);
      }
      setGenStatus({ phase: 'Uploaded ' + done + ' / ' + batch.length, current: done, total: batch.length });
    }
    const remaining = todo.length - batch.length;
    setGenStatus({
      phase: 'Done · ' + (done - errors) + ' uploaded, ' + errors + ' failed' + (remaining > 0 ? ' · ' + remaining + ' more pending (click again)' : ''),
      current: done, total: batch.length,
    });
    setTimeout(() => setGenStatus(null), 3500);
    await reload();
  };

  const safeUnitFilename = (u, b, suffix) =>
    (b.name || 'asset').replace(/[^A-Za-z0-9._-]/g, '_') + '-' + (u.unit_number || u.id).toString().replace(/[^A-Za-z0-9._-]/g, '_') + '-' + suffix;

  const bulkGenerateUnitPhotos = () => _runPerUnit({
    label: 'photo', kind: 'photo', mime: 'image/jpeg', needsTenant: false,
    makeBlob: ({ building, unit }) => generateUnitPhotoBlob({ building, unit }),
    filenameFor: (u, b) => safeUnitFilename(u, b, 'photo.jpg'),
  });
  const bulkGenerateTitleDeeds = () => _runPerUnit({
    label: 'title deed', kind: 'title_deed', mime: 'application/pdf', needsTenant: false,
    makeBlob: ({ building, unit }) => generateTitleDeedPdf({ building, unit }),
    filenameFor: (u, b) => safeUnitFilename(u, b, 'title-deed.pdf'),
  });
  const bulkGenerateFloorPlans = () => _runPerUnit({
    label: 'floor plan', kind: 'layout', mime: 'application/pdf', needsTenant: false,
    makeBlob: ({ building, unit }) => generateFloorPlanPdf({ building, unit }),
    filenameFor: (u, b) => safeUnitFilename(u, b, 'floor-plan.pdf'),
  });
  const bulkGenerateAgreements = () => _runPerUnit({
    label: 'tenancy contract', kind: 'other', mime: 'application/pdf', needsTenant: true,
    makeBlob: ({ building, unit, tenant }) => generateAgreementPdf({ building, unit, tenant }),
    filenameFor: (u, b) => safeUnitFilename(u, b, 'tenancy-contract.pdf'),
  });

  // ---- Invoice PDFs ----------------------------------------------------
  // One PDF per public.invoices row, uploaded to the invoice-attachments
  // bucket and linked via public.invoice_attachments(kind='invoice') so
  // the existing Invoice slot UI surfaces it. Skips invoices that already
  // have an attachment of that kind. Batches to MAX_BATCH per click.
  const bulkGenerateInvoicePdfs = async () => {
    setGenStatus({ phase: 'Loading invoices…', current: 0, total: 0 });
    const tenantMap = await loadResidentMap();
    const { data: invs } = await supabaseClient
      .from('invoices')
      .select('id, unit_id, invoice_number, description, amount_aed, due_date, status, created_at')
      .order('due_date', { ascending: true });
    const { data: existingAtt } = await supabaseClient
      .from('invoice_attachments')
      .select('invoice_id, kind');
    const haveInvoice = new Set((existingAtt || []).filter(a => a.kind === 'invoice').map(a => a.invoice_id));
    const todo = (invs || []).filter(i => !haveInvoice.has(i.id));
    const batch = todo.slice(0, MAX_BATCH);
    if (batch.length === 0) {
      setGenStatus({ phase: 'Every invoice already has a PDF.', current: 0, total: 0 });
      setTimeout(() => setGenStatus(null), 2000);
      return;
    }
    setGenStatus({ phase: 'Generating invoice PDFs…', current: 0, total: batch.length });
    let done = 0, errors = 0;
    for (const inv of batch) {
      const u = units.find(x => x.id === inv.unit_id);
      const b = u ? buildings.find(x => x.id === u.building_id) : null;
      if (!u || !b) { done++; continue; }
      try {
        const tenant = tenantMap[u.id] || (u.tenant_name ? {
          name: u.tenant_name, email: u.tenant_email || '', phone: u.tenant_phone || '',
          monthly_payment_aed: u.tenant_monthly_payment_aed,
        } : null);
        setGenStatus({ phase: 'Rendering ' + (inv.invoice_number || inv.id.slice(0, 8)), current: done, total: batch.length });
        const blob = await generateInvoicePdf({ building: b, unit: u, invoice: inv, tenant });
        const filename = (inv.invoice_number || ('invoice-' + inv.id.slice(0, 8))).replace(/[^A-Za-z0-9._-]/g, '_') + '.pdf';
        const path = inv.id + '/invoice/' + filename;
        const { error: upErr } = await supabaseClient.storage.from('invoice-attachments').upload(path, blob, { contentType: 'application/pdf', upsert: false });
        if (upErr) throw upErr;
        const { error: insErr } = await supabaseClient.from('invoice_attachments').insert({
          invoice_id: inv.id, kind: 'invoice', file_name: filename, storage_path: path, mime_type: 'application/pdf',
        });
        if (insErr) throw insErr;
        done++;
      } catch (e) {
        errors++; done++;
        console.error('Invoice PDF for ' + inv.invoice_number + ' failed:', e);
      }
      setGenStatus({ phase: 'Uploaded ' + done + ' / ' + batch.length, current: done, total: batch.length });
    }
    const remaining = todo.length - batch.length;
    setGenStatus({
      phase: 'Done · ' + (done - errors) + ' uploaded, ' + errors + ' failed' + (remaining > 0 ? ' · ' + remaining + ' more pending (click again)' : ''),
      current: done, total: batch.length,
    });
    setTimeout(() => setGenStatus(null), 3500);
  };

  // One-click sweep: runs photo → title deed → floor plan → tenancy contract
  // → invoice PDFs for every unit/invoice missing them. Each pass is
  // rate-limited by MAX_BATCH, so a large portfolio may need a re-click —
  // the UI status says how many more remain.
  const bulkGenerateAllMissing = async () => {
    await bulkGenerateUnitPhotos();
    await bulkGenerateTitleDeeds();
    await bulkGenerateFloorPlans();
    await bulkGenerateAgreements();
    await bulkGenerateInvoicePdfs();
  };

  if (loading) {
    return (<div className="page-padding"><h1>Documents</h1><div className="card"><div style={{padding:32,color:'var(--text-muted)',fontSize:13,textAlign:'center'}}>Loading library…</div></div></div>);
  }
  if (error) {
    return (<div className="page-padding"><h1>Documents</h1><div className="card"><div style={{padding:24,color:'#8b4a42',fontSize:13}}>Error: {error}</div></div></div>);
  }

  // ---- Group + filter -------------------------------------------------
  const buildingFilterIds = new Set(selectedProperties || []);
  const visibleBuildings = buildings.filter(b => buildingFilterIds.size === 0 || buildingFilterIds.has(b.id));
  const unitsByBuilding = {};
  for (const u of units) (unitsByBuilding[u.building_id] = unitsByBuilding[u.building_id] || []).push(u);
  const attsByUnit = {};
  for (const a of attachments) (attsByUnit[a.unit_id] = attsByUnit[a.unit_id] || []).push(a);

  const lowerSearch = search.trim().toLowerCase();
  const kindLabel = { photo: 'Photo', title_deed: 'Title deed', layout: 'Layout', other: 'Other' };
  const kindColor = { photo: '#5a6b4f', title_deed: '#3E4C59', layout: '#a07d3c', other: '#61707D' };

  // ---- Stats ---------------------------------------------------------
  const visibleAtts = attachments.filter(a => {
    const u = units.find(x => x.id === a.unit_id);
    if (!u) return false;
    if (buildingFilterIds.size && !buildingFilterIds.has(u.building_id)) return false;
    if (filterKind !== 'all' && a.kind !== filterKind) return false;
    if (lowerSearch) {
      const b = buildings.find(x => x.id === u.building_id);
      const hay = (a.filename + ' ' + (u.unit_number || '') + ' ' + (b ? b.name : '')).toLowerCase();
      if (!hay.includes(lowerSearch)) return false;
    }
    return true;
  });
  const stats = {
    total: visibleAtts.length,
    photo: visibleAtts.filter(a => a.kind === 'photo').length,
    title_deed: visibleAtts.filter(a => a.kind === 'title_deed').length,
    layout: visibleAtts.filter(a => a.kind === 'layout').length,
    other: visibleAtts.filter(a => a.kind === 'other').length,
  };

  const fmtDate = (s) => { try { return new Date(s).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }); } catch (_) { return s; } };
  const kpiBox = { background:'#fff', border:'1px solid var(--border-light)', borderRadius:8, padding:'14px 16px', display:'flex', flexDirection:'column', gap:4 };

  return (
    <div className="page-padding">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',marginBottom:8,flexWrap:'wrap',gap:14}}>
        <div>
          <h1 style={{margin:0}}>Documents</h1>
          <div style={{fontSize:13,color:'var(--text-muted)',marginTop:4}}>Every attachment in the system, grouped by asset. Generate title deeds and unit photos in bulk.</div>
        </div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <button className="btn" onClick={bulkGenerateUnitPhotos}    disabled={!!genStatus}>Photos</button>
          <button className="btn" onClick={bulkGenerateTitleDeeds}   disabled={!!genStatus}>Title deeds</button>
          <button className="btn" onClick={bulkGenerateFloorPlans}   disabled={!!genStatus}>Floor plans</button>
          <button className="btn" onClick={bulkGenerateAgreements}   disabled={!!genStatus}>Tenancy contracts</button>
          <button className="btn" onClick={bulkGenerateInvoicePdfs}  disabled={!!genStatus}>Invoice PDFs</button>
          <button className="btn btn-primary" onClick={bulkGenerateAllMissing} disabled={!!genStatus}>Generate everything missing</button>
        </div>
      </div>

      {genStatus && (
        <div style={{margin:'8px 0 18px',padding:'10px 14px',background:'var(--bg-surface)',border:'1px solid var(--border-light)',borderRadius:8}}>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:12,color:'var(--text-secondary)',marginBottom:6}}>
            <span style={{whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{genStatus.phase}</span>
            {genStatus.total > 0 && <span style={{fontWeight:600,color:'var(--text-dark)'}}>{genStatus.current} / {genStatus.total}</span>}
          </div>
          <div style={{width:'100%',height:6,background:'#e6eae9',borderRadius:3,overflow:'hidden'}}>
            <div style={{width: (genStatus.total > 0 ? Math.round((genStatus.current / genStatus.total) * 100) : 100) + '%', height:'100%', background:'#3E4C59', transition:'width 0.2s ease'}}/>
          </div>
        </div>
      )}

      {/* KPI strip */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(5, minmax(0, 1fr))',gap:12,marginBottom:18}}>
        <div style={kpiBox}>
          <div style={{fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600}}>Total Documents</div>
          <div style={{fontSize:22,fontWeight:600}}>{stats.total}</div>
        </div>
        <div style={kpiBox}>
          <div style={{fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600}}>Photos</div>
          <div style={{fontSize:22,fontWeight:600,color:'#5a6b4f'}}>{stats.photo}</div>
        </div>
        <div style={kpiBox}>
          <div style={{fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600}}>Title Deeds</div>
          <div style={{fontSize:22,fontWeight:600,color:'#3E4C59'}}>{stats.title_deed}</div>
        </div>
        <div style={kpiBox}>
          <div style={{fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600}}>Layouts</div>
          <div style={{fontSize:22,fontWeight:600,color:'#a07d3c'}}>{stats.layout}</div>
        </div>
        <div style={kpiBox}>
          <div style={{fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600}}>Other</div>
          <div style={{fontSize:22,fontWeight:600,color:'#61707D'}}>{stats.other}</div>
        </div>
      </div>

      {/* Filter row */}
      <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center',marginBottom:14}}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search filename / unit / asset…"
          style={{flex:'1 1 280px',minWidth:240,padding:'9px 12px',fontSize:13,border:'1px solid var(--border-light)',borderRadius:6,outline:'none',background:'#fff'}}/>
        <select value={filterKind} onChange={e => setFilterKind(e.target.value)}
          style={{padding:'9px 12px',fontSize:13,border:'1px solid var(--border-light)',borderRadius:6,background:'#fff',cursor:'pointer'}}>
          <option value="all">All types</option>
          <option value="photo">Photos</option>
          <option value="title_deed">Title deeds</option>
          <option value="layout">Layouts</option>
          <option value="other">Other</option>
        </select>
      </div>

      {/* Building → Unit → Files tree */}
      <div style={{display:'grid',gap:14}}>
        {visibleBuildings.map(b => {
          const us = (unitsByBuilding[b.id] || []).slice().sort((a, b) => (a.floor || 0) - (b.floor || 0) || String(a.unit_number || '').localeCompare(String(b.unit_number || '')));
          const bAtts = visibleAtts.filter(a => us.some(u => u.id === a.unit_id));
          if (bAtts.length === 0 && lowerSearch) return null;
          const isExpanded = expanded[b.id] !== false; // default expanded
          return (
            <div key={b.id} className="card" style={{padding:0,overflow:'hidden'}}>
              <div onClick={() => setExpanded(prev => ({ ...prev, [b.id]: !isExpanded }))}
                style={{padding:'14px 18px',display:'flex',justifyContent:'space-between',alignItems:'center',cursor:'pointer',background:'#FAFAFA',borderBottom: isExpanded ? '1px solid var(--border-light)' : 'none'}}>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#61707D" strokeWidth="2"
                    style={{transform: isExpanded ? 'rotate(90deg)' : 'rotate(0)', transition:'transform 0.15s'}}>
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                  <div>
                    <div style={{fontSize:15,fontWeight:600,color:'var(--text-dark)'}}>{b.name}</div>
                    <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2}}>{b.property_type} · {us.length} unit{us.length===1?'':'s'} · {bAtts.length} document{bAtts.length===1?'':'s'}</div>
                  </div>
                </div>
              </div>
              {isExpanded && (
                <div style={{padding:'4px 0 8px'}}>
                  {us.map(u => {
                    const ua = (attsByUnit[u.id] || []).filter(a => filterKind === 'all' || a.kind === filterKind)
                      .filter(a => !lowerSearch || (a.filename + ' ' + (u.unit_number || '') + ' ' + b.name).toLowerCase().includes(lowerSearch));
                    if (ua.length === 0) return null;
                    return (
                      <div key={u.id} style={{padding:'8px 18px 8px 38px',borderBottom:'1px solid #f4f4f4'}}>
                        <div style={{display:'flex',alignItems:'baseline',gap:10,marginBottom:6}}>
                          <span style={{fontSize:13,fontWeight:500,color:'var(--text-dark)'}}>Unit {u.unit_number}</span>
                          <span style={{fontSize:11,color:'var(--text-muted)'}}>Floor {u.floor != null ? u.floor : '—'}</span>
                        </div>
                        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(260px, 1fr))',gap:6}}>
                          {ua.map(a => (
                            <div key={a.id} onClick={() => openAttachment(a)}
                              style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,padding:'8px 10px',background:'#fff',border:'1px solid var(--border-light)',borderRadius:6,cursor:'pointer',transition:'background 0.12s'}}
                              onMouseEnter={e => e.currentTarget.style.background='#FAFAFA'}
                              onMouseLeave={e => e.currentTarget.style.background='#fff'}>
                              <div style={{minWidth:0,flex:1}}>
                                <div style={{fontSize:12,fontWeight:500,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{a.filename}</div>
                                <div style={{fontSize:10,color:'var(--text-muted)',marginTop:2}}>{fmtDate(a.created_at)}</div>
                              </div>
                              <span style={{fontSize:9,letterSpacing:'0.05em',textTransform:'uppercase',color:'#fff',background:kindColor[a.kind] || '#61707D',padding:'2px 7px',borderRadius:3,fontWeight:600,whiteSpace:'nowrap'}}>{kindLabel[a.kind] || a.kind}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {bAtts.length === 0 && (
                    <div style={{padding:'18px 18px 18px 38px',fontSize:12,color:'var(--text-muted)',fontStyle:'italic'}}>
                      No documents yet for this asset. Use the buttons above to generate placeholders.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {visibleBuildings.length === 0 && (
          <div className="card"><div style={{padding:32,textAlign:'center',color:'var(--text-muted)',fontSize:13}}>No assets match the current filter.</div></div>
        )}
      </div>
    </div>
  );
};
