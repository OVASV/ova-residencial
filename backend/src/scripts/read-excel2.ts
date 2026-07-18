import XLSX from 'xlsx';

const wb = XLSX.readFile('C:/OVA_DTE/Base completa pagos.xlsx');
const ws = wb.Sheets['Sheet1'];
const rows = XLSX.utils.sheet_to_json(ws) as any[];

// Get all unique amounts and detect transitions
const allAmounts = new Set<number>();
const transitions: { lote: string; from: number; to: number; month: string }[] = [];

const dateKeys = Object.keys(rows[0]).filter(k => !['LOTE','CALLE','NOMBRE','PAIS DE RESIDENCIA','TELEFONO','EMAIL','ESTATUS','OBSERVACION'].includes(k));
console.log('Date columns:', dateKeys.length, '→', dateKeys[0], '...', dateKeys[dateKeys.length - 1]);

for (const row of rows) {
  const lote = row.LOTE?.trim();
  let prevAmount: number | null = null;

  for (const dk of dateKeys) {
    const val = row[dk];
    const amount = typeof val === 'number' ? val : parseFloat(val);
    if (!isNaN(amount) && amount > 0) {
      allAmounts.add(amount);
      if (prevAmount !== null && amount !== prevAmount) {
        transitions.push({ lote, from: prevAmount, to: amount, month: dk });
      }
      prevAmount = amount;
    }
  }
}

console.log('\nUnique amounts:', [...allAmounts].sort((a, b) => a - b));
console.log('\nTransitions (amount changes):');
for (const t of transitions) {
  console.log(`  ${t.lote}: $${t.from} → $${t.to} in ${t.month}`);
}
