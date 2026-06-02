// starfield.jsx
// Canvas star system: ambient starfield, parallax, release flight, galaxy clustering,
// and slow fade-over-time. Plain class exposed on window; the React app drives it.

(function () {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;

  // deterministic pseudo-random from a numeric seed
  function seeded(seed) {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return () => (s = (s * 16807) % 2147483647) / 2147483647;
  }

  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgba(hex, a) {
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r},${g},${b},${a})`;
  }

  const DAY = 86400000;
  const MAX_AGE_DAYS = 50; // fades toward a dim floor over ~50 days

  class Starfield {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.w = 0; this.h = 0; this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.ambient = [];
      this.stars = [];           // released user stars
      this.cluster = 0;          // 0 = open sky, 1 = galaxies
      this.targetCluster = 0;
      this.pointer = { x: 0, y: 0 };   // -0.5..0.5
      this.targetPointer = { x: 0, y: 0 };
      this.t = 0;
      this.tweaks = { warmth: 'svalt', nebula: true, motion: 1 };
      this.highlight = null;     // highlighted theme key in galaxy view
      this._raf = null;
      this._last = 0;
      this.resize();
      this._buildAmbient();
    }

    /* ---------- setup ---------- */
    _buildAmbient() {
      const rnd = seeded(98765);
      const N = 260;
      this.ambient = [];
      for (let i = 0; i < N; i++) {
        const depth = rnd();                       // 0 far .. 1 near
        this.ambient.push({
          x: rnd(), y: rnd(),
          r: 0.4 + depth * 1.2,
          depth,
          base: 0.12 + rnd() * 0.55,
          tw: rnd() * Math.PI * 2,
          tws: 0.4 + rnd() * 1.4,
          warm: rnd() < 0.12,
        });
      }
    }

    resize() {
      const c = this.canvas;
      this.w = c.clientWidth; this.h = c.clientHeight;
      c.width = Math.round(this.w * this.dpr);
      c.height = Math.round(this.h * this.dpr);
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.aspectX = this.h / this.w; // keep clusters circular on wide screens
    }

    setTweaks(t) { this.tweaks = Object.assign(this.tweaks, t); }
    setView(name) { this.targetCluster = name === 'galaxies' ? 1 : 0; }
    setHighlight(key) { this.highlight = key; }
    setPointer(nx, ny) { this.targetPointer.x = nx - 0.5; this.targetPointer.y = ny - 0.5; }

    /* ---------- data ---------- */
    loadStars(arr) {
      this.stars = (arr || []).map((s) => this._hydrate(s));
    }
    _hydrate(s) {
      const rnd = seeded(s.id || 1);
      return {
        id: s.id, theme: s.theme, color: s.color,
        createdAt: s.createdAt,
        sx: s.sx, sy: s.sy,                 // scatter position (open sky)
        ga: rnd() * Math.PI * 2,            // galaxy angle offset
        gr: 0.02 + rnd() * 0.085,           // galaxy radius offset
        r: 1.3 + rnd() * 1.1,
        tw: rnd() * Math.PI * 2,
        tws: 0.5 + rnd() * 1.6,
        state: 'rest',
        fly: null,
      };
    }

    serialize() {
      return this.stars.map((s) => ({
        id: s.id, theme: s.theme, color: s.color,
        createdAt: s.createdAt, sx: s.sx, sy: s.sy,
      }));
    }

    addStar({ theme, color, fromX, fromY }) {
      const rnd = seeded(Date.now() % 2000000);
      // scatter target, biased away from dead center where the prompt sits
      let sx, sy, tries = 0;
      do {
        sx = 0.08 + rnd() * 0.84;
        sy = 0.10 + rnd() * 0.78;
        tries++;
      } while (Math.hypot(sx - 0.5, sy - 0.46) < 0.16 && tries < 8);

      const star = this._hydrate({
        id: Date.now(), theme, color,
        createdAt: Date.now(), sx, sy,
      });
      star.state = 'fly';
      const x0 = fromX / this.w, y0 = fromY / this.h;
      star.fly = {
        x0, y0,
        // control point: arc upward and outward
        cx: lerp(x0, sx, 0.5) + (sx - x0) * 0.1,
        cy: Math.min(y0, sy) - 0.18 - rnd() * 0.1,
        t0: performance.now(),
        dur: 2600 + rnd() * 600,
        trail: [],
      };
      this.stars.push(star);
      return star;
    }

    /* ---------- geometry ---------- */
    presentThemes() {
      const seen = [];
      for (const s of this.stars) if (!seen.includes(s.theme)) seen.push(s.theme);
      // keep a stable visual order
      const order = window.THEME_ORDER || [];
      return seen.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    }

    centroids() {
      const themes = this.presentThemes();
      const n = themes.length;
      const map = {};
      const R = n <= 1 ? 0 : 0.30;
      const cx = 0.5, cy = 0.47;
      themes.forEach((th, i) => {
        const ang = -Math.PI / 2 + (i / Math.max(1, n)) * Math.PI * 2;
        map[th] = { x: cx + Math.cos(ang) * R * this.aspectX, y: cy + Math.sin(ang) * R };
      });
      return map;
    }

    galaxyPos(s, cents) {
      const c = cents[s.theme] || { x: 0.5, y: 0.47 };
      return {
        x: c.x + Math.cos(s.ga) * s.gr * this.aspectX,
        y: c.y + Math.sin(s.ga) * s.gr,
      };
    }

    // labels for the React overlay
    clusterLabels() {
      const cents = this.centroids();
      const counts = {};
      for (const s of this.stars) counts[s.theme] = (counts[s.theme] || 0) + 1;
      const THEMES = window.THEMES || {};
      return this.presentThemes().map((th) => ({
        key: th,
        name: (THEMES[th] && THEMES[th].name) || th,
        color: (THEMES[th] && THEMES[th].color) || '#cdd6ff',
        count: counts[th],
        x: cents[th].x * this.w,
        y: cents[th].y * this.h,
        alpha: this.cluster,
      }));
    }

    ageFade(s) {
      const days = (Date.now() - s.createdAt) / DAY;
      return clamp(1 - days / MAX_AGE_DAYS, 0.16, 1);
    }

    /* ---------- render ---------- */
    _drawGlow(x, y, r, color, alpha) {
      const ctx = this.ctx;
      const R = r * 4.2;
      const g = ctx.createRadialGradient(x, y, 0, x, y, R);
      g.addColorStop(0, rgba(color, alpha * 0.9));
      g.addColorStop(0.35, rgba(color, alpha * 0.32));
      g.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.fill();
      ctx.fillStyle = rgba('#ffffff', alpha);
      ctx.beginPath(); ctx.arc(x, y, Math.max(0.7, r * 0.55), 0, 7); ctx.fill();
    }

    starColor(s) {
      const w = this.tweaks.warmth;
      if (w === 'varmt') return '#ffd6a6';
      if (w === 'tema') return s.color || '#cdd6ff';
      return '#bcd2ff';
    }

    frame(now) {
      const ctx = this.ctx, w = this.w, h = this.h;
      const dt = Math.min(0.05, (now - this._last) / 1000 || 0.016);
      this._last = now;
      this.t += dt;
      const motion = this.tweaks.motion != null ? this.tweaks.motion : 1;

      // ease global state
      this.cluster = lerp(this.cluster, this.targetCluster, 0.06);
      this.pointer.x = lerp(this.pointer.x, this.targetPointer.x, 0.05);
      this.pointer.y = lerp(this.pointer.y, this.targetPointer.y, 0.05);

      // background
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#05060e');
      bg.addColorStop(0.55, '#070611');
      bg.addColorStop(1, '#04040b');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // distant ambient nebula (very faint), if enabled
      if (this.tweaks.nebula) {
        this._nebula(w * 0.26, h * 0.24, Math.max(w, h) * 0.5, '#243a6b', 0.10);
        this._nebula(w * 0.8, h * 0.78, Math.max(w, h) * 0.45, '#3a2a5e', 0.08);
      }

      // galaxy nebulae
      if (this.cluster > 0.02) {
        const cents = this.centroids();
        const THEMES = window.THEMES || {};
        for (const th of this.presentThemes()) {
          const c = cents[th];
          const col = (THEMES[th] && THEMES[th].color) || '#cdd6ff';
          const hot = this.highlight === th ? 1.6 : 1;
          this._nebula(c.x * w, c.y * h, Math.min(w, h) * 0.22, col, 0.16 * this.cluster * hot);
        }
      }

      // ambient stars (parallax)
      const px = this.pointer.x, py = this.pointer.y;
      for (const a of this.ambient) {
        const off = a.depth * 26 * motion;
        const x = a.x * w - px * off;
        const y = a.y * h - py * off;
        const tw = 0.65 + 0.35 * Math.sin(this.t * a.tws + a.tw) * motion;
        const col = a.warm ? '#ffe6c4' : '#dbe6ff';
        ctx.fillStyle = rgba(col, a.base * tw);
        ctx.beginPath(); ctx.arc(x, y, a.r, 0, 7); ctx.fill();
      }

      // user stars
      const cents = this.centroids();
      for (const s of this.stars) {
        if (s.state === 'fly') { this._drawFlying(s, now, motion); continue; }
        const gp = this.galaxyPos(s, cents);
        const bx = lerp(s.sx, gp.x, this.cluster);
        const by = lerp(s.sy, gp.y, this.cluster);
        const off = 14 * motion * (0.3 + s.r * 0.25);
        const x = bx * w - px * off;
        const y = by * h - py * off;
        const fade = this.ageFade(s);
        const tw = 0.7 + 0.3 * Math.sin(this.t * s.tws + s.tw) * motion;
        let a = fade * tw;
        if (this.cluster > 0.5 && this.highlight && s.theme !== this.highlight) a *= 0.28;
        this._drawGlow(x, y, s.r, this.starColor(s), a);
      }

      this._raf = requestAnimationFrame((n) => this.frame(n));
    }

    _nebula(x, y, R, color, alpha) {
      const ctx = this.ctx;
      const g = ctx.createRadialGradient(x, y, 0, x, y, R);
      g.addColorStop(0, rgba(color, alpha));
      g.addColorStop(0.5, rgba(color, alpha * 0.45));
      g.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.fill();
    }

    _drawFlying(s, now, motion) {
      const f = s.fly;
      const raw = clamp((now - f.t0) / f.dur, 0, 1);
      const p = easeOutCubic(raw);
      // quadratic bezier in normalized space
      const inv = 1 - p;
      const nx = inv * inv * f.x0 + 2 * inv * p * f.cx + p * p * s.sx;
      const ny = inv * inv * f.y0 + 2 * inv * p * f.cy + p * p * s.sy;
      const x = nx * this.w, y = ny * this.h;

      // trail
      f.trail.push({ x, y });
      if (f.trail.length > 16) f.trail.shift();
      const col = this.starColor(s);
      for (let i = 0; i < f.trail.length; i++) {
        const tp = f.trail[i];
        const ta = (i / f.trail.length) * 0.5 * (1 - p * 0.5);
        this.ctx.fillStyle = rgba(col, ta);
        this.ctx.beginPath();
        this.ctx.arc(tp.x, tp.y, lerp(1, 3.2, i / f.trail.length), 0, 7);
        this.ctx.fill();
      }

      // size shrinks from a bright bloom into a small star; brightness flares early
      const r = lerp(11, s.r, easeInOutSine(raw));
      const flare = raw < 0.2 ? lerp(0.6, 1, raw / 0.2) : 1;
      this._drawGlow(x, y, r, col, flare);

      if (raw >= 1) { s.state = 'rest'; s.fly = null; }
    }

    start() {
      if (this._raf) return;
      this._last = performance.now();
      this._raf = requestAnimationFrame((n) => this.frame(n));
    }
    stop() { if (this._raf) cancelAnimationFrame(this._raf); this._raf = null; }
  }

  window.Starfield = Starfield;
})();
