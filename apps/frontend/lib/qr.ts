/**
 * Minimal QR Code encoder (byte mode, error-correction level M, versions 1-10).
 *
 * Written by hand because the build environment cannot reach the npm registry,
 * so a third-party QR dependency is not installable. Scope is deliberately
 * narrow: it encodes the short HTTPS broadcast URLs this app produces and
 * nothing else. See qr.test.ts for the round-trip check.
 */

const EC_LEVEL_M_BITS = 0b00;

/** Byte-mode data capacity per version at EC level M. */
const BYTE_CAPACITY_M = [0, 14, 26, 42, 62, 84, 106, 122, 152, 180, 213];

type VersionSpec = {
  /** EC codewords per block. */
  ecPerBlock: number;
  /** [blockCount, dataCodewordsPerBlock] for each group. */
  groups: [number, number][];
};

const VERSION_SPECS_M: Record<number, VersionSpec> = {
  1: { ecPerBlock: 10, groups: [[1, 16]] },
  2: { ecPerBlock: 16, groups: [[1, 28]] },
  3: { ecPerBlock: 26, groups: [[1, 44]] },
  4: { ecPerBlock: 18, groups: [[2, 32]] },
  5: { ecPerBlock: 24, groups: [[2, 43]] },
  6: { ecPerBlock: 16, groups: [[4, 27]] },
  7: { ecPerBlock: 18, groups: [[4, 31]] },
  8: { ecPerBlock: 22, groups: [[2, 38], [2, 39]] },
  9: { ecPerBlock: 22, groups: [[3, 36], [2, 37]] },
  10: { ecPerBlock: 26, groups: [[4, 43], [1, 44]] },
};

const ALIGNMENT_CENTERS: Record<number, number[]> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
};

// --- GF(256) arithmetic for Reed-Solomon, primitive polynomial 0x11D ---

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(function initTables() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

/** Generator polynomial for `degree` EC codewords. */
function rsGenerator(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], GF_EXP[i]);
    }
    poly = next;
  }
  return poly;
}

function rsEncode(data: number[], ecCount: number): number[] {
  const gen = rsGenerator(ecCount);
  const remainder = new Array(ecCount).fill(0);

  for (const byte of data) {
    const factor = byte ^ remainder[0];
    remainder.shift();
    remainder.push(0);
    if (factor !== 0) {
      for (let i = 0; i < ecCount; i++) {
        remainder[i] ^= gfMul(gen[i + 1], factor);
      }
    }
  }
  return remainder;
}

// --- Bit buffer ---

class BitBuffer {
  bits: number[] = [];

  put(value: number, length: number) {
    for (let i = length - 1; i >= 0; i--) {
      this.bits.push((value >>> i) & 1);
    }
  }

  get length() {
    return this.bits.length;
  }
}

function chooseVersion(byteLength: number): number {
  for (let v = 1; v <= 10; v++) {
    if (byteLength <= BYTE_CAPACITY_M[v]) return v;
  }
  throw new Error(`Payload of ${byteLength} bytes exceeds supported QR capacity (213 bytes)`);
}

function totalDataCodewords(version: number): number {
  return VERSION_SPECS_M[version].groups.reduce((sum, [blocks, perBlock]) => sum + blocks * perBlock, 0);
}

/** Mode indicator + length + payload + terminator + padding, as codewords. */
function buildDataCodewords(bytes: number[], version: number): number[] {
  const capacity = totalDataCodewords(version);
  const buffer = new BitBuffer();

  buffer.put(0b0100, 4); // byte mode
  buffer.put(bytes.length, version <= 9 ? 8 : 16);
  for (const b of bytes) buffer.put(b, 8);

  // Terminator, up to four zero bits.
  const capacityBits = capacity * 8;
  const terminator = Math.min(4, capacityBits - buffer.length);
  buffer.put(0, terminator);

  // Pad to a byte boundary.
  while (buffer.length % 8 !== 0) buffer.bits.push(0);

  const codewords: number[] = [];
  for (let i = 0; i < buffer.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | buffer.bits[i + j];
    codewords.push(byte);
  }

  // Alternating pad codewords fill the remainder.
  const PADS = [0xec, 0x11];
  let padIndex = 0;
  while (codewords.length < capacity) {
    codewords.push(PADS[padIndex++ % 2]);
  }
  return codewords;
}

