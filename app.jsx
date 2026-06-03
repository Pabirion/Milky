// app.jsx — Spilt Milky Way: a private, meditative "let it go" space.
const { useState, useEffect, useRef, useCallback } = React;

const STORE_KEY = 'spilt_milky_way_v1';

const AFTERGLOW = {
  ensamhet: 'Ett ljus för ensamheten. Någonstans där ute lyser fler.',
  utmattning: 'Lägg ner tyngden en stund. Du får vila nu.',
  sjalvkansla: 'Du dög hela tiden.',
  sorg: 'Det du saknar lyser nu bland stjärnorna.',
  oro: 'Låt tanken driva bort. Andas långsamt.',
  namnlosa: 'Du släppte taget. Det räcker.',
};

const RELEASE_HINT = {
  andas: 'Håll medan du andas in — släpp när du andas ut.',
  dra: 'Dra ljuset uppåt mot stjärnorna och släpp taget.',
  losupp: 'Andas ut. Se hur det sakta löser upp sig.',
};

function prefersReduced() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "release": "andas",
  "warmth": "svalt",
  "nebula": true,
  "motion": 1,
  "guide": true
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [view, setView] = useState('sky');           // sky | compose | release | galaxies
  const [text, setText] = useState('');
  const [holding, setHolding] = useState(false);
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false });
  const [dissolving, setDissolving] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [afterglow, setAfterglow] = useState(null);
  const [count, setCount] = useState(0);
  const [labels, setLabels] = useState([]);
  const [highlight, setHighlight] = useState(null);

  const canvasRef = useRef(null);
  const sfRef = useRef(null);
  const orbRef = useRef(null);
  const dragStart = useRef(null);

  /* ---- init starfield ---- */
  useEffect(() => {
    const sf = new window.Starfield(canvasRef.current);
    sfRef.current = sf;
    let saved = [];
    try { saved = JSON.parse(localStorage.getItem(STORE_KEY)) || []; } catch (e) {}
    sf.loadStars(saved);
    setCount(sf.stars.length);
    if (prefersReduced()) setTweak('motion', 0.4);
    sf.setTweaks({ warmth: t.warmth, nebula: t.nebula, motion: t.motion });
    sf.start();

    const onResize = () => { sf.resize(); if (view === 'galaxies') setLabels(sf.clusterLabels()); };
    const onMove = (e) => sf.setPointer(e.clientX / window.innerWidth, e.clientY / window.innerHeight);
    window.addEventListener('resize', onResize);
    window.addEventListener('pointermove', onMove);
    return () => { sf.stop(); window.removeEventListener('resize', onResize); window.removeEventListener('pointermove', onMove); };
  }, []);

  /* ---- push tweaks to canvas ---- */
  useEffect(() => {
    if (sfRef.current) sfRef.current.setTweaks({ warmth: t.warmth, nebula: t.nebula, motion: t.motion });
  }, [t.warmth, t.nebula, t.motion]);

  /* ---- view -> canvas ---- */
  useEffect(() => {
    const sf = sfRef.current; if (!sf) return;
    sf.setView(view === 'galaxies' ? 'galaxies' : 'sky');
    if (view === 'galaxies') {
      setLabels(sf.clusterLabels());
      const id = setTimeout(() => setLabels(sf.clusterLabels()), 60);
      return () => clearTimeout(id);
    } else {
      setHighlight(null); sf.setHighlight(null);
    }
  }, [view]);

  const persist = useCallback(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(sfRef.current.serialize())); } catch (e) {}
  }, []);

  /* ---- release the orb ---- */
  const releaseStar = useCallback(() => {
    if (releasing) return;
    const sf = sfRef.current;
    const rect = orbRef.current.getBoundingClientRect();
    const fromX = rect.left + rect.width / 2;
    const fromY = rect.top + rect.height / 2;
    const theme = window.detectTheme(text);
    const color = window.THEMES[theme].color;
    sf.addStar({ theme, color, fromX, fromY });
    persist();
    const msg = AFTERGLOW[theme];
    setReleasing(true);
    setTimeout(() => {
      setView('sky'); setText(''); setReleasing(false); setHolding(false);
      setDissolving(false); setDrag({ x: 0, y: 0, active: false });
      setCount(sf.stars.length);
      setAfterglow(msg);
      setTimeout(() => setAfterglow(null), 3400);
    }, 620);
  }, [text, releasing, persist]);

  /* ---- orb drag (variant: dra) ---- */
  useEffect(() => {
    if (t.release !== 'dra' || view !== 'release') return;
    const onMove = (e) => {
      if (!dragStart.current) return;
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      setDrag({ x: dx * 0.6, y: dy, active: true });
    };
    const onUp = () => {
      if (!dragStart.current) return;
      const released = dragStart.current.dy <= -110;
      dragStart.current = null;
      if (drag.y <= -110) { releaseStar(); }
      else setDrag({ x: 0, y: 0, active: false });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
  }, [t.release, view, drag.y, releaseStar]);

  const startCompose = () => { setView('compose'); };
  const beginRelease = () => { if (text.trim().length >= 2) setView('release'); };

  /* orb interaction handlers per variant */
  const orbDown = (e) => {
    if (t.release === 'andas') { setHolding(true); }
    else if (t.release === 'dra') { dragStart.current = { x: e.clientX, y: e.clientY, dy: 0 }; }
  };
  const orbUp = () => {
    if (t.release === 'andas' && holding) { releaseStar(); }
  };

  // keep dragStart.dy in sync for the up-handler decision
  useEffect(() => { if (dragStart.current) dragStart.current.dy = drag.y; }, [drag.y]);

  const theme = window.detectTheme(text);
  const themeColor = window.THEMES[theme].color;
  const orbScale = Math.min(1, 0.42 + text.length / 130);

  return (
    <div style={ui.root}>
      <canvas ref={canvasRef} style={ui.canvas} />

      {/* ---------------- SKY ---------------- */}
      {view === 'sky' && (
        <div style={{ ...ui.center, opacity: afterglow ? 0 : 1, transition: 'opacity 1.1s ease' }} className="fade-in">
          <div style={ui.kicker}>MILKY WAY</div>
          <div style={ui.skyPromptLabel}>Vad tynger dig?</div>
          <textarea
            autoFocus value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Låt orden komma. Ingen läser dem."
            style={ui.textarea} rows={3} maxLength={400} />
          <div style={ui.composeBtns}>
            <button style={{ ...ui.solidBtn, opacity: text.trim().length >= 2 ? 1 : 0.35,
              pointerEvents: text.trim().length >= 2 ? 'auto' : 'none' }}
              className="press" onClick={beginRelease}>Forma till ljus</button>
          </div>
          {count > 0 && (
            <div style={ui.skyFoot}>
              <span style={ui.footCount}>{count} {count === 1 ? 'ljus' : 'ljus'} i din himmel · de bleknar långsamt</span>
              <button style={ui.ghostBtn} className="press" onClick={() => setView('galaxies')}>Se din stjärnhimmel →</button>
            </div>
          )}
        </div>
      )}

      {/* ---------------- COMPOSE ---------------- */}
      {view === 'compose' && (
        <div style={ui.composeWrap} className="fade-in">
          <div style={ui.kickerTop}>VAD TYNGER DIG JUST NU?</div>
          <textarea
            autoFocus value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Låt orden komma. Ingen läser dem."
            style={ui.textarea} rows={3} maxLength={400} />
          <div style={ui.formGlow}>
            <div style={{ ...ui.formGlowOrb, transform: `scale(${orbScale})`,
              background: `radial-gradient(circle, #fff 0%, ${themeColor} 38%, transparent 70%)` }} />
          </div>
          <div style={ui.composeBtns}>
            <button style={ui.ghostBtn} className="press" onClick={() => { setText(''); setView('sky'); }}>Avbryt</button>
            <button style={{ ...ui.solidBtn, opacity: text.trim().length >= 2 ? 1 : 0.35,
              pointerEvents: text.trim().length >= 2 ? 'auto' : 'none' }}
              className="press" onClick={beginRelease}>Forma till ljus</button>
          </div>
        </div>
      )}

      {/* ---------------- RELEASE ---------------- */}
      {view === 'release' && (
        <div style={ui.releaseWrap} className="fade-in">
          {t.release === 'andas' && <div className="breathe-ring" style={ui.breatheRing} />}
          <div
            ref={orbRef}
            onPointerDown={orbDown}
            onPointerUp={orbUp}
            className={'orb' + (holding ? ' orb-inhale' : '') + (dissolving ? ' orb-dissolve' : '') + (releasing ? ' orb-gone' : '')}
            style={{
              ...ui.orb,
              transform: `translate(${drag.x}px, ${drag.y}px)`,
              background: `radial-gradient(circle at 50% 42%, #ffffff 0%, ${themeColor} 34%, ${themeColor}00 72%)`,
              boxShadow: `0 0 60px 14px ${themeColor}55, 0 0 140px 40px ${themeColor}22`,
              transition: drag.active ? 'none' : ui.orb.transition,
            }}>
            <div style={ui.orbText} className={releasing || dissolving ? 'orb-words-fade' : ''}>{text}</div>
          </div>
          {t.guide && <div style={ui.releaseHint} className={releasing ? 'fade-out' : ''}>{RELEASE_HINT[t.release]}</div>}
          {t.release === 'losupp' && !releasing && (
            <button style={ui.solidBtn} className="press"
              onClick={() => { setDissolving(true); setTimeout(releaseStar, 480); }}>Släpp taget</button>
          )}
          {!releasing && (
            <button style={ui.tinyBack} className="press" onClick={() => setView('compose')}>← tillbaka</button>
          )}
        </div>
      )}

      {/* ---------------- GALAXIES ---------------- */}
      {view === 'galaxies' && (
        <div style={ui.galaxyWrap}>
          <div style={ui.galaxyTop} className="fade-in">
            <div style={ui.kicker}>DINA GALAXER</div>
            <div style={ui.subtle}>Samlade efter tema. De bleknar med tiden.</div>
          </div>
          {labels.map((l) => (
            <button key={l.key}
              onPointerEnter={() => { setHighlight(l.key); sfRef.current.setHighlight(l.key); }}
              onPointerLeave={() => { setHighlight(null); sfRef.current.setHighlight(null); }}
              onClick={() => { setHighlight(l.key); sfRef.current.setHighlight(l.key); }}
              style={{
                ...ui.label,
                left: l.x, top: l.y,
                opacity: highlight && highlight !== l.key ? 0.4 : 1,
                borderColor: highlight === l.key ? l.color + 'aa' : 'rgba(255,255,255,0.14)',
              }}>
              <span style={{ ...ui.labelDot, background: l.color, boxShadow: `0 0 10px ${l.color}` }} />
              <span style={ui.labelName}>{l.name}</span>
              <span style={ui.labelCount}>{l.count}</span>
            </button>
          ))}
          <button style={ui.galaxyBack} className="press" onClick={() => setView('sky')}>← Tillbaka till himlen</button>
        </div>
      )}

      {/* ---------------- AFTERGLOW ---------------- */}
      {afterglow && <div style={ui.afterglow} className="afterglow-anim">{afterglow}</div>}

      <Tweaks t={t} setTweak={setTweak} />
    </div>
  );
}

