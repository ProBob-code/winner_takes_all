/**
 * What a scorer said, turned into the same taps the buttons make.
 *
 * WHERE THE WORDS COME FROM
 * Two places, and this file does not care which. On a phone, the browser's own
 * speech recognition. On a laptop, Handy (github.com/cjpais/Handy), which is a
 * desktop app with no API: it transcribes on the machine and pastes the text
 * into whatever field has focus. Either way what arrives here is a string, and
 * a string is all this needs.
 *
 * WHAT IT UNDERSTANDS
 *   "Bob note the points"            the wake phrase; arms hands-free listening
 *   "Bob note the points, Asha two balls one foul"
 *   "Asha 2 balls, Ravi a foul"      several players in one breath
 *   "two balls for Asha"             the name may come after
 *   "Ravi point" / "Ravi goal"       a point is a ball at pool, a goal at football
 *   "Asha the black" / "8 ball"      the black (the screen asks before it counts)
 *   "undo Ravi's foul", "remove a ball from Asha"
 *   "scratch that" / "undo"          take back the last thing said
 *   "left two balls", "right foul"   the side instead of the name: left (or top,
 *                                    on a phone held upright) is the first player
 *   "kay kay foul"                   a name that is initials, said as letters
 *
 * WHY SO FORGIVING
 * Speech recognisers write "to balls", "fowl", "bowls" and "2balls". The
 * homophones are only read as numbers when a scoring word follows them, so
 * "two balls to Asha" still means two balls for Asha and not four.
 *
 * WHAT IT WILL NOT DO
 * Guess. A scoring word with no player named anywhere in the sentence is
 * reported, not given to whoever is ahead. A name both players share ("Rahul"
 * in a Rahul v Rahul frame) is not a name it can use, and the screen says so.
 */

import type { LocalScoreEvent } from "./local-score";

export type VoiceSport = "POOL" | "FOOTBALL";

export interface VoicePlayer {
  id: string;
  name: string;
}

export interface VoiceEvent {
  teamId: string;
  type: LocalScoreEvent;
}

export interface ParsedVoiceCommand {
  /** The taps, in the order they were said. */
  events: VoiceEvent[];
  /** "Scratch that": take back the last batch. */
  undoLast: boolean;
  /** Things heard that could not be turned into a tap, for the screen. */
  problems: string[];
  /** The wake phrase was in the text. */
  wake: boolean;
  /** The normalised text after the wake phrase, which is what was parsed. */
  heard: string;
}

/** `current` while scoring is stopped by a word we could not place. */
const BLOCKED = "\u0000blocked";

/** Seven a side at 8-ball; more than that in one breath was misheard. */
const MAX_COUNT = 7;

/**
 * "Bob note the points", as recognisers actually write it.
 *
 * "Bob" is the assistant's name, not a player's: a player called Bob still
 * works, because the wake phrase is the whole phrase and only the text after it
 * is read for names.
 */
const WAKE_RE =
  /\b(?:bob|bobb|bop|bobby|bab)\s+(?:note|notes|noted|not|know|knows|nod|nut|no)\s+(?:the\s+|da\s+|de\s+|this\s+)?(?:point|points|poins|pointz)\b/;

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, a: 1, an: 1, single: 1, another: 1,
};

/** Read as numbers only when a scoring word comes straight after. */
const HOMOPHONES: Record<string, number> = {
  won: 1, to: 2, too: 2, tu: 2, tree: 3, free: 3, for: 4, fore: 4, ate: 8,
};

type Unit = "BALL" | "POINT" | "FOUL" | "BLACK" | "GOAL";

const UNITS: Record<string, Unit> = {
  ball: "BALL", balls: "BALL", bowl: "BALL", bowls: "BALL", bol: "BALL", boll: "BALL",
  bols: "BALL", bulls: "BALL", boles: "BALL",
  point: "POINT", points: "POINT",
  foul: "FOUL", fouls: "FOUL", fowl: "FOUL", fowls: "FOUL", foal: "FOUL", foals: "FOUL",
  // How the on-device model actually wrote "foul" from a synthesised voice.
  fell: "FOUL", fouled: "FOUL", fool: "FOUL", feller: "FOUL", fall: "FOUL", falls: "FOUL",
  fal: "FOUL", fow: "FOUL", faul: "FOUL",
  // "a foul" run together into one word.
  afoul: "FOUL", afel: "FOUL", afell: "FOUL",
  black: "BLACK", blacks: "BLACK", blake: "BLACK",
  goal: "GOAL", goals: "GOAL", gol: "GOAL",
};

