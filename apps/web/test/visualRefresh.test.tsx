// @vitest-environment jsdom
import { Buffer as NodeBuffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, fireEvent, render } from '@testing-library/react';
import { brand as TS_BRAND, ink as TS_INK, paper as TS_PAPER, status as TS_STATUS } from '@masaar/tokens';
import { useCountUp } from '@masaar/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../src/i18n';
import App from '../src/App';
import { NAV_SEC_KEY } from '../src/admin/AdminShell';
import { saveSession } from '../src/session';

/**
 * The visual refresh (ops/VISUAL-REFRESH-SPEC.md §1, §2, §4).
 *
 * Three kinds of check live here, and the split is deliberate:
 *
 *  · The SHEET IS PARSED, never scraped. The first version of this file deleted comments with a
 *    non-greedy regex and then regex-matched `--name: value;` out of what was left. That is
 *    structurally blind, and it hid a shipped bug: an unopened comment-close turned eight lines of
 *    prose into a bad declaration, the CSS parser consumed its remnants up to the next `;` —
 *    deleting `--status-planned` in every browser and in the built bundle — and the scraper reported
 *    the token as present and correct. Everything below reads the CSSOM: a declaration a parser
 *    throws away is genuinely absent here too, so the assertion fails. A second, independent
 *    parser (esbuild, the one vite actually builds with) must also report ZERO warnings.
 *
 *  · CONTRAST is COMPUTED, and compared UNROUNDED. A test that pins `--ink-3: #5A6474` proves only
 *    that nobody retyped the constant. Worse, the helper used to round to two places before
 *    comparing, so anything in [4.495, 4.5) passed as AA — and a real pair sat in that band.
 *    Rounding is for the failure message now, never for the comparison.
 *
 *  · BEHAVIOUR is rendered. The sidebar disclosure is a preference, a forced open and a badge that
 *    must not swallow an alarm, and none of those three is visible to a type checker.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/**
 * esbuild — the parser vite builds this app with — is loaded here so a stylesheet can be handed to
 * a SECOND, independent parser and not only to jsdom's.
 *
 * It refuses to initialise under jsdom: its startup invariant is
 * `new TextEncoder().encode('') instanceof Uint8Array`, and jsdom's encoder returns a Uint8Array
 * built in jsdom's own realm while `Uint8Array` here resolves to node's — cross-realm
 * `instanceof` is false, which esbuild reads as a broken environment. The encoder below produces
 * bytes in whichever realm this module sees, so the invariant holds; the import is deferred until
 * after the swap because esbuild checks at load time.
 */
class RealmSafeTextEncoder {
  readonly encoding = 'utf-8';
  encode(input = ''): Uint8Array {
    const bytes = NodeBuffer.from(input, 'utf8');
    const out = new Uint8Array(bytes.length);
    out.set(bytes);
    return out;
  }
  encodeInto(input: string, dest: Uint8Array) {
    const encoded = this.encode(input);
    const written = Math.min(encoded.length, dest.length);
    dest.set(encoded.subarray(0, written));
    return { read: input.length, written };
  }
}
globalThis.TextEncoder = RealmSafeTextEncoder as unknown as typeof globalThis.TextEncoder;
const { transform } = await import('esbuild');

const TOKENS_PATH = 'packages/tokens/css/tokens.css';
const TOKENS = read(TOKENS_PATH);

/** Every stylesheet the app ships. A malformed comment in any one of them is a shipped bug. */
const SHEETS = [
  TOKENS_PATH,
  'packages/ui/src/ui.css',
  'apps/web/src/styles.css',
  'apps/web/src/toast.css',
  'apps/web/src/operator/operator.css',
  'apps/web/src/admin/admin.css',
  'apps/web/src/registry/registry.css',
  'apps/web/src/charts/charts.css',
  'apps/web/src/report/report.css',
] as const;

/* ------------------------------------------------------------------ */
/*  parse, don't scrape                                                */
/* ------------------------------------------------------------------ */

interface Sheet {
  /** the custom properties that SURVIVED parsing, off the `:root` rule */
  decls: Record<string, string>;
  /** every style rule in source order, `@media` children included */
  all: { selector: string; style: CSSStyleDeclaration }[];
  /** the first rule for a selector, or a throw naming the sheet */
  rule: (selector: string) => CSSStyleDeclaration;
}

