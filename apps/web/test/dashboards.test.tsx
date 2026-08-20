// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '../src/i18n';
import App from '../src/App';
import { saveSession } from '../src/session';
import i18n from '../src/i18n';
import { Sparkline } from '../src/charts/Sparkline';
import { complianceSeries } from '../src/admin/dashboardDerive';
import { seedState, todayIso, type State } from '../src/store';

const KEY = 'masaar-operator-v11';

/**
 * The dashboards wave, end to end (client requests 1, 2, 5, 6, 12, 13).
 *
 * The derivations are pinned in dashboardDerive.test.ts. What only a mounted screen can prove is
 * the promise the whole wave rests on: a statistic is a REAL link, and the registry it opens
 * holds exactly the rows it counted. A tile that lands on an unfiltered — or differently
 * filtered — registry typechecks perfectly and is a lie only a render can catch.
 */

const MDOC = { name: 'د. سارة الجبوري', role: 'MDOC_ADMIN' as const, oid: 'oid-roc-01' };

beforeEach(() => {
  localStorage.clear();
  saveSession(MDOC);
});

afterEach(() => {
  document.body.innerHTML = '';
  window.location.hash = '';
  localStorage.clear();
});

/** Mount the real app at a hash, optionally over a store the test seeded first. */
function at(hash: string, state?: State) {
  if (state) localStorage.setItem(KEY, JSON.stringify(state));
  window.location.hash = hash;
  return render(<App />);
}

/** Follow a link the way a click does — including the re-sync every registry now depends on. */
function follow(hash: string) {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new Event('hashchange'));
  });
}

/** The admin shell renders exactly one page body; selecting it by class keeps the helper
 *  language-agnostic, which the English mirror test below depends on. */
const room = () => document.querySelector('.op-page') as HTMLElement;

describe('#/admin — the follow-up room replaces the list with counts that open (requests 1 + 5)', () => {
  it('has dropped the «مراحل متجاوزة للمخطط» panel entirely', () => {
    at('#/admin');
    expect(screen.queryByText('مراحل متجاوزة للمخطط')).toBeNull();
    expect(screen.queryByText('عبر المحفظة كلها · بأيام العمل')).toBeNull();
  });

  it('replaces it with a counted tile that opens the registry of late requests', () => {
    at('#/admin');
    const tile = screen.getByText('مراحل متأخرة').closest('a') as HTMLAnchorElement;
    expect(tile.getAttribute('href')).toBe('#/admin/tenders?status=delayed');
    // three of the four seeded requests have run past their current stage's planned close
    expect(within(tile).getByText('3')).toBeTruthy();
  });

  it('makes every ROW-COUNTING tile a real link with a standing «افتح السجل مصفّى» affordance', () => {
    at('#/admin');
    const tiles = [...room().querySelectorAll('.ad-kpi')];
    expect(tiles).toHaveLength(7);
    const links = tiles.filter((el) => el.tagName === 'A');
    // six of the seven count rows and open the registry holding them; none hides its affordance
    // behind a hover, and every one of them really carries a destination
    expect(links).toHaveLength(6);
    expect(links.every((el) => el.getAttribute('href'))).toBe(true);
    expect(links.every((el) => el.querySelector('.ad-kpi__go')?.textContent?.includes('افتح السجل مصفّى'))).toBe(true);
  });

  /**
   * The one tile that counts NO rows. «الالتزام بالجداول» is a ratio over every stage ever
   * closed — there is no registry that can hold «92%» — and the screen it used to point at
   * (`#/admin/compliance`) answers §9 local content and §12.2 nominations, a different subject
   * entirely. An affordance promising a filtered registry there was a placebo twice over.
   */
  it('leaves the compliance ratio a plain tile — no anchor, no affordance, and its window named', () => {
    at('#/admin');
    const label = screen.getByText('الالتزام بالجداول');
    expect(label.closest('a')).toBeNull();
    const tile = label.closest('.ad-kpi') as HTMLElement;
    expect(tile.tagName).toBe('DIV');
    expect(tile.querySelector('.ad-kpi__go')).toBeNull();
    // what replaces the affordance: the window the percentage measures
    expect(tile.querySelector('.ad-kpi__win')?.textContent).toBe('منذ البداية');
    // and no tile anywhere still points at the legacy §9 screen
    expect(room().querySelector('a[href="#/admin/compliance"]')).toBeNull();
  });

  it('puts the month-by-month strip directly after the tile row, so the trend sits beside the ratio', () => {
    at('#/admin');
    const strip = screen.getByText('الالتزام الزمني شهراً بشهر').closest('.ad-panel') as HTMLElement;
    expect(strip).toBeTruthy();
    expect(strip.previousElementSibling?.classList.contains('ad-kpis')).toBe(true);
  });

  it('points each tile at the registry that holds what it counted', () => {
    at('#/admin');
    const href = (label: string) => (screen.getByText(label).closest('a') as HTMLAnchorElement).getAttribute('href');
    expect(href('مناقصات مفتوحة')).toBe('#/admin/tenders?status=open');
    expect(href('بانتظار المصادقة')).toBe('#/admin/tenders?pending=1');
    expect(href('عقود في مرحلة التنفيذ')).toBe('#/admin/contracts?stage=execute');
    // the ladder tiles count only the UNDECIDED rows of a band, so they carry the gate as well
    expect(href('بانتظار موافقة اللجنة المشتركة JMC')).toBe('#/admin/approvals?tier=JMC&pending=1');
    expect(href('بانتظار موافقة نفط الوسط')).toBe('#/admin/approvals?tier=MDOC&pending=1');
  });
});

