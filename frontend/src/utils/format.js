export const rupiah = (value) =>
  value === null || value === undefined
    ? "-"
    : new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 2,
      }).format(value);
export const percent = (value) =>
  value === null || value === undefined || !Number.isFinite(Number(value))
    ? "-"
    : Number(value).toLocaleString("id-ID", { maximumFractionDigits: 2 }) + "%";
export const compact = (value) =>
  new Intl.NumberFormat("id-ID", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
export const months = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];
export function filterQuery(filters) {
  return new URLSearchParams(
    Object.entries(filters).filter(
      ([, value]) => value !== "" && value !== null && value !== undefined,
    ),
  ).toString();
}
