-- Markets: end-of-day prices for indices, stocks and macro series, IPOs, trading holidays, and per-user watchlists.
-- Data is written only by the scheduled ingest job through app_market_ingest (its own token). The app reads through app_market_*.

create table if not exists public.market_quotes (
  region text not null check (region in ('in','us')),
  kind text not null check (kind in ('index','stock','macro')),
  symbol text not null,
  trade_date date not null,
  name text,
  open numeric, high numeric, low numeric,
  close numeric not null,
  prev_close numeric,
  volume numeric,
  turnover numeric,                       -- rupees crore (in) or dollars million (us)
  extra jsonb not null default '{}'::jsonb,
  primary key (region, kind, symbol, trade_date)
);
create index if not exists market_quotes_day_idx on public.market_quotes (region, kind, trade_date desc);

create table if not exists public.market_universe (
  region text not null check (region in ('in','us')),
  kind text not null check (kind in ('index','stock','macro')),
  symbol text not null,
  name text not null,
  industry text,
  category text,
  isin text,
  groups text[] not null default '{}',     -- headline, sector, nifty500, startup, macro
  sort int not null default 1000,
  primary key (region, kind, symbol)
);

create table if not exists public.market_ipos (
  region text not null check (region in ('in','us')),
  symbol text not null,
  name text not null,
  segment text,                            -- Mainboard or SME
  status text not null check (status in ('open','upcoming','listed')),
  open_date date not null,
  close_date date,
  listing_date date,
  price_low numeric, price_high numeric,
  issue_price numeric,
  issue_size numeric,
  updated_at timestamptz not null default now(),
  primary key (region, symbol, open_date)
);

create table if not exists public.market_calendar (
  region text not null check (region in ('in','us')),
  day date not null,
  description text,
  primary key (region, day)
);

create table if not exists public.market_refresh_log (
  id bigint generated always as identity primary key,
  region text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz not null default now(),
  ok boolean not null,
  trade_date date,
  counts jsonb not null default '{}'::jsonb,
  note text
);
create index if not exists market_refresh_log_idx on public.market_refresh_log (region, finished_at desc);

create table if not exists public.market_watchlist (
  user_id uuid not null references public.app_users(id) on delete cascade,
  region text not null check (region in ('in','us')),
  symbol text not null,
  added_at timestamptz not null default now(),
  primary key (user_id, region, symbol)
);

create table if not exists public.market_ingest_key (
  id boolean primary key default true check (id),
  key_hash text not null
);

alter table public.market_quotes enable row level security;
alter table public.market_universe enable row level security;
alter table public.market_ipos enable row level security;
alter table public.market_calendar enable row level security;
alter table public.market_refresh_log enable row level security;
alter table public.market_watchlist enable row level security;
alter table public.market_ingest_key enable row level security;
revoke all on public.market_quotes, public.market_universe, public.market_ipos, public.market_calendar,
  public.market_refresh_log, public.market_watchlist, public.market_ingest_key from anon, authenticated;

-- ───────── internal helpers (not callable from the API) ─────────

create or replace function public.market_ingest_ok(p_token text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_token is not null and length(p_token) >= 24 and exists (
    select 1 from public.market_ingest_key k
    where k.key_hash = encode(sha256(convert_to(p_token,'UTF8')),'hex'));
$$;

-- Latest quote, short series and period changes for a group of instruments.
create or replace function public.market_items(p_region text, p_kind text, p_group text, p_days int) returns jsonb
language sql stable security definer set search_path = '' as $$
  with u as (
    select symbol, name, sort, category, industry from public.market_universe
    where region = p_region and kind = p_kind and p_group = any(groups)
  ), last as (
    select distinct on (q.symbol) q.symbol, q.trade_date, q.high, q.low, q.close, q.prev_close, q.volume, q.turnover, q.extra
    from public.market_quotes q join u on u.symbol = q.symbol
    where q.region = p_region and q.kind = p_kind
    order by q.symbol, q.trade_date desc
  ), series as (
    select q.symbol, array_agg(q.trade_date order by q.trade_date) d, array_agg(q.close order by q.trade_date) c
    from public.market_quotes q join last l on l.symbol = q.symbol
    where q.region = p_region and q.kind = p_kind and p_days > 0 and q.trade_date > l.trade_date - p_days
    group by q.symbol
  ), chg as (
    select l.symbol, jsonb_object_agg(per.k, round((l.close / nullif(b.close,0) - 1) * 100, 2)) filter (where b.close is not null) as c
    from last l cross join (values ('1w',7),('1m',30),('3m',91),('6m',182),('1y',365)) per(k,n)
    left join lateral (
      select q.close from public.market_quotes q
      where q.region = p_region and q.kind = p_kind and q.symbol = l.symbol and q.trade_date <= l.trade_date - per.n
      order by q.trade_date desc limit 1) b on true
    group by l.symbol
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'symbol', u.symbol, 'name', u.name, 'category', u.category, 'industry', u.industry, 'date', l.trade_date,
    'close', l.close, 'prev', l.prev_close, 'high', l.high, 'low', l.low, 'volume', l.volume, 'turnover', l.turnover,
    'changePct', round((l.close / nullif(l.prev_close,0) - 1) * 100, 2),
    'chg', coalesce(c.c, '{}'::jsonb), 'extra', l.extra,
    'd', coalesce(to_jsonb(s.d), '[]'::jsonb), 'c', coalesce(to_jsonb(s.c), '[]'::jsonb)
  ) order by u.sort, u.symbol), '[]'::jsonb)
  from u join last l on l.symbol = u.symbol left join series s on s.symbol = u.symbol left join chg c on c.symbol = u.symbol;
