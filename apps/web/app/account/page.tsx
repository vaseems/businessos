'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, changePassword, getUser, type SessionUser } from '@/lib/api';
import Shell from '@/components/Shell';

export default function Account() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setUser(getUser()); }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(''); setDone(false);
    if (next !== again) { setError('The new passwords do not match.'); return; }
    setBusy(true);
    try {
      await changePassword(cur, next);
      setCur(''); setNext(''); setAgain(''); setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401 && /sign in/i.test(err.message)) { router.replace('/login/'); return; }
      setError(err instanceof Error ? err.message : 'Could not change the password.');
    } finally { setBusy(false); }
  };

  return (
    <Shell title="Account">
      <section className="panel uadd">
        <h2 className="sheet-h">{user ? user.name || user.username : 'Account'}</h2>
        {user && <p className="muted small">Signed in as <b>@{user.username}</b> · {user.isInitial ? 'Initial admin' : user.role === 'admin' ? 'Admin' : 'Member'}</p>}
        <h2 className="sheet-h" style={{ marginTop: 22 }}>Change password</h2>
        {error && <p className="notice" role="alert">{error}</p>}
        {done && <p className="notice ok" role="status">Password changed. You are still signed in on this device; other devices must sign in again.</p>}
        <form className="uform acct-form" onSubmit={submit}>
          <label className="field"><input type="password" autoComplete="current-password" placeholder="Current password" aria-label="Current password" required value={cur} onChange={(e) => setCur(e.target.value)} /></label>
          <label className="field"><input type="password" autoComplete="new-password" placeholder="New password (10 characters or more)" aria-label="New password" required minLength={10} maxLength={72} value={next} onChange={(e) => setNext(e.target.value)} /></label>
          <label className="field"><input type="password" autoComplete="new-password" placeholder="Repeat new password" aria-label="Repeat new password" required minLength={10} maxLength={72} value={again} onChange={(e) => setAgain(e.target.value)} /></label>
          <button type="submit" className="btn" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</button>
        </form>
      </section>
    </Shell>
  );
}
