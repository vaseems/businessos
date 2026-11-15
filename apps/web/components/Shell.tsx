'use client';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clearToken, getToken, getUser, isAdmin, me, type SessionUser } from '@/lib/api';
import { regionGroups, stateSlug } from '@/lib/region';
import { useApi, useApp, type PaletteItem } from './AppContext';
import { Icon, Notice } from './ui';

export default function Shell({ title, children, refresh, stale }: { title: string; children: ReactNode; refresh?: () => void; stale?: boolean }) {
  const { rc, region, setRegion, state, setState, sheet, closeSheet, paletteExtras, ready } = useApp();
  const pathname = usePathname();
  const router = useRouter();
  const [authed, setAuthed] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    if (!getToken()) { router.replace('/login/'); return; }
    setUser(getUser());
    setAuthed(true);
    // Confirm the session is still valid (the account may have been disabled or its password reset).
    let live = true;
    me().then((u) => { if (!live) return; if (u) setUser(u); else router.replace('/login/'); });
    return () => { live = false; };
  }, [router]);
  const admin = isAdmin(user);
  useEffect(() => { document.title = `${title} · Groundwork`; }, [title]);

  const nav: [string, string, string][] = [
    ['/', 'Overview', 'overview'], ['/ideas/', 'Ideas', 'ideas'], ['/startups/', 'Startups', 'startups'], ['/funding/', 'Funding', 'funding'],
    ['/opportunities/', 'Opportunities', 'opps'], ['/directory/', 'Directory', 'directory'], ['/jobs/', 'Jobs', 'jobs'], ['/schemes/', region === 'us' ? 'Programs' : 'Schemes', 'schemes'], ['/regulations/', 'Regulations', 'regs'],
    ...(admin ? [['/users/', 'Users', 'users'] as [string, string, string]] : []),
  ];
  const isActive = (h: string) => (h === '/' ? pathname === '/' : pathname.startsWith(h.replace(/\/$/, '')));
  const active = nav.find(([h]) => isActive(h))?.[0] || '';

  // Keep the current tab visible in the scrollable mobile nav.
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const n = navRef.current, a = n?.querySelector<HTMLElement>('a[aria-current=page]');
    if (a && n && n.scrollWidth > n.clientWidth) n.scrollLeft = a.offsetLeft - (n.clientWidth - a.offsetWidth) / 2;
  }, [pathname, authed]);

  // Bars and histograms animate in as they scroll into view.
  useEffect(() => {
    if (!authed) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const sel = '.rbar i, .track i, .hist i, .sbar i';
    const io = !reduce && 'IntersectionObserver' in window
      ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('go'); io!.unobserve(e.target); } }), { threshold: 0.2 })
      : null;
    const seen = new WeakSet<Element>();
    const scan = () => document.querySelectorAll(sel).forEach((el) => {
      if (seen.has(el)) return;
      seen.add(el);
      if (io) io.observe(el); else el.classList.add('go');
    });
    scan();
    const mo = new MutationObserver(scan);
    const root = document.getElementById('content');
    if (root) mo.observe(root, { childList: true, subtree: true });
    return () => { mo.disconnect(); io?.disconnect(); };
  }, [authed]);

  // Detail sheet dialog
  const sheetRef = useRef<HTMLDialogElement>(null);
  const sbodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const d = sheetRef.current;
    if (!d) return;
    if (sheet && !d.open) d.showModal();
    if (!sheet && d.open) d.close();
    if (sheet && sbodyRef.current) sbodyRef.current.scrollTop = 0;
  }, [sheet]);

  // Command palette
  const palRef = useRef<HTMLDialogElement>(null);
  const pqRef = useRef<HTMLInputElement>(null);
  const [pq, setPq] = useState('');
  const [sel, setSel] = useState(0);
  const dataApi = useApi<any>('data');
  const base: PaletteItem[] = useMemo(() => {
    const items: PaletteItem[] = [
      { k: 'Pages', t: 'Overview', h: '/' }, { k: 'Pages', t: 'Ideas', h: '/ideas/' }, { k: 'Pages', t: 'Startups', h: '/startups/' },
      { k: 'Pages', t: 'Funding', h: '/funding/' }, { k: 'Pages', t: 'Funding opportunities', h: '/opportunities/' }, { k: 'Pages', t: 'Directory of funding sources', h: '/directory/' }, { k: 'Pages', t: 'Jobs and skills', h: '/jobs/' },
      { k: 'Pages', t: region === 'us' ? 'Government programs' : 'Government schemes', h: '/schemes/' }, { k: 'Pages', t: 'Regulations', h: '/regulations/' },
    ];
    if (admin) items.push({ k: 'Pages', t: 'Users', h: '/users/' });
    return items;
  }, [region, admin]);
  const all = useMemo(() => {
    const out = [...base, ...paletteExtras];
    for (const i of dataApi.data?.ideas || []) out.push({ k: 'Ideas', t: String(i.name), s: 'Score ' + Math.trunc(i.score), h: `/ideas/#${i.slug}` });
    for (const s of dataApi.data?.startups || []) out.push({ k: 'Startups', t: String(s.name), s: String(s.sector ?? ''), h: `/startups/#${s.slug}` });
    return out;
  }, [base, paletteExtras, dataApi.data]);
  const shown = useMemo(() => {
    const term = pq.trim().toLowerCase();
    return all.filter((i) => !term || (i.t + ' ' + (i.s || '')).toLowerCase().includes(term)).slice(0, 40);
  }, [all, pq]);

  const openPalette = () => {
    const d = palRef.current;
    if (!d) return;
    if (sheetRef.current?.open) closeSheet();
    setPq(''); setSel(0);
    if (!d.open) d.showModal();
    setTimeout(() => pqRef.current?.focus(), 0);
  };
  const go = (i: number) => {
    const it = shown[i];
    if (!it) return;
    palRef.current?.close();
    const [path, hash] = it.h.split('#');
    if (hash && path === pathname) location.hash = hash; // same page: just open the item
    else if (hash) location.href = it.h; // other page: full load so the item's sheet opens from the URL
    else router.push(it.h);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(INPUT|SELECT|TEXTAREA)$/.test((document.activeElement as HTMLElement)?.tagName || '');
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); }
      else if (e.key === '/' && !typing && !palRef.current?.open) {
        const f = document.getElementById('q') as HTMLInputElement | null;
        e.preventDefault();
        if (f) f.focus(); else openPalette();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });
  useEffect(() => {
    document.querySelector('#pal-list a[aria-selected=true]')?.scrollIntoView({ block: 'nearest' });
  }, [sel, pq]);

  if (!authed) return null;
  const groups = regionGroups(region);
  let lastGroup = '';
  const signOut = () => { clearToken(); router.replace('/login/'); };

  return (
    <>
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true"><defs>
        <linearGradient id="ringgrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#0a84ff" /><stop offset=".55" stopColor="#bf5af2" /><stop offset="1" stopColor="#ff375f" /></linearGradient>
      </defs></svg>
      <div className="shell">
        <aside className="side">
          <Link className="brand" href="/"><img className="logo-mark" src="/brand/mark-96.png" width={28} height={28} alt="" /><span>Groundwork</span></Link>
          <nav className="nav" aria-label="Main" ref={navRef}>
            {nav.map(([href, label, ic]) => (
              <Link key={href} href={href} aria-current={active === href ? 'page' : undefined}><Icon name={ic} /><span>{label}</span></Link>
            ))}
          </nav>
          <div className="signout">
            <Link href="/account/" className="acct" aria-current={pathname.startsWith('/account') ? 'page' : undefined}><Icon name="account" /><span>{user ? user.name || user.username : 'Account'}</span></Link>
            <button type="button" onClick={signOut}><Icon name="out" /><span>Sign out</span></button>
          </div>
        </aside>
        <div className="main">
          <header className="bar">
            <h2 className="crumb">{title}</h2>
            <div className="bar-actions">
              <div className="regsw" role="group" aria-label="Region">
                <button type="button" aria-pressed={region === 'in'} title="India edition" onClick={() => region !== 'in' && setRegion('in')}>India</button>
                <button type="button" aria-pressed={region === 'us'} title="United States edition" onClick={() => region !== 'us' && setRegion('us')}>US</button>
              </div>
              <label className={`statepick${state ? ' on' : ''}`} title={rc.pick}>
                <Icon name="pin" />
                <select id="gstate" aria-label={rc.pick} value={state} onChange={(e) => setState(e.target.value)}>
                  <option value="">{rc.all}</option>
                  {Object.entries(groups).map(([grp, names]) => (
                    <optgroup key={grp} label={grp}>
                      {names.map((n) => <option key={n} value={stateSlug(n)}>{n}</option>)}
                    </optgroup>
                  ))}
                </select>
              </label>
              <button type="button" className="cmd" onClick={openPalette} aria-label="Search or jump to"><Icon name="search" /><span>Search or jump to</span><kbd>⌘K</kbd></button>
              {refresh && <button type="button" className="iconbtn" onClick={refresh} title="Refresh data" aria-label="Refresh data"><Icon name="refresh" /></button>}
            </div>
          </header>
          <main id="content">
            {stale && <Notice>Live data could not be reached. Showing the last saved copy.</Notice>}
            {ready ? children : null}
          </main>
          <footer className="foot">&copy; 2026 Gradient Technology Labs LLP. All rights reserved.</footer>
        </div>
      </div>

      <dialog ref={sheetRef} id="sheet" aria-labelledby="sheet-title" onClose={closeSheet} onClick={(e) => { if (e.target === sheetRef.current) closeSheet(); }}>
        <div className="sheet-card">
          <header><h2 id="sheet-title">{sheet?.title}</h2><button type="button" className="iconbtn" onClick={closeSheet} aria-label="Close"><Icon name="close" /></button></header>
          <div className="sheet-body" id="sheet-body" ref={sbodyRef}>{sheet?.body}</div>
        </div>
      </dialog>

      <dialog ref={palRef} id="palette" aria-label="Search or jump to" onClick={(e) => { if (e.target === palRef.current) palRef.current?.close(); }}>
        <div className="pal-card">
          <div className="pal-input"><Icon name="search" />
            <input id="pal-q" ref={pqRef} type="text" placeholder={rc.palette} autoComplete="off" spellCheck={false} aria-label="Search" value={pq}
              onChange={(e) => { setPq(e.target.value); setSel(0); }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(shown.length - 1, s + 1)); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
                else if (e.key === 'Enter') { e.preventDefault(); go(sel); }
              }} />
          </div>
          <ul id="pal-list" role="listbox">
            {!shown.length && <li className="none">No matches</li>}
            {shown.map((it, idx) => {
              const head = it.k !== lastGroup ? <li className="grp" key={'g' + idx}>{it.k}</li> : null;
              lastGroup = it.k;
              return [head,
                <li key={idx}>
                  <a href={it.h} data-i={idx} role="option" aria-selected={idx === sel}
                    onMouseMove={() => idx !== sel && setSel(idx)}
                    onClick={(e) => { e.preventDefault(); go(idx); }}>
                    <b style={{ fontWeight: 550 }}>{it.t}</b><span>{it.s || ''}</span>
                  </a>
                </li>];
            })}
          </ul>
          <div className="pal-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>↵</kbd> open</span><span><kbd>esc</kbd> close</span></div>
        </div>
      </dialog>
    </>
  );
}