function parse(css: string, label: string): Sheet {
  const el = document.createElement('style');
  el.textContent = css;
  document.head.appendChild(el);
  const sheet = el.sheet;
  if (!sheet) throw new Error(`${label} produced no stylesheet`);

  const decls: Record<string, string> = {};
  const all: { selector: string; style: CSSStyleDeclaration }[] = [];
  const visit = (list: CSSRuleList) => {
    for (const r of Array.from(list) as (CSSStyleRule & { cssRules?: CSSRuleList })[]) {
      if (r.cssRules) { visit(r.cssRules); continue; }   // @media, @supports, @keyframes
      if (typeof r.selectorText !== 'string') continue;  // @font-face and friends
      all.push({ selector: r.selectorText, style: r.style });
      if (r.selectorText !== ':root') continue;
      for (let i = 0; i < r.style.length; i++) {
        const name = r.style[i];
        decls[name] = r.style.getPropertyValue(name).trim();
      }
    }
  };
  visit(sheet.cssRules);
  el.remove();   // the sheet is read, not applied: nothing below styles a rendered tree

  return {
    decls,
    all,
    rule: (selector) => {
      const found = all.find((r) => r.selector === selector);
      if (!found) throw new Error(`${label} has no rule for ${selector}`);
      return found.style;
    },
  };
}

const sheetCache = new Map<string, Sheet>();
const sheetOf = (path: string): Sheet => {
  const hit = sheetCache.get(path);
  if (hit) return hit;
  const parsed = parse(read(path), path);
  sheetCache.set(path, parsed);
  return parsed;
};

const TOKEN_SHEET = parse(TOKENS, TOKENS_PATH);
const DECLS = TOKEN_SHEET.decls;

/** Every property this rule sets, as `name: value` — shorthands included, verbatim. */
function declarationsOf(style: CSSStyleDeclaration): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < style.length; i++) out[style[i]] = style.getPropertyValue(style[i]);
  return out;
}

/* ------------------------------------------------------------------ */
/*  a tiny CSS-variable resolver + the WCAG 2.x contrast formula        */
/* ------------------------------------------------------------------ */

function resolveVar(v: string, depth = 0): string {
  const m = /^var\((--[\w-]+)\)$/.exec(v.trim());
  return m && depth < 8 && DECLS[m[1]] ? resolveVar(DECLS[m[1]], depth + 1) : v.trim();
}

type Rgba = [number, number, number, number];

function toRgba(value: string): Rgba {
  const v = resolveVar(value);
  const hex = /^#([0-9a-fA-F]{6})$/.exec(v);
  if (hex) {
    const h = hex[1];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1];
  }
  const fn = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.]+)\s*)?\)$/.exec(v);
  if (fn) return [+fn[1], +fn[2], +fn[3], fn[4] === undefined ? 1 : +fn[4]];
  throw new Error(`not a colour: ${value} → ${v}`);
}

const tokenRgba = (name: string): Rgba => toRgba(DECLS[name] ?? '');

/** Composite a (possibly translucent) colour over an opaque one. */
function over(fg: Rgba, bg: Rgba): Rgba {
  const a = fg[3];
  return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a), 1];
}

