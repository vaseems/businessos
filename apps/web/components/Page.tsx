'use client';
import type { ReactNode } from 'react';
import Shell from './Shell';

/** Standard page wrapper: loading and error states around a dataset. */
export default function Page({ title, data, error, stale, refresh, children }: {
  title: string; data: any; error?: string; stale?: boolean; refresh?: () => void; children: () => ReactNode;
}) {
  return (
    <Shell title={title} stale={stale ?? !!data?._stale} refresh={refresh}>
      {data ? children() : error ? (
        <section className="empty"><h1>Data unavailable</h1><p>The data source could not be reached and there is no saved copy yet. Reload in a moment.</p></section>
      ) : <p className="muted">Loading…</p>}
    </Shell>
  );
}
