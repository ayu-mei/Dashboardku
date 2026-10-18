-- Run once in a new Supabase project. Transactional; no existing data is deleted.
begin;
create table public.refraksi_sales (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  date date not null check (date between '0001-01-01' and '9999-12-31'),
  customer text not null check (length(trim(customer)) between 1 and 150),
  product text not null check (length(trim(product)) between 1 and 150),
  quantity integer not null check (quantity between 1 and 1000000),
  price numeric not null check (price between 0 and 1000000000000 and scale(price) <= 2),
  unit_cost numeric not null check (unit_cost between 0 and 1000000000000 and scale(unit_cost) <= 2),
  created_at timestamptz not null default now()
);
create table public.refraksi_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  date date not null check (date between '0001-01-01' and '9999-12-31'),
  description text not null check (length(trim(description)) between 1 and 150),
  amount numeric not null check (amount between 0 and 1000000000000 and scale(amount) <= 2),
  created_at timestamptz not null default now()
);
create index refraksi_sales_owner_date on public.refraksi_sales(user_id, date);
create index refraksi_expenses_owner_date on public.refraksi_expenses(user_id, date);
alter table public.refraksi_sales enable row level security;
alter table public.refraksi_expenses enable row level security;
revoke all on public.refraksi_sales, public.refraksi_expenses from anon, authenticated;
grant select, insert, update, delete on public.refraksi_sales, public.refraksi_expenses to authenticated;
create policy sales_owner on public.refraksi_sales to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy expenses_owner on public.refraksi_expenses to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Invoker privileges: RLS applies inside this function, including aggregates.
create function public.refraksi_dashboard(report_year integer) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if report_year is null or report_year < 1 or report_year > 9999 then raise exception 'Invalid report year' using errcode = '22023'; end if;
  with sales as (
    select id, date, customer, product, quantity, price, unit_cost,
      quantity * price as sales_value, quantity * unit_cost as total_hpp
    from public.refraksi_sales where extract(year from date) = report_year
  ), expenses as (
    select id, date, description, amount from public.refraksi_expenses
    where extract(year from date) = report_year
  ), totals as (
    select coalesce((select sum(sales_value) from sales), 0) as sales,
      coalesce((select sum(total_hpp) from sales), 0) as hpp,
      coalesce((select sum(amount) from expenses), 0) as operational
  ), profits as (
    select *, sales - hpp as gross, sales - hpp - operational as net from totals
  )
  select jsonb_build_object(
    'sales', coalesce((select jsonb_agg(to_jsonb(s) order by s.date desc, s.id) from sales s), '[]'::jsonb),
    'expenses', coalesce((select jsonb_agg(to_jsonb(e) order by e.date desc, e.id) from expenses e), '[]'::jsonb),
    'metrics', (select jsonb_build_object('sales', sales, 'hpp', hpp, 'gross', gross,
      'gross_margin', gross / nullif(sales, 0) * 100, 'operational', operational,
      'net', net, 'net_margin', net / nullif(sales, 0) * 100) from profits),
    'monthly', (select jsonb_agg(value order by month) from (
      select month, coalesce((select sum(sales_value) from sales where extract(month from date) = month), 0) as value
      from generate_series(1, 12) as months(month)
    ) monthly)
  ) into result;
  return result;
end $$;
revoke all on function public.refraksi_dashboard(integer) from public, anon;
grant execute on function public.refraksi_dashboard(integer) to authenticated;
commit;