/** Words that turn the next scoring word into its undo. */
const REMOVERS = new Set([
  "undo", "remove", "minus", "cancel", "delete", "scratch", "less", "takeaway", "subtract",
]);

/**
 * Words people put between a name and a score. Known, so they are passed
 * over; anything else in that position is taken to be a name that was not
 * recognised, and stops the score going to whoever was named before it.
 */
const FILLERS = new Set([
  "um", "umm", "uh", "er", "hmm", "ah", "oh", "okay", "ok", "so", "yeah", "yes", "side",
  "now", "also", "again", "then", "just", "more", "with", "have", "had", "made", "makes",
  "scored", "score", "scores", "pot", "pots", "potted", "sunk", "sinks", "sank", "did",
  "does", "commits", "committed", "gave", "plays", "played", "shot", "wait", "sorry",
  "actually", "please", "mark", "note", "put", "write", "for", "to", "on", "in", "at",
  "into", "goes", "went", "another", "his", "her", "their",
]);

/** Never a player's name, even if it is a token of one. */
const RESERVED = new Set([
  ...Object.keys(NUMBER_WORDS),
  ...Object.keys(HOMOPHONES),
  ...Object.keys(UNITS),
  ...REMOVERS,
  "the", "and", "from", "of", "by", "that", "this", "last", "take", "back", "off",
  "away", "is", "has", "gets", "got", "give", "player", "plus", "add", "s", "eight",
  ...FILLERS,
]);

const own = (table: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(table, key);

/** Lower case, letters and digits only, "2balls" split into "2 balls". */
export function normaliseSpeech(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, " and ")
    // "Ravi's" -> "ravi", so a possessive still names the player.
    .replace(/['’]s\b/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/(\p{N})(\p{L})/gu, "$1 $2")
    .replace(/(\p{L})(\p{N})/gu, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

/** Where the wake phrase is, and what was said after it. */
export function findWakePhrase(text: string): { found: boolean; after: string } {
  const normalised = normaliseSpeech(text);
  const match = WAKE_RE.exec(normalised);
  if (!match) return { found: false, after: normalised };
  return { found: true, after: normalised.slice(match.index + match[0].length).trim() };
}

/** Edit distance, capped: names are short and only 1–2 edits matter. */
function editDistance(a: string, b: string, cap: number): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      rowMin = Math.min(rowMin, current[j]);
    }
    if (rowMin > cap) return cap + 1;
    previous = current;
  }
  return previous[b.length];
}

/**
 * How a name sounds, roughly: the first letter (any vowel as "a") and then
 * the consonants, with the pairs a recogniser confuses folded together —
 * v/w/b, z/s, c/k, j/g, the h in "sh"/"bh"/"dh", and a trailing r. So
 * "Robbie" sounds like "Ravi", and "Asher" and "Esha" like "Asha".
 */
export function soundsLike(word: string): string {
  let w = word.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z]/g, "");
  if (w.length > 3) w = w.replace(/e?r$/, "");
  w = w
    .replace(/ph/g, "f")
    .replace(/[vw]/g, "b")
    .replace(/[zx]/g, "s")
    .replace(/q/g, "k")
    .replace(/c(?=[eiy])/g, "s")
    .replace(/c/g, "k")
    .replace(/j/g, "g")
    .replace(/(?<=.)h/g, "");
  if (!w) return "";
  const first = /[aeiouy]/.test(w[0]) ? "a" : w[0];
  const rest = w.slice(1).replace(/[aeiouy]/g, "").replace(/(.)\1+/g, "$1");
  return (first + rest).replace(/(.)\1+/g, "$1");
}

