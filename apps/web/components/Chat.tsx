'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ApiError, askChat, type ChatCard } from '@/lib/api';
import { useApp } from './AppContext';
import { Icon } from './ui';

interface Msg { role: 'user' | 'assistant'; text: string; cards?: ChatCard[]; suggestions?: string[]; error?: boolean }
const KEY = 'gw_chat';
const HELLO: Msg = {
  role: 'assistant',
  text: 'Hi, I can find things across Groundwork for you: ideas, startups, funding rounds, programs to apply to, schemes, regulations, roles and skills. Ask in plain words.',
  suggestions: ['Top ideas right now', 'Funding I can apply to now', 'Latest funding rounds', 'DPDP and data protection rules'],
};
const SEE_ALL = /^see all results for /i;

const load = (): Msg[] => {
  try { const v = JSON.parse(sessionStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v.slice(-30) : []; } catch { return []; }
};
const save = (m: Msg[]) => { try { sessionStorage.setItem(KEY, JSON.stringify(m.slice(-30))); } catch { /* ignore */ } };

/** A chat assistant on every page. It answers from the same data as the pages and links to what it found. */
export default function Chat() {
  const { region } = useApp();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => { setMsgs(load()); }, []);
  useEffect(() => { save(msgs); }, [msgs]);
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight }); }, [msgs, busy, open]);
  useEffect(() => { if (open) setTimeout(() => box.current?.focus(), 30); }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('dialog[open]')) { setOpen(false); btn.current?.focus(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const send = useCallback(async (raw: string) => {
    const message = raw.trim();
    if (!message || busy) return;
    if (SEE_ALL.test(message)) { setOpen(false); router.push(`/search/?q=${encodeURIComponent(message.replace(SEE_ALL, ''))}`); return; }
    const history = msgs.filter((m) => !m.error).slice(-6).map((m) => ({ role: m.role, text: m.text }));
    setMsgs((m) => [...m, { role: 'user', text: message }]);
    setText(''); setBusy(true);
    try {
      const r = await askChat(message, history, pathname || '/', region);
      setMsgs((m) => [...m, { role: 'assistant', text: r.reply, cards: r.cards, suggestions: r.suggestions }]);
    } catch (e) {
      const msg = e instanceof ApiError
        ? e.status === 401 ? 'Your session ended. Sign in again to keep chatting.' : e.status === 429 ? 'That was a lot of questions at once. Wait a moment and ask again.' : e.message
        : 'I could not reach the server. Check your connection and try again.';
      setMsgs((m) => [...m, { role: 'assistant', text: msg, error: true }]);
    } finally { setBusy(false); }
  }, [busy, msgs, pathname, region, router]);

  const submit = (e: FormEvent) => { e.preventDefault(); send(text); };
  const shown = msgs.length ? msgs : [HELLO];
  const last = shown[shown.length - 1];

  return (
    <>
      <button ref={btn} type="button" className={`chat-fab${open ? ' on' : ''}`} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="chat-panel" aria-label={open ? 'Close the assistant' : 'Ask Groundwork'}>
        <Icon name={open ? 'close' : 'chat'} /><span>{open ? 'Close' : 'Ask'}</span>
      </button>
      {open && (
        <section id="chat-panel" className="chat" role="dialog" aria-label="Groundwork assistant">
          <header>
            <span className="chat-t"><Icon name="spark" /> Ask Groundwork</span>
            {!!msgs.length && <button type="button" className="chat-clear" onClick={() => setMsgs([])}>Clear</button>}
            <button type="button" className="iconbtn" onClick={() => { setOpen(false); btn.current?.focus(); }} aria-label="Close"><Icon name="close" /></button>
          </header>
          <div className="chat-list" ref={list} role="log" aria-live="polite" aria-relevant="additions">
            {shown.map((m, i) => (
              <div key={i} className={`cm cm-${m.role}${m.error ? ' err' : ''}`}>
                <p>{m.text}</p>
                {!!m.cards?.length && (
                  <ul className="cm-cards">
                    {m.cards.map((c, j) => (
                      <li key={j}><a href={c.href} onClick={() => setOpen(false)}>
                        <span className="cm-k">{c.label}</span><b>{c.title}</b>{c.sub && <span className="cm-s">{c.sub}</span>}{c.tag && <span className="tag">{c.tag}</span>}
                      </a></li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
            {busy && <div className="cm cm-assistant"><p className="cm-dots" aria-label="Thinking"><i /><i /><i /></p></div>}
          </div>
          {!busy && !!last?.suggestions?.length && (
            <div className="chat-sug">{last.suggestions.map((s) => <button type="button" key={s} onClick={() => send(s)}>{s}</button>)}</div>
          )}
          <form className="chat-in" onSubmit={submit}>
            <textarea ref={box} rows={1} value={text} maxLength={500} placeholder="Ask about ideas, funding, rules…" aria-label="Your question"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(text); } }} />
            <button type="submit" className="chat-send" disabled={busy || !text.trim()} aria-label="Send"><Icon name="send" /></button>
          </form>
          <p className="chat-note">Answers come from Groundwork&apos;s own data. Check the source before you act on them.</p>
        </section>
      )}
    </>
  );
}
