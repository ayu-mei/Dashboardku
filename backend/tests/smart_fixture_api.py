"""Isolated browser fixture: real finance routes, fake identity/storage/provider."""
from fixture_api import app, state, all_records
from app.routes import smart
smart.all_records = all_records
smart.configured = lambda: True

async def generate(question,context,task):
    if question == 'Buat resep nasi goreng untuk dashboard':
        from app.services.ai_scope import scope_reply
        return scope_reply('test-provider')
    if task == 'import':
        return {'answer':'Periksa tanggal, jumlah dan nilai total pada header sumber. HPP yang belum tersedia tidak diganti nol. Saran ini tidak mengubah pencocokan kolom.', 'suggested_filters':None, 'model':'test-provider'}
    if 'Tampilkan' in question:
        return {'answer':'Terapkan filter September 2026 untuk membaca periode tersebut.', 'suggested_filters':{'year':2026,'month':9},'model':'test-provider'}
    return {'answer':f"Penjualan pada filter pilihan: {context['metrics']['sales']}. Periksa transaksi yang tampak sama sebelum menghapus. Tidak ada data diubah.\n\n| Keterangan | Nilai |\n| --- | ---: |\n| Penjualan | **Rp7.000** |\n| Catatan | <script>contoh</script> |", 'suggested_filters':None,'model':'test-provider'}
smart.generate = generate

@app.post('/test/smart-seed')
async def seed():
    rows=[{'id':f'00000000-0000-4000-8000-{m:012d}', 'date':f'2026-{m:02d}-01','product':'Produk Uji','customer':'Pelanggan Privat','quantity':1,'price':'1000','unit_cost':'600','location':'Bali','category':'Optik'} for m in range(4,10)]
    rows.append({**rows[-1],'id':'00000000-0000-4000-8000-000000000099'})
    state.update(refraksi_sales=rows,refraksi_expenses=[{'id':'expense','date':'2026-09-01','description':'Sewa','amount':'100'}],refraksi_sources=[],writes=0)
    return {'ok':True}
