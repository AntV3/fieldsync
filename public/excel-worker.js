// Excel Web Worker - Handles Excel parsing off the main thread
// This prevents UI freezing during large file imports

importScripts('https://cdn.sheetjs.com/xlsx-0.18.5/package/dist/xlsx.full.min.js');

self.onmessage = function(e) {
  const { type, data } = e.data;

  try {
    if (type === 'PARSE_EXCEL') {
      // Parse Excel file
      const workbook = XLSX.read(data, { type: 'array' });

      // Get first sheet
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];

      // Convert to array of arrays
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      // Send result back to main thread
      self.postMessage({
        type: 'PARSE_SUCCESS',
        rows: rows
      });
    } else if (type === 'EXPORT_EXCEL') {
      // Create workbook from data
      const wb = XLSX.utils.book_new();

      // Add each sheet
      data.sheets.forEach(sheetData => {
        const ws = XLSX.utils.json_to_sheet(sheetData.data);
        XLSX.utils.book_append_sheet(wb, ws, sheetData.name);
      });

      // Generate file as array buffer
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

      // Send result back to main thread
      self.postMessage({
        type: 'EXPORT_SUCCESS',
        data: wbout,
        fileName: data.fileName
      });
    }
  } catch (error) {
    self.postMessage({
      type: 'ERROR',
      error: error.message
    });
  }
};
