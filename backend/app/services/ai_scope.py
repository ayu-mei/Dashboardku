"""Application topic boundary. No account data is needed for this check."""
import re

SCOPE_REPLY = 'Saya hanya membantu terkait dashboard Refraksi: penjualan, HPP, biaya, laba, impor Excel, filter, dan analisis data. Silakan ajukan pertanyaan tentang dashboard Anda.'

# Recognize application questions; unclear questions receive scope guidance.
TOPICS = re.compile(r'\b(dashboard|refraksi|penjualan|omze[tt]|sales|hpp|laba|profit|margin|biaya|pengeluaran|operasional|produk|barang|transaksi|rekap|rafaksi|rafraksi|supplier|pemasok|master|excel|xlsx|impor|import|ekspor|export|filter|periode|bulan|tahun|januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember|cabang|lokasi|toko|duplikat|duplikasi|data|laporan|grafik|simulasi|estimasi|prediksi|target|kontribusi|pendapatan|harga|jumlah|unit|volume|stok|login|logout|masuk|keluar)\b', re.I)
OVERRIDES = re.compile(r'abaikan.{0,40}(instruksi|aturan|perintah)|ignore.{0,40}(instruction|rule|previous)|system\s*prompt|prompt\s*sistem|instruksi\s*sistem|developer\s*message|jailbreak|\b(api\s*key|password|kata\s*sandi|token\s*(api|login|cloudflare|supabase))\b|\b(jalankan|eksekusi)\s+(sql|kode|script)|\b(you are now|act as|berpura.pura)\b', re.I | re.S)
CLEARLY_UNRELATED = re.compile(r'\b(resep|puisi|pantun|dongeng|politik|presiden|cuaca|ibukota|ibu kota|horoskop|zodiak|diagnosis|diagnosa|obat|pemilu|sepak bola|gosip|judi|bitcoin|kripto|cryptocurrency)\b', re.I)
SHORTCUTS = {'apa yang paling perlu saya perhatikan', 'apa yang perlu saya perhatikan', 'apa yang perlu diperiksa'}


def dashboard_question(question):
    normalized = ' '.join(question.lower().strip().split())
    if OVERRIDES.search(normalized) or CLEARLY_UNRELATED.search(normalized):
        return False
    return bool(TOPICS.search(normalized) or normalized.rstrip('?.!') in SHORTCUTS)


def scope_reply(model):
    return {'answer': SCOPE_REPLY, 'suggested_filters': None, 'model': model, 'scope': 'out_of_scope'}
