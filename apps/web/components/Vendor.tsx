'use client';
import { useEffect } from 'react';

const loaded = new Map<string, Promise<void>>();
export function loadScript(src: string): Promise<void> {
  let p = loaded.get(src);
  if (!p) {
    p = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.async = true; s.onload = () => res(); s.onerror = () => rej(new Error('load ' + src));
      document.head.appendChild(s);
    });
    loaded.set(src, p);
  }
  return p;
}

/** The login particle field (tsParticles, same config as before). */
export function Particles({ count = 55 }: { count?: number }) {
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        await loadScript('/vendor/tsparticles.slim.bundle.min.js');
        if (live) await loadScript('/vendor/particles.js');
      } catch { /* decorative */ }
    })();
    return () => {
      live = false;
      try { (window as any).tsParticles?.domItem(0)?.destroy(); } catch { /* ignore */ }
    };
  }, []);
  return <div id="particles" data-count={count} aria-hidden="true" />;
}

/** The overview constellation (three.js, unchanged scene script). */
export function Constellation({ nodes }: { nodes: { n: string; s: number; k: string }[] }) {
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        await loadScript('/vendor/three.min.js');
        if (!live) return;
        // scene.js runs once per load; re-evaluate it for each mount by reloading a fresh copy.
        const s = document.createElement('script');
        s.src = '/vendor/scene.js?t=' + Date.now();
        s.async = true;
        document.head.appendChild(s);
        cleanup = () => s.remove();
      } catch { /* decorative */ }
    })();
    let cleanup = () => {};
    return () => { live = false; cleanup(); };
  }, [nodes]);
  return (
    <>
      <div id="constellation" aria-hidden="true" />
      <div className="tip" id="tip" hidden />
      <script id="constellation-data" type="application/json" dangerouslySetInnerHTML={{ __html: JSON.stringify(nodes).replace(/</g, '\\u003c') }} />
    </>
  );
}
