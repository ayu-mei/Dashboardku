-- Isolated fixtures; run on a test database after all migrations. Roll back at end.
begin;
insert into auth.users(id,email) values
 ('55555555-5555-4555-8555-555555555555','source-a@example.invalid'),
 ('66666666-6666-4666-8666-666666666666','source-b@example.invalid');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}',true);
insert into public.refraksi_sources(id,kind,source_name,sheet,fingerprint,metadata,records) values
 ('11111111-1111-4111-8111-111111111115','sales_recap','test.xlsx','Jan',repeat('a',64),'{}',
 '[{"sku":"001","product":"Produk","location":"BALI","aggregate_location":true,"period_start":"2026-01-01","period_end":"2026-01-31","quantity":3,"sales_value":"100","total_hpp":"3.3702"}]');
do $$ begin
 if (select records->0->>'sales_value' from public.refraksi_sources) <> '100'
   or (select records->0->>'total_hpp' from public.refraksi_sources) <> '3.3702' then
   raise exception 'Aggregate precision changed'; end if;
 begin
   insert into public.refraksi_sources(id,kind,source_name,sheet,fingerprint,metadata,records)
   select gen_random_uuid(),kind,'renamed.xlsx','Other',repeat('b',64),metadata,records from public.refraksi_sources;
   raise exception 'Overlap accepted';
 exception when unique_violation then null; end;
 begin
   insert into public.refraksi_sales(date,customer,product,quantity,price,unit_cost,location)
   values('2026-01-10','Test','Produk',1,50,1,'Toko B');
   raise exception 'Transaction double counted';
 exception when unique_violation then null; end;
 begin
   update public.refraksi_sources set source_name='Changed';
   raise exception 'Source UPDATE was allowed';
 exception when insufficient_privilege then null; end;
 begin
   insert into public.refraksi_sources(id,user_id,kind,source_name,sheet,fingerprint,metadata,records)
   values(gen_random_uuid(),'66666666-6666-4666-8666-666666666666','master','x','x',repeat('d',64),'{}','[{"sku":"x","product":"x"}]');
   raise exception 'Owner spoof allowed';
 exception when insufficient_privilege then null; end;
 begin
   insert into public.refraksi_sources(id,kind,source_name,sheet,fingerprint,metadata,records)
   values(gen_random_uuid(),'sales_recap','x','x',repeat('e',64),'{}','[{"sku":"x","product":"x","quantity":1,"sales_value":"-1","period_start":"2026-03-01","period_end":"2026-03-31"}]');
   raise exception 'Negative sales allowed';
 exception when raise_exception then
   if sqlerrm = 'Negative sales allowed' then raise; end if;
 end;
 begin
   insert into public.refraksi_sources(id,kind,source_name,sheet,fingerprint,metadata,records)
   values(gen_random_uuid(),'master','x','x',repeat('f',64),'{}','[{"sku":"x","product":"x"},{"sku":"x","product":"x"}]');
   raise exception 'Repeated source keys allowed';
 exception when unique_violation then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"66666666-6666-4666-8666-666666666666","role":"authenticated"}',true);
do $$ declare affected integer; begin
 if exists(select 1 from public.refraksi_sources) then raise exception 'Source owner leak'; end if;
 delete from public.refraksi_sources; get diagnostics affected = row_count;
 if affected <> 0 then raise exception 'Cross-owner delete allowed'; end if;
end $$;
-- Same business values on another account are permitted and isolated.
insert into public.refraksi_sources(id,kind,source_name,sheet,fingerprint,metadata,records) values
 (gen_random_uuid(),'master','master.xlsx','master',repeat('a',64),'{}','[{"sku":"001","product":"Produk"}]');
-- Existing transactions also block a newly imported overlapping recap.
insert into public.refraksi_sales(date,customer,product,quantity,price,unit_cost,location)
values('2026-02-10','Test','Existing',1,50,1,'Bali');
do $$ begin
 begin
  insert into public.refraksi_sources(id,kind,source_name,sheet,fingerprint,metadata,records) values
   (gen_random_uuid(),'sales_recap','x','Feb',repeat('b',64),'{}',
   '[{"sku":"002","product":"Existing","aggregate_location":true,"quantity":1,"sales_value":"50","period_start":"2026-02-01","period_end":"2026-02-28"}]');
  raise exception 'Legacy transaction overlap accepted';
 exception when unique_violation then null; end;
end $$;
set local role anon;
do $$ begin
 begin perform * from public.refraksi_sources; raise exception 'Anonymous source read allowed'; exception when insufficient_privilege then null; end;
end $$;
rollback;
