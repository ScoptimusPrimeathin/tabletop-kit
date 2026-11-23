// =============================================================
// letstalk.js — game data for LET'S TALK! (v0.04)
// -------------------------------------------------------------
// LET'S TALK! — Stand-alone NPC dialogue system for solo roleplaying
// by Dr. Gerald Ravenpie (2024). https://ucmeumm.blogspot.com/
// The author allows any use of the document's text except making
// money. Tabletop Kit is a free, personal tool; the rules data below
// is used under that permission. Descriptions are short summaries in
// our own words; see the original PDF for the full text and examples.
// =============================================================

// Attitude columns, worst → best (same scale as the NPC hub, -2..+2).
export const ATTITUDE_COLS = ['Very unfriendly', 'Unfriendly', 'Neutral', 'Friendly', 'Very friendly'];

// ---------- Topic (when the NPC approaches you): 1d10 ----------
export const TOPICS = [
  [1, 2, 'Just saying hi'],
  [3, 4, 'Brings news'],
  [5, 6, 'Wants to remind you of something'],
  [7, 8, 'Has a petition or a demand'],
  [9, 10, 'Brings an opportunity'],
];

// ---------- Mood roll: 1d10 row × 1d10 column ----------
// Columns run from most negative (1-2) to most positive (9-10).
export const MOOD_GRID = [
  ['Angry', 'Bored', 'Chatty', 'Diplomatic', 'Caring'],
  ['Arrogant', 'Dubitative', 'Gossipy', 'Bold', 'Charming'],
  ['Defiant', 'Nitpicking', 'Impatient', 'Clueless', 'Empathic'],
  ['Egotist', 'Overwhelmed', 'Ironic', 'Dreamy', 'Excited'],
  ['Envious', 'Proud', 'Negotiator', 'Fair', 'Happy'],
  ['Fastidious', 'Sarcastic', 'Self-absorbed', 'Humble', 'Helpful'],
  ['Grumpy', 'Scared', 'Sleepy', 'Inquisitive', 'Pacific'],
  ['Harsh', 'Skeptical', 'Somber', 'Jokey', 'Patient'],
  ['Sad', 'Startled', 'Strict', 'Pleased', 'Placative'],
  ['Suspicious', 'Stubborn', 'Tired', 'Pragmatic', 'Sympathetic'],
];

// ---------- Mood by attitude: 1d10 within the Attitude's column ----------
export const MOOD_BY_ATTITUDE = {
  'Very unfriendly': ['Angry', 'Defiant', 'Harsh', 'Arrogant', 'Grumpy', 'Suspicious', 'Sarcastic', 'Skeptical', 'Dubitative', 'Pragmatic'],
  'Unfriendly': ['Angry', 'Harsh', 'Grumpy', 'Suspicious', 'Ironic', 'Skeptical', 'Impatient', 'Dubitative', 'Negotiator', 'Pragmatic'],
  'Neutral': ['Grumpy', 'Suspicious', 'Impatient', 'Nitpicking', 'Self-absorbed', 'Fair', 'Negotiator', 'Pragmatic', 'Diplomatic', 'Empathic'],
  'Friendly': ['Nitpicking', 'Dubitative', 'Self-absorbed', 'Chatty', 'Inquisitive', 'Fair', 'Patient', 'Empathic', 'Sympathetic', 'Helpful'],
  'Very friendly': ['Self-absorbed', 'Inquisitive', 'Pragmatic', 'Chatty', 'Fair', 'Patient', 'Empathic', 'Sympathetic', 'Helpful', 'Caring'],
};

// ---------- Reaction roll: 1d10 vs Attitude ----------
// Result levels: P = positive, SP = somewhat positive,
// SN = somewhat negative, N = negative.
export const LEVELS = ['P', 'SP', 'SN', 'N'];
export const LEVEL_NAMES = { P: 'Positive', SP: 'Somewhat positive', SN: 'Somewhat negative', N: 'Negative' };
// [d10 low, high, then the level for each Attitude column]
export const REACTION_ROLL = [
  [1, 2, 'N', 'N', 'N', 'N', 'N'],
  [3, 4, 'N', 'SN', 'SN', 'SN', 'SN'],
  [5, 6, 'SN', 'SN', 'SP', 'SP', 'SP'],
  [7, 8, 'SP', 'SP', 'SP', 'SP', 'P'],
  [9, 10, 'P', 'P', 'P', 'P', 'P'],
];

