'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, isAdmin, me, send, type UserRow } from '@/lib/api';
import { dFull } from '@/lib/format';
import { md5 } from '@/lib/md5';
import { monogram } from '@/lib/opps';
import Shell from '@/components/Shell';

interface Cred { username: string; tempPassword: string; kind: 'created' | 'reset' }

export default function Users() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState('');
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState('');
  const [cred, setCred] = useState<Cred | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState<{ id: string; action: 'reset' | 'delete' } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const fail = useCallback((e: unknown) => {
    if (e instanceof ApiError && e.status === 401) { router.replace('/login/'); return; }
    if (e instanceof ApiError && e.status === 403) { setAllowed(false); return; }
    setError(e instanceof Error ? e.message : 'Something went wrong');
  }, [router]);

  const load = useCallback(async () => {
    try { setUsers((await send<{ users: UserRow[] }>('GET', '/users')).users); setError(''); } catch (e) { fail(e); }
  }, [fail]);

  useEffect(() => {
    let live = true;
    me().then((u) => {
      if (!live) return;
      if (!u) { router.replace('/login/'); return; }
      const ok = isAdmin(u);
      setAllowed(ok);
      if (ok) load();
    });
    return () => { live = false; };
  }, [router, load]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const arm = (id: string, action: 'reset' | 'delete') => {
    setConfirm({ id, action });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setConfirm(null), 5000);
  };

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setBusy('add'); setError(''); setCred(null);
    try {
      const r = await send<{ user: UserRow; tempPassword: string }>('POST', '/users', { username, name });
      setCred({ username: r.user.username, tempPassword: r.tempPassword, kind: 'created' });
      setUsername(''); setName('');
      await load();
    } catch (err) { fail(err); } finally { setBusy(''); }
  };

  const act = async (u: UserRow, what: 'reset' | 'toggle' | 'delete') => {
    setBusy(u.id); setError(''); setConfirm(null);
    try {
      if (what === 'reset') {
        const r = await send<{ tempPassword: string }>('POST', `/users/${u.id}/reset-password`);
        setCred({ username: u.username, tempPassword: r.tempPassword, kind: 'reset' });
      } else if (what === 'toggle') {
        await send('PATCH', `/users/${u.id}`, { active: !u.active });
      } else {
        await send('DELETE', `/users/${u.id}`);
        setCred((c) => (c && c.username === u.username ? null : c));
      }
      await load();
    } catch (err) { fail(err); } finally { setBusy(''); }
  };

  const copy = async () => {
    if (!cred) return;
    try {
      await navigator.clipboard.writeText(`Username: ${cred.username}\nTemporary password: ${cred.tempPassword}`);
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    } catch { /* the details are on screen to copy by hand */ }
  };

  return (
    <Shell title="Users">
      {allowed === null ? <p className="muted">Loading…</p> : !allowed ? (
        <section className="empty"><h1>Administrators only</h1><p>Only the initial administrator can manage users.</p></section>
      ) : (
        <>
          <section className="panel uadd">
            <h2 className="sheet-h">Add a user</h2>
            <p className="muted small">Choose a username and, if you like, a name. You get a one-time temporary password to pass on. They can change it under Account after signing in.</p>
            <form className="uform" onSubmit={add}>
              <label className="field"><input type="text" placeholder="Username (e.g. priya)" aria-label="Username" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off" required minLength={3} maxLength={32} pattern="[A-Za-z0-9][A-Za-z0-9._\-]{2,31}" title="3 to 32 characters: letters, numbers, dot, dash or underscore" value={username} onChange={(e) => setUsername(e.target.value)} /></label>
              <label className="field"><input type="text" placeholder="Name (optional)" aria-label="Name" autoComplete="off" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></label>
              <button type="submit" className="btn" disabled={busy === 'add'}>{busy === 'add' ? 'Adding…' : 'Add user'}</button>
            </form>
          </section>

          {error && <p className="notice" role="alert">{error}</p>}

          {cred && (
            <section className="panel ucred" role="status" aria-live="polite">
              <h2 className="sheet-h">{cred.kind === 'created' ? 'User added' : 'Password reset'}</h2>
              <p className="muted small">Share these details with {cred.username} now. The password is shown only once and cannot be looked up later.</p>
              <dl className="ucred-box">
                <div><dt>Username</dt><dd>{cred.username}</dd></div>
                <div><dt>Temporary password</dt><dd><code>{cred.tempPassword}</code></dd></div>
              </dl>
              <div className="ucred-actions">
                <button type="button" className="btn sm" onClick={copy}>{copied ? 'Copied' : 'Copy details'}</button>
                <button type="button" className="btn quiet sm" onClick={() => setCred(null)}>Done</button>
              </div>
            </section>
          )}

          <p className="count"><span>{users.length}</span> {users.length === 1 ? 'user' : 'users'}</p>
          <ul className="rows ulist">
            {users.map((u) => {
              const off = busy === u.id;
              return (
                <li className={`urow${u.active ? '' : ' off'}`} key={u.id}>
                  <span className={`rkb cat-${md5(u.username).charAt(0)}`} aria-hidden="true">{monogram(u.name || u.username)}</span>
                  <span className="uid">
                    <b>{u.name || u.username}</b>
                    <span className="muted small">@{u.username} · {u.last_login_at ? 'Last sign-in ' + dFull(u.last_login_at) : 'Never signed in'}</span>
                  </span>
                  <span className="ubadges">
                    {u.is_initial && <span className="st st-o-upcoming">Administrator</span>}
                    <span className={`st ${u.active ? 'st-o-rolling' : 'st-o-closed'}`}>{u.active ? 'Active' : 'Disabled'}</span>
                  </span>
                  <span className="uactions">
                    {u.is_initial ? <span className="muted small">Cannot be changed here</span> : (
                      <>
                        <button type="button" className="btn quiet sm" disabled={off} onClick={() => (confirm?.id === u.id && confirm.action === 'reset' ? act(u, 'reset') : arm(u.id, 'reset'))}>
                          {confirm?.id === u.id && confirm.action === 'reset' ? 'Confirm reset' : 'Reset password'}
                        </button>
                        <button type="button" className="btn quiet sm" disabled={off} onClick={() => act(u, 'toggle')}>{u.active ? 'Disable' : 'Enable'}</button>
                        <button type="button" className="btn quiet sm danger" disabled={off} onClick={() => (confirm?.id === u.id && confirm.action === 'delete' ? act(u, 'delete') : arm(u.id, 'delete'))}>
                          {confirm?.id === u.id && confirm.action === 'delete' ? 'Confirm delete' : 'Delete'}
                        </button>
                      </>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="muted small jnote">Disabling a user or resetting their password signs them out. A disabled user can be enabled again; a deleted user cannot be recovered. Everyone you add can view the dashboard, but only you can manage users.</p>
        </>
      )}
    </Shell>
  );
}
