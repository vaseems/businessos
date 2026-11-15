-- 1) Row-level change history, 2) a paginated "previous results" RPC for every section, 3) admin tagging.

-- ───────── Change log: every edit or removal of a tracked row is kept, so older values are never lost ─────────
create table if not exists public.change_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  section text not null,
  row_key text,
  label text,
  op text not null check (op in ('updated','deleted')),
  changes jsonb not null default '{}'::jsonb
);
create index if not exists change_log_at_idx on public.change_log (at desc);
alter table public.change_log enable row level security;
revoke all on public.change_log from anon, authenticated;

-- TG_ARGV: 0 = key column, 1 = label column, 2 = section name
create or replace function public.log_row_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare o jsonb := to_jsonb(old); n jsonb; k text; diff jsonb := '{}'::jsonb; ov jsonb; nv jsonb;
  trim_v constant int := 500;
begin
  if tg_op = 'DELETE' then
    insert into public.change_log (section, row_key, label, op) values (tg_argv[2], o->>tg_argv[0], o->>tg_argv[1], 'deleted');
    return old;
  end if;
  n := to_jsonb(new);
  for k in select jsonb_object_keys(n) loop
    if k in ('refreshed_at','updated_at','added_at') then continue; end if;
    ov := o->k; nv := n->k;
    if ov is distinct from nv then
      if jsonb_typeof(ov) = 'string' and length(ov #>> '{}') > trim_v then ov := to_jsonb(left(ov #>> '{}', trim_v) || '…'); end if;
      if jsonb_typeof(nv) = 'string' and length(nv #>> '{}') > trim_v then nv := to_jsonb(left(nv #>> '{}', trim_v) || '…'); end if;
      diff := diff || jsonb_build_object(k, jsonb_build_object('from', ov, 'to', nv));
    end if;
  end loop;
  if diff <> '{}'::jsonb then
    insert into public.change_log (section, row_key, label, op, changes) values (tg_argv[2], n->>tg_argv[0], n->>tg_argv[1], 'updated', diff);
  end if;
  return new;
end $$;
revoke all on function public.log_row_change() from public, anon, authenticated;

do $$
declare t record;
begin
  for t in select * from (values
    ('ideas','slug','name','ideas'), ('startups','slug','name','startups'), ('funding_deals','slug','company','funding'),
    ('funding_sources','slug','name','opportunities'), ('gov_schemes','slug','name','schemes'), ('regulations','slug','name','regulations'),
    ('jobs_future','id','role','jobs'), ('jobs_hot','id','role','jobs'), ('jobs_skills','id','skill','jobs')
  ) as v(tbl, keycol, labelcol, section)
  loop
    execute format('drop trigger if exists trg_log_change on public.%I', t.tbl);
    execute format('create trigger trg_log_change after update or delete on public.%I for each row execute function public.log_row_change(%L,%L,%L)',
      t.tbl, t.keycol, t.labelcol, t.section);
  end loop;
end $$;

-- ───────── History: one normalised, paginated view over every section, including rows the pages no longer show ─────────
create or replace function public.history_base(p_section text, p_country text) returns table (
  d timestamptz, title text, sub text, tag text, kind text, ref text)
language plpgsql security definer set search_path = '' as $$
declare us boolean := upper(coalesce(p_country,'IN')) = 'US';
begin
  if p_section = 'ideas' then
    return query select i.date_added::timestamptz, i.name, left(i.india_angle, 160),
      case when i.active then 'active' else 'retired' end, 'idea', i.slug
    from public.ideas i where upper(i.region) = case when us then 'US' else 'IN' end;
  elsif p_section = 'startups' then
    return query select s.data_as_of::timestamptz, s.name, left(s.one_liner, 160), s.stage, s.sector, s.slug
    from public.startups s
    where not us or upper(coalesce(s.hq_country,'')) in ('US','USA','UNITED STATES');
  elsif p_section = 'funding' then
    return query select f.announced_on::timestamptz, f.company,
      concat_ws(' · ', case when f.amount_usd_m is not null then '$' || f.amount_usd_m::text || 'M' end, f.sector, f.hq_city),
      f.stage, f.sector, f.slug
    from public.funding_deals f where upper(f.country) = case when us then 'US' else 'IN' end;
  elsif p_section = 'opportunities' then
    return query select coalesce(s.added_at, s.checked_on::timestamptz), s.name,
      concat_ws(' · ', s.org, left(s.summary, 110)), s.status, s.kind, s.slug
    from public.funding_sources s
    where upper(s.country) in (case when us then 'US' else 'IN' end, 'GLOBAL');
  elsif p_section = 'schemes' then
    return query select g.as_of::timestamptz, g.name, concat_ws(' · ', g.ministry, left(g.highlight, 110)), g.status, g.category, g.slug
    from public.gov_schemes g where upper(g.country) = case when us then 'US' else 'IN' end;
  elsif p_section = 'regulations' then
    return query select coalesce(r.as_of, r.enacted_on)::timestamptz, r.name, concat_ws(' · ', r.regulator, left(r.summary, 110)), r.status, r.category, r.slug
    from public.regulations r where upper(r.country) = case when us then 'US' else 'IN' end;
  elsif p_section = 'jobs' then
    return query
      select coalesce(f.as_of::timestamptz, f.refreshed_at), f.role, concat_ws(' · ', f.outlook, f.horizon, f.region), f.outlook, 'Role outlook', f.id::text
        from public.jobs_future f where (f.region in ('United States','Europe and United States')) = us or (us and f.region = 'Global')
      union all
      select coalesce(h.as_of::timestamptz, h.refreshed_at), h.role, concat_ws(' · ', h.signal, h.region), 'hot', 'Hot role', h.id::text
        from public.jobs_hot h where (h.region in ('United States','Europe and United States')) = us or (us and h.region = 'Global')
      union all
      select coalesce(k.as_of::timestamptz, k.refreshed_at), k.skill, concat_ws(' · ', k.category, k.region), k.category, 'Skill', k.id::text
        from public.jobs_skills k where (k.region in ('United States','Europe and United States')) = us or (us and k.region = 'Global');
  elsif p_section = 'changes' then
    return query select c.at, coalesce(c.label, c.row_key, '—'),
      case when c.op = 'deleted' then 'Removed' else (
        select string_agg(e.key || ': ' || coalesce(left(e.value->'from' #>> '{}', 40), '—') || ' → ' || coalesce(left(e.value->'to' #>> '{}', 40), '—'), '; ')
        from (select * from jsonb_each(c.changes) limit 4) e) end,
      c.op, c.section, c.row_key
    from public.change_log c;
  elsif p_section = 'runs' then
    return query
      select r.ran_at, 'Funding deals refresh', concat_ws(' · ', r.deals_added || ' added', r.deals_updated || ' updated', r.summary), 'run', 'funding', null::text from public.funding_refresh_log r
      union all
      select r.ran_at, 'Funding sources refresh', concat_ws(' · ', r.added || ' added', r.updated || ' updated', r.closed || ' closed', r.summary), 'run', 'opportunities', null::text from public.funding_sources_log r
      union all
      select r.ran_at, 'Schemes and regulations refresh', concat_ws(' · ', (coalesce(r.schemes_added,0) + coalesce(r.regs_added,0)) || ' added', (coalesce(r.schemes_updated,0) + coalesce(r.regs_updated,0)) || ' updated', r.summary), 'run', 'policy', null::text from public.policy_refresh_log r
      union all
      select r.ran_at, 'Jobs and skills refresh', concat_ws(' · ', coalesce(r.rows_added,0) || ' added', coalesce(r.rows_updated,0) || ' updated', r.summary), 'run', 'jobs', null::text from public.jobs_refresh_log r;
  end if;
end $$;
revoke all on function public.history_base(text, text) from public, anon, authenticated;

create or replace function public.app_history(
  p_key text, p_section text, p_country text default 'IN', p_q text default null,
  p_since_days int default null, p_limit int default 25, p_offset int default 0) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare q text := nullif(lower(trim(coalesce(p_q, ''))), ''); lim int := greatest(1, least(coalesce(p_limit, 25), 100));
  skip int := greatest(0, coalesce(p_offset, 0)); total int; page_rows jsonb; latest timestamptz;
begin
  if not public.app_key_ok(p_key) then raise exception 'unauthorized' using errcode = '28000'; end if;
  if p_section is null or p_section not in ('ideas','startups','funding','opportunities','schemes','regulations','jobs','changes','runs') then
    return jsonb_build_object('error', 'bad_section');
  end if;
  with b as (
    select h.* from public.history_base(p_section, p_country) h
    where (p_since_days is null or h.d >= now() - make_interval(days => p_since_days))
      and (q is null or position(q in lower(coalesce(h.title,'') || ' ' || coalesce(h.sub,'') || ' ' || coalesce(h.tag,'') || ' ' || coalesce(h.kind,''))) > 0)
  ), pg as (select * from b order by d desc nulls last, title limit lim offset skip)
  select (select count(*) from b), (select max(d) from b),
         coalesce((select jsonb_agg(to_jsonb(pg) order by pg.d desc nulls last, pg.title) from pg), '[]'::jsonb)
    into total, latest, page_rows;
  return jsonb_build_object('section', p_section, 'total', total, 'latest', latest, 'rows', page_rows);
end $$;

-- ───────── Admin tagging ─────────
create or replace function public.app_user_set_role(p_key text, p_id uuid, p_role text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u public.app_users;
begin
  if not public.app_key_ok(p_key) then raise exception 'unauthorized' using errcode = '28000'; end if;
  if p_role is null or p_role not in ('admin','member') then return jsonb_build_object('error','invalid'); end if;
  select * into u from public.app_users where id = p_id;
  if not found then return jsonb_build_object('error','not_found'); end if;
  if u.is_initial then return jsonb_build_object('error','protected'); end if;
  update public.app_users set role = p_role where id = p_id returning * into u;
  return public.app_user_row(u);
end $$;

grant execute on function
  public.app_history(text,text,text,text,int,int,int), public.app_user_set_role(text,uuid,text)
  to anon, authenticated;