// ---------- Tones ----------
// base: always in the Tone Deck. Flirting/Romantic have requirements.
export const TONES = {
  Aggressive: { icon: '😡', base: true, hint: 'Demanding, threatening or violent. The worst tone to use with anyone.' },
  Charming: { icon: '😎', base: true, hint: 'Look cool, talk about something cool, or flatter. Not possible with someone Very unfriendly.' },
  Friendly: { icon: '😀', base: true, hint: 'Something heartwarming, or offering help. Not possible with someone Very unfriendly: an olive branch needs deeds first.' },
  Humorous: { icon: '😆', base: true, hint: 'A joke or a light tone: laughing with them, not at them.' },
  Questioning: { icon: '🤨', base: true, hint: 'Ask for information or an opinion, or voice doubts.' },
  Rude: { icon: '😒', base: true, hint: 'Sarcastic, dismissive, or venting about something unpleasant (not necessarily at them).' },
  Sad: { icon: '😭', base: true, hint: 'Something sad: condolences, melancholy, regret.' },
  Surprised: { icon: '😮', base: true, hint: 'Something baffling or strange, or trying to mystify them.' },
  Worried: { icon: '😥', base: true, hint: 'Something that worries you, concern for them, or a warning.' },
  Flirting: { icon: '😚', base: false, hint: 'Light flirting. Only with an NPC who is Unfriendly or better; can\'t be used again with them for a while.' },
  Romantic: { icon: '🥰', base: false, hint: 'A special moment with your partner. Only with an NPC you have a romance with; can\'t be used again for a while.' },
  'Err…hmm': { icon: '🤔', base: false, hint: 'You have nothing usable to say and look a bit silly.' },
};
export const BASE_TONES = Object.keys(TONES).filter((t) => TONES[t].base);

// ---------- NPC reactions ----------
export const REACTIONS = {
  Disagreement: { icon: '🙄', hint: 'Objects, but not vehemently: a blunt no, irony, or agreeing to disagree.' },
  Flirting: { icon: '😚', hint: 'Receptive, and flirts back.' },
  Furious: { icon: '🤬', hint: 'Really angry. The dialogue ends, badly.' },
  Happy: { icon: '😁', hint: 'Likes what you say a lot and shares the good feeling.' },
  Helpful: { icon: '😇', hint: 'Offers or accepts help: answers, advice, reassurance.' },
  Hostile: { icon: '😠', hint: 'Angry, probably at you, but still willing to talk.' },
  Malevolent: { icon: '😈', hint: 'Pleased at your expense.' },
  Neutral: { icon: '😐', hint: 'Unimpressed, indifferent, stalling, or a mixed bag.' },
  Questioning: { icon: '🤨', hint: 'Curious; wants to know more or has doubts.' },
  Reject: { icon: '😕', hint: 'Not receptive to your flirting or romance: wrong time or wrong person.' },
  Romantic: { icon: '🥰', hint: 'Your partner is also looking for a special moment.' },
  Rude: { icon: '😒', hint: 'Doesn\'t care or doesn\'t like it, or shares your anger.' },
  Sad: { icon: '😭', hint: 'Saddened or disappointed, or offers condolences.' },
  Satisfaction: { icon: '🙂', hint: 'Likes it, or at least politely agrees.' },
  Surprised: { icon: '😮', hint: 'Surprised by what you said, or shares your surprise.' },
  Worried: { icon: '😥', hint: 'Perturbed, scared or uneasy.' },
};

