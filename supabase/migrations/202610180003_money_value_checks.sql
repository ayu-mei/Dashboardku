-- Align numeric validation with the backend: 1.2300 equals 1.23.
-- Actual fractional cents remain rejected; no values are rounded or rewritten.
-- Apply after 001 and 002. Uses their constraint names; unexpected schemas fail
-- transactionally instead of dropping unknown constraints or changing columns.
begin;

alter table public.refraksi_sales
  drop constraint refraksi_sales_price_check,
  add constraint refraksi_sales_price_check
    check (price between 0 and 1000000000000 and price = trunc(price, 2)),
  drop constraint refraksi_sales_unit_cost_check,
  add constraint refraksi_sales_unit_cost_check
    check (unit_cost between 0 and 1000000000000 and unit_cost = trunc(unit_cost, 2));

alter table public.refraksi_expenses
  drop constraint refraksi_expenses_amount_check,
  add constraint refraksi_expenses_amount_check
    check (amount between 0 and 1000000000000 and amount = trunc(amount, 2));

commit;
