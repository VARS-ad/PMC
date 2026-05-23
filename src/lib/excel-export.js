// ==================== EXCEL EXPORT HELPER ====================
const exportToExcel = (data, columns, filename) => {
  try {
    const ws_data = [columns.map(c => c.header)];
    data.forEach(row => {
      ws_data.push(columns.map(c => row[c.key] !== undefined ? row[c.key] : ''));
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    // Auto-width columns
    ws['!cols'] = columns.map(c => ({ wch: Math.max(c.header.length, 15) }));
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    // Use setTimeout to prevent screen freezing
    setTimeout(() => {
      XLSX.writeFile(wb, filename + '.xlsx');
      showToast('File downloaded successfully');
    }, 100);
  } catch (error) {
    showToast('Error exporting Excel: ' + (error.message || 'Please try again'));
  }
};

