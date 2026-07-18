import XLSX from 'xlsx';

const wb = XLSX.readFile('C:/OVA_DTE/Base completa pagos.xlsx');
const ws = wb.Sheets['Sheet1'];

// Get headers (first row)
const range = XLSX.utils.decode_range(ws['!ref']!);
const headers: string[] = [];
for (let c = range.s.c; c <= range.e.c; c++) {
  const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
  headers.push(cell ? String(cell.v) : `COL_${c}`);
}
console.log('Total columns:', headers.length);
console.log('First 10 headers:', headers.slice(0, 10));
console.log('Headers from col 10:', headers.slice(10, 30));
console.log('Last 10 headers:', headers.slice(-10));

// First row of data
const rows = XLSX.utils.sheet_to_json(ws) as any[];
console.log('\nFirst row keys:', Object.keys(rows[0]));
console.log('\nFirst row sample (first 8 keys):');
const keys = Object.keys(rows[0]);
for (const k of keys.slice(0, 8)) {
  console.log(`  ${k}: ${rows[0][k]}`);
}
// Show date-like columns
for (const k of keys.slice(8, 20)) {
  console.log(`  ${k}: ${rows[0][k]}`);
}

console.log('\nTotal rows:', rows.length);