/** Split into blocks, append EC per block, then interleave both. */
function interleave(dataCodewords: number[], version: number): number[] {
  const spec = VERSION_SPECS_M[version];
  const dataBlocks: number[][] = [];
  const ecBlocks: number[][] = [];

  let offset = 0;
  for (const [blockCount, perBlock] of spec.groups) {
    for (let i = 0; i < blockCount; i++) {
      const block = dataCodewords.slice(offset, offset + perBlock);
      offset += perBlock;
      dataBlocks.push(block);
      ecBlocks.push(rsEncode(block, spec.ecPerBlock));
    }
  }

  const result: number[] = [];
  const maxData = Math.max(...dataBlocks.map((b) => b.length));
  for (let i = 0; i < maxData; i++) {
    for (const block of dataBlocks) {
      if (i < block.length) result.push(block[i]);
    }
  }
  for (let i = 0; i < spec.ecPerBlock; i++) {
    for (const block of ecBlocks) result.push(block[i]);
  }
  return result;
}

// --- Matrix construction ---

type Matrix = {
  size: number;
  /** 0/1 module colour. */
  modules: Uint8Array;
  /** 1 where the module is structural and must not carry data. */
  reserved: Uint8Array;
};

function createMatrix(version: number): Matrix {
  const size = version * 4 + 17;
  return {
    size,
    modules: new Uint8Array(size * size),
    reserved: new Uint8Array(size * size),
  };
}

function setModule(m: Matrix, row: number, col: number, dark: boolean, reserve = true) {
  m.modules[row * m.size + col] = dark ? 1 : 0;
  if (reserve) m.reserved[row * m.size + col] = 1;
}

function placeFinder(m: Matrix, row: number, col: number) {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const rr = row + r;
      const cc = col + c;
      if (rr < 0 || rr >= m.size || cc < 0 || cc >= m.size) continue;
      const inRing = (r >= 0 && r <= 6 && (c === 0 || c === 6)) || (c >= 0 && c <= 6 && (r === 0 || r === 6));
      const inCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      setModule(m, rr, cc, inRing || inCore);
    }
  }
}

function placeAlignment(m: Matrix, version: number) {
  const centers = ALIGNMENT_CENTERS[version];
  for (const r of centers) {
    for (const c of centers) {
      // Skip the three corners occupied by finder patterns.
      const isFinderCorner =
        (r === 6 && c === 6) ||
        (r === 6 && c === m.size - 7) ||
        (r === m.size - 7 && c === 6);
      if (isFinderCorner) continue;

      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const dark = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
          setModule(m, r + dr, c + dc, dark);
        }
      }
    }
  }
}

function placeTimingAndDark(m: Matrix, version: number) {
  for (let i = 8; i < m.size - 8; i++) {
    const dark = i % 2 === 0;
    setModule(m, 6, i, dark);
    setModule(m, i, 6, dark);
  }
  // The always-dark module beside the lower-left finder.
  setModule(m, 4 * version + 9, 8, true);
}

/**
 * 18-bit BCH version information, required from version 7 upward.
 *
 * Omitting these two blocks is not cosmetic: the modules they occupy are not
 * available to data, so leaving them out both shifts every subsequent data bit
 * and denies the scanner the version it needs. A symbol missing them cannot be
 * decoded at all.
 */
function versionBits(version: number): number {
  let value = version << 12;
  for (let i = 17; i >= 12; i--) {
    if ((value >>> i) & 1) value ^= 0x1f25 << (i - 12);
  }
  return (version << 12) | value;
}

/** Version info occupies a 6x3 block by the top-right and bottom-left finders. */
function placeVersionInfo(m: Matrix, version: number) {
  if (version < 7) return;

  const bits = versionBits(version);
  for (let i = 0; i < 18; i++) {
    const bit = ((bits >>> i) & 1) === 1;
    const a = Math.floor(i / 3);
    const b = i % 3;

    setModule(m, m.size - 11 + b, a, bit); // bottom-left block
    setModule(m, a, m.size - 11 + b, bit); // top-right block
  }
}

function reserveFormatAreas(m: Matrix) {
  for (let i = 0; i < 9; i++) {
    if (!m.reserved[8 * m.size + i]) setModule(m, 8, i, false);
    if (!m.reserved[i * m.size + 8]) setModule(m, i, 8, false);
  }
  for (let i = 0; i < 8; i++) {
    if (!m.reserved[8 * m.size + (m.size - 1 - i)]) setModule(m, 8, m.size - 1 - i, false);
    if (!m.reserved[(m.size - 1 - i) * m.size + 8]) setModule(m, m.size - 1 - i, 8, false);
  }
}

const MASKS: ((r: number, c: number) => boolean)[] = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

