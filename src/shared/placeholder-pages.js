// ==================== PLACEHOLDER PAGES ====================
const PlaceholderPage = ({ title, description }) => {
  const { t } = useApp();
  return (
  <div>
    <div className="page-header"><h1>{title}</h1></div>
    <div className="card" style={{textAlign:'center',padding:60}}>
      <div style={{fontSize:48,marginBottom:16}}><svg width='48' height='48' viewBox='0 0 24 24' fill='none' stroke='#a89a92' strokeWidth='1.5'><path d='M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z'/></svg></div>
      <h2 style={{marginBottom:8}}>{title}</h2>
      <p style={{color:'#a89a92'}}>{description || t('pm.comingSoon')}</p>
    </div>
  </div>
  );
};

</script>
<script type="text/babel" src="src/resident/pre-approve-form.js"></script>