function commonPrefix(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

interface Alias {
  teamId: string;
  tokens: string[];
  /** Set when the name is initials ("KK", "Rj"): the letters, to be heard spoken. */
  letters?: string[];
}

/**
 * How recognisers write a letter said on its own. "KK" is said "kay kay", and
 * comes back as "k k", "kay kay", "okay okay" or "kaykay", never as "kk".
 */
const LETTER_FORMS: Record<string, string[]> = {
  a: ["a", "ay", "eh", "hey"], b: ["b", "be", "bee"], c: ["c", "see", "sea", "si"],
  d: ["d", "dee", "di"], e: ["e", "ee"], f: ["f", "ef", "eff"], g: ["g", "gee", "ji", "jee"],
  h: ["h", "aitch", "edge", "etch"], i: ["i", "eye", "aye"], j: ["j", "jay", "je", "jai"],
  k: ["k", "kay", "kai", "okay", "ok", "cay", "que", "kei", "ke"], l: ["l", "el", "ell"],
  m: ["m", "em"], n: ["n", "en"], o: ["o", "oh"], p: ["p", "pee", "pea", "pe"],
  q: ["q", "queue", "cue"], r: ["r", "are", "ar"], s: ["s", "es", "ess"],
  t: ["t", "tee", "tea", "ti"], u: ["u", "you"], v: ["v", "vee", "we"],
  w: ["w"], x: ["x", "ex"], y: ["y", "why"], z: ["z", "zed", "zee"],
};

/**
 * Whether a written name is initials rather than a word: "KK", "RJ", "Kk".
 * Upper case and short, or short with no vowel to say it by.
 */
function isInitials(raw: string): boolean {
  const word = raw.replace(/[^\p{L}]/gu, "");
  if (word.length < 1 || word.length > 3 || !/^[a-z]+$/i.test(word)) return false;
  return /^[A-Z]+$/.test(word) || !/[aeiouy]/i.test(word);
}

/**
 * Words that name a side without naming the player: the first player's card
 * is on the left (on top, on a phone held upright), the second's on the right.
 * A name the recogniser keeps mangling can always be scored this way.
 */
const SIDE_WORDS: [string[][], string[][]] = [
  [["left"], ["top"], ["first"], ["player", "one"], ["player", "1"], ["first", "player"]],
  [["right"], ["bottom"], ["second"], ["player", "two"], ["player", "2"], ["player", "to"], ["second", "player"]],
];

/**
 * Every way a player can be named: the whole name, and each word of it that
 * belongs to them alone. Longest first, so "Asha Rao" beats "Asha".
 */
function buildAliases(players: VoicePlayer[]): { aliases: Alias[]; shared: Set<string> } {
  const tokenised = players.map((p) => ({
    id: p.id,
    tokens: normaliseSpeech(p.name).split(" ").filter(Boolean),
  }));

  const owners = new Map<string, Set<string>>();
  for (const player of tokenised) {
    for (const token of player.tokens) {
      if (!owners.has(token)) owners.set(token, new Set());
      owners.get(token)!.add(player.id);
    }
  }

  const shared = new Set<string>();
  const aliases: Alias[] = [];

  // Initials, heard as letters. Only when the whole name is initials, so a
  // "Raj" stays a word.
  for (const player of players) {
    const raw = player.name.trim().split(/\s+/).filter(Boolean);
    if (raw.length === 1 && isInitials(raw[0])) {
      const letters = raw[0].toLowerCase().split("");
      if (letters.every((l) => own(LETTER_FORMS, l))) {
        aliases.push({ teamId: player.id, tokens: letters, letters });
      }
    }
  }

  // The sides. Every frame has two.
  if (players.length === 2) {
    players.forEach((player, index) => {
      for (const tokens of SIDE_WORDS[index]) aliases.push({ teamId: player.id, tokens });
    });
  }

  for (const player of tokenised) {
    // A side called "Black" or "Two" cannot be named by voice without
    // swallowing the word that scores; its other words still work.
    const usable = player.tokens.length > 1 || !RESERVED.has(player.tokens[0] ?? "");
    if (player.tokens.length > 0 && usable) aliases.push({ teamId: player.id, tokens: player.tokens });
    for (const token of player.tokens) {
      if (token.length < 2 || RESERVED.has(token)) continue;
      if (owners.get(token)!.size > 1) {
        shared.add(token);
        continue;
      }
      if (player.tokens.length > 1) aliases.push({ teamId: player.id, tokens: [token] });
    }
  }
  aliases.sort((a, b) => b.tokens.length - a.tokens.length);
  return { aliases, shared };
}

/** The player named at `at`, and how many words the name took. */
function matchPlayer(
  words: string[],
  at: number,
  aliases: Alias[]
): { teamId: string; length: number } | null {
  for (const alias of aliases) {
    const slice = words.slice(at, at + alias.tokens.length);
    if (slice.length === alias.tokens.length && slice.every((w, i) => w === alias.tokens[i])) {
      return { teamId: alias.teamId, length: alias.tokens.length };
    }
  }

  // Initials said as letters: "kay kay", "okay okay", or run into one word.
  for (const alias of aliases) {
    const letters = alias.letters;
    if (!letters) continue;
    const slice = words.slice(at, at + letters.length);
    if (slice.length === letters.length && slice.every((w, i) => LETTER_FORMS[letters[i]].includes(w))) {
      return { teamId: alias.teamId, length: letters.length };
    }
    if (spokenAsOneWord(words[at], letters)) return { teamId: alias.teamId, length: 1 };
  }

  // One name written as two words: "ball a" for "Bala", "ash a" for "Asha".
  // Held to one letter off, so a real "ball" is never taken for a name.
  const following = words[at + 1];
  if (following !== undefined && !/^\p{N}+$/u.test(words[at]) && !/^\p{N}+$/u.test(following) && !own(UNITS, following)) {
    const owner = closestSpelling(words[at] + following, aliases, 1);
    if (owner) return { teamId: owner, length: 2 };
  }

  // Close enough, for one word: "Ashaa", "Ravvi". Only for words long enough
  // that one letter off is still recognisably the same name.
  const word = words[at];
  if (word.length < 3 || RESERVED.has(word) || /^\p{N}+$/u.test(word)) return null;
  const spelt = word.length >= 4 ? closestSpelling(word, aliases) : null;
  if (spelt) return { teamId: spelt, length: 1 };

  // Then by sound, for what spelling cannot reach: "Robbie" for "Ravi".
  const key = soundsLike(word);
  if (key.length < 2) return null;
  const heard = new Set(
    aliases
      .filter((a) => a.tokens.length === 1 && !a.letters && !isSideWord(a.tokens) && soundsLike(a.tokens[0]) === key)
      .map((a) => a.teamId)
  );
  return heard.size === 1 ? { teamId: [...heard][0], length: 1 } : null;
}

/** The one player whose name is a letter or two from `word`, if only one is. */
function closestSpelling(word: string, aliases: Alias[], maxCap?: number): string | null {
  let best: { teamId: string; distance: number } | null = null;
  let tie = false;
  for (const alias of aliases) {
    if (alias.tokens.length !== 1 || alias.letters || isSideWord(alias.tokens)) continue;
    const target = alias.tokens[0];
    if (target.length < 4) continue;
    // Two edits for long names, or for a word that starts like the name:
    // the on-device model wrote "Asha" as "Asher". With two players at the
    // table and ties refused, generous costs little.
    const loose = target.length >= 7 || commonPrefix(word, target) >= 3 ? 2 : 1;
    const cap = maxCap === undefined ? loose : Math.min(loose, maxCap);
    const distance = editDistance(word, target, cap);
    if (distance > cap) continue;
    if (!best || distance < best.distance) {
      best = { teamId: alias.teamId, distance };
      tie = false;
    } else if (distance === best.distance && best.teamId !== alias.teamId) {
      tie = true;
    }
  }
  return best && !tie ? best.teamId : null;
}

/**
 * How alike two words are, 0 to 1: the better of their spelling and their
 * sound (soundsLike), each as one minus edit distance over the longer length.
 */
function likeness(heard: string, name: string): number {
  const ratio = (a: string, b: string) => {
    const longer = Math.max(a.length, b.length);
    if (longer === 0) return 0;
    return 1 - editDistance(a, b, longer) / longer;
  };
  return Math.max(ratio(heard, name), ratio(soundsLike(heard), soundsLike(name)));
}

/** How alike a heard word must be to the nearer name, and by how much nearer. */
const NEAREST_FLOOR = 0.45;
const NEAREST_MARGIN = 0.2;

/**
 * The player an unrecognised word most likely was, at a two-player table.
 *
 * Only ever asked about words in a name's place: just before a count or a
 * scoring word, where nothing else could be. There are two names to choose
 * between, not a dictionary, so "Ballot" is plainly Bala and not Kk even
 * though it is three letters from either spelling. Refuses when the two
 * names are about as near as each other, or when neither is near at all.
 * Benchmarked on what the on-device models really wrote: "Ballot", "ballet",
 * "Baller" for Bala, "I should" for Aishu.
 */
function nearestOfTwo(run: string[], players: VoicePlayer[]): string | null {
  if (players.length !== 2 || run.length === 0) return null;
  const names = players.map((p) => normaliseSpeech(p.name).replace(/ /g, ""));
  const candidates = new Set<string>();
  for (let take = 1; take <= Math.min(3, run.length); take++) candidates.add(run.slice(-take).join(""));
  let best: { id: string; score: number } | null = null;
  let second = 0;
  for (const heard of candidates) {
    if (heard.length < 2) continue;
    const scores = names.map((name) => likeness(heard, name));
    const winner = scores[0] >= scores[1] ? 0 : 1;
    const gap = scores[winner] - scores[1 - winner];
    if (!best || scores[winner] > best.score) {
      best = { id: players[winner].id, score: scores[winner] };
      second = scores[winner] - gap;
    }
  }
  if (!best || best.score < NEAREST_FLOOR || best.score - second < NEAREST_MARGIN) return null;
  return best.id;
}

/** "kaykay", "kk", "kayk": initials said and written as one word. */
function spokenAsOneWord(word: string, letters: string[]): boolean {
  let options = [""];
  for (const letter of letters) {
    const next: string[] = [];
    for (const start of options) for (const form of LETTER_FORMS[letter]) next.push(start + form);
    options = next;
  }
  return options.includes(word);
}

const SIDE_KEYS = new Set(SIDE_WORDS.flat().map((tokens) => tokens.join(" ")));
function isSideWord(tokens: string[]): boolean {
  return SIDE_KEYS.has(tokens.join(" "));
}

/** The tap a scoring word makes, or why it makes none. */
function toEvent(
  unit: Unit,
  remove: boolean,
  sport: VoiceSport
): { event: LocalScoreEvent } | { problem: string } {
  if (sport === "FOOTBALL") {
    if (unit === "GOAL" || unit === "POINT") return { event: remove ? "REMOVE_GOAL" : "GOAL" };
    return { problem: `“${unit.toLowerCase()}” is not something football scores. Say “goal”.` };
  }
  switch (unit) {
    case "BALL":
    case "POINT":
      return { event: remove ? "REMOVE_BALL" : "BALL" };
    case "FOUL":
      return { event: remove ? "REMOVE_FOUL" : "FOUL" };
    case "BLACK":
      return remove ? { problem: "The black cannot be taken back by voice." } : { event: "BLACK" };
    case "GOAL":
      return { problem: "“goal” is not something pool scores. Say “ball” or “point”." };
  }
}

/**
 * Parse one utterance.
 *
 * `players` are the two sides of the live frame. Pass the raw recogniser
 * output; the wake phrase, if it is there, is found and skipped.
 */
export function parseVoiceCommand(
  text: string,
  players: VoicePlayer[],
  sport: VoiceSport
): ParsedVoiceCommand {
  const { found, after } = findWakePhrase(text);
  const words = after.split(" ").filter(Boolean);
  const { aliases, shared } = buildAliases(players);

  const events: VoiceEvent[] = [];
  const problems: string[] = [];
  /** Said before any name: whose they are is decided by the next name. */
  const orphans: { type: LocalScoreEvent; count: number }[] = [];

  /**
   * Who the next score is for. BLOCKED after a word in a name's place that is
   * not a name we know: "Asha one ball, Robbie one foul" once gave Asha the
   * foul. A score nobody can be sure of is reported, never redirected.
   */
  let current: string | null = null;
  let blockedBy: string | null = null;
  const blockedReported = new Set<string>();
  let count: number | null = null;
  let remove = false;
  let removeUsed = false;
  let sharedHeard: string | null = null;
  /** Words since the last thing understood that no rule recognised. */
  let unknownRun: string[] = [];

  const emit = (type: LocalScoreEvent, times: number) => {
    // A score with nobody (or nobody we know) named just before it: the words
    // in the name's place were most likely one of the two names, misheard.
    if ((current === null || current === BLOCKED) && unknownRun.length > 0) {
      const guess = nearestOfTwo(unknownRun, players);
      if (guess) {
        if (current === null && orphans.length > 0) {
          for (const orphan of orphans.splice(0)) {
            for (let k = 0; k < orphan.count; k++) events.push({ teamId: guess, type: orphan.type });
          }
        }
        current = guess;
        blockedBy = null;
      }
    }
    unknownRun = [];
    if (current === BLOCKED) {
      if (blockedBy && !blockedReported.has(blockedBy)) {
        blockedReported.add(blockedBy);
        problems.push(
          shared.has(blockedBy)
            ? `Both players are called “${blockedBy}”, so nothing after it was scored. Use the other word of the name.`
            : `Didn't recognise “${blockedBy}” as either player, so nothing after it was scored.`
        );
      }
      return;
    }
    if (current) {
      for (let i = 0; i < times; i++) events.push({ teamId: current, type });
    } else {
      orphans.push({ type, count: times });
    }
  };

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const next = words[i + 1];

    const player = matchPlayer(words, i, aliases);
    if (player) {
      // Anything said before the first name belongs to it: "two balls for Asha".
      if (!current && orphans.length > 0) {
        for (const orphan of orphans.splice(0)) {
          for (let k = 0; k < orphan.count; k++) events.push({ teamId: player.teamId, type: orphan.type });
        }
      }
      current = player.teamId;
      blockedBy = null;
      count = null;
      unknownRun = [];
      i += player.length - 1;
      continue;
    }

    if (shared.has(word)) {
      sharedHeard = word;
      if (current) {
        current = BLOCKED;
        blockedBy = word;
      }
      continue;
    }

    // A word in a name's place — just before a count or a scoring word — that
    // is no word we know and no player at this table.
    const looksLikeName =
      current !== null &&
      word.length >= 3 &&
      !RESERVED.has(word) &&
      !/^\p{N}+$/u.test(word) &&
      next !== undefined &&
      (own(UNITS, next) || own(NUMBER_WORDS, next) || /^\p{N}+$/u.test(next) ||
        (own(HOMOPHONES, next) && own(UNITS, words[i + 2] ?? "")));
    if (looksLikeName) {
      current = BLOCKED;
      blockedBy = word;
      unknownRun.push(word);
      continue;
    }

    if (REMOVERS.has(word) || (word === "take" && (next === "back" || next === "away" || next === "off"))) {
      remove = true;
      continue;
    }

    if (/^\p{N}+$/u.test(word)) {
      count = Number(word);
      continue;
    }
    if (own(NUMBER_WORDS, word)) {
      count = NUMBER_WORDS[word];
      continue;
    }
    if (own(HOMOPHONES, word) && next && own(UNITS, next)) {
      count = HOMOPHONES[word];
      continue;
    }

    const unit = own(UNITS, word) ? UNITS[word] : undefined;
    if (!unit) {
      if (!RESERVED.has(word)) unknownRun.push(word);
      continue;
    }

    // "8 ball" and "eight ball" are the black, not eight balls.
    const isEightBall = unit === "BALL" && count === 8 && sport === "POOL";
    const resolvedUnit: Unit = isEightBall ? "BLACK" : unit;
    const times = isEightBall ? 1 : count ?? 1;
    const result = toEvent(resolvedUnit, remove, sport);
    if (remove) removeUsed = true;
    remove = false;
    count = null;

    if ("problem" in result) {
      problems.push(result.problem);
      continue;
    }
    if (times <= 0) continue;
    if (times > MAX_COUNT) {
      problems.push(`Heard ${times} ${word}, which cannot be right. Nothing scored for that.`);
      continue;
    }
    emit(result.event, times);
  }

  // "Two balls for ballet": the score came first and the name, misheard,
  // after it. Whatever was said after the last score is in the run.
  if (orphans.length > 0 && current === null && unknownRun.length > 0) {
    const guess = nearestOfTwo(unknownRun, players);
    if (guess) {
      for (const orphan of orphans.splice(0)) {
        for (let k = 0; k < orphan.count; k++) events.push({ teamId: guess, type: orphan.type });
      }
    }
  }

  if (orphans.length > 0) {
    problems.push(
      sharedHeard
        ? `Both players are called “${sharedHeard}”. Use a surname or the other word of the name.`
        : "Didn't catch whose that was. Say the player's name."
    );
  }

  // "Scratch that", "undo", "cancel that" with no scoring word for it to undo.
  const undoLast = events.length === 0 && orphans.length === 0 && !removeUsed && remove;

  if (events.length === 0 && !undoLast && problems.length === 0 && words.length > 0) {
    problems.push(
      sharedHeard
        ? `Both players are called “${sharedHeard}”. Use a surname or the other word of the name.`
        : `Heard you, but not a score. Try ${exampleFor(players)}.`
    );
  }

  return { events, undoLast, problems, wake: found, heard: after };
}