// ---------- Tone → reaction, by attitude group ----------
// Groups: 0 = Very unfriendly, 1 = Unfriendly/Neutral, 2 = Friendly/Very friendly.
// Each entry lists reactions in order P, SP, SN, N. null = tone not available.
export const attitudeGroup = (v) => (v <= -2 ? 0 : v <= 0 ? 1 : 2);
export const REACTION_TABLE = {
  Aggressive: [['Rude', 'Hostile', 'Hostile', 'Furious'], ['Disagreement', 'Rude', 'Hostile', 'Hostile'], ['Worried', 'Disagreement', 'Rude', 'Hostile']],
  Charming: [null, ['Satisfaction', 'Surprised', 'Questioning', 'Neutral'], ['Happy', 'Satisfaction', 'Questioning', 'Neutral']],
  Friendly: [null, ['Happy', 'Satisfaction', 'Neutral', 'Disagreement'], ['Helpful', 'Happy', 'Satisfaction', 'Neutral']],
  Humorous: [['Satisfaction', 'Questioning', 'Rude', 'Hostile'], ['Happy', 'Satisfaction', 'Neutral', 'Disagreement'], ['Happy', 'Satisfaction', 'Surprised', 'Questioning']],
  Questioning: [['Questioning', 'Neutral', 'Malevolent', 'Rude'], ['Helpful', 'Questioning', 'Neutral', 'Malevolent'], ['Helpful', 'Questioning', 'Surprised', 'Neutral']],
  Rude: [['Disagreement', 'Rude', 'Hostile', 'Furious'], ['Surprised', 'Disagreement', 'Rude', 'Hostile'], ['Surprised', 'Disagreement', 'Worried', 'Rude']],
  Sad: [['Questioning', 'Neutral', 'Malevolent', 'Rude'], ['Sad', 'Surprised', 'Questioning', 'Neutral'], ['Helpful', 'Sad', 'Surprised', 'Questioning']],
  Surprised: [['Surprised', 'Neutral', 'Malevolent', 'Rude'], ['Surprised', 'Questioning', 'Neutral', 'Malevolent'], ['Helpful', 'Surprised', 'Questioning', 'Neutral']],
  Worried: [['Questioning', 'Neutral', 'Malevolent', 'Rude'], ['Questioning', 'Surprised', 'Worried', 'Neutral'], ['Helpful', 'Questioning', 'Worried', 'Neutral']],
  Flirting: [null, ['Flirting', 'Satisfaction', 'Neutral', 'Reject'], ['Flirting', 'Happy', 'Satisfaction', 'Reject']],
  Romantic: [null, ['Romantic', 'Satisfaction', 'Neutral', 'Reject'], ['Romantic', 'Happy', 'Satisfaction', 'Reject']],
  'Err…hmm': [['Neutral', 'Disagreement', 'Malevolent', 'Rude'], ['Surprised', 'Neutral', 'Disagreement', 'Malevolent'], ['Worried', 'Surprised', 'Neutral', 'Disagreement']],
};

