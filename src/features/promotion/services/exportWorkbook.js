export function buildExportRows(products) {
  const columns = [
    ['SKU', 'sku', String, 18], ['Nama produk', 'name', String, 48],
    ['Departemen', 'department', String, 24], ['Supplier', 'supplier', String, 40],
    ['Harga reguler', 'price', Number, 20, '#,##0'],
    ['Harga promo', 'promoPrice', Number, 20, '#,##0'],
    ['GP promo', 'promoMargin', Number, 18, '0.0%'],
    ['Stok', 'stock', Number, 16, '#,##0'], ['Assortment', 'assortment', String, 18],
  ];
  return {
    columns: columns.map(c => ({ width: c[3] })),
    rows: [
      columns.map(([value]) => ({ value, type: String, fontWeight: 'bold', backgroundColor: '#214b38', textColor: '#ffffff' })),
      ...products.map(p => columns.map(([, key, type, , format]) => ({
        value: p[key] ?? null, type, ...(format ? { format } : {}),
      }))),
    ],
  };
}

export async function exportWorkbook(products) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const { rows, columns } = buildExportRows(products);
  await writeXlsxFile(rows, { columns, sheet: 'Promosi Bali', stickyRowsCount: 1 }).toFile('promosi-bali-oktober-2026.xlsx');
}
