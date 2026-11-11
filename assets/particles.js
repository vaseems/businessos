(function () {
  'use strict';
  var el = document.getElementById('particles');
  if (!el || !window.tsParticles) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var dark = matchMedia('(prefers-color-scheme: dark)').matches;
  var count = parseInt(el.dataset.count || '50', 10);
  window.tsParticles.load('particles', {
    fullScreen: { enable: false },
    fpsLimit: 60,
    detectRetina: true,
    particles: {
      number: { value: window.innerWidth < 760 ? Math.round(count / 2) : count, density: { enable: true, area: 900 } },
      color: { value: dark ? ['#2997ff', '#7d7aff', '#bf5af2'] : ['#0071e3', '#5e5ce6', '#86868b'] },
      opacity: { value: { min: 0.2, max: 0.6 } },
      size: { value: { min: 1, max: 3 } },
      move: { enable: true, speed: 0.45, outModes: { default: 'out' } },
      links: { enable: true, distance: 130, opacity: 0.14, color: dark ? '#9aa4ff' : '#0071e3' }
    },
    interactivity: { events: { onHover: { enable: true, mode: 'grab' } }, modes: { grab: { distance: 150, links: { opacity: 0.35 } } } }
  });
})();
