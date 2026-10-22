export function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  if (!minutes) return `${rest} detik`;
  return rest ? `${minutes} menit ${rest} detik` : `${minutes} menit`;
}
