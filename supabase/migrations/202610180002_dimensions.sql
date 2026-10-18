begin;
alter table public.refraksi_sales add column if not exists category text check (length(category) <= 150);
alter table public.refraksi_sales add column if not exists location text check (length(location) <= 150);
commit;