$$;

create or replace function public.market_movers(p_region text, p_universe text, p_limit int) returns jsonb
language sql stable security definer set search_path = '' as $$
  with d as (select max(trade_date) as d from public.market_quotes where region = p_region and kind = 'stock'),
  base as (
    select q.symbol, coalesce(u.name, q.name, q.symbol) as name, u.industry, q.close, q.prev_close, q.volume, q.turnover,
           round((q.close / q.prev_close - 1) * 100, 2) as pct
    from public.market_quotes q join d on q.trade_date = d.d
    left join public.market_universe u on u.region = q.region and u.kind = 'stock' and u.symbol = q.symbol
    where q.region = p_region and q.kind = 'stock' and q.prev_close > 0 and q.close > 0
      and (case when p_universe = 'nifty500' then 'nifty500' = any(coalesce(u.groups, '{}'))
                else coalesce(q.turnover, 0) >= (case p_region when 'in' then 2 else 5 end) end)
  )
  select jsonb_build_object(
    'date', (select d from d), 'universe', p_universe, 'count', (select count(*) from base),
    'advancers', (select count(*) from base where pct > 0), 'decliners', (select count(*) from base where pct < 0),
    'gainers', coalesce((select jsonb_agg(jsonb_build_object('symbol',symbol,'name',name,'industry',industry,'close',close,'prev',prev_close,'changePct',pct,'volume',volume,'turnover',turnover) order by pct desc, turnover desc nulls last)
                         from (select * from base where pct > 0 order by pct desc, turnover desc nulls last limit p_limit) g), '[]'::jsonb),
    'losers',  coalesce((select jsonb_agg(jsonb_build_object('symbol',symbol,'name',name,'industry',industry,'close',close,'prev',prev_close,'changePct',pct,'volume',volume,'turnover',turnover) order by pct asc, turnover desc nulls last)
                         from (select * from base where pct < 0 order by pct asc, turnover desc nulls last limit p_limit) l), '[]'::jsonb)
  );
$$;

revoke all on function public.market_ingest_ok(text), public.market_items(text,text,text,int), public.market_movers(text,text,int) from public, anon, authenticated;

-- ───────── API-facing RPCs ─────────

