import readXlsxFile from 'read-excel-file/node';
import { readdir, mkdir, writeFile } from 'node:fs/promises';
const file = (await readdir('.')).find(name => name.endsWith('.xlsx'));
if (!file) throw new Error('File Excel tidak ditemukan di root proyek.');
const rows = await readXlsxFile(file, { sheet: 'FORMAT' });
const number = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const products = rows.slice(5).filter(r => r[2] && r[4] && /^\d+$/.test(String(r[2]))).map((r, i) => ({
  id: i, department: String(r[1] || 'Tanpa departemen'), sku: String(r[2]), upc: String(r[3] || ''), name: String(r[4]),
  cost: number(r[5]), costTax: number(r[6]), price: number(r[7]), promoPrice: number(r[11]), promoMargin: number(r[12]),
  note: String(r[16] || ''), supplier: String(r[18] || 'Tidak tersedia'), status: String(r[19] || 'Tidak tersedia'), assortment: String(r[21] || 'Tidak tersedia'),
  campaign: String(r[27] || ''), stockDc: number(r[42]), stockStore: number(r[43]), stock: number(r[44]), stockSeptember: number(r[38]),
  totalCost: number(r[45]), promoValue: number(r[46]), salesQty: number(r[52]), salesValue: number(r[53])
}));
// AQ/AR/AS are the workbook's second stock block; AT/AU are valuation, not realized sales.
await mkdir('src/data', { recursive: true });
await writeFile('src/data/promotions.json', JSON.stringify({ source: file, period: String(rows[2][2]), products }, null, 2));
console.log(`Imported ${products.length} promotion rows from ${file}`);