function Tweaks({ t, setTweak }) {
  return (
    <TweaksPanel>
      <TweakSection label="Att släppa taget" />
      <TweakSelect label="Gest" value={t.release}
        options={[{ value: 'andas', label: 'Andas ut' }, { value: 'dra', label: 'Dra mot stjärnorna' }, { value: 'losupp', label: 'Lös upp' }]}
        onChange={(v) => setTweak('release', v)} />
      <TweakToggle label="Visa ledtext" value={t.guide} onChange={(v) => setTweak('guide', v)} />
      <TweakSection label="Rymden" />
      <TweakSelect label="Ljusets värme" value={t.warmth}
        options={[{ value: 'svalt', label: 'Svalt' }, { value: 'varmt', label: 'Varmt' }, { value: 'tema', label: 'Temafärg' }]}
        onChange={(v) => setTweak('warmth', v)} />
      <TweakToggle label="Avlägsen nebulosa" value={t.nebula} onChange={(v) => setTweak('nebula', v)} />
      <TweakSlider label="Liv i rymden" value={t.motion} min={0} max={1.4} step={0.1}
        onChange={(v) => setTweak('motion', v)} />
    </TweaksPanel>
  );
}

const ui = {
  root: { position: 'fixed', inset: 0, overflow: 'hidden', background: '#04040b', color: '#e8ecff',
    fontFamily: "'Instrument Sans', system-ui, sans-serif", userSelect: 'none', touchAction: 'none' },
  canvas: { position: 'fixed', inset: 0, width: '100%', height: '100%', display: 'block' },

  center: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 22, textAlign: 'center', padding: 24 },
  kicker: { fontSize: 12, letterSpacing: '0.42em', color: 'rgba(200,212,255,0.5)', fontWeight: 500, paddingLeft: '0.42em' },
  primaryPrompt: { background: 'none', border: 'none', color: '#f3f5ff', cursor: 'pointer',
    fontFamily: "'Spectral', Georgia, serif", fontWeight: 300, fontSize: 'clamp(34px, 6vw, 60px)',
    letterSpacing: '0.01em', textShadow: '0 0 40px rgba(150,180,255,0.35)', lineHeight: 1.05 },
  skyPromptLabel: { fontFamily: "'Spectral', Georgia, serif", fontWeight: 300,
    fontSize: 'clamp(28px, 4.5vw, 48px)', color: '#f3f5ff', letterSpacing: '0.01em',
    textShadow: '0 0 40px rgba(150,180,255,0.35)', lineHeight: 1.05 },
  subtle: { fontSize: 15, color: 'rgba(205,214,255,0.55)', fontWeight: 300, maxWidth: 360, lineHeight: 1.5 },
  skyFoot: { position: 'absolute', bottom: 36, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 },
  footCount: { fontSize: 12.5, color: 'rgba(205,214,255,0.42)', letterSpacing: '0.02em' },
  ghostBtn: { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.14)',
    color: 'rgba(232,236,255,0.85)', padding: '9px 18px', borderRadius: 999, cursor: 'pointer',
    fontSize: 13, fontFamily: 'inherit', backdropFilter: 'blur(8px)', whiteSpace: 'nowrap' },

  composeWrap: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 26, padding: 24 },
  kickerTop: { fontSize: 12, letterSpacing: '0.36em', color: 'rgba(200,212,255,0.5)', paddingLeft: '0.36em' },
  textarea: { width: 'min(640px, 88vw)', background: 'none', border: 'none', outline: 'none', resize: 'none',
    color: '#f1f3ff', textAlign: 'center', fontFamily: "'Spectral', Georgia, serif", fontWeight: 300,
    fontSize: 'clamp(22px, 3.4vw, 32px)', lineHeight: 1.5, caretColor: '#9fb6ff' },
  formGlow: { height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  formGlowOrb: { width: 56, height: 56, borderRadius: '50%', filter: 'blur(2px)', transition: 'transform 0.6s ease' },
  composeBtns: { display: 'flex', gap: 14, alignItems: 'center' },
  solidBtn: { background: 'rgba(232,236,255,0.10)', border: '1px solid rgba(232,236,255,0.30)', color: '#f3f5ff',
    padding: '11px 26px', borderRadius: 999, cursor: 'pointer', fontSize: 14, fontFamily: 'inherit',
    backdropFilter: 'blur(8px)', transition: 'opacity 0.3s ease', whiteSpace: 'nowrap' },

  releaseWrap: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 30, padding: 24 },
  breatheRing: { position: 'absolute', width: 320, height: 320, borderRadius: '50%',
    border: '1px solid rgba(160,185,255,0.18)', pointerEvents: 'none' },
  orb: { width: 150, height: 150, borderRadius: '50%', cursor: 'grab', position: 'relative',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'transform 0.5s cubic-bezier(.2,.7,.2,1), opacity 0.6s ease', willChange: 'transform' },
  orbText: { fontFamily: "'Spectral', Georgia, serif", fontWeight: 300, fontSize: 13, lineHeight: 1.4,
    color: 'rgba(20,22,40,0.5)', textAlign: 'center', maxWidth: 120, maxHeight: 110, overflow: 'hidden',
    padding: 6, transition: 'opacity 0.5s ease' },
  releaseHint: { fontSize: 14.5, color: 'rgba(205,214,255,0.6)', fontWeight: 300, letterSpacing: '0.01em',
    maxWidth: 320, textAlign: 'center', lineHeight: 1.5 },
  tinyBack: { position: 'absolute', bottom: 34, background: 'none', border: 'none',
    color: 'rgba(205,214,255,0.4)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' },

  galaxyWrap: { position: 'absolute', inset: 0 },
  galaxyTop: { position: 'absolute', top: 40, left: 0, right: 0, display: 'flex', flexDirection: 'column',
    alignItems: 'center', gap: 8, textAlign: 'center' },
  label: { position: 'absolute', transform: 'translate(-50%, -50%)', display: 'flex', alignItems: 'center',
    gap: 9, background: 'rgba(10,12,26,0.5)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 999,
    padding: '7px 14px', cursor: 'pointer', backdropFilter: 'blur(10px)', fontFamily: 'inherit',
    transition: 'opacity 0.5s ease, border-color 0.3s ease', color: '#e8ecff', whiteSpace: 'nowrap' },
  labelDot: { width: 8, height: 8, borderRadius: '50%' },
  labelName: { fontSize: 13.5, fontWeight: 400 },
  labelCount: { fontSize: 12, color: 'rgba(205,214,255,0.5)', fontVariantNumeric: 'tabular-nums' },
  galaxyBack: { position: 'absolute', bottom: 34, left: '50%', transform: 'translateX(-50%)',
    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.14)',
    color: 'rgba(232,236,255,0.85)', padding: '10px 20px', borderRadius: 999, cursor: 'pointer',
    fontSize: 13.5, fontFamily: 'inherit', backdropFilter: 'blur(8px)', whiteSpace: 'nowrap' },

  afterglow: { position: 'absolute', left: '50%', top: '20%', transform: 'translate(-50%,-20%)',
    fontFamily: "'Spectral', Georgia, serif", fontWeight: 300, fontSize: 'clamp(22px, 3.4vw, 30px)',
    color: '#eef1ff', textAlign: 'center', maxWidth: 'min(560px, 86vw)', lineHeight: 1.45,
    textShadow: '0 0 40px rgba(150,180,255,0.4)', pointerEvents: 'none' },
};

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