/** Walk the zig-zag data path, skipping reserved modules and the timing column. */
function dataPositions(m: Matrix): [number, number][] {
  const positions: [number, number][] = [];
  let upward = true;

  for (let right = m.size - 1; right > 0; right -= 2) {
    // Column 6 is the vertical timing pattern; the pairing shifts left past it.
    if (right === 6) right = 5;

    for (let i = 0; i < m.size; i++) {
      const row = upward ? m.size - 1 - i : i;
      for (const col of [right, right - 1]) {
        if (!m.reserved[row * m.size + col]) positions.push([row, col]);
      }
    }
    upward = !upward;
  }
  return positions;
}

function placeData(m: Matrix, codewords: number[]) {
  const positions = dataPositions(m);
  let bitIndex = 0;

  for (const [row, col] of positions) {
    const byte = codewords[bitIndex >> 3];
    // Remainder bits past the payload stay light.
    const bit = byte === undefined ? 0 : (byte >>> (7 - (bitIndex & 7))) & 1;
    m.modules[row * m.size + col] = bit;
    bitIndex++;
  }
}

function penalty(m: Matrix): number {
  const size = m.size;
  const at = (r: number, c: number) => m.modules[r * size + c];
  let score = 0;

  // Rule 1: runs of five or more same-coloured modules.
  for (let i = 0; i < size; i++) {
    for (const horizontal of [true, false]) {
      let run = 1;
      for (let j = 1; j < size; j++) {
        const prev = horizontal ? at(i, j - 1) : at(j - 1, i);
        const cur = horizontal ? at(i, j) : at(j, i);
        if (cur === prev) {
          run++;
        } else {
          if (run >= 5) score += run - 2;
          run = 1;
        }
      }
      if (run >= 5) score += run - 2;
    }
  }

  // Rule 2: 2x2 blocks of one colour.
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const v = at(r, c);
      if (v === at(r, c + 1) && v === at(r + 1, c) && v === at(r + 1, c + 1)) score += 3;
    }
  }

  // Rule 3: finder-like 1:1:3:1:1 patterns with four light modules either side.
  const PATTERN = [1, 0, 1, 1, 1, 0, 1];
  const matchesAt = (r: number, c: number, horizontal: boolean, seq: number[]) => {
    for (let k = 0; k < seq.length; k++) {
      const rr = horizontal ? r : r + k;
      const cc = horizontal ? c + k : c;
      if (rr >= size || cc >= size) return false;
      if (at(rr, cc) !== seq[k]) return false;
    }
    return true;
  };
  const withLight = [
    [...PATTERN, 0, 0, 0, 0],
    [0, 0, 0, 0, ...PATTERN],
  ];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      for (const seq of withLight) {
        if (matchesAt(r, c, true, seq)) score += 40;
        if (matchesAt(r, c, false, seq)) score += 40;
      }
    }
  }

  // Rule 4: deviation from an even dark/light balance.
  let dark = 0;
  for (let i = 0; i < size * size; i++) dark += m.modules[i];
  const percent = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;

  return score;
}

/** 15-bit BCH format information for EC level M and the chosen mask. */
function formatBits(maskIndex: number): number {
  const data = (EC_LEVEL_M_BITS << 3) | maskIndex;
  let value = data << 10;
  for (let i = 14; i >= 10; i--) {
    if ((value >>> i) & 1) value ^= 0b10100110111 << (i - 10);
  }
  return ((data << 10) | value) ^ 0b101010000010010;
}

function placeFormat(m: Matrix, maskIndex: number) {
  const bits = formatBits(maskIndex);
  const bitAt = (i: number) => ((bits >>> i) & 1) === 1;

  for (let i = 0; i <= 5; i++) setModule(m, 8, i, bitAt(i));
  setModule(m, 8, 7, bitAt(6));
  setModule(m, 8, 8, bitAt(7));
  setModule(m, 7, 8, bitAt(8));
  for (let i = 9; i <= 14; i++) setModule(m, 14 - i, 8, bitAt(i));

  // Second copy: seven modules up the lower-left column (bits 0-6), then eight
  // across the upper-right row (bits 7-14). The module at (4v+9, 8) is the
  // permanently dark one and must not be part of this run.
  for (let i = 0; i <= 6; i++) setModule(m, m.size - 1 - i, 8, bitAt(i));
  for (let i = 7; i <= 14; i++) setModule(m, 8, m.size - 15 + i, bitAt(i));
}

export type QrMatrix = {
  size: number;
  /** Row-major dark/light modules; true is dark. */
  get: (row: number, col: number) => boolean;
  version: number;
};

