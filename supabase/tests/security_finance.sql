-- Run in SQL Editor after migration. Test fixtures are rolled back, even on errors.
begin;
insert into auth.users(id, email) values
 ('11111111-1111-4111-8111-111111111111', 'refraksi-test-a@example.invalid'),
 ('22222222-2222-4222-8222-222222222222', 'refraksi-test-b@example.invalid');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
insert into public.refraksi_sales(date,customer,product,quantity,price,unit_cost)
values ('2026-01-10','Test','Lensa',2,500000,300000);
insert into public.refraksi_expenses(date,description,amount) values ('2026-01-12','Sewa',100000);
do $$ declare d jsonb; begin
 d := public.refraksi_dashboard(2026);
 if d->'metrics' <> '{"sales":1000000,"hpp":600000,"gross":400000,"gross_margin":40,"operational":100000,"net":300000,"net_margin":30}'::jsonb then raise exception 'Financial formula failed: %',d; end if;
 if d->'monthly'->>0 <> '1000000' then raise exception 'Monthly chart failed'; end if;
 if (public.refraksi_dashboard(2025)->'metrics'->>'sales')::numeric <> 0 then raise exception 'Year filter failed'; end if;
 begin
   insert into public.refraksi_sales(user_id,date,customer,product,quantity,price,unit_cost) values ('22222222-2222-4222-8222-222222222222','2026-01-01','Test','Test',1,1,0);
   raise exception 'Cross-owner insert was allowed';
 exception when insufficient_privilege then null; end;
 begin
   insert into public.refraksi_expenses(date,description,amount) values ('2026-01-01','Bad',0.001);
   raise exception 'Fractional cent allowed';
 exception when check_violation then null; end;
end $$;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
do $$ declare affected integer; begin
 if exists(select 1 from public.refraksi_sales) or exists(select 1 from public.refraksi_expenses) then raise exception 'Cross-account SELECT leaked'; end if;
 update public.refraksi_sales set quantity=5; get diagnostics affected = row_count;
 if affected <> 0 then raise exception 'Cross-account UPDATE allowed'; end if;
 delete from public.refraksi_expenses; get diagnostics affected = row_count;
 if affected <> 0 then raise exception 'Cross-account DELETE allowed'; end if;
 if public.refraksi_dashboard(2026)->'metrics'->>'net_margin' is not null then raise exception 'Zero sales margin should be null'; end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
update public.refraksi_sales set quantity=1;
do $$ begin
 if (public.refraksi_dashboard(2026)->'metrics'->>'net')::numeric <> 100000 then raise exception 'Edit failed'; end if;
end $$;
delete from public.refraksi_sales;
do $$ begin
 if (public.refraksi_dashboard(2026)->'metrics'->>'net')::numeric <> -100000 then raise exception 'Expense counted incorrectly'; end if;
end $$;
set local role anon;
do $$ begin
 begin perform * from public.refraksi_sales; raise exception 'Anonymous read allowed'; exception when insufficient_privilege then null; end;
 begin perform public.refraksi_dashboard(2026); raise exception 'Anonymous RPC allowed'; exception when insufficient_privilege then null; end;
end $$;
rollback;