/** "“Bala two balls” or “Kk foul”, or the sides", for this table. */
export function exampleFor(players: VoicePlayer[]): string {
  const first = (p?: VoicePlayer) => (p ? p.name.trim().split(/\s+/)[0] : "");
  const a = first(players[0]) || "left";
  const b = first(players[1]) || "right";
  return `“${a} two balls” or “${b} foul” (or “left” and “right” for the two sides)`;
}

/**
 * The best of the recogniser's guesses: the first that scored something
 * cleanly, else the first that scored anything, else the first.
 */
export function parseBestAlternative(
  alternatives: string[],
  players: VoicePlayer[],
  sport: VoiceSport
): ParsedVoiceCommand {
  const parsed = alternatives
    .filter((a) => a.trim().length > 0)
    .map((a) => parseVoiceCommand(a, players, sport));
  if (parsed.length === 0) return parseVoiceCommand("", players, sport);
  return (
    parsed.find((p) => (p.events.length > 0 || p.undoLast) && p.problems.length === 0) ??
    parsed.find((p) => p.events.length > 0 || p.undoLast) ??
    parsed[0]
  );
}

const EVENT_WORDS: Record<LocalScoreEvent, [string, string]> = {
  BALL: ["ball", "balls"],
  BLACK: ["the black", "the black"],
  FOUL: ["foul", "fouls"],
  GOAL: ["goal", "goals"],
  REMOVE_BALL: ["ball taken back", "balls taken back"],
  REMOVE_FOUL: ["foul taken back", "fouls taken back"],
  REMOVE_GOAL: ["goal taken back", "goals taken back"],
};

