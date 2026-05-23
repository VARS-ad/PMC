// ==================== PAYMENT METHOD MODAL (resident-side) ====================

const PaymentMethodModal = ({ amount, onClose, showToast }) => {
  const [method, setMethod] = useState('card');
  const [cardName, setCardName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExp, setCardExp] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [swiftBank, setSwiftBank] = useState('');
  const [swiftAccount, setSwiftAccount] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = () => {
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      if (showToast) showToast('Payment intent recorded. Gateway is under development — no charge processed.');
      onClose();
    }, 700);
  };

  const PField = ({ label, value, onChange, placeholder, type }) => (
    <div style={{marginBottom:12}}>
      <label style={{display:'block',fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'#a89a92',marginBottom:6,fontWeight:500}}>{label}</label>
      <input type={type||'text'} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder||''} style={{width:'100%',padding:'10px 12px',fontSize:13,border:'1px solid #d5cfc8',borderRadius:8,outline:'none',fontFamily:'inherit'}}/>
    </div>
  );

  return (
    <div className="modal-overlay" onClick={onClose} style={{zIndex:1200}}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:480}}>
        <div className="modal-header">
          <div>
            <div style={{fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'#a89a92',marginBottom:4}}>Pay invoice</div>
            <h2>{amount}</h2>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div style={{display:'flex',gap:6,marginBottom:18}}>
          {[
            {id:'card',label:'Card'},
            {id:'swift',label:'Bank / SWIFT'},
            {id:'apple',label:'Apple Pay'},
          ].map(m => (
            <button key={m.id} onClick={()=>setMethod(m.id)} style={{
              flex:1, padding:'10px 8px', fontSize:12, fontWeight: method===m.id?600:400,
              background: method===m.id?'var(--bg-warm-dark)':'#fff',
              color: method===m.id?'#fff':'var(--text-dark)',
              border: method===m.id?'none':'1px solid var(--border-light)',
              borderRadius:8, cursor:'pointer'
            }}>{m.label}</button>
          ))}
        </div>

        {method === 'card' && (
          <div>
            <PField label="Cardholder name" value={cardName} onChange={setCardName} placeholder="As shown on card"/>
            <PField label="Card number" value={cardNumber} onChange={setCardNumber} placeholder="4242 4242 4242 4242"/>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <PField label="Expiry" value={cardExp} onChange={setCardExp} placeholder="MM / YY"/>
              <PField label="CVC" value={cardCvc} onChange={setCardCvc} placeholder="•••"/>
            </div>
          </div>
        )}

        {method === 'swift' && (
          <div>
            <PField label="Bank name" value={swiftBank} onChange={setSwiftBank} placeholder="e.g. Emirates NBD"/>
            <PField label="Account / IBAN" value={swiftAccount} onChange={setSwiftAccount} placeholder="AE07 0331 …"/>
            <div style={{padding:12,fontSize:11,color:'#7a6e60',background:'#f5f3f0',borderRadius:8,marginTop:4,lineHeight:1.55}}>
              On submit, you'll receive transfer instructions + a reference number. Amount reconciled once funds arrive (typically 1–3 working days).
            </div>
          </div>
        )}

        {method === 'apple' && (
          <div style={{textAlign:'center',padding:'18px 12px'}}>
            <div style={{width:60,height:60,margin:'0 auto 12px',background:'#1a1a1a',borderRadius:14,display:'flex',alignItems:'center',justifyContent:'center'}}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="#fff"><path d="M17.05 12.04c-.03-3 2.45-4.45 2.56-4.52-1.4-2.04-3.57-2.32-4.34-2.36-1.85-.19-3.6 1.09-4.54 1.09-.94 0-2.39-1.07-3.93-1.04-2.02.03-3.88 1.17-4.92 2.98-2.1 3.64-.54 9.03 1.5 11.99 1 1.45 2.19 3.08 3.74 3.02 1.5-.06 2.07-.97 3.89-.97 1.82 0 2.33.97 3.92.94 1.62-.03 2.65-1.47 3.65-2.93 1.15-1.69 1.62-3.33 1.65-3.42-.04-.02-3.16-1.21-3.18-4.78zM14.3 5.21c.83-1 1.39-2.39 1.24-3.78-1.2.05-2.65.8-3.51 1.79-.77.89-1.45 2.31-1.27 3.67 1.33.1 2.7-.68 3.54-1.68z"/></svg>
            </div>
            <div style={{fontSize:14,fontWeight:600,color:'#1a1a1a',marginBottom:6}}>Confirm with Face ID / Touch ID</div>
            <div style={{fontSize:12,color:'var(--text-secondary)',marginBottom:16}}>One tap to pay {amount} from your default Apple Pay card.</div>
            <button onClick={submit} disabled={busy} style={{background:'#1a1a1a',color:'#fff',padding:'12px 36px',border:'none',borderRadius:10,fontSize:13,fontWeight:600,cursor:busy?'wait':'pointer'}}>
              {busy ? 'Processing…' : '  Pay'}
            </button>
          </div>
        )}

        <div style={{marginTop:18,padding:'10px 12px',background:'#fdf6e3',borderRadius:8,fontSize:11,color:'#7a6e60',lineHeight:1.5}}>
          ⚠ Payment gateway is under development. Submitting this form records your intent for the property manager — no actual charge will be processed yet.
        </div>

        {method !== 'apple' && (
          <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:14}}>
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={busy} onClick={submit}>
              {busy ? 'Processing…' : 'Pay ' + amount}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

