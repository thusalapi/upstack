// Story content: chapters, rocks (doubts) and the lessons they turn into.

export const THEMES = [
  { grass: 0x86cf6e, dirt: 0x9a6b4b, tuft: 0x5aa84f, floorA: '#ead9bd', floorB: '#dfcaa8', accent: 0x4f8cff, accent2: 0xff8fab, wall: 0xf2e6d0 },
  { grass: 0x7fcf9b, dirt: 0x8f6a55, tuft: 0x4fa676, floorA: '#dfe8f2', floorB: '#cfdbe9', accent: 0xff9f43, accent2: 0x48dbfb, wall: 0xdde7f2 },
  { grass: 0x77c9b5, dirt: 0x7d6a63, tuft: 0x46a08b, floorA: '#e9e4f7', floorB: '#dad3f0', accent: 0x6c5ce7, accent2: 0xfeca57, wall: 0xe4dff3 },
  { grass: 0xc2e27c, dirt: 0xa8805a, tuft: 0x93c25a, floorA: '#fff5da', floorB: '#ffeab8', accent: 0xffc83d, accent2: 0xff6b6b, wall: 0xfff0cc },
];

export const ISLANDS = [
  { c: [0, 0, 0], r: 8 },
  { c: [-6, 5, -22], r: 8 },
  { c: [5, 10, -44], r: 8 },
  { c: [-2, 15, -66], r: 8.5 },
];

export const CHAPTERS = [
  {
    title: 'Chapter 1 · Ground Zero',
    sub: 'Self-taught, broke and stubborn.',
    milestone: 'Ship your first project',
    steps: 4,
    critics: 2,
    interval: 5.2,
    flight: 1.9,
    boulderChance: 0,
    objects: ['bed', 'bookshelf', 'desk', 'coffee', 'beanbag'],
    task: { label: 'Code a side project', icon: '💻' },
    alt: { obj: 'bookshelf', label: 'Watch tutorials', icon: '📺', rate: 0.6, cap: 30, capMsg: 'Tutorials only go so far. Time to build.' },
    rocks: [
      ['Is this a real job?', 'It is if you treat it like one.'],
      ['Am I cut out for this?', 'Nobody is born knowing this. Everyone starts at zero.'],
      ['Am I too late?', 'The best time was yesterday. The next best time is now.'],
      ['Nothing works', 'Nothing works until it does. Keep debugging.'],
      ['Tutorial hell', 'Build something ugly. Then build it again.'],
      ['No CS degree?', 'Skills compile. Excuses do not.'],
    ],
  },
  {
    title: 'Chapter 2 · The Job Hunt',
    sub: '200 applications. 3 replies.',
    milestone: 'Land your first offer',
    steps: 5,
    critics: 3,
    interval: 3.9,
    flight: 1.6,
    boulderChance: 0.1,
    objects: ['bed', 'whiteboard', 'desk', 'coffee', 'beanbag'],
    task: { label: 'Send applications', icon: '📨' },
    alt: { obj: 'whiteboard', label: 'Practice interviews', icon: '🧠', rate: 0.9 },
    rocks: [
      ['Rejected', 'Every no is data, not a verdict.'],
      ['Need 5 yrs experience', 'Side projects are experience. Ship them.'],
      ['Ghosted', 'Silence says nothing about your worth.'],
      ['Position filled', 'There is always another door.'],
      ['Not a culture fit', 'Find the teams that fit you back.'],
      ['Failed the whiteboard', 'Practice the problem, not the panic.'],
    ],
  },
  {
    title: 'Chapter 3 · First Job',
    sub: 'The real learning starts now.',
    milestone: 'Ship your first feature',
    steps: 6,
    critics: 4,
    interval: 3.1,
    flight: 1.4,
    boulderChance: 0.25,
    objects: ['bed', 'bookshelf', 'desk', 'coffee', 'beanbag'],
    task: { label: 'Write code', icon: '⌨️' },
    alt: { obj: 'bookshelf', label: 'Read the docs', icon: '📚', rate: 0.8 },
    rocks: [
      ['Bug in prod', 'Everyone breaks prod once. Write the postmortem.'],
      ['Imposter syndrome', 'Feeling unsure means you are still learning.'],
      ['47 review comments', 'Code review is free mentorship.'],
      ['Deadline moved up', 'Cut scope, not quality.'],
      ['Works on my machine', 'Reproduce it first. Then fix it.'],
      ['Legacy code', 'Leave it better than you found it.'],
    ],
  },
  {
    title: 'Chapter 4 · The Summit',
    sub: 'Look how far you have climbed.',
    milestone: 'Publish your portfolio',
    steps: 0,
    critics: 0,
    objects: ['coffee', 'trophy', 'desk', 'beanbag'],
    task: { label: 'Publish portfolio', icon: '🚀' },
    rocks: [],
  },
];

export const GIBBERISH = ['zib', 'na', 'bo', 'wub', 'zo', 'fra', 'mib', 'loo', 'ka', 'yib', 'nor', 'shoo', 'plu', 'dee', 'gah', 'vee', 'tib', 'oo'];
export function simlish(n = 3) {
  const w = [];
  for (let i = 0; i < n; i++) {
    let s = '';
    const k = 1 + Math.floor(Math.random() * 2);
    for (let j = 0; j < k; j++) s += GIBBERISH[Math.floor(Math.random() * GIBBERISH.length)];
    w.push(s);
  }
  const t = w.join(' ');
  return t.charAt(0).toUpperCase() + t.slice(1) + (Math.random() < 0.5 ? '!' : '...');
}