/** "Asha: 2 balls, 1 foul · Ravi: 1 ball", for the line under the mic. */
export function describeVoiceEvents(events: VoiceEvent[], nameOf: (id: string) => string): string {
  const byTeam = new Map<string, Map<LocalScoreEvent, number>>();
  for (const event of events) {
    if (!byTeam.has(event.teamId)) byTeam.set(event.teamId, new Map());
    const counts = byTeam.get(event.teamId)!;
    counts.set(event.type, (counts.get(event.type) ?? 0) + 1);
  }
  return [...byTeam.entries()]
    .map(([teamId, counts]) => {
      const parts = [...counts.entries()].map(([type, n]) => {
        const [one, many] = EVENT_WORDS[type];
        return type === "BLACK" ? one : `${n} ${n === 1 ? one : many}`;
      });
      return `${nameOf(teamId)}: ${parts.join(", ")}`;
    })
    .join(" · ");
}

/** What undoes a tap. The black has no undo, so it has no inverse. */
export function inverseOf(type: LocalScoreEvent): LocalScoreEvent | null {
  switch (type) {
    case "BALL": return "REMOVE_BALL";
    case "REMOVE_BALL": return "BALL";
    case "FOUL": return "REMOVE_FOUL";
    case "REMOVE_FOUL": return "FOUL";
    case "GOAL": return "REMOVE_GOAL";
    case "REMOVE_GOAL": return "GOAL";
    case "BLACK": return null;
  }
}
