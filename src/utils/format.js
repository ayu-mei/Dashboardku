export const integer = n => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(n ?? 0);
export const rupiah = n => n == null ? '—' : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
export const compact = n => new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 }).format(n ?? 0);
export const percent = n => n == null ? '—' : `${(n * 100).toFixed(1)}%`;