/** Encode `text` as a QR symbol at EC level M. */
export function encodeQr(text: string): QrMatrix {
  const bytes = Array.from(new TextEncoder().encode(text));
  const version = chooseVersion(bytes.length);

  const dataCodewords = buildDataCodewords(bytes, version);
  const finalCodewords = interleave(dataCodewords, version);

  const base = createMatrix(version);
  placeFinder(base, 0, 0);
  placeFinder(base, 0, base.size - 7);
  placeFinder(base, base.size - 7, 0);
  placeAlignment(base, version);
  placeTimingAndDark(base, version);
  placeVersionInfo(base, version);
  reserveFormatAreas(base);
  placeData(base, finalCodewords);

  // Pick the mask with the lowest penalty.
  let best: Matrix | null = null;
  let bestScore = Infinity;
  let bestMask = 0;

  for (let maskIndex = 0; maskIndex < 8; maskIndex++) {
    const candidate: Matrix = {
      size: base.size,
      modules: Uint8Array.from(base.modules),
      reserved: base.reserved,
    };
    const mask = MASKS[maskIndex];
    for (let r = 0; r < candidate.size; r++) {
      for (let c = 0; c < candidate.size; c++) {
        if (candidate.reserved[r * candidate.size + c]) continue;
        if (mask(r, c)) candidate.modules[r * candidate.size + c] ^= 1;
      }
    }
    placeFormat(candidate, maskIndex);

    const score = penalty(candidate);
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
      bestMask = maskIndex;
    }
  }

  const chosen = best!;
  return {
    size: chosen.size,
    version,
    get: (row, col) => chosen.modules[row * chosen.size + col] === 1,
  };
}

/**
 * Render an encoded symbol as a standalone SVG string.
 *
 * The requested size is rounded to a whole number of pixels per module. At a
 * fractional scale some modules land a pixel wider than their neighbours,
 * which distorts the grid a camera is trying to sample — the symbol is then
 * mathematically valid but harder to read. Snapping keeps every module
 * identical, so the rendered size may differ slightly from what was asked.
 */
export function qrToSvg(text: string, options: { margin?: number; size?: number } = {}): string {
  const { margin = 4, size = 240 } = options;
  const qr = encodeQr(text);
  const total = qr.size + margin * 2;

  const scale = Math.max(2, Math.round(size / total));
  const pixels = total * scale;

  let path = "";
  for (let r = 0; r < qr.size; r++) {
    for (let c = 0; c < qr.size; c++) {
      if (qr.get(r, c)) path += `M${c + margin} ${r + margin}h1v1h-1z`;
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${pixels}" height="${pixels}"`,
    ` viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" role="img"`,
    ` style="display:block;max-width:100%;height:auto">`,
    `<rect width="${total}" height="${total}" fill="#ffffff"/>`,
    `<path d="${path}" fill="#000000"/>`,
    `</svg>`,
  ].join("");
}


/**
 * Render the symbol as a PNG data URL by drawing each module as a block of
 * whole pixels on a canvas.
 *
 * The SVG path is mathematically identical, but it leaves rasterisation to
 * the browser, and how a vector path lands on a pixel grid varies between
 * renderers — especially inside the in-app webviews QR scanners use. Drawing
 * the modules directly removes that variable: every module is exactly `scale`
 * pixels, with hard edges and no interpolation.
 *
 * Returns null where there is no canvas (server rendering), so callers can
 * fall back to the SVG.
 */
export function qrToPngDataUrl(
  text: string,
  options: { margin?: number; scale?: number } = {}
): string | null {
  if (typeof document === "undefined") return null;

  const { margin = 4, scale = 10 } = options;
  const qr = encodeQr(text);
  const total = qr.size + margin * 2;

  const canvas = document.createElement("canvas");
  canvas.width = total * scale;
  canvas.height = total * scale;

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // A quiet zone of light modules is part of the symbol, not decoration.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#000000";
  for (let r = 0; r < qr.size; r++) {
    for (let c = 0; c < qr.size; c++) {
      if (qr.get(r, c)) {
        ctx.fillRect((c + margin) * scale, (r + margin) * scale, scale, scale);
      }
    }
  }

  try {
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

/** Internals exposed for the round-trip test only. */
export const __qrInternals = {
  versionBits,
  buildDataCodewords,
  interleave,
  chooseVersion,
  dataPositions,
  MASKS,
  totalDataCodewords,
  VERSION_SPECS_M,
  rsEncode,
};
