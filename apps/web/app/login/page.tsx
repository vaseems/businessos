'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, getToken, login } from '@/lib/api';
import { Particles } from '@/components/Vendor';

export default function Login() {
  const router = useRouter();
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = 'Sign in · Groundwork';
    document.body.classList.add('login');
    if (getToken()) router.replace('/');
    return () => document.body.classList.remove('login');
  }, [router]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { await login(pw); router.replace('/'); }
    catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? 'That password is incorrect.'
        : err instanceof ApiError && err.status === 429 ? 'Too many attempts. Try again in a few minutes.'
        : 'Could not reach the server. Try again in a moment.');
      setBusy(false);
    }
  };

  return (
    <>
      <Particles count={55} />
      <form className="login-card" onSubmit={submit}>
        <img className="login-logo" src="/brand/logo-wordmark.png" alt="Groundwork. Lay the groundwork. Build what’s next." width={300} height={72} />
        {error && <p className="notice" role="alert">{error}</p>}
        <label className="field">
          <input id="password" name="password" type="password" autoComplete="current-password" placeholder="Password" aria-label="Password" autoFocus required value={pw} onChange={(e) => setPw(e.target.value)} />
        </label>
        <button type="submit" className="btn full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <footer className="foot login-foot">&copy; 2026 Gradient Technology Labs LLP. All rights reserved.</footer>
    </>
  );
}
