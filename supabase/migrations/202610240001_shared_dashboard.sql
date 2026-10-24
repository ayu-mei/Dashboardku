-- Semua akun terautentikasi berbagi data; user_id tetap mencatat pembuat.
-- Data existing tidak dipindah, dihapus, atau ditulis ulang.
begin;
drop policy sales_owner on public.refraksi_sales;
create policy sales_shared_read on public.refraksi_sales for select to authenticated using (true);
create policy sales_shared_insert on public.refraksi_sales for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy sales_shared_delete on public.refraksi_sales for delete to authenticated using (true);
create policy sales_shared_update on public.refraksi_sales for update to authenticated
  using (true) with check (true);
drop policy expenses_owner on public.refraksi_expenses;
create policy expenses_shared_read on public.refraksi_expenses for select to authenticated using (true);
create policy expenses_shared_insert on public.refraksi_expenses for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy expenses_shared_delete on public.refraksi_expenses for delete to authenticated using (true);
create policy expenses_shared_update on public.refraksi_expenses for update to authenticated
  using (true) with check (true);
drop policy source_owner on public.refraksi_sources;
create policy sources_shared_read on public.refraksi_sources for select to authenticated using (true);
create policy sources_shared_insert on public.refraksi_sources for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy sources_shared_delete on public.refraksi_sources for delete to authenticated using (true);

create function public.refraksi_keep_creator() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'Creator cannot be changed' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.refraksi_keep_creator() from public, anon;
grant execute on function public.refraksi_keep_creator() to authenticated;
create trigger keep_creator before update on public.refraksi_sales
  for each row execute function public.refraksi_keep_creator();
create trigger keep_creator before update on public.refraksi_expenses
  for each row execute function public.refraksi_keep_creator();

create or replace function public.refraksi_validate_source() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare r jsonb;
begin
  if auth.uid() is null or new.user_id <> auth.uid() then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  -- Serialize all shared imports and transactions across accounts.
  perform pg_advisory_xact_lock(hashtextextended('refraksi-shared-data', 0));
  for r in select value from jsonb_array_elements(new.records) loop
    if jsonb_typeof(r) <> 'object' then raise exception 'Invalid source row'; end if;
    if new.kind in ('master', 'sales_recap') then
      if nullif(trim(r->>'sku'),'') is null or nullif(trim(r->>'product'),'') is null or length(trim(r->>'product')) not between 1 and 150 then
        raise exception 'Product/SKU required';
      end if;
    end if;
    if new.kind <> 'master' then
      if r->>'period_start' is null or r->>'period_end' is null
        or (r->>'period_start')::date > (r->>'period_end')::date
        or extract(year from (r->>'period_start')::date) < 1
        or extract(year from (r->>'period_end')::date) > 9999 then
        raise exception 'Invalid reporting period';
      end if;
    end if;
    if new.kind = 'sales_recap' then
      if date_trunc('month', (r->>'period_start')::date) <> date_trunc('month', (r->>'period_end')::date) then
        raise exception 'Recap must stay within one calendar month';
      end if;
      if r->>'quantity' is null or (r->>'quantity')::numeric not between 1 and 1000000
        or trunc((r->>'quantity')::numeric) <> (r->>'quantity')::numeric
        or r->>'sales_value' is null or not ((r->>'sales_value')::numeric between 0 and 1e18)
        or (r->>'total_hpp' is not null and not ((r->>'total_hpp')::numeric between 0 and 1e18)) then
        raise exception 'Invalid sales values';
      end if;
    elsif new.kind = 'supplier_claim' then
      if nullif(trim(r->>'supplier_code'),'') is null or nullif(trim(r->>'supplier_name'),'') is null
        or r->>'amount' is null or not ((r->>'amount')::numeric between 0 and 1e18) then
        raise exception 'Invalid supplier claim';
      end if;
    end if;
  end loop;
  if exists (
    select 1 from jsonb_array_elements(new.records) with ordinality a(value, ord)
    join jsonb_array_elements(new.records) with ordinality b(value, ord)
      on coalesce(a.value->>'sku', a.value->>'supplier_code') = coalesce(b.value->>'sku', b.value->>'supplier_code')
    where a.ord < b.ord and public.refraksi_records_overlap(a.value, b.value)
  ) then raise exception 'Repeated or overlapping source business key' using errcode = '23505'; end if;
  if exists (
    select 1 from public.refraksi_sources existing
    cross join lateral jsonb_array_elements(existing.records) old_row
    cross join lateral jsonb_array_elements(new.records) new_row
    where existing.kind = new.kind
      and coalesce(old_row.value->>'sku', old_row.value->>'supplier_code') = coalesce(new_row.value->>'sku', new_row.value->>'supplier_code')
      and public.refraksi_records_overlap(old_row.value, new_row.value)
  ) then raise exception 'Source overlaps existing data' using errcode = '23505'; end if;
  if new.kind = 'sales_recap' and exists (
    select 1 from public.refraksi_sales s
    cross join lateral jsonb_array_elements(new.records) new_row
    where public.refraksi_records_overlap(new_row.value,
      jsonb_build_object('product',s.product,'location',s.location,'period_start',s.date,'period_end',s.date))
  ) then raise exception 'Source overlaps existing transactions' using errcode = '23505'; end if;
  return new;
end $$;
revoke all on function public.refraksi_validate_source() from public, anon;
grant execute on function public.refraksi_validate_source() to authenticated;

create or replace function public.refraksi_guard_transaction_source() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('refraksi-shared-data', 0));
  if exists (
    select 1 from public.refraksi_sources existing
    cross join lateral jsonb_array_elements(existing.records) r
    where existing.kind = 'sales_recap'
      and public.refraksi_records_overlap(r.value,
        jsonb_build_object('product',new.product,'location',new.location,'period_start',new.date,'period_end',new.date))
  ) then raise exception 'Transaction overlaps existing recap' using errcode = '23505'; end if;
  return new;
end $$;
revoke all on function public.refraksi_guard_transaction_source() from public, anon;
grant execute on function public.refraksi_guard_transaction_source() to authenticated;
notify pgrst, 'reload schema';
commit;