create or replace function public.app_market_overview(p_key text, p_region text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare asof date; stocks_asof date; run jsonb; ipos jsonb; hol jsonb;
begin
  if not public.app_key_ok(p_key) then raise exception 'unauthorized' using errcode = '28000'; end if;
  if p_region not in ('in','us') then raise exception 'bad region' using errcode = '22023'; end if;
  select max(trade_date) into asof from public.market_quotes where region = p_region and kind = 'index';
  select max(trade_date) into stocks_asof from public.market_quotes where region = p_region and kind = 'stock';
  if asof is null then return jsonb_build_object('region', p_region, 'empty', true); end if;

  select to_jsonb(r) into run from (
    select finished_at, ok, trade_date, note from public.market_refresh_log
    where region = p_region and ok order by finished_at desc limit 1) r;

  select jsonb_build_object(
    'open', coalesce((select jsonb_agg(to_jsonb(i) order by i.close_date, i.name) from (
        select symbol, name, segment, open_date, close_date, price_low, price_high, issue_size from public.market_ipos
        where region = p_region and status = 'open' and (close_date is null or close_date >= asof)) i), '[]'::jsonb),
    'upcoming', coalesce((select jsonb_agg(to_jsonb(i) order by i.open_date, i.name) from (
        select symbol, name, segment, open_date, close_date, price_low, price_high, issue_size from public.market_ipos
        where region = p_region and status = 'upcoming' and open_date >= asof - 1) i), '[]'::jsonb),
    'listed', coalesce((select jsonb_agg(to_jsonb(i) order by i.listing_date desc, i.name) from (
        select p.symbol, p.name, p.segment, p.open_date, p.close_date, p.listing_date, p.price_low, p.price_high, p.issue_price,
               lq.close as listing_close, nq.close as last_close, nq.trade_date as last_date,
               round((lq.close / nullif(p.issue_price,0) - 1) * 100, 2) as listing_gain_pct,
               round((nq.close / nullif(p.issue_price,0) - 1) * 100, 2) as gain_pct
        from public.market_ipos p
        left join lateral (select close from public.market_quotes q where q.region = p.region and q.kind = 'stock' and q.symbol = p.symbol and q.trade_date = p.listing_date) lq on true
        left join lateral (select close, trade_date from public.market_quotes q where q.region = p.region and q.kind = 'stock' and q.symbol = p.symbol order by q.trade_date desc limit 1) nq on true
        where p.region = p_region and p.status = 'listed' and p.listing_date >= asof - 120
        order by p.listing_date desc, p.name limit 40) i), '[]'::jsonb)
  ) into ipos;

  select coalesce(jsonb_agg(jsonb_build_object('day', day, 'description', description) order by day), '[]'::jsonb) into hol
  from public.market_calendar where region = p_region and day >= current_date - 1 and day <= current_date + 120;

  return jsonb_build_object(
    'region', p_region, 'asOf', asof, 'stocksAsOf', stocks_asof, 'run', run,
    'indices', public.market_items(p_region, 'index', 'headline', 366),
    'sectors', public.market_items(p_region, 'index', 'sector', 0),
    'movers', public.market_movers(p_region, 'nifty500', 10),
    'startups', public.market_items(p_region, 'stock', 'startup', 100),
    'macro', public.market_items(p_region, 'macro', 'macro', 40),
    'ipos', ipos, 'holidays', hol);
end $$;

create or replace function public.app_market_movers(p_key text, p_region text, p_universe text, p_limit int default 10) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.app_key_ok(p_key) then raise exception 'unauthorized' using errcode = '28000'; end if;
  if p_region not in ('in','us') or p_universe not in ('nifty500','all') then raise exception 'bad arguments' using errcode = '22023'; end if;
  return public.market_movers(p_region, p_universe, greatest(1, least(coalesce(p_limit, 10), 50)));
end $$;

create or replace function public.app_market_search(p_key text, p_region text, p_q text, p_limit int default 8) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare q text := lower(btrim(coalesce(p_q, ''))); res jsonb;
begin
  if not public.app_key_ok(p_key) then raise exception 'unauthorized' using errcode = '28000'; end if;
  if length(q) < 1 then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.rank, r.symbol), '[]'::jsonb) into res from (
    select u.symbol, u.name, u.industry, l.close, l.trade_date as date,
           round((l.close / nullif(l.prev_close,0) - 1) * 100, 2) as change_pct,
           case when lower(u.symbol) = q then 0 when lower(u.symbol) like q || '%' then 1 when lower(u.name) like q || '%' then 2 else 3 end as rank
    from public.market_universe u
    left join lateral (select close, prev_close, trade_date from public.market_quotes x where x.region = u.region and x.kind = 'stock' and x.symbol = u.symbol order by x.trade_date desc limit 1) l on true
    where u.region = p_region and u.kind = 'stock'
      and (lower(u.symbol) like q || '%' or lower(u.name) like '%' || q || '%')
    order by rank, u.symbol limit greatest(1, least(coalesce(p_limit, 8), 25))) r;
  return res;
end $$;

