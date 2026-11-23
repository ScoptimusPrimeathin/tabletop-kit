// =============================================================
// keepingcontact.js — labels and flavour for KEEPING CONTACT! (v0.03)
// -------------------------------------------------------------
// KEEPING CONTACT! — Stand-alone social system for solo roleplaying
// by Dr. Gerald Ravenpie (2024). https://ucmeumm.blogspot.com/
// The author allows any use of the document's text except making
// money; Tabletop Kit is free and personal. The rules live in
// ../keepingcontact.js; prompts below are short paraphrases.
// =============================================================

// What each Attitude level means, depending on the relationship type.
// Index 0 = -2 … index 4 = +2.
export const LEVEL_NAMES = {
  default: ['Hostile', 'Unfavorable', 'Neutral / cautious', 'Favorable', 'Friendly'],
  bond: ['Toxic', 'Cold', 'Respect', 'Loyal', 'Heartfelt'],
  romance: ['Hurtful', 'Cold', 'Romantic', 'Love', 'True love'],
  outsider: ['Despised', 'Distrusted', 'Neutral', 'Trusted', 'Ally'],       // Reputation
  member: ['Foot out the door', 'Lacking', 'Under test', 'Valued member', 'Paragon'], // Status
  leader: ['Revolt', 'Lacking', 'Acceptance', 'Satisfaction', 'Veneration'], // Leadership
  ties: ['Enemies', 'Animosity', 'Just business', 'Cordiality', 'Allies'],   // faction ↔ faction
};
export const levelName = (kind, v) => (LEVEL_NAMES[kind] || LEVEL_NAMES.default)[v + 2];

// First impressions (1d6 by Attitude), paraphrased prompts.
export const FIRST_IMPRESSIONS = {
  '-2': ['Instant hatred', 'Wouldn\'t give a penny for them', 'Untrustworthy', 'Reminds you of someone you hate', 'They\'re ignoring you!', 'Nothing but trouble'],
  '-1': ['Boring', 'A nobody', 'Something unpleasant about them', 'Reminds you of someone you dislike', 'A waste of your time', 'Not worth a dollar'],
  '0': ['Hard to read, and that\'s unsettling', 'Seems to be hiding something', 'Something unnerving about them', 'Fine, one chance', 'Can\'t decide yet', 'Still has to prove themselves'],
  '1': ['Funny!', 'Grudging respect', 'Something oddly alluring', 'Reminds you of someone you like', 'More than meets the eye', 'Some common ground'],
  '2': ['You want to know more', 'Feels trustworthy', 'Looks cool!', 'Reminds you of someone you adore', 'Feels like family', 'A kindred spirit'],
};

// Backstory between two characters (1d6 by Attitude), paraphrased prompts.
export const BACKSTORIES = {
  '-2': ['Mutual grudges', 'A sore rivalry', 'Clashing personalities', 'One deliberately hurt the other', 'One envies the other', 'Their backgrounds set them against each other'],
  '-1': ['An intense rivalry', 'One let the other down once', 'One thinks the other weak or unreliable', 'One reminds the other of someone they dislike', 'One hurt the other without meaning to', 'A rocky start'],
  '0': ['One topic they never agree on', 'They only just met', 'One finds the other too cautious or too reckless', 'A competitive streak', 'They used to be closer', 'One sees wasted potential in the other'],
  '1': ['A shared hobby', 'Distant relatives', 'Old acquaintances', 'Same dream, but not the means', 'A secret crush (one way)', 'A friendly rivalry'],
  '2': ['Personalities that fit perfectly', 'Close family', 'Best friends forever', 'Same dream and the means to reach it', 'An obvious crush (one way)', 'A mutual crush'],
};

export const CREDIT = 'KEEPING CONTACT! by Dr. Gerald Ravenpie (2024), used under the author\'s non-commercial permission. ucmeumm.blogspot.com';