function luminance(c: Rgba): number {
  const lin = (x: number) => {
    const s = x / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
}

/**
 * WCAG 2.x contrast ratio, UNROUNDED.
 *
 * The spec's own tables quote two places, and quoting is where rounding belongs. Rounding before
 * the comparison silently widens every threshold in this file by 0.005 — enough to let
 * #666F7E on --bg-muted (4.496818…) report itself as a passing 4.50.
 */
export function contrast(fg: Rgba, bg: Rgba): number {
  const a = luminance(over(fg, bg));
  const b = luminance(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** Assert a floor on the true ratio; the rounded figure appears only in the failure message. */
function expectRatio(fg: Rgba, bg: Rgba, floor: number, what: string) {
  const r = contrast(fg, bg);
  expect(r, `${what}: ${r.toFixed(4)}:1 — floor is ${floor}:1`).toBeGreaterThanOrEqual(floor);
}

const SURFACES = ['--bg-page', '--bg-card', '--bg-muted', '--bg-inset'] as const;

/* ================================================================== */
/*  §1-0 — the sheet a browser parses is the sheet on disk             */
/* ================================================================== */

describe('§1-0 — the stylesheets survive a real CSS parser intact', () => {
  it.each(SHEETS)('%s transforms with zero warnings', async (path) => {
    // esbuild is the parser vite builds with; a warning here IS the shipped bundle's bug. The one
    // that got through was `[WARNING] Expected ":" [css-syntax-error]` at tokens.css:66 — an
    // unopened `*/`, after which the parser ate --status-planned and the dist file carried the
    // fused garbage. `exit 0` on a warning is why nothing downstream noticed.
    const { warnings } = await transform(read(path), { loader: 'css' });
    expect(warnings.map((w) => `${path}:${w.location?.line}:${w.location?.column} ${w.text}`)).toEqual([]);
  });

  it('every token the suite pins is actually present in the parsed CSSOM', () => {
    // a regex scraper reports a deleted declaration as present; the CSSOM cannot
    for (const name of [
      '--ink-1', '--ink-2', '--ink-3', '--ink-4', '--ink-disabled',
      '--status-planned', '--status-progress', '--status-done',
      '--status-risk', '--status-delayed', '--status-blocked',
      '--border-1', '--border-2', '--border-3', '--border-control', '--mark-accent',
      '--elev-rest', '--elev-hover', '--elev-overlay', '--lift', '--focus-ring', '--dur-fast',
    ]) {
      expect(DECLS[name], `${name} did not survive parsing`).toBeTruthy();
    }
    // the exact declaration the stray comment close deleted, and its neighbour that survived:
    // both must read back, or the comment block has come apart again
    expect(DECLS['--status-planned']).toBe('#4B5972');
    expect(DECLS['--status-planned-bg']).toBe('#E6E8EE');
  });
});

/* ================================================================== */
/*  §1 — tokens                                                        */
/* ================================================================== */

describe('§1 — the ink scale is readable on every surface it lands on', () => {
  it.each(['--ink-1', '--ink-2', '--ink-3'])(
    '%s clears 4.5:1 on page, card, muted and inset',
    (ink) => {
      for (const surface of SURFACES) {
        expectRatio(tokenRgba(ink), tokenRgba(surface), 4.5, `${ink} on ${surface}`);
      }
    },
  );

  it('--ink-4 clears 4.5:1 on the three surfaces it is actually spent on', () => {
    // it carries quiet-but-READ data (tender codes, timeline dates, stage ranges), and every one
    // of those sits on paper, on a card, or on a hovered row — never inside an --bg-inset well,
    // where it would land at 4.17. That is a placement rule, and this is where it is written down.
    for (const surface of ['--bg-page', '--bg-card', '--bg-muted'] as const) {
      expectRatio(tokenRgba('--ink-4'), tokenRgba(surface), 4.5, `--ink-4 on ${surface}`);
    }
    expect(contrast(tokenRgba('--ink-4'), tokenRgba('--bg-inset'))).toBeCloseTo(4.17, 2);
  });

  it('carries the exact darkened values, and every superseded one is gone', () => {
    expect(DECLS['--ink-3']).toBe('#5A6474');
    expect(DECLS['--ink-4']).toBe('#656E7D');
    // #6B7686 fell to 3.73 on --bg-inset and #98A1B0 to 2.11 — neither may return as live text.
    // #666F7E is barred too: it is the near-miss that only cleared AA if you rounded first.
    expect(TOKENS).not.toMatch(/--ink-3:\s*#6B7686/);
    expect(TOKENS).not.toMatch(/--ink-4:\s*#98A1B0/);
    expect(TOKENS).not.toMatch(/--ink-4:\s*#666F7E/);
  });

  it('keeps the old --ink-4 value as --ink-disabled — inactive controls only', () => {
    // WCAG 1.4.3 exempts inactive components explicitly; the token exists so that exemption has
    // to be claimed by name instead of being borrowed from the text scale by accident
    expect(DECLS['--ink-disabled']).toBe('#98A1B0');
    expect(contrast(tokenRgba('--ink-disabled'), tokenRgba('--bg-card'))).toBeLessThan(4.5);
  });

  it('spends --ink-disabled only where the component is genuinely INACTIVE', () => {
    /**
     * This used to whitelist by selector NAME — `/:disabled|__m$|--todo|--no|--session/` — a list
     * written to match the four selectors that were violating the rule, so it green-lit exactly
     * the misuse it was meant to police, and would green-light any future selector ending in
     * `__m` or `--no`. The rule is semantic: 1.4.3's exemption covers text inside a component
     * that CANNOT BE OPERATED, and `:disabled` is the only selector in CSS that means that. A
     * mark in enabled content does not qualify however quiet it is meant to look.
     */
    const sites = SHEETS.flatMap((path) =>
      sheetOf(path).all
        .filter((r) => Object.values(declarationsOf(r.style)).some((v) => v.includes('--ink-disabled')))
        .map((r) => `${path} ${r.selector}`),
    );
    expect(sites.length).toBeGreaterThan(0);
    for (const site of sites) expect(site, `${site} is not an inactive control`).toMatch(/:disabled\b/);
  });

  it('the four live marks that had borrowed the exemption now compute clean', () => {
    /**
     * Each is informational content in an ENABLED component — a capability cell with an
     * aria-label, the stage NUMBER in a contract tracker, the met/unmet mark in a live checklist
     * — so each is text and answers to 4.5:1, not to the 3:1 non-text floor and not to the
     * exemption. `surface` is the painted background behind the glyph: the rule's own background
     * where it sets one, and the container's where the rule is transparent.
     */
    const MARKS = [
      { sheet: 'apps/web/src/admin/admin.css', selector: '.acc-cell--no', surface: '--bg-card', was: 2.61 },
      { sheet: 'apps/web/src/admin/admin.css', selector: '.acc-cell--session', surface: '--bg-card', was: 1.55 },
      { sheet: 'apps/web/src/admin/admin.css', selector: '.ctr-stage__dot--todo', surface: '--bg-muted', was: 2.31 },
      { sheet: 'apps/web/src/operator/operator.css', selector: '.wz-cond__m', surface: '--paper-200', was: 2.11 },
    ] as const;

    for (const m of MARKS) {
      const style = sheetOf(m.sheet).rule(m.selector);
      const decls = declarationsOf(style);
      expect(decls.color, `${m.selector} sets no colour`).toBeTruthy();
      expect(decls.color, `${m.selector} still claims the inactive exemption`).not.toContain('--ink-disabled');
      // an opacity on top of an already-quiet ink is contrast laundering: .acc-cell--session
      // stacked 0.5 and landed at 1.55:1, worse than anything the token was ever meant to permit
      expect(decls.opacity, `${m.selector} stacks opacity on its ink`).toBeUndefined();
      // where the rule paints its own background it must be the surface we are computing against
      if (decls.background && decls.background !== 'transparent') {
        expect(decls.background).toContain(m.surface.replace('--', ''));
      }
      expectRatio(toRgba(decls.color), tokenRgba(m.surface), 4.5, `${m.selector} on ${m.surface}`);
      expect(m.was).toBeLessThan(3); // what it used to be, kept so the regression is legible
    }
  });

  it('the TypeScript mirror carries the same values as the sheet it claims to mirror', () => {
    // packages/tokens/src/index.ts calls itself "TypeScript mirror of css/tokens.css" and had
    // drifted to five superseded values. Latent (the one import is type-only) is not the same as
    // harmless: it was a second source of truth that neither typecheck nor any test could see.
    for (const [key, value] of Object.entries(TS_BRAND)) {
      const css = `--brand-${key.replace(/^(navy|amber)(\d+)$/, '$1-$2')}`;
      expect(DECLS[css], `${css} missing`).toBeTruthy();
      expect(value, `brand.${key}`).toBe(DECLS[css]);
    }
    for (const [key, value] of Object.entries(TS_PAPER)) {
      expect(value, `paper.${key}`).toBe(DECLS[`--paper-${key}`]);
    }
    expect(TS_INK[1]).toBe(DECLS['--ink-1']);
    expect(TS_INK[2]).toBe(DECLS['--ink-2']);
    expect(TS_INK[3]).toBe(DECLS['--ink-3']);
    expect(TS_INK[4]).toBe(DECLS['--ink-4']);
    expect(TS_INK.disabled).toBe(DECLS['--ink-disabled']);
    expect(TS_INK.onDark).toBe(DECLS['--ink-on-dark']);
    expect(TS_INK.onDark2).toBe(DECLS['--ink-on-dark-2']);
    for (const name of ['planned', 'progress', 'done', 'risk', 'delayed', 'blocked'] as const) {
      expect(TS_STATUS[name].fg, `status.${name}.fg`).toBe(DECLS[`--status-${name}`]);
      expect(TS_STATUS[name].bg, `status.${name}.bg`).toBe(DECLS[`--status-${name}-bg`]);
    }
  });
});

describe('§1 — status colours clear AA against their own soft pair AND every surface', () => {
  const STATUSES = ['planned', 'progress', 'done', 'risk', 'delayed', 'blocked'] as const;

  it.each(STATUSES)('%s reads on its own -bg', (name) => {
    expectRatio(tokenRgba(`--status-${name}`), tokenRgba(`--status-${name}-bg`), 4.5, `--status-${name} on its pair`);
  });

  it.each(STATUSES)('%s also reads on all four surfaces', (name) => {
    // a status colour is not surface-bound: it is the colour of a word (.wz-gate, .op-dev,
    // .file-tl__done) as much as of a pill, and it lands wherever that word lands. Testing it
    // only against its own soft pair is how #945D17 kept a 4.44 on --bg-inset.
    for (const surface of SURFACES) {
      expectRatio(tokenRgba(`--status-${name}`), tokenRgba(surface), 4.5, `--status-${name} on ${surface}`);
    }
  });

  it('darkened exactly the three that failed and left the three that did not', () => {
    expect(DECLS['--status-progress']).toBe('#1B65A4'); // was #1E6FB3 → 4.31
    expect(DECLS['--status-done']).toBe('#1C7046');     // was #1F7A4D → 4.38
    expect(DECLS['--status-risk']).toBe('#8F5915');     // was #B5751F → 3.32, then #945D17 → 4.44 on inset
    expect(DECLS['--status-planned']).toBe('#4B5972');
    expect(DECLS['--status-delayed']).toBe('#B23535');
    expect(DECLS['--status-blocked']).toBe('#6B4FB5');
  });

  it('decouples --status-risk from --brand-amber-600 — their old identity was coincidence', () => {
    expect(resolveVar(DECLS['--status-risk'])).not.toBe(resolveVar(DECLS['--brand-amber-600']));
  });
});

describe('§1 — the functional border and the meaningful mark clear the 3:1 graphical floor', () => {
  it('--border-control is the control edge and reaches 3:1 over every surface', () => {
    // α 0.46 held on page/card/muted and stopped at 2.9814 over --bg-inset. A floor that depends
    // on which surface the control happens to sit on is a placement rule nobody can enforce.
    expect(DECLS['--border-control']).toBe('rgba(11, 19, 32, 0.48)');
    for (const surface of SURFACES) {
      expectRatio(tokenRgba('--border-control'), tokenRgba(surface), 3, `--border-control on ${surface}`);
    }
  });

  it('leaves the decorative scale below it — the two jobs stay separate', () => {
    const card = tokenRgba('--bg-card');
    const decorative = contrast(tokenRgba('--border-2'), card);
    expect(decorative).toBeLessThan(3);
    expect(contrast(tokenRgba('--border-control'), card)).toBeGreaterThan(decorative);
    expect(DECLS['--border-1']).toContain('0.10');
    expect(DECLS['--border-2']).toContain('0.20');
    expect(DECLS['--border-3']).toContain('0.30');
  });

  it('--mark-accent clears 3:1 where --brand-amber-500 did not', () => {
    const card = tokenRgba('--bg-card');
    expectRatio(tokenRgba('--mark-accent'), card, 3, '--mark-accent on --bg-card');
    expect(contrast(tokenRgba('--brand-amber-500'), card)).toBeLessThan(3);
  });

  it('every control listed in §1-ج actually took the functional edge', () => {
    const uses = (path: string, selector: string) =>
      Object.values(declarationsOf(sheetOf(path).rule(selector))).some((v) => v.includes('--border-control'));
    for (const sel of ['.wz-in', '.wz-ta', '.wz-chip', '.wz-check', '.wz-cardbtn', '.wz-draft', '.op-btn-ghost', '.op-langbtn', '.file-doc__up', '.bidderadd-in']) {
      expect(uses('apps/web/src/operator/operator.css', sel), sel).toBe(true);
    }
    for (const sel of ['.reg-select', '.reg-pager__size']) {
      expect(uses('apps/web/src/registry/registry.css', sel), sel).toBe(true);
    }
    for (const sel of ['.op-filter-select', '.acc-open', '.acc-scope-select']) {
      expect(uses('apps/web/src/admin/admin.css', sel), sel).toBe(true);
    }
  });
});

describe('§1 — elevation and focus are named, and the dark sidebar gets its own ring', () => {
  it('has exactly three elevation names plus the single permitted lift', () => {
    expect(DECLS['--elev-rest']).toBe('var(--shadow-1)');
    expect(DECLS['--elev-hover']).toBe('var(--shadow-2)');
    expect(DECLS['--elev-overlay']).toBe('var(--shadow-pop)');
    expect(DECLS['--lift']).toBe('-1px');
    expect(DECLS['--elev-4']).toBeUndefined(); // there is no fourth level, by design
  });

  it('routes :focus-visible through the tokens instead of a literal', () => {
    expect(DECLS['--focus-ring']).toBe('var(--focus-width) solid var(--focus-color)');
    expect(TOKEN_SHEET.rule(':focus-visible').getPropertyValue('outline')).toBe('var(--focus-ring)');
    expect(TOKEN_SHEET.rule(':focus-visible').getPropertyValue('outline-offset')).toBe('var(--focus-offset)');
  });

  it('keeps ONE name for the ring colour — no alias with zero consumers', () => {
    // --border-focus was `var(--focus-color)` with not one reference repo-wide. "One source of
    // truth" that nothing reads is dead code, and a dead alias is the thing a later edit changes
    // instead of the live token.
    expect(DECLS['--border-focus']).toBeUndefined();
    for (const path of SHEETS) expect(read(path), path).not.toContain('var(--border-focus)');
  });

  it('switches the ring COLOUR on the navy sidebar, where navy-on-navy is 2.18:1', () => {
    const navy900 = tokenRgba('--brand-navy-900');
    expect(contrast(tokenRgba('--focus-color'), navy900)).toBeLessThan(3);
    expectRatio(tokenRgba('--focus-color-on-dark'), navy900, 3, '--focus-color-on-dark on navy-900');
    expect(TOKEN_SHEET.rule('.ad-side :focus-visible').getPropertyValue('outline-color'))
      .toBe('var(--focus-color-on-dark)');
  });
});

/* ================================================================== */
/*  §2 — motion                                                        */
/* ================================================================== */

describe('§2-0 — every portal stylesheet answers prefers-reduced-motion', () => {
  const PORTALS = [
    'apps/web/src/operator/operator.css',
    'apps/web/src/admin/admin.css',
    'apps/web/src/registry/registry.css',
    'apps/web/src/charts/charts.css',
  ];

  it.each(PORTALS)('%s carries the universal 0.01ms block', (path) => {
    const css = read(path);
    const block = /@media \(prefers-reduced-motion: reduce\) \{\s*\*, \*::before, \*::after \{([^}]*)\}/.exec(css);
    expect(block, `${path} has no universal reduced-motion block`).not.toBeNull();
    const body = block![1];
    expect(body).toContain('animation-duration: 0.01ms !important');
    expect(body).toContain('transition-duration: 0.01ms !important');
    // 0 would suppress transitionend/animationend, and the drawer teardown listens for exactly that
    expect(body).not.toMatch(/duration:\s*0(ms)?\s*!/);
  });

  it('the drawer exit is a real animation the teardown can hear', () => {
    const css = read('apps/web/src/operator/operator.css');
    // a DISTINCT keyframe name for the exit: reusing the entry name with `reverse` leaves
    // animation-name unchanged, so the finished animation is updated rather than restarted and
    // no second animationend ever fires — the teardown would then hang on its fallback timer
    expect(css).toMatch(/\.op-drawer--closing\s*\{[^}]*animation:\s*dr-fade-out/);
    expect(css).toMatch(/\.op-drawer--closing \.op-drawer__panel\s*\{[^}]*animation:\s*dr-out/);
    expect(css).toMatch(/@keyframes dr-out/);
    expect(css).not.toMatch(/animation:[^;]*reverse/);
    // logical direction: one variable flips the offset, never a second keyframe block
    expect(css).toMatch(/html\[dir='ltr'\]\s*\{\s*--dr-dir:\s*-1;/);
    expect(css).not.toMatch(/@keyframes dr-in-ltr/);
  });
});

describe('§2-1 — useCountUp', () => {
  function Probe({ value, format }: { value: number; format?: (n: number) => string }) {
    const ref = useCountUp(value, format ? { format } : undefined);
    return <span data-testid="v" ref={ref} />;
  }

  afterEach(() => {
    // auto-cleanup is off (vitest runs without `globals`), so each probe is torn down by hand
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('prints the final figure at once where there is no IntersectionObserver', () => {
    const { getByTestId } = render(<Probe value={42} />);
    expect(getByTestId('v').textContent).toBe('42');
  });

  it('applies the caller\'s formatter, not String()', () => {
    const pct = (n: number) => `${n}%`;
    const { getByTestId } = render(<Probe value={87} format={pct} />);
    expect(getByTestId('v').textContent).toBe('87%');
  });

  it('jumps to the final figure under prefers-reduced-motion, creating no observer at all', () => {
    // with an observer available, only the reduced-motion branch can explain an instant value
    const observe = vi.fn();
    class IO {
      observe = observe;
      disconnect = vi.fn();
    }
    vi.stubGlobal('IntersectionObserver', IO);
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduced-motion'), media: q }));

    const { getByTestId } = render(<Probe value={7} />);
    expect(getByTestId('v').textContent).toBe('7');
    expect(observe).not.toHaveBeenCalled();
  });

  it('observes rather than printing when motion is allowed', () => {
    const observe = vi.fn();
    class IO {
      observe = observe;
      disconnect = vi.fn();
    }
    vi.stubGlobal('IntersectionObserver', IO);
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q }));

    const { getByTestId } = render(<Probe value={7} />);
    expect(observe).toHaveBeenCalledTimes(1);
    expect(getByTestId('v').textContent).toBe(''); // the hook writes nothing before the reveal
  });
});

describe('§2-5 — the toast exit is faster than its entry', () => {
  it('animates out at --dur-fast, and the timer that unmounts it agrees', () => {
    expect(read('apps/web/src/toast.css')).toMatch(/\.tv2-toast--out\s*\{\s*animation:\s*tv2-out var\(--dur-fast\)/);
    // --dur-fast is 120ms; EXIT_MS must track it or the node outlives its own animation
    expect(DECLS['--dur-fast']).toBe('120ms');
    expect(read('apps/web/src/Toasts.tsx')).toMatch(/const EXIT_MS = 120;/);
  });
});

/* ================================================================== */
/*  §4 — the sidebar disclosure                                        */
/* ================================================================== */

const MDOC = { name: 'د. سارة الجبوري', role: 'MDOC_ADMIN' as const, oid: 'oid-roc-01' };
const OPERATOR = {
  name: 'م. أحمد عبد الرحمن', role: 'OPERATOR_ADMIN' as const, oid: 'oid-opadmin-01',
  company: 'شركة نفط الواحة الصينية', companyId: 'op-alwaha',
};

const disc = () => document.querySelector('.ad-nav__disc') as HTMLButtonElement;
const sec = () => document.querySelector('.ad-nav__sec') as HTMLElement;
const navHrefs = (root: Element | null) =>
  Array.from(root?.querySelectorAll('a.ad-nav__btn') ?? []).map((a) => a.getAttribute('href'));

/** The primary items are the .ad-nav children that are NOT inside the secondary container. */
const primaryHrefs = () =>
  Array.from(document.querySelectorAll('.ad-nav > a.ad-nav__btn')).map((a) => a.getAttribute('href'));

function at(hash: string) {
  window.location.hash = hash;
  return render(<App />);
}

describe('§4 — «أدوات ومراجع» is a real disclosure over a real preference', () => {
  beforeEach(() => {
    localStorage.clear();
    saveSession(MDOC);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    window.location.hash = '';
    localStorage.clear();
  });

  it('promotes the approval chain into the daily five and demotes reports and accounts', () => {
    at('#/admin');
    const primary = primaryHrefs();
    expect(primary).toEqual(['#/admin', '#/admin/tenders', '#/admin/approvals', '#/admin/contracts', '#/admin/entities']);
    // the two that moved the other way — periodic work, not the work of the day
    expect(navHrefs(sec())).toEqual(expect.arrayContaining(['#/admin/reports', '#/admin/users']));
  });

  it('starts collapsed, and collapsing hides the items for real', () => {
    at('#/admin');
    expect(disc().getAttribute('aria-expanded')).toBe('false');
    expect(sec().hasAttribute('hidden')).toBe(true);
    // the attribute is what a screen reader reads — and the CSS must not lose to display:flex
    expect(sheetOf('apps/web/src/admin/admin.css').rule('.ad-nav__sec[hidden]').getPropertyValue('display'))
      .toBe('none');
    expect(disc().getAttribute('aria-controls')).toBe(sec().id);
  });

  it('never swallows an alarm: the collapsed header carries the sum of what it folded away', () => {
    at('#/admin');
    const badge = disc().querySelector('.ad-nav__count');
    expect(badge).not.toBeNull();
    const hidden = Array.from(sec().querySelectorAll('.ad-nav__count')).reduce(
      (n, el) => n + Number(el.textContent),
      0,
    );
    expect(Number(badge!.textContent)).toBe(hidden);
    expect(Number(badge!.textContent)).toBeGreaterThan(0);
  });

  it('opening writes the preference, and the badge is retired once nothing is hidden', () => {
    at('#/admin');
    expect(disc().hasAttribute('aria-disabled')).toBe(false); // operable here, and it says so
    act(() => { fireEvent.click(disc()); });
    expect(disc().getAttribute('aria-expanded')).toBe('true');
    expect(sec().hasAttribute('hidden')).toBe(false);
    expect(localStorage.getItem(NAV_SEC_KEY)).toBe('1');
    expect(disc().querySelector('.ad-nav__count')).toBeNull();
  });

  it('closes again, and the preference follows it down', () => {
    localStorage.setItem(NAV_SEC_KEY, '1');
    at('#/admin');
    act(() => { fireEvent.click(disc()); });
    expect(disc().getAttribute('aria-expanded')).toBe('false');
    expect(sec().hasAttribute('hidden')).toBe(true);
    expect(localStorage.getItem(NAV_SEC_KEY)).toBe('0');
  });

  it('reads the stored preference back on the next mount', () => {
    localStorage.setItem(NAV_SEC_KEY, '1');
    at('#/admin');
    expect(disc().getAttribute('aria-expanded')).toBe('true');
    expect(sec().hasAttribute('hidden')).toBe(false);
  });

  it('keeps the preference OUTSIDE the business store key', () => {
    // a chrome preference must not travel with — or be wiped by — a data migration
    expect(NAV_SEC_KEY).toBe('masaar.nav.sec');
    expect(NAV_SEC_KEY.startsWith('masaar-operator')).toBe(false);
  });

  it('forces the group open for a deep link inside it — without corrupting the preference', () => {
    localStorage.setItem(NAV_SEC_KEY, '0');
    at('#/admin/audit');
    expect(sec().hasAttribute('hidden')).toBe(false);
    const active = sec().querySelector('a[aria-current="page"]');
    expect(active?.getAttribute('href')).toBe('#/admin/audit');
    // the forced open is a display decision only; what the reader chose is still what is stored
    expect(localStorage.getItem(NAV_SEC_KEY)).toBe('0');
  });

  it.each(['0', '1'])(
    'announces the forced-open disclosure as unavailable and never rewrites the preference (stored %s)',
    (stored) => {
      /**
       * The group cannot close while the current page is inside it, so on `#/admin/audit` the
       * button is not operable — and it has to SAY that. It used to compute `!secOpen`, i.e.
       * always `false` here: every click wrote `masaar.nav.sec = '0'` while `aria-expanded`
       * stayed `true` and `hidden` never moved. A screen-reader user activated a control that
       * announced "expanded", got no change, and had their stored OPEN preference destroyed —
       * destroyable there, never restorable there.
       */
      localStorage.setItem(NAV_SEC_KEY, stored);
      at('#/admin/audit');
      expect(disc().getAttribute('aria-disabled')).toBe('true');
      expect(disc().getAttribute('aria-expanded')).toBe('true');
      act(() => { fireEvent.click(disc()); });
      expect(disc().getAttribute('aria-expanded')).toBe('true');
      expect(sec().hasAttribute('hidden')).toBe(false);
      expect(localStorage.getItem(NAV_SEC_KEY)).toBe(stored);
    },
  );

  it('marks the current page in both shells', () => {
    at('#/admin/tenders');
    expect(document.querySelector('a.ad-nav__btn[aria-current="page"]')?.getAttribute('href'))
      .toBe('#/admin/tenders');
    document.body.innerHTML = '';

    localStorage.clear();
    saveSession(OPERATOR);
    at('#/operator/tenders');
    expect(document.querySelector('a.op-nav__btn[aria-current="page"]')?.getAttribute('href'))
      .toBe('#/operator/tenders');
  });

  it('leaves the operator shell FLAT — one secondary item is below the disclosure threshold', () => {
    localStorage.clear();
    saveSession(OPERATOR);
    at('#/operator');
    expect(document.querySelector('.op-nav__disc')).toBeNull();
    // a static heading instead, with the one secondary destination under it and nothing hidden
    expect(document.querySelector('.op-nav__group')).not.toBeNull();
    expect(
      Array.from(document.querySelectorAll('a.op-nav__btn')).map((a) => a.getAttribute('href')),
    ).toEqual(['#/operator', '#/operator/tenders', '#/operator/new', '#/operator/reports']);
  });
});

/* ================================================================== */
/*  §2-1 — the KPI figure is a fact before it is an animation          */
/* ================================================================== */

describe('§2-1 — a KPI tile that is never revealed still shows the truth', () => {
  const kpiValues = () =>
    Array.from(document.querySelectorAll('.ad-kpi__v')).map((el) => el.textContent);

  beforeEach(() => {
    localStorage.clear();
    saveSession(MDOC);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    window.location.hash = '';
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('reads identically whether or not the reveal ever fires', () => {
    /**
     * The tile used to render a hard-coded `0` and wait for `IntersectionObserver` at
     * `threshold: 0.4`. Any tile that never reaches 40% visibility — a short viewport, a headless
     * print of the follow-up room — displayed and announced a figure of zero that no derivation
     * had produced, on a governance dashboard. The literal was a Latin `0` whatever the language,
     * and `0` rather than `0%` on the ratio tile.
     *
     * With no IntersectionObserver (jsdom) the hook writes the true figure synchronously; with an
     * observer that never fires, the markup is all a reader ever gets. The two must agree.
     */
    at('#/admin');
    const revealed = kpiValues();
    expect(revealed.length).toBeGreaterThan(0);
    expect(revealed.some((v) => /%$/.test(v ?? ''))).toBe(true); // the ratio tile keeps its unit
    document.body.innerHTML = '';

    class NeverFires {
      observe = vi.fn();
      disconnect = vi.fn();
    }
    vi.stubGlobal('IntersectionObserver', NeverFires);
    at('#/admin');
    expect(kpiValues()).toEqual(revealed);
  });
});
