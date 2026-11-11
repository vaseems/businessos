(function () {
  'use strict';
  var host = document.getElementById('constellation'), tip = document.getElementById('tip'), dataEl = document.getElementById('constellation-data');
  if (!host || !dataEl || !window.THREE) return;
  var nodes; try { nodes = JSON.parse(dataEl.textContent); } catch (e) { return; }
  if (!nodes || !nodes.length) return;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var dark = matchMedia('(prefers-color-scheme: dark)').matches;
  var renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' }); } catch (e) { return; }
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr); renderer.setClearColor(0x000000, 0);
  host.appendChild(renderer.domElement);

  var scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(40, 1, 0.1, 60), group = new THREE.Group();
  scene.add(group);
  var cs = getComputedStyle(document.documentElement);
  function css(n, f) { var v = cs.getPropertyValue(n).trim(); return new THREE.Color(/^#/.test(v) ? v : f); }
  var cA = css('--accent', '#0071e3'), cB = css('--accent2', '#5e5ce6');

  function material(alpha) {
    return new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { px: { value: 400 }, alpha: { value: alpha } },
      vertexShader: 'attribute float size;attribute vec3 col;varying vec3 vC;uniform float px;void main(){vC=col;vec4 mv=modelViewMatrix*vec4(position,1.0);gl_PointSize=size*px/(-mv.z);gl_Position=projectionMatrix*mv;}',
      fragmentShader: 'varying vec3 vC;uniform float alpha;void main(){float d=length(gl_PointCoord-vec2(0.5));if(d>0.5)discard;float a=smoothstep(0.5,0.1,d);gl_FragColor=vec4(vC,a*alpha);}'
    });
  }
  function points(pos, size, col, alpha) {
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('size', new THREE.BufferAttribute(size, 1));
    g.setAttribute('col', new THREE.BufferAttribute(col, 3));
    var p = new THREE.Points(g, material(alpha)); group.add(p); return p;
  }

  // Idea nodes on a Fibonacci sphere; size and colour follow score.
  var n = nodes.length, R = 3, gold = Math.PI * (3 - Math.sqrt(5));
  var pos = new Float32Array(n * 3), size = new Float32Array(n), base = new Float32Array(n), col = new Float32Array(n * 3), vecs = [];
  nodes.forEach(function (nd, i) {
    var y = n > 1 ? 1 - (i / (n - 1)) * 2 : 0, r = Math.sqrt(Math.max(0, 1 - y * y)), th = gold * i;
    var v = new THREE.Vector3(Math.cos(th) * r * R, y * R, Math.sin(th) * r * R); vecs.push(v);
    pos.set([v.x, v.y, v.z], i * 3);
    var k = Math.max(0, Math.min(1, (nd.s - 40) / 55));
    base[i] = size[i] = 0.14 + k * 0.34;
    var c = cB.clone().lerp(cA, k); col.set([c.r, c.g, c.b], i * 3);
  });
  var idea = points(pos, size, col, 0.95);

  // Faint dust shell for depth.
  var dn = window.innerWidth < 760 ? 110 : 220, dp = new Float32Array(dn * 3), ds = new Float32Array(dn), dc = new Float32Array(dn * 3);
  var dcol = new THREE.Color(dark ? 0x8d93a8 : 0x9a9aa5);
  for (var j = 0; j < dn; j++) {
    var u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, rr = 3.7 + Math.random() * 1.9, s = Math.sqrt(1 - u * u);
    dp.set([Math.cos(a) * s * rr, u * rr, Math.sin(a) * s * rr], j * 3);
    ds[j] = 0.04 + Math.random() * 0.07; dc.set([dcol.r, dcol.g, dcol.b], j * 3);
  }
  var dust = points(dp, ds, dc, dark ? 0.55 : 0.5);

  // Connect the strongest ideas to their nearest neighbours.
  var seg = [], top = Math.min(10, n);
  for (var a1 = 0; a1 < top; a1++) {
    var near = vecs.map(function (v, k2) { return { k: k2, d: v.distanceTo(vecs[a1]) }; }).filter(function (o) { return o.k !== a1; }).sort(function (x, y) { return x.d - y.d; }).slice(0, 2);
    near.forEach(function (o) { seg.push(vecs[a1].x, vecs[a1].y, vecs[a1].z, vecs[o.k].x, vecs[o.k].y, vecs[o.k].z); });
  }
  if (seg.length) {
    var lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
    group.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: cA, transparent: true, opacity: dark ? 0.2 : 0.26 })));
  }

  var W = 1, H = 1;
  function resize() {
    W = host.clientWidth || 1; H = host.clientHeight || 1;
    renderer.setSize(W, H, false);
    camera.aspect = W / H; camera.position.set(0, 0, W / H < 1 ? 12.5 : 9.5); camera.updateProjectionMatrix();
    var px = H * dpr * 1.374;
    [idea, dust].forEach(function (p) { p.material.uniforms.px.value = px; });
    draw();
  }
  var px0 = 0, py0 = 0, spin = 0.6, hover = -1;
  function draw() {
    group.rotation.y = spin + px0 * 0.35;
    group.rotation.x = py0 * 0.2 + 0.18;
    renderer.render(scene, camera);
  }
  var running = false, inView = true;
  function frame() {
    if (!running) return;
    requestAnimationFrame(frame);
    spin += 0.0016; draw();
  }
  function sync() {
    var want = !reduce && inView && !document.hidden;
    if (want && !running) { running = true; requestAnimationFrame(frame); } else if (!want) { running = false; }
  }
  if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { inView = es[0].isIntersecting; sync(); }).observe(host);
  document.addEventListener('visibilitychange', sync);
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(host); else window.addEventListener('resize', resize);
  resize(); sync();

  // Hover: nearest projected node
  var v3 = new THREE.Vector3();
  function pick(cx, cy) {
    group.updateMatrixWorld(true);
    var best = -1, bd = 1e9;
    for (var i = 0; i < n; i++) {
      v3.copy(vecs[i]).applyMatrix4(group.matrixWorld).project(camera);
      if (v3.z > 1) continue;
      var sx = (v3.x * 0.5 + 0.5) * W, sy = (-v3.y * 0.5 + 0.5) * H, d = Math.hypot(sx - cx, sy - cy);
      var rad = Math.max(16, base[i] * H * 1.374 / camera.position.z / 2 + 6);
      if (d < rad && d < bd) { bd = d; best = i; v3.sx = sx; v3.sy = sy; }
    }
    return best === -1 ? null : { i: best, x: v3.sx, y: v3.sy };
  }
  function setHover(i) {
    if (i === hover) return;
    if (hover > -1) size[hover] = base[hover];
    if (i > -1) size[i] = base[i] * 1.4;
    hover = i; idea.geometry.attributes.size.needsUpdate = true; if (!running) draw();
  }
  host.addEventListener('pointermove', function (e) {
    var r = host.getBoundingClientRect(), cx = e.clientX - r.left, cy = e.clientY - r.top;
    px0 = (cx / W - 0.5) * 2; py0 = (cy / H - 0.5) * 2;
    var h = pick(cx, cy);
    host.style.cursor = h ? 'pointer' : 'default';
    if (h && tip) {
      var nd = nodes[h.i];
      tip.hidden = false; tip.textContent = '';
      var b = document.createElement('b'), s = document.createElement('span');
      b.textContent = nd.n; s.textContent = 'Score ' + nd.s;
      tip.appendChild(b); tip.appendChild(s);
      tip.style.left = (host.offsetLeft + h.x) + 'px'; tip.style.top = (host.offsetTop + h.y) + 'px';
      setHover(h.i);
    } else { if (tip) tip.hidden = true; setHover(-1); }
    if (!running) draw();
  });
  host.addEventListener('pointerleave', function () { if (tip) tip.hidden = true; setHover(-1); px0 = py0 = 0; if (!running) draw(); });
  host.addEventListener('click', function (e) {
    var r = host.getBoundingClientRect(), h = pick(e.clientX - r.left, e.clientY - r.top);
    if (h) location.href = 'ideas.php#' + encodeURIComponent(nodes[h.i].k);
  });
})();
