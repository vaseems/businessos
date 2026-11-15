import { Fragment, type ReactNode } from 'react';

/** Wraps each matched word in <mark>. */
export function Marked({ text, tokens }: { text: string; tokens: string[] }): ReactNode {
  const ts = tokens.filter((t) => t.length > 1).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!ts.length || !text) return text;
  const re = new RegExp(`(${ts.join('|')})`, 'ig');
  return text.split(re).map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : <Fragment key={i}>{part}</Fragment>));
}
