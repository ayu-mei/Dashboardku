import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, ArrowUpDown } from 'lucide-react';
import { integer, rupiah, percent } from '../../../utils/format';
export default function ProductTable({ products }) {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState(false);
  useEffect(() => { setPage(1); }, [products]);
  const sorted = sort ? [...products].sort((a,b) => (a.promoMargin ?? Infinity) - (b.promoMargin ?? Infinity)) : products;
  const pages = Math.max(1, Math.ceil(sorted.length / 12));
  return <section className="panel table-panel"><div className="panel-heading"><div><h2>Daftar produk promosi</h2><p>Harga, persediaan, dan margin per produk</p></div><span className="count">{integer(products.length)} produk</span></div><div className="table-scroll"><table><thead><tr><th>PRODUK / SKU</th><th>DEPARTEMEN</th><th>HARGA REGULER</th><th>HARGA PROMO</th><th><button className="sort" onClick={() => setSort(!sort)}>GP PROMO <ArrowUpDown size={12}/></button></th><th>STOK¹</th><th>ASSORTMENT</th></tr></thead><tbody>{sorted.slice((page-1)*12,page*12).map(p => <tr key={p.id}><td><b>{p.name}</b><small>{p.sku} · {p.supplier}</small></td><td>{p.department}</td><td className="muted">{rupiah(p.price)}</td><td className="price">{rupiah(p.promoPrice)}</td><td><span className={`badge ${p.promoMargin == null ? '' : p.promoMargin < 0 ? 'danger' : 'positive'}`}>{percent(p.promoMargin)}</span></td><td>{p.stock == null ? '—' : integer(p.stock)}</td><td><span className="badge">{p.assortment}</span></td></tr>)}</tbody></table>{!products.length && <div className="empty">Tidak ada produk sesuai filter.</div>}</div><footer className="pagination"><span>Halaman {page} dari {pages}</span><div><button aria-label="Halaman sebelumnya" disabled={page === 1} onClick={() => setPage(page-1)}><ChevronLeft size={16}/></button><button aria-label="Halaman selanjutnya" disabled={page >= pages} onClick={() => setPage(page+1)}><ChevronRight size={16}/></button></div></footer></section>;
}