/**
 * The governing law of the wave, at the one place it was still broken: a tile opens the registry
 * holding EXACTLY the rows it counted.
 *
 * The follow-up room's «بانتظار موافقة …» tiles count `decision === 'pending'` inside a band, but
 * `?tier=JMC` opens the whole band. While every seeded request is undecided the two numbers agree
 * by luck; ratify one and they part company. That is what these tests ratify and then measure.
 */
describe('the pending-approval tiles open exactly the signatures they counted', () => {
  const RATIFIED_T3: State = (() => {
    const s = seedState();
    const t3 = s.tenders.find((x) => x.id === 't3')!;
    t3.ratification = { status: 'ratified', on: '2026-08-18', by: 'د. سارة الجبوري' };
    return s;
  })();

  const tileCount = (label: string): number => {
    const tile = screen.getByText(label).closest('a') as HTMLAnchorElement;
    return Number(tile.querySelector('.ad-kpi__v')!.textContent);
  };
  const landedRows = (): number => document.querySelectorAll('.op-tbl tbody tr').length;

  it('agrees with the landed registry while the whole band is undecided', () => {
    at('#/admin');
    expect(tileCount('بانتظار موافقة اللجنة المشتركة JMC')).toBe(1);
    follow('#/admin/approvals?tier=JMC&pending=1');
    expect(landedRows()).toBe(1);
  });

  it('drops the tile AND the landed rows by the same one when a request is ratified', () => {
    at('#/admin', RATIFIED_T3);
    // t3 is the only JMC row and it is now decided — nobody is waiting on that signature
    expect(tileCount('بانتظار موافقة اللجنة المشتركة JMC')).toBe(0);
    follow('#/admin/approvals?tier=JMC&pending=1');
    expect(landedRows()).toBe(0);
    expect(screen.getByText('لا مناقصة تطابق الفلاتر الحالية.')).toBeTruthy();
  });

  it('is the `pending=1` gate that does it — the band alone still holds the decided row', () => {
    at('#/admin/approvals?tier=JMC', RATIFIED_T3);
    // WITHOUT the gate the destination lists a row the tile no longer counts: the exact defect
    expect(landedRows()).toBe(1);
    expect(screen.getByText('MN-EPC-0305')).toBeTruthy();
    expect(screen.getByText('مُصادَق')).toBeTruthy();
  });

  it('says why the registry is short, and widens it in one click', () => {
    at('#/admin/approvals?tier=JMC&pending=1', RATIFIED_T3);
    const chip = screen.getByText('بانتظار القرار فقط');
    fireEvent.click(within(chip.closest('.reg-chip') as HTMLElement).getByRole('button'));
    act(() => { window.dispatchEvent(new Event('hashchange')); });
    // dismissing rewrites the hash, so the address never describes a screen other than the one on it
    expect(window.location.hash).toBe('#/admin/approvals?tier=JMC');
    expect(screen.getByText('MN-EPC-0305')).toBeTruthy();
  });
});

