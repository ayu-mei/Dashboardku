-- Jalankan sesudah migrasi shared_dashboard. Seluruh fixture di-rollback.
begin;
insert into auth.users(id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}';
insert into public.refraksi_sales(id,date,customer,product,quantity,price,unit_cost)
values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','2026-01-01','Shared test','Shared test product',1,100,50);
insert into public.refraksi_expenses(id,date,description,amount)
values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','2026-01-01','Shared test expense',10);
insert into public.refraksi_sources(id,kind,source_name,sheet,fingerprint,metadata,records)
values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','master','Shared test','Master',repeat('a',64),'{}','[{"sku":"SHARED-TEST","product":"Shared test master"}]');
set local request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}';
do $$ begin
 if not exists (select 1 from public.refraksi_sales where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc')
 or not exists (select 1 from public.refraksi_expenses where id='dddddddd-dddd-4ddd-8ddd-dddddddddddd')
 or not exists (select 1 from public.refraksi_sources where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') then
 raise exception 'Akun kedua harus melihat data akun pertama'; end if;
 update public.refraksi_sales set price=120 where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 if not found then raise exception 'Shared edit failed'; end if;
 begin
  update public.refraksi_sales set user_id=auth.uid() where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  raise exception 'Creator spoof accepted';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.refraksi_sources(id,kind,source_name,sheet,fingerprint,metadata,records)
  values (gen_random_uuid(),'master','Duplicate','Master',repeat('b',64),'{}','[{"sku":"SHARED-TEST","product":"Shared test master"}]');
  raise exception 'Cross-account duplicate accepted';
 exception when unique_violation then null; end;
 delete from public.refraksi_expenses where id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
 if not found then raise exception 'Shared delete failed'; end if;
end $$;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}';
do $$ begin
 if (select price from public.refraksi_sales where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc') <> 120
 or exists (select 1 from public.refraksi_expenses where id='dddddddd-dddd-4ddd-8ddd-dddddddddddd') then
 raise exception 'Perubahan akun kedua tidak tersinkron'; end if;
end $$;
set local role anon;
set local request.jwt.claims = '{}';
do $$ begin
 begin
  perform * from public.refraksi_sales;
  raise exception 'Anonymous read accepted';
 exception when insufficient_privilege then null; end;
end $$;
rollback;
