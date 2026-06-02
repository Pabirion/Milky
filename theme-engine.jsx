// theme-engine.jsx
// Auto-detects an emotional "theme" from free Swedish text using keyword scoring.
// Each theme owns a name + a star color. Exposed on window for the canvas + app.

const THEMES = {
  ensamhet: {
    key: 'ensamhet',
    name: 'Ensamhet',
    color: '#8fb4ff',
    words: ['ensam', 'ensamhet', 'sjalv', 'själv', 'isolerad', 'isolering', 'tom', 'tomhet',
      'utanfor', 'utanför', 'overgiven', 'övergiven', 'ingen', 'allena', 'vanner', 'vänner',
      'sallskap', 'sällskap', 'oalskad', 'oälskad', 'osynlig', 'bortvald', 'lamnad', 'lämnad'],
  },
  utmattning: {
    key: 'utmattning',
    name: 'Utmattning',
    color: '#ffb27a',
    words: ['trott', 'trött', 'utmattad', 'stress', 'stressad', 'orka', 'orkar', 'press',
      'jobb', 'jobbet', 'utbrand', 'utbränd', 'somn', 'sömn', 'krav', 'prestera', 'deadline',
      'maste', 'måste', 'hinner', 'overvaldig', 'överväldig', 'sliten', 'slut', 'tungt', 'energi'],
  },
  sjalvkansla: {
    key: 'sjalvkansla',
    name: 'Självkänsla',
    color: '#c69bff',
    words: ['duger', 'vardelos', 'värdelös', 'misslyck', 'dalig', 'dålig', 'fel', 'skams',
      'skäms', 'otillrack', 'otillräck', 'dum', 'ful', 'hatar mig', 'inte bra nog', 'jamfor',
      'jämför', 'skuld', 'skam', 'duglig', 'racker inte', 'räcker inte', 'sviker', 'pinsam'],
  },
  sorg: {
    key: 'sorg',
    name: 'Sorg & saknad',
    color: '#ffe1b0',
    words: ['dod', 'död', 'dog', 'dott', 'dött', 'forlorat', 'förlorat', 'forlust', 'förlust',
      'saknad', 'saknar', 'begravning', 'borta', 'mamma', 'pappa', 'mormor', 'farmor', 'farfar',
      'morfar', 'sorg', 'grater', 'gråter', 'minne', 'minns', 'avled', 'bortgang', 'bortgång',
      'sjuk', 'cancer', 'kista', 'gravsten', 'efterlangtar', 'efterlängtar'],
  },
  oro: {
    key: 'oro',
    name: 'Oro & ångest',
    color: '#86e6d4',
    words: ['orolig', 'oro', 'radd', 'rädd', 'angest', 'ångest', 'panik', 'framtid', 'nervos',
      'nervös', 'angslig', 'ängslig', 'skrack', 'skräck', 'grubbel', 'grubblar', 'katastrof',
      'tankar', 'tankarna', 'spiral', 'hjartat', 'hjärtat', 'andas', 'farligt', 'osakert', 'osäkert'],
  },
  namnlosa: {
    key: 'namnlosa',
    name: 'Det namnlösa',
    color: '#cdd6ff',
    words: [],
  },
};

const THEME_ORDER = ['sorg', 'ensamhet', 'utmattning', 'oro', 'sjalvkansla', 'namnlosa'];

function detectTheme(text) {
  if (!text || !text.trim()) return 'namnlosa';
  const t = ' ' + text.toLowerCase() + ' ';
  let best = 'namnlosa';
  let bestScore = 0;
  for (const key of THEME_ORDER) {
    const theme = THEMES[key];
    let score = 0;
    for (const w of theme.words) {
      let idx = t.indexOf(w);
      while (idx !== -1) { score++; idx = t.indexOf(w, idx + w.length); }
    }
    if (score > bestScore) { bestScore = score; best = key; }
  }
  return best;
}

window.THEMES = THEMES;
window.THEME_ORDER = THEME_ORDER;
window.detectTheme = detectTheme;
