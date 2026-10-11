import { useMemo, useState } from 'react';
import workbook from '../../../data/promotions.json';
export function usePromotions() {
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('');
  const [assortment, setAssortment] = useState('');
  const [risk, setRisk] = useState(false);
  const products = useMemo(() => workbook.products.filter(p => (!department || p.department === department) && (!assortment || p.assortment === assortment) && (!risk || (p.promoMargin != null && p.promoMargin < 0)) && `${p.name} ${p.sku} ${p.supplier}`.toLowerCase().includes(search.toLowerCase())), [search, department, assortment, risk]);
  const departments = [...new Set(workbook.products.map(p => p.department))].sort();
  const assortments = [...new Set(workbook.products.map(p => p.assortment))].sort();
  return { workbook, products, search, setSearch, department, setDepartment, assortment, setAssortment, risk, setRisk, departments, assortments };
}
