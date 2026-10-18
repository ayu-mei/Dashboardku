-- Run after migrations 001, 002, 003. Isolated test users/data are rolled back.
begin;
insert into auth.users(id, email) values
 ('33333333-3333-4333-8333-333333333333', 'refraksi-money-test@example.invalid'),
 ('44444444-4444-4444-8444-444444444444', 'refraksi-owner-test@example.invalid');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);

insert into public.refraksi_sales(date,customer,product,quantity,price,unit_cost)
values ('2026-01-10','Test','A',2,1.2300,0.5000),
       ('2026-01-11','Test','B',1,2.0000,1.0000);
insert into public.refraksi_expenses(date,description,amount)
values ('2026-01-12','Biaya uji',0.2300);

do $$ declare d jsonb; begin
 d := public.refraksi_dashboard(2026);
 if (d->'metrics'->>'sales')::numeric <> 4.46
    or (d->'metrics'->>'hpp')::numeric <> 2
    or (d->'metrics'->>'gross')::numeric <> 2.46
    or (d->'metrics'->>'net')::numeric <> 2.23 then
   raise exception 'Trailing zero compatibility or financial math failed';
 end if;
 if abs((d->'metrics'->>'gross_margin')::numeric - (2.46 / 4.46 * 100)) > 0.0000000001 then
   raise exception 'Margin must use weighted totals';
 end if;
 if (d->'monthly'->>0)::numeric <> 4.46 or (d->'monthly'->>1)::numeric <> 0 then
   raise exception 'Monthly financial totals failed';
 end if;
 begin
   insert into public.refraksi_sales(date,customer,product,quantity,price,unit_cost)
   values ('2026-01-01','Test','Bad price',1,1.2301,0);
   raise exception 'Actual extra price decimals were accepted';
 exception when check_violation then null; end;
 begin
   insert into public.refraksi_sales(date,customer,product,quantity,price,unit_cost)
   values ('2026-01-01','Test','Bad cost',1,1,0.001);
   raise exception 'Actual extra cost decimals were accepted';
 exception when check_violation then null; end;
 begin
   insert into public.refraksi_expenses(date,description,amount)
   values ('2026-01-01','Bad amount',0.001);
   raise exception 'Actual extra expense decimals were accepted';
 exception when check_violation then null; end;
 begin
   insert into public.refraksi_sales(date,customer,product,quantity,price,unit_cost)
   values ('2026-01-01','Test','Negative',1,-1,0);
   raise exception 'Negative price accepted';
 exception when check_violation then null; end;
 begin
   insert into public.refraksi_expenses(date,description,amount)
   values ('2026-01-01','Over limit',1000000000000.01);
   raise exception 'Money maximum no longer enforced';
 exception when check_violation then null; end;
 begin
   update public.refraksi_sales
   set user_id = '44444444-4444-4444-8444-444444444444';
   raise exception 'Ownership change bypassed WITH CHECK';
 exception when insufficient_privilege then null; end;
end $$;

rollback;
