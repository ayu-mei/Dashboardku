-- Add source imports without altering existing transactions or financial precision.
begin;
create table public.refraksi_sources (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id),
  kind text not null check (kind in ('master', 'sales_recap', 'supplier_claim')),
  source_name text not null check (length(source_name) between 1 and 255),
  sheet text not null check (length(sheet) between 1 and 100),
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  metadata jsonb not null check (jsonb_typeof(metadata) = 'object'),
  records jsonb not null check (jsonb_typeof(records) = 'array' and jsonb_array_length(records) between 1 and 20000),
  created_at timestamptz not null default now(),
  unique(user_id, kind, fingerprint)
);
create index refraksi_sources_owner on public.refraksi_sources(user_id, kind);
alter table public.refraksi_sources enable row level security;
revoke all on public.refraksi_sources from anon, authenticated;
grant select, insert, delete on public.refraksi_sources to authenticated;
create policy source_owner on public.refraksi_sources to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Conservative overlap checks: ambiguous aggregate coverage must be reviewed,
-- never silently added to another report or an individual transaction.
create function public.refraksi_records_overlap(a jsonb, b jsonb) returns boolean
language sql immutable strict set search_path = '' as $$
  select (
    case when a ? 'supplier_code' or b ? 'supplier_code'
      then a->>'supplier_code' = b->>'supplier_code'
      else case when nullif(a->>'sku','') is not null and nullif(b->>'sku','') is not null
        then a->>'sku' = b->>'sku' else lower(trim(a->>'product')) = lower(trim(b->>'product')) end end
  ) and (
    not (a ? 'period_start') or not (b ? 'period_start') or (
      (a->>'period_start')::date <= (b->>'period_end')::date
      and (a->>'period_end')::date >= (b->>'period_start')::date
      and (a ? 'supplier_code' or coalesce((a->>'aggregate_location')::boolean, false)
        or coalesce((b->>'aggregate_location')::boolean, false)
        or lower(trim(coalesce(a->>'location',''))) = lower(trim(coalesce(b->>'location',''))))
    )
  );
$$;
revoke all on function public.refraksi_records_overlap(jsonb,jsonb) from public, anon;
grant execute on function public.refraksi_records_overlap(jsonb,jsonb) to authenticated;

create function public.refraksi_validate_source() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare r jsonb;
begin
  if auth.uid() is null or new.user_id <> auth.uid() then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  -- Serialize source/transaction insertions for this owner to avoid races.
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
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
    where existing.user_id = new.user_id and existing.kind = new.kind
      and coalesce(old_row.value->>'sku', old_row.value->>'supplier_code') = coalesce(new_row.value->>'sku', new_row.value->>'supplier_code')
      and public.refraksi_records_overlap(old_row.value, new_row.value)
  ) then raise exception 'Source overlaps existing data' using errcode = '23505'; end if;
  if new.kind = 'sales_recap' and exists (
    select 1 from public.refraksi_sales s
    cross join lateral jsonb_array_elements(new.records) new_row
    where s.user_id = new.user_id and public.refraksi_records_overlap(new_row.value,
      jsonb_build_object('product',s.product,'location',s.location,'period_start',s.date,'period_end',s.date))
  ) then raise exception 'Source overlaps existing transactions' using errcode = '23505'; end if;
  return new;
end $$;
revoke all on function public.refraksi_validate_source() from public, anon;
grant execute on function public.refraksi_validate_source() to authenticated;
create trigger validate_source before insert on public.refraksi_sources
  for each row execute function public.refraksi_validate_source();

create function public.refraksi_guard_transaction_source() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
  if exists (
    select 1 from public.refraksi_sources existing
    cross join lateral jsonb_array_elements(existing.records) r
    where existing.user_id = new.user_id and existing.kind = 'sales_recap'
      and public.refraksi_records_overlap(r.value,
        jsonb_build_object('product',new.product,'location',new.location,'period_start',new.date,'period_end',new.date))
  ) then raise exception 'Transaction overlaps existing recap' using errcode = '23505'; end if;
  return new;
end $$;
revoke all on function public.refraksi_guard_transaction_source() from public, anon;
grant execute on function public.refraksi_guard_transaction_source() to authenticated;
create trigger guard_transaction_source before insert or update on public.refraksi_sales
  for each row execute function public.refraksi_guard_transaction_source();
notify pgrst, 'reload schema';
commit;
