'use client';
import { useMemo, useState } from 'react';
import { downloadCsv } from '@/lib/api';
import { has, money, num, s, safeUrl } from '@/lib/format';
import { useApi, useApp, useSheetItems, type SheetItem } from '@/components/AppContext';
import Page from '@/components/Page';
import { PreviousResults } from '@/components/History';
import { Icon, SearchField, Seg, SelectField } from '@/components/ui';

export default function Startups() {
  const { rc, region, openSheet } = useApp();
  const isUs = region === 'us';
  const { data, error } = useApi<any>('data');
  const startups: any[] = data?.startups || [];
  const [q, setQ] = useState('');
  const [reg, setReg] = useState('');
  const [sector, setSector] = useState('');
  const [sort, setSort] = useState('funding');

  const sectors = useMemo(() => [...new Set(startups.map((x) => s(x.sector)).filter(Boolean))].sort(), [startups]);

  const items = useMemo<Record<string, SheetItem>>(() => {
    const m: Record<string, SheetItem> = {};
    for (const x of startups) {
      const links = s(x.source_urls).replace(/;/g, ' ').split(/\s+/).map(safeUrl).filter(Boolean);
      const hq = [x.hq_city ? x.hq_city + ', ' : '', s(x.hq_country)].join('').replace(/^[, ]+|[, ]+$/g, '');
      m[x.slug] = {
        slug: x.slug, title: x.name,
        body: (
          <dl className="facts">
            {has(x.one_liner) && <div><dt>What it does</dt><dd>{x.one_liner}</dd></div>}
            {has(x.problem_solved) && <div><dt>Problem</dt><dd>{x.problem_solved}</dd></div>}
            <div><dt>Sector</dt><dd>{s(x.sector)}{has(x.sub_sector) ? ' · ' + x.sub_sector : ''}{has(x.customer_type) ? ' · ' + x.customer_type : ''}</dd></div>
            <div><dt>HQ and founded</dt><dd>{hq}{x.founded_year ? ' · ' + Math.trunc(x.founded_year) : ''}</dd></div>
            {has(x.founders) && <div><dt>Founders</dt><dd>{x.founders}</dd></div>}
            <div><dt>Last round</dt><dd>{money(x.last_round_amount_usd_m)} {s(x.last_round)}{x.last_round_date ? ' · ' + x.last_round_date : ''}{has(x.last_round_investors) && <><br />{x.last_round_investors}</>}</dd></div>
            {x.total_funding_usd_m !== null && x.total_funding_usd_m !== undefined && <div><dt>Total funding</dt><dd>{money(x.total_funding_usd_m)}</dd></div>}
            {x.valuation_usd_m !== null && x.valuation_usd_m !== undefined && <div><dt>Valuation</dt><dd>{money(x.valuation_usd_m)} ({s(x.valuation_basis)})</dd></div>}
            {has(x.traction_metric) && <div><dt>Traction</dt><dd>{num(x.traction_value)} · {x.traction_metric}<br /><span className="muted">{s(x.traction_metric_type)}, as of {s(x.traction_as_of)}</span></dd></div>}
            {has(x.named_clients) && <div><dt>Named clients</dt><dd>{x.named_clients}</dd></div>}
            {has(x.india_gap) && !isUs && <div><dt>India gap</dt><dd>{x.india_gap}</dd></div>}
            {x.copyability !== null && x.copyability !== undefined && <div><dt>Copyability</dt><dd>{Math.trunc(x.copyability)} of 5 <span className="muted">(analyst judgment)</span></dd></div>}
            {has(x.regulatory_dependency) && <div><dt>Regulation</dt><dd>{x.regulatory_dependency}</dd></div>}
            {has(x.key_risks) && <div><dt>Risks</dt><dd>{x.key_risks}</dd></div>}
            {has(x.notes) && <div><dt>Notes</dt><dd>{x.notes}</dd></div>}
            <div><dt>Sources</dt><dd>{links.map((u, k) => <span key={u}><a href={u} target="_blank" rel="noopener noreferrer">Source {k + 1}</a> </span>)}<span className="muted">Checked {s(x.data_as_of)}. Confidence: {s(x.confidence)}.</span></dd></div>
          </dl>
        ),
      };
    }
    return m;
  }, [startups, isUs]);
  useSheetItems(data ? items : null);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = startups.filter((x) => {
      if (term && !([x.name, x.sector, x.sub_sector, x.last_round_investors, x.named_clients, x.one_liner].map(s).join(' ').toLowerCase().includes(term))) return false;
      if (reg && s(x.region) !== reg) return false;
      if (sector && s(x.sector) !== sector) return false;
      return true;
    });
    const numeric = (k: string) => (a: any, b: any) => {
      const x = a[k] === '' || a[k] == null ? null : parseFloat(a[k]);
      const y = b[k] === '' || b[k] == null ? null : parseFloat(b[k]);
      if (x === null && y === null) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      return y - x;
    };
    const cmp = sort === 'funding' ? numeric('last_round_amount_usd_m') : sort === 'valuation' ? numeric('valuation_usd_m')
      : (a: any, b: any) => (s(a.name).toLowerCase() < s(b.name).toLowerCase() ? -1 : s(a.name).toLowerCase() > s(b.name).toLowerCase() ? 1 : 0);
    return [...list].sort(cmp);
  }, [startups, q, reg, sector, sort]);

  return (
    <Page title="Startups" data={data} error={error}>
      {() => (
        <>
          <div className="toolbar">
            <SearchField placeholder="Filter startups" value={q} onChange={setQ} />
            {!isUs && <Seg label="Region" id="regseg" value={reg} onChange={setReg} options={[['', 'All'], ['India', 'India'], ['Global', 'Global']]} />}
            <SelectField id="sector" label="Sector" value={sector} onChange={setSector}>
              <option value="">All sectors</option>
              {sectors.map((x) => <option key={x}>{x}</option>)}
            </SelectField>
            <SelectField id="sortsel" label="Sort by" value={sort} onChange={setSort}>
              <option value="funding">Largest round</option><option value="valuation">Valuation</option><option value="name">Name</option>
            </SelectField>
            <button type="button" className="btn quiet sm" onClick={() => downloadCsv('startups', region)}><Icon name="download" />CSV</button>
          </div>
          <p className="count"><span id="count">{shown.length}</span> startups</p>
          <ul className="tiles" id="list">
            {shown.map((x) => (
              <li className="tile" key={x.slug} data-slug={x.slug}>
                <button type="button" className="tile-btn" onClick={() => openSheet(items[x.slug])}>
                  <span className="tile-top"><b>{x.name}</b><span className="tag">{isUs ? (x.hq_city || 'US') : x.region}</span></span>
                  <span className="tile-sub">{x.one_liner || x.sector}</span>
                  <span className="tile-fig">{money(x.last_round_amount_usd_m)}<small>{x.last_round || 'No round disclosed'}</small></span>
                  <span className="tile-foot"><span>{x.valuation_usd_m !== null && x.valuation_usd_m !== undefined ? money(x.valuation_usd_m) + ' valuation' : 'Valuation not disclosed'}</span><span className={`conf c-${s(x.confidence)}`}><i></i>{s(x.confidence)}</span></span>
                </button>
              </li>
            ))}
          </ul>
          {!!startups.length && !shown.length && <section className="empty" id="none"><h1>No matches</h1><p>Try a different search or clear the filters.</p></section>}
          <PreviousResults section="startups" />
        </>
      )}
    </Page>
  );
}