describe('the per-company bars (request 1)', () => {
  it('draws all twelve companies, each row a real link to its own tenders', () => {
    at('#/admin');
    const bars = [...room().querySelectorAll('a.ch-bar')] as HTMLAnchorElement[];
    expect(bars).toHaveLength(12);
    expect(bars.every((a) => a.getAttribute('href')?.startsWith('#/admin/tenders?op='))).toBe(true);
  });

  it('carries the numbers in the link label — the track itself is hidden from assistive tech', () => {
    at('#/admin');
    const bar = room().querySelector('a.ch-bar[href="#/admin/tenders?op=op-alwaha"]') as HTMLAnchorElement;
    expect(bar.getAttribute('aria-label')).toContain('شركة نفط الواحة الصينية');
    expect(bar.getAttribute('aria-label')).toContain('$4.2M');
    expect(bar.querySelector('.ch-bar__track')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('keeps a company with no tenders visible, with an empty track and «—» for its value', () => {
    at('#/admin');
    const bar = room().querySelector('a.ch-bar[href="#/admin/tenders?op=op-kar"]') as HTMLAnchorElement;
    expect(bar).toBeTruthy();
    expect(bar.querySelectorAll('.ch-bar__seg')).toHaveLength(0);
    expect(within(bar).getAllByText('—').length).toBeGreaterThan(0);
  });

  it('lands the row link on the tenders registry narrowed to that company, with a removable chip', () => {
    at('#/admin');
    follow('#/admin/tenders?op=op-alwaha');
    expect(screen.getByText('AH-DRL-0212')).toBeTruthy();
    expect(screen.queryByText('BD-MNT-0098')).toBeNull();

    const chip = screen.getByText(/الشركة: شركة نفط الواحة الصينية/);
    fireEvent.click(within(chip.closest('.reg-chip') as HTMLElement).getByRole('button'));
    act(() => { window.dispatchEvent(new Event('hashchange')); });
    // dismissing widens the registry AND rewrites the address, so the two never drift apart
    expect(window.location.hash).toBe('#/admin/tenders');
    expect(screen.getByText('BD-MNT-0098')).toBeTruthy();
  });
});

describe('the tier donut (request 5)', () => {
  it('prints the portfolio total in the ring and every band in the legend', () => {
    at('#/admin');
    const donut = room().querySelector('.ch--donut') as HTMLElement;
    expect(donut.querySelector('.ch-donut__n')?.textContent).toBe('4');
    // the SVG is a drawing: hidden from assistive tech, and never focusable
    const svg = donut.querySelector('svg')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.querySelector('[tabindex]')).toBeNull();
    expect(svg.querySelectorAll('.ch-donut__seg')).toHaveLength(3);
  });

  it('gives ط2 and ط3 a real link, and leaves ط1 inert — it opens no approval gate', () => {
    at('#/admin');
    const legend = room().querySelector('.ch--donut .ch-legend') as HTMLElement;
    expect((within(legend).getByText('ط2 · JMC').closest('a') as HTMLAnchorElement).getAttribute('href')).toBe('#/admin/approvals?tier=JMC');
    expect((within(legend).getByText('ط3 · MDOC').closest('a') as HTMLAnchorElement).getAttribute('href')).toBe('#/admin/approvals?tier=MDOC');
    expect(within(legend).getByText('ط1 · المشغّل').closest('a')).toBeNull();
  });

  it('lands a segment link on the approval chain filtered to that band', () => {
    at('#/admin');
    follow('#/admin/approvals?tier=MDOC');
    expect(screen.getByText('B7-FAC-0331')).toBeTruthy();
    expect(screen.queryByText('MN-EPC-0305')).toBeNull();
  });

  it('re-syncs the chain when only the band changes — no remount, no stale table', () => {
    at('#/admin/approvals?tier=MDOC');
    expect(screen.queryByText('MN-EPC-0305')).toBeNull();
    follow('#/admin/approvals?tier=JMC');
    expect(screen.getByText('MN-EPC-0305')).toBeTruthy();
    expect(screen.queryByText('B7-FAC-0331')).toBeNull();
  });
});

describe('the company detail (request 2)', () => {
  it('folds a per-company table of fields, project types, late requests and contracts', () => {
    at('#/admin');
    const disc = room().querySelector('details.ad-disc') as HTMLDetailsElement;
    expect(disc).toBeTruthy();
    expect(within(disc).getByText('تفصيل الشركات المشغّلة')).toBeTruthy();
    for (const head of ['الحقول', 'حفر', 'هندسة/إنشاء', 'مواد ثقيلة', 'أخرى', 'متأخرة', 'العقود'])
      expect(within(disc).getAllByText(head).length).toBeGreaterThan(0);
    expect(disc.querySelectorAll('tbody tr')).toHaveLength(12);
  });

  it('links each company name to the operators registry narrowed to it', () => {
    at('#/admin');
    const disc = room().querySelector('details.ad-disc') as HTMLElement;
    const link = within(disc).getByText('جيو-جاد الصينية').closest('a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('#/admin/operators?op=op-geojade');

    follow('#/admin/operators?op=op-geojade');
    expect(screen.getByText(/الشركة: جيو-جاد الصينية/)).toBeTruthy();
    expect(screen.queryByText('شركة نفط الواحة الصينية')).toBeNull();
  });

  it('says out loud why a contract may belong to no company, instead of leaving zeros unexplained', () => {
    at('#/admin');
    expect(screen.getByText(/العقد الذي لا يحمل مناقصة أصل لا يُنسب إلى أحد/)).toBeTruthy();
  });
});

describe('the contracts registry (request 12c)', () => {
  it('puts the completion distribution above the table, each column a real link', () => {
    at('#/admin/contracts');
    const cols = [...document.querySelectorAll('a.ch-hist__col')] as HTMLAnchorElement[];
    expect(cols.map((a) => a.getAttribute('href'))).toEqual([
      '#/admin/contracts?prog=0-25', '#/admin/contracts?prog=25-50',
      '#/admin/contracts?prog=50-75', '#/admin/contracts?prog=75-100',
    ]);
  });

  it('filters the table in place when a column is followed — the same screen, re-synced', () => {
    at('#/admin/contracts');
    expect(screen.getByText('EB-CON-0176')).toBeTruthy();
    follow('#/admin/contracts?prog=25-50');
    // 3/7, 2/7 and 3/7 sit in this bucket; c4 at 5/7 does not
    expect(screen.getByText('AH-CON-0188')).toBeTruthy();
    expect(screen.queryByText('EB-CON-0176')).toBeNull();
    // the chip prints the range the bucket actually HOLDS — the key '25-50' is a half-open
    // machine name, and «25–50%» beside a «0–25%» column claims 25% for both
    expect(screen.getByText(/نسبة الإنجاز: 25–49%/)).toBeTruthy();
  });

  it('honours the `?stage=` deep link the «عقود في مرحلة التنفيذ» tile carries', () => {
    at('#/admin/contracts?stage=execute');
    expect(screen.getByText('AH-CON-0188')).toBeTruthy();
    expect(screen.getByText('MN-CON-0205')).toBeTruthy();
    expect(screen.queryByText('FM-CON-0191')).toBeNull();
  });
});

describe('#/admin/fields — the mount-only ?op= defect is gone', () => {
  it('re-filters when the address changes on the screen already open', () => {
    at('#/admin/fields?op=op-alwaha');
    expect(screen.getByText('AHDAB')).toBeTruthy();
    expect(screen.queryByText('BADRA')).toBeNull();
    follow('#/admin/fields?op=op-badra');
    expect(screen.getByText('BADRA')).toBeTruthy();
    expect(screen.queryByText('AHDAB')).toBeNull();
  });

  it('writes the reader\'s own choice back into the address, so the URL stays shareable', () => {
    at('#/admin/fields?op=op-alwaha');
    fireEvent.change(screen.getByLabelText('كل المشغّلين'), { target: { value: 'op-badra' } });
    expect(window.location.hash).toBe('#/admin/fields?op=op-badra');
  });
});

describe('#/admin/tenders — the counted queues open exactly what they counted', () => {
  it('`?status=open` lists every unfinished request, not just the calm ones', () => {
    at('#/admin/tenders?status=open');
    for (const code of ['AH-DRL-0212', 'BD-MNT-0098', 'MN-EPC-0305', 'B7-FAC-0331'])
      expect(screen.getByText(code)).toBeTruthy();
    expect(screen.getByText(/مفتوحة \(لم تُنجَز بعد\)/)).toBeTruthy();
  });

  it('`?pending=1` lists only the request awaiting ratification', () => {
    at('#/admin/tenders?pending=1');
    expect(screen.getByText('MN-EPC-0305')).toBeTruthy();
    expect(screen.queryByText('AH-DRL-0212')).toBeNull();
  });

  it('`?status=delayed` lists exactly the request the room counted as late', () => {
    at('#/admin/tenders?status=delayed');
    expect(screen.getByText('BD-MNT-0098')).toBeTruthy();
    // B7-FAC-0331 sits at an approval stage still inside its plan — it is late nowhere
    expect(screen.queryByText('B7-FAC-0331')).toBeNull();
  });

  it('ignores a junk filter and shows the whole registry rather than an empty one', () => {
    at('#/admin/tenders?op=op-nope&status=exploded');
    expect(screen.getByText('AH-DRL-0212')).toBeTruthy();
    expect(screen.getByText('B7-FAC-0331')).toBeTruthy();
  });
});

describe('the contract file states how completion is controlled (request 12)', () => {
  it('prints the formula under the progress bar, with the live denominator', () => {
    at('#/admin/contracts/c1');
    expect(screen.getByText(/النسبة = المراحل المغلقة من أصل الكل: 3 من 7 = 43%/)).toBeTruthy();
  });

  it('previews the before → after percentage inside the advance-stage confirmation', () => {
    at('#/admin/contracts/c1');
    fireEvent.click(screen.getByRole('button', { name: /إنجاز المرحلة/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('43%')).toBeTruthy();
    expect(within(dialog).getByText('57%')).toBeTruthy();
    expect(within(dialog).getByText('ستصير 4 من 7 مرحلة')).toBeTruthy();
  });
});

describe('the public home page carries the awarded portfolio (requests 6 + 13)', () => {
  it('states count, value and the completed / in-execution split', () => {
    at('#/');
    const card = screen.getByText('العقود المحالة').closest('section') as HTMLElement;
    expect(within(card).getByText('$31.9M')).toBeTruthy();
    expect(within(card).getByText('عدد العقود').nextElementSibling?.textContent).toBe('4');
    expect(within(card).getByText('منجزة (كل المراحل مغلقة)').nextElementSibling?.textContent).toBe('0');
    expect(within(card).getByText('قيد التنفيذ').nextElementSibling?.textContent).toBe('4');
  });

  it('splits the requests in flight across the ladder, and offers no link a visitor cannot use', () => {
    at('#/');
    const fig = screen.getByText('المناقصات الجارية حسب طبقة الموافقة').closest('figure') as HTMLElement;
    expect(within(fig).getByText('ط1 · المشغّل').closest('a')).toBeNull();
    expect(fig.querySelectorAll('.ch-bar__seg')).toHaveLength(3);
  });
});

describe('the schedule-compliance strip refuses to invent a trend (request 5)', () => {
  it('draws a point per measured month, or nothing at all when the store cannot support a series', () => {
    const series = complianceSeries(seedState(), todayIso());
    at('#/admin');
    const strip = screen.queryByText('الالتزام الزمني شهراً بشهر');
    if (series.length < 2) {
      // one derivable point is not a time series — the strip must be absent, not flat
      expect(strip).toBeNull();
      return;
    }
    expect(strip).toBeTruthy();
    const svg = room().querySelector('svg.ch-spark')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.querySelector('polyline')!.getAttribute('points')!.trim().split(/\s+/)).toHaveLength(series.length);
    // the number is printed beside the line: the drawing decorates a figure, it never carries it
    expect(room().querySelector('.ch-spark__v')!.textContent).toBe(`${series[series.length - 1]!.pct}%`);
  });

  it('renders nothing from a single point', () => {
    const { container } = render(<Sparkline points={[{ month: '2026-06', pct: 87, closed: 4 }]} lang="ar" />);
    expect(container.innerHTML).toBe('');
  });

  /**
   * x is TIME, not array position. `complianceSeries` skips a month that closed no stage, so an
   * index axis draws March→June with the same step as March→April — a slope the data never had.
   */
  it('spaces the points by month, so a skipped month leaves a gap instead of collapsing', () => {
    const pts = (months: string[]) => months.map((month, i) => ({ month, pct: [40, 70, 90][i]!, closed: 2 }));
    const xs = (el: HTMLElement) => el.querySelector('polyline')!.getAttribute('points')!
      .trim().split(/\s+/).map((p) => Number(p.split(',')[0]));

    // identical percentages, identical point count — only the calendar differs
    const dense = render(<Sparkline points={pts(['2026-04', '2026-05', '2026-06'])} lang="ar" />);
    const sparse = render(<Sparkline points={pts(['2026-01', '2026-05', '2026-06'])} lang="ar" />);
    const a = xs(dense.container);
    const b = xs(sparse.container);

    expect(a).not.toEqual(b);
    expect(a).toEqual([0, 60, 120]);          // three consecutive months — even thirds
    expect(b).toEqual([0, 96, 120]);          // Jan→May is four months of the five-month span
    // both still start and end at the box edges: the covered range is what the strip draws
    expect([a[0], a[2]]).toEqual([b[0], b[2]]);
  });

  it('prints the last point’s MONTH beside its percentage, at caption size', () => {
    const { container } = render(<Sparkline points={[{ month: '2026-05', pct: 62, closed: 3 }, { month: '2026-06', pct: 87, closed: 4 }]} lang="ar" />);
    expect(container.querySelector('.ch-spark__v')!.textContent).toBe('87%');
    // the number alone would read as «compliance», which is the all-time tile's claim, not this one's
    expect(container.querySelector('.ch-spark__vm')!.textContent).toBe('2026-06');
  });
});

describe('the completion histogram labels its boundaries honestly (§3-د)', () => {
  it('prints the last percentage each half-open bucket actually holds', () => {
    at('#/admin/contracts');
    const cols = [...document.querySelectorAll('a.ch-hist__col')] as HTMLAnchorElement[];
    // '0-25%' beside '25-50%' claims 25% twice and leaves the reader to guess which column owns it
    expect(cols.map((c) => c.querySelector('.ch-hist__l')!.textContent))
      .toEqual(['0–24%', '25–49%', '50–74%', '75–100%']);
    // the aria sentence reads the same two numbers as the printed label
    expect(cols[0]!.getAttribute('aria-label')).toContain('من 0 إلى 24');
    expect(cols[3]!.getAttribute('aria-label')).toContain('من 75 إلى 100');
  });
});

describe('the room’s completion histogram opens the contracts registry', () => {
  it('carries the same four bucket links the registry filters by', () => {
    at('#/admin');
    const cols = [...room().querySelectorAll('a.ch-hist__col')] as HTMLAnchorElement[];
    expect(cols).toHaveLength(4);
    expect(cols[1]!.getAttribute('href')).toBe('#/admin/contracts?prog=25-50');
    // 3/7, 2/7 and 3/7 of the seeded contracts land in that bucket
    expect(within(cols[1]!).getByText('3')).toBeTruthy();
    follow('#/admin/contracts?prog=25-50');
    expect(screen.queryByText('EB-CON-0176')).toBeNull();
  });
});

describe('English mirror — parity is a rendering fact, not a file diff', () => {
  afterEach(async () => { await act(async () => { await i18n.changeLanguage('ar'); }); });

  /**
   * `nameEn` is optional on `OperatorOrg`. A company registered without one must read to an
   * English reader as its Arabic name — never as «op-alwaha». An id in a sentence is a leaked
   * primary key: it names nothing the reader can act on, and reads as a defect.
   */
  it('falls back to the Arabic company name, never the record id, in a filter chip', async () => {
    const noEn = seedState();
    const alwaha = noEn.operators.find((o) => o.id === 'op-alwaha')!;
    const arName = alwaha.name;
    delete alwaha.nameEn;

    at('#/admin/operators?op=op-alwaha', noEn);
    await act(async () => { await i18n.changeLanguage('en'); });
    const chip = document.querySelector('.reg-chip') as HTMLElement;
    expect(chip.textContent).toContain(arName);
    expect(chip.textContent).not.toContain('op-alwaha');
  });

  it('renders every new surface in English, with the same Latin digits and the same links', async () => {
    at('#/admin');
    await act(async () => { await i18n.changeLanguage('en'); });
    expect(screen.getByText('Tenders per operating company')).toBeTruthy();
    expect(screen.getByText('Tenders by approval tier')).toBeTruthy();
    expect(screen.getByText('Contracts by completion')).toBeTruthy();
    expect(screen.getByText('Operating companies in detail')).toBeTruthy();
    // the destinations are language-independent — a translated href would be a second contract
    const tile = screen.getByText('Late stages').closest('a') as HTMLAnchorElement;
    expect(tile.getAttribute('href')).toBe('#/admin/tenders?status=delayed');
    expect(within(tile).getByText('3')).toBeTruthy();
    // the company bar reads its English name and keeps the machine value an LTR island
    const bar = room().querySelector('a.ch-bar[href="#/admin/tenders?op=op-alwaha"]') as HTMLAnchorElement;
    expect(bar.getAttribute('aria-label')).toContain('AlWaha');
    expect(bar.getAttribute('aria-label')).toContain('$4.2M');
  });
});