create or replace function public.app_market_watch_get(p_key text, p_user uuid, p_region text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare res jsonb;
begin
  if not public.app_key_ok(p_key) then raise exception 'unauthorized' using errcode = '28000'; end if;
  select coalesce(jsonb_agg(item order by w.added_at desc), '[]'::jsonb) into res
  from public.market_watchlist w
  left join public.market_universe u on u.region = w.region and u.kind = 'stock' and u.symbol = w.symbol
  left join lateral (select close, prev_close, high, low, volume, turnover, trade_date from public.market_quotes q
                     where q.region = w.region and q.kind = 'stock' and q.symbol = w.symbol order by q.trade_date desc limit 1) l on true
  left join lateral (select to_jsonb(array_agg(c order by dd)) as c, to_jsonb(array_agg(dd order by dd)) as d from (
                       select q.close as c, q.trade_date as dd from public.market_quotes q
                       where q.region = w.region and q.kind = 'stock' and q.symbol = w.symbol and q.trade_date > coalesce(l.trade_date, current_date) - 100) z) s on true
  cross join lateral (select jsonb_build_object(
      'symbol', w.symbol, 'name', coalesce(u.name, w.symbol), 'industry', u.industry, 'addedAt', w.added_at, 'date', l.trade_date,
      'close', l.close, 'prev', l.prev_close, 'high', l.high, 'low', l.low, 'volume', l.volume, 'turnover', l.turnover,
      'changePct', round((l.close / nullif(l.prev_close,0) - 1) * 100, 2),
      'd', coalesce(s.d, '[]'::jsonb), 'c', coalesce(s.c, '[]'::jsonb)) as item) it
  where w.user_id = p_user and w.region = p_region;
  return res;
end $$;

create or replace function public.app_market_watch_add(p_key text, p_user uuid, p_region text, p_symbol text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare sym text := upper(btrim(coalesce(p_symbol, '')));
begin
  if not public.app_key_ok(p_key) then raise exception 'unauthorized' using errcode = '28000'; end if;
  if p_region not in ('in','us') then raise exception 'bad region' using errcode = '22023'; end if;
  if not exists (select 1 from public.market_universe where region = p_region and kind = 'stock' and symbol = sym) then
    return jsonb_build_object('error', 'unknown_symbol');
  end if;
  if exists (select 1 from public.market_watchlist where user_id = p_user and region = p_region and symbol = sym) then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  if (select count(*) from public.market_watchlist where user_id = p_user and region = p_region) >= 50 then
    return jsonb_build_object('error', 'limit');
  end if;
  insert into public.market_watchlist (user_id, region, symbol) values (p_user, p_region, sym);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.app_market_watch_remove(p_key text, p_user uuid, p_region text, p_symbol text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.app_key_ok(p_key) then raise exception 'unauthorized' using errcode = '28000'; end if;
  delete from public.market_watchlist where user_id = p_user and region = p_region and symbol = upper(btrim(coalesce(p_symbol, '')));
  return jsonb_build_object('ok', true);
end $$;

-- ───────── ingest (called by the scheduled job with its own token) ─────────

create or replace function public.app_market_ingest_tracked(p_token text, p_region text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.market_ingest_ok(p_token) then raise exception 'unauthorized' using errcode = '28000'; end if;
  return coalesce((select jsonb_agg(distinct symbol) from public.market_watchlist where region = p_region), '[]'::jsonb);
end $$;

create or replace function public.app_market_ingest(p_token text, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r text := p->>'region'; n_q int := 0; n_u int := 0; n_i int := 0; n_c int := 0; n_p int := 0; pr date;
begin
  if not public.market_ingest_ok(p_token) then raise exception 'unauthorized' using errcode = '28000'; end if;
  if r not in ('in','us') then raise exception 'bad region' using errcode = '22023'; end if;

  if coalesce((p->>'universe_replace')::boolean, false) then
    delete from public.market_universe where region = r;
  end if;
  if p ? 'universe' then
    insert into public.market_universe (region, kind, symbol, name, industry, category, isin, groups, sort)
    select r, x.kind, x.symbol, x.name, x.industry, x.category, x.isin,
           coalesce(array(select jsonb_array_elements_text(x.groups)), '{}'), coalesce(x.sort, 1000)
    from jsonb_to_recordset(p->'universe') as x(kind text, symbol text, name text, industry text, category text, isin text, groups jsonb, sort int)
    on conflict (region, kind, symbol) do update set name = excluded.name, industry = excluded.industry, category = excluded.category,
      isin = excluded.isin, groups = excluded.groups, sort = excluded.sort;
    get diagnostics n_u = row_count;
  end if;

  if p ? 'quotes' then
    insert into public.market_quotes (region, kind, symbol, trade_date, name, open, high, low, close, prev_close, volume, turnover, extra)
    select r, x.kind, x.symbol, x.trade_date, x.name, x.open, x.high, x.low, x.close, x.prev_close, x.volume, x.turnover, coalesce(x.extra, '{}'::jsonb)
    from jsonb_to_recordset(p->'quotes') as x(kind text, symbol text, trade_date date, name text, open numeric, high numeric, low numeric,
                                              close numeric, prev_close numeric, volume numeric, turnover numeric, extra jsonb)
    where x.close is not null and x.close > 0
    on conflict (region, kind, symbol, trade_date) do update set name = excluded.name, open = excluded.open, high = excluded.high, low = excluded.low,
      close = excluded.close, prev_close = excluded.prev_close, volume = excluded.volume, turnover = excluded.turnover, extra = excluded.extra;
    get diagnostics n_q = row_count;
  end if;

  if p ? 'ipos' then
    insert into public.market_ipos (region, symbol, name, segment, status, open_date, close_date, listing_date, price_low, price_high, issue_price, issue_size, updated_at)
    select r, x.symbol, x.name, x.segment, x.status, x.open_date, x.close_date, x.listing_date, x.price_low, x.price_high, x.issue_price, x.issue_size, now()
    from jsonb_to_recordset(p->'ipos') as x(symbol text, name text, segment text, status text, open_date date, close_date date, listing_date date,
                                           price_low numeric, price_high numeric, issue_price numeric, issue_size numeric)
    where x.open_date is not null and x.status in ('open','upcoming','listed')
    on conflict (region, symbol, open_date) do update set name = excluded.name, segment = excluded.segment, status = excluded.status,
      close_date = excluded.close_date, listing_date = excluded.listing_date, price_low = excluded.price_low, price_high = excluded.price_high,
      issue_price = excluded.issue_price, issue_size = excluded.issue_size, updated_at = now();
    get diagnostics n_i = row_count;
    -- an issue that moved on (open → listed) must not stay behind under an older status
    delete from public.market_ipos o where o.region = r and o.status in ('open','upcoming')
      and exists (select 1 from jsonb_to_recordset(p->'ipos') as x(symbol text, open_date date, status text)
                  where x.symbol = o.symbol and x.status = 'listed');
  end if;

  if p ? 'calendar' then
    insert into public.market_calendar (region, day, description)
    select r, x.day, x.description from jsonb_to_recordset(p->'calendar') as x(day date, description text)
    on conflict (region, day) do update set description = excluded.description;
    get diagnostics n_c = row_count;
  end if;

  if p ? 'prune' then
    pr := (p->'prune'->>'all_before')::date;
    if pr is not null then delete from public.market_quotes where region = r and kind = 'stock' and trade_date < pr; end if;
    pr := (p->'prune'->>'untracked_before')::date;
    if pr is not null then
      delete from public.market_quotes q where q.region = r and q.kind = 'stock' and q.trade_date < pr
        and not exists (select 1 from public.market_universe u where u.region = q.region and u.kind = 'stock' and u.symbol = q.symbol and (u.groups && array['nifty500','startup']))
        and not exists (select 1 from public.market_watchlist w where w.region = q.region and w.symbol = q.symbol)
        and not exists (select 1 from public.market_ipos i where i.region = q.region and i.symbol = q.symbol and i.listing_date >= pr - 150);
      get diagnostics n_p = row_count;
    end if;
  end if;

  if p ? 'log' then
    insert into public.market_refresh_log (region, started_at, finished_at, ok, trade_date, counts, note)
    values (r, coalesce((p->'log'->>'started_at')::timestamptz, now()), now(), coalesce((p->'log'->>'ok')::boolean, true),
            (p->'log'->>'trade_date')::date, coalesce(p->'log'->'counts', '{}'::jsonb), left(p->'log'->>'note', 500));
  end if;

  return jsonb_build_object('quotes', n_q, 'universe', n_u, 'ipos', n_i, 'calendar', n_c, 'pruned', n_p);
end $$;

grant execute on function public.app_market_overview(text,text), public.app_market_movers(text,text,text,int), public.app_market_search(text,text,text,int),
  public.app_market_watch_get(text,uuid,text), public.app_market_watch_add(text,uuid,text,text), public.app_market_watch_remove(text,uuid,text,text),
  public.app_market_ingest_tracked(text,text), public.app_market_ingest(text,jsonb) to anon, authenticated;