// ---------- Advanced Moods: mechanical effects (optional rule) ----------
// Encoded so the engine can apply them:
//   mods: { Tone|'all': ±1 }   attitude step for those tones in an exchange
//   restrict: [tones]          unusable this dialogue
//   reshuffle: [tones]         the first time drawn, goes back in the deck
//   shift: { from: to }        change reaction levels (P/SP/SN/N)
//   until: [reactions]         effect stops after one of these reactions
//   after: [reactions]         effect only starts after one of these
//   exchanges: [n…]            only in these exchanges
//   special: 'negotiator' | 'pragmatic' | 'tired'
//   text: short summary for the screen
const GOOD = ['Flirting', 'Happy', 'Helpful', 'Romantic', 'Satisfaction'];
const BAD3 = ['Furious', 'Hostile', 'Rude'];
export const MOOD_EFFECTS = {
  Angry: { mods: { all: -1 }, until: GOOD, text: '−1 to every tone until a Flirting, Happy, Helpful, Romantic or Satisfaction reaction.' },
  Arrogant: { mods: { Rude: -1 }, restrict: ['Charming'], until: GOOD, text: '−1 Rude and no Charming until a Flirting, Happy, Helpful, Romantic or Satisfaction reaction.' },
  Bold: { mods: { Aggressive: -1, Rude: -1 }, text: '−1 Aggressive and −1 Rude.' },
  Bored: { mods: { Charming: -1 }, restrict: ['Surprised'], until: ['Flirting', 'Romantic', 'Surprised'], text: '−1 Charming and no Surprised until a Flirting, Romantic or Surprised reaction.' },
  Caring: { mods: { Sad: 1, Worried: 1 }, until: BAD3, text: '+1 Sad and +1 Worried until a Furious, Hostile or Rude reaction.' },
  Charming: { mods: { Charming: 1, Flirting: 1, Romantic: 1 }, until: ['Furious', 'Hostile', 'Reject', 'Rude'], text: '+1 Charming, Flirting and Romantic until a Furious, Hostile, Reject or Rude reaction.' },
  Chatty: { mods: { Questioning: 1, Surprised: 1 }, text: '+1 Questioning and +1 Surprised.' },
  Clueless: { mods: { Worried: 1 }, restrict: ['Questioning'], text: '+1 Worried and no Questioning.' },
  Defiant: { mods: { Rude: -1 }, restrict: ['Friendly'], text: '−1 Rude and no Friendly.' },
  Diplomatic: { shift: { SN: 'SP' }, until: BAD3, text: 'Somewhat negative becomes somewhat positive until a Furious, Hostile or Rude reaction.' },
  Dreamy: { mods: { Friendly: 1, Charming: 1 }, until: ['Furious', 'Hostile', 'Reject', 'Rude', 'Sad', 'Worried'], text: '+1 Friendly and +1 Charming until a Furious, Hostile, Reject, Rude, Sad or Worried reaction.' },
  Dubitative: { mods: { Charming: -1, Questioning: 1 }, text: '−1 Charming and +1 Questioning.' },
  Egotist: { mods: { Worried: -1 }, restrict: ['Sad'], text: '−1 Worried and no Sad.' },
  Empathic: { mods: { Sad: 1, Worried: 1 }, text: '+1 Sad and +1 Worried.' },
  Envious: { mods: { Friendly: -1 }, restrict: ['Charming'], text: '−1 Friendly and no Charming.' },
  Excited: { shift: { SP: 'P', SN: 'N' }, text: 'Somewhat positive becomes positive, and somewhat negative becomes negative.' },
  Fair: { text: 'No effect.' },
  Fastidious: { mods: { Sad: -1, Worried: -1 }, until: ['Sad', 'Worried'], text: '−1 Sad and −1 Worried until a Sad or Worried reaction.' },
  Gossipy: { mods: { Questioning: 1 }, reshuffle: ['Questioning'], text: '+1 Questioning, and Questioning goes back in the deck the first time it\'s drawn.' },
  Grumpy: { mods: { all: -1 }, until: GOOD, text: '−1 to every tone until a Flirting, Happy, Helpful, Romantic or Satisfaction reaction.' },
  Happy: { mods: { all: 1 }, until: ['Furious', 'Hostile', 'Reject', 'Rude', 'Sad', 'Worried'], text: '+1 to every tone until a Furious, Hostile, Reject, Rude, Sad or Worried reaction.' },
  Harsh: { mods: { all: -1 }, after: ['Disagreement', 'Furious', 'Hostile', 'Reject', 'Rude'], text: '−1 to every tone after a Disagreement, Furious, Hostile, Reject or Rude reaction.' },
  Helpful: { mods: { Sad: 1, Worried: 1 }, until: BAD3, text: '+1 Sad and +1 Worried until a Furious, Hostile or Rude reaction.' },
  Humble: { mods: { all: 1 }, exchanges: [1], text: '+1 to every tone in the first exchange.' },
  Impatient: { mods: { all: -1 }, exchanges: [2, 3], text: '−1 to every tone in the second and third exchanges.' },
  Inquisitive: { mods: { Questioning: 1 }, text: '+1 Questioning.' },
  Ironic: { mods: { all: -1 }, until: BAD3, text: '−1 to every tone until a Furious, Hostile or Rude reaction.' },
  Jokey: { mods: { Humorous: 1 }, reshuffle: ['Humorous'], text: '+1 Humorous, and Humorous goes back in the deck the first time it\'s drawn.' },
  Negotiator: { special: 'negotiator', text: 'After a negative reaction, −1 to every tone next exchange; after a positive one, +1.' },
  Nitpicking: { shift: { SP: 'SN' }, text: 'Somewhat positive becomes somewhat negative.' },
  Overwhelmed: { mods: { Rude: 1, Aggressive: 1 }, text: '+1 Rude and +1 Aggressive.' },
  Pacific: { mods: { Rude: 1 }, restrict: ['Aggressive'], text: '+1 Rude and no Aggressive.' },
  Patient: { shift: { N: 'SN' }, text: 'Negative becomes somewhat negative.' },
  Placative: { mods: { Aggressive: 1, Rude: 1 }, until: BAD3, text: '+1 Aggressive and +1 Rude until a Furious, Hostile or Rude reaction.' },
  Pleased: { mods: { all: 1 }, until: ['Disagreement', 'Furious', 'Hostile', 'Reject', 'Rude', 'Sad', 'Worried'], text: '+1 to every tone until a Disagreement, Furious, Hostile, Reject, Rude, Sad or Worried reaction.' },
  Pragmatic: { special: 'pragmatic', text: 'The first positive reaction becomes somewhat positive, and the first negative becomes somewhat negative.' },
  Proud: { mods: { all: -1 }, after: ['Disagreement', 'Furious', 'Hostile', 'Reject', 'Rude'], text: '−1 to every tone after a Disagreement, Furious, Hostile, Reject or Rude reaction.' },
  Sad: { mods: { Sad: 1 }, restrict: ['Humorous'], until: ['Flirting', 'Happy', 'Romantic', 'Satisfaction'], text: '+1 Sad and no Humorous until a Flirting, Happy, Romantic or Satisfaction reaction.' },
  Sarcastic: { mods: { all: -1 }, until: GOOD, text: '−1 to every tone until a Flirting, Happy, Helpful, Romantic or Satisfaction reaction.' },
  Scared: { mods: { Worried: 1 }, reshuffle: ['Worried'], text: '+1 Worried, and Worried goes back in the deck the first time it\'s drawn.' },
  'Self-absorbed': { mods: { Sad: -1 }, restrict: ['Worried'], until: ['Sad', 'Surprised', 'Worried'], text: '−1 Sad and no Worried until a Sad, Surprised or Worried reaction.' },
  Skeptical: { mods: { all: -1 }, exchanges: [1], text: '−1 to every tone in the first exchange.' },
  Sleepy: { mods: { Questioning: -1 }, restrict: ['Surprised'], text: '−1 Questioning and no Surprised.' },
  Somber: { mods: { Worried: 1 }, restrict: ['Humorous'], text: '+1 Worried and no Humorous.' },
  Startled: { mods: { Surprised: 1 }, reshuffle: ['Surprised'], text: '+1 Surprised, and Surprised goes back in the deck the first time it\'s drawn.' },
  Strict: { shift: { SN: 'N' }, text: 'Somewhat negative becomes negative.' },
  Stubborn: { mods: { all: -1 }, after: ['Disagreement', 'Furious', 'Hostile', 'Rude'], text: '−1 to every tone after a Disagreement, Furious, Hostile or Rude reaction.' },
  Suspicious: { shift: { SP: 'SN', P: 'SP' }, exchanges: [1], text: 'In the first exchange, positive becomes somewhat positive and somewhat positive becomes somewhat negative.' },
  Sympathetic: { mods: { Friendly: 1 }, reshuffle: ['Friendly'], until: BAD3, text: '+1 Friendly, and Friendly goes back in the deck the first time it\'s drawn, until a Furious, Hostile or Rude reaction.' },
  Tired: { special: 'tired', text: 'The dialogue ends after the second exchange.' },
};

export const ALL_MOODS = Object.keys(MOOD_EFFECTS).sort();

export const CREDIT = 'LET\'S TALK! by Dr. Gerald Ravenpie (2024), used under the author\'s non-commercial permission. ucmeumm.blogspot.com';
