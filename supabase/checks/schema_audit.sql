-- Read-only inventory for the existing online project. No customer data is read.
-- Run this file in Supabase SQL Editor; it does not create or change anything.
begin read only;

with target_tables as (
  select c.oid, n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('refraksi_sales', 'refraksi_expenses')
    and c.relkind in ('r', 'p')
)
select jsonb_build_object(
  'tables', coalesce((
    select jsonb_agg(jsonb_build_object(
      'name', t.relname, 'rls_enabled', t.relrowsecurity,
      'force_rls', t.relforcerowsecurity,
      'columns', (select jsonb_agg(jsonb_build_object(
        'name', a.attname, 'type', format_type(a.atttypid, a.atttypmod),
        'not_null', a.attnotnull, 'default', pg_get_expr(d.adbin, d.adrelid)
      ) order by a.attnum)
        from pg_attribute a left join pg_attrdef d
          on d.adrelid = a.attrelid and d.adnum = a.attnum
        where a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped),
      'constraints', (select jsonb_agg(jsonb_build_object(
        'name', conname, 'definition', pg_get_constraintdef(oid),
        'validated', convalidated
      ) order by conname) from pg_constraint where conrelid = t.oid),
      'policies', (select jsonb_agg(jsonb_build_object(
        'name', policyname, 'roles', roles, 'command', cmd,
        'permissive', permissive, 'using', qual, 'with_check', with_check
      ) order by policyname) from pg_policies
        where schemaname = t.nspname and tablename = t.relname),
      'indexes', (select jsonb_agg(indexdef order by indexname)
        from pg_indexes where schemaname = t.nspname and tablename = t.relname),
      'api_privileges', (select jsonb_agg(jsonb_build_object(
        'role', r.rolname, 'superuser', r.rolsuper, 'bypass_rls', r.rolbypassrls,
        'select', has_table_privilege(r.oid, t.oid, 'SELECT'),
        'insert', has_table_privilege(r.oid, t.oid, 'INSERT'),
        'update', has_table_privilege(r.oid, t.oid, 'UPDATE'),
        'delete', has_table_privilege(r.oid, t.oid, 'DELETE')
      ) order by r.rolname) from pg_roles r where r.rolname in ('anon', 'authenticated'))
    ) order by t.relname) from target_tables t
  ), '[]'::jsonb),
  'dashboard_functions', coalesce((
    select jsonb_agg(jsonb_build_object(
      'signature', p.oid::regprocedure::text,
      'security_definer', p.prosecdef, 'settings', p.proconfig,
      'definition', pg_get_functiondef(p.oid),
      'execute_privileges', (select jsonb_agg(jsonb_build_object(
        'role', r.rolname, 'execute', has_function_privilege(r.oid, p.oid, 'EXECUTE')
      ) order by r.rolname) from pg_roles r where r.rolname in ('anon', 'authenticated'))
    ) order by p.oid::regprocedure::text)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'refraksi_dashboard'
  ), '[]'::jsonb)
) as database_audit;

commit;
