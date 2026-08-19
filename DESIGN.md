# Design

Authoritative source: `packages/tokens/css/tokens.css` (self-hosted fonts via @fontsource; matches `assets/colors_and_type.css`). Never restate values inline — always `var(--…)`.

## Theme

Warm-paper institutional light theme. Deep petroleum navy carries identity; amber is a sparing accent; status colors are a closed semantic vocabulary. No dark mode.

## Color roles

- Brand: `--brand-navy-900…50` (primary `--brand-navy-800`); accent `--brand-amber-700…50` (primary `--brand-amber-500`).
- Surfaces: `--bg-page` (paper-50), `--bg-card` (#fff), `--bg-muted`, `--bg-inset`, `--bg-dark` (navy-900 — admin sidebar).
- Ink: `--fg-1…4` (primary→placeholder), `--ink-on-dark`, `--ink-on-dark-2`. Hairlines: `--border-1`.
- Status (fixed meanings, each with `-bg` soft pair): `--status-planned` (مخطط), `--status-progress` (قيد التنفيذ), `--status-done` (منجز), `--status-risk` (تحذير), `--status-delayed` (متأخر), `--status-blocked` (موقوف). Status color is information, never decoration.

## Typography

Arabic-first stacks from tokens (self-hosted). Mono (`.mono`, `.op-code`) for codes/dates/money — always LTR islands, Latin digits via `fmtCount(n, lang)`. Product scale: fixed rem steps, weight carries hierarchy. RTL note: `td.mono`/`td.op-code` re-anchor to column start edge (see styles.css rule).

## Layout & spacing

CSS logical properties exclusively (`inset-inline-*`, `padding-inline`, `margin-inline`, `text-align: start/end`, `border-start-*`). Radii/spacing from tokens (`--r-md` …). Pages are `.op-page` vertical stacks; density is welcome in tables.

## Component vocabulary (reuse before inventing)

- Primitives (`@masaar/ui`): StatusPill, PathBadge, KpiTile, CapMeter, WdRail, VerdictStrip, Stepper (3 skins).
- Shell/page: `.op-page`, `.op-page__head/__title/__sub`, `.op-tablecard` + `.op-tbl` (+ `.op-tbl__row/__name/__code`, `.op-end`), `.op-empty`, `.op-search`, `.op-panel`, `.op-drawer` (QuickLook), `.op-toast`.
- Buttons: `.op-btn-primary` (ONE per surface), `.op-btn-ghost`, `.op-btn-nav`, `.op-btn-danger` (the only danger style), `.op-iconbtn`. Labels are masdar + object («تسجيل دفعة»); confirms are «نعم، + الواقعة» / «تراجع».
- Wizard/notes: `.wz-note--info/warn/danger/ok`, `.wz-chip(--on)`, `.wz-gate(--ok)`, `.wz-next(--amber)`, WizardShell.
- Admin: `.ad-kpis/.ad-kpi(__head/__l/__row/__v/__delta)`, `.ad-cols/.ad-panel`, `.ad-modal` (Modal.tsx), `.acc-*` registry family (filters, avatar, role pills, `.acc-open` row link).
- Registry layer (batch 1, `apps/web/src/registry/`): ReportColumn/exportCsv, useTableSort + SortableTh (aria-sort), usePagination + PaginationBar, EmptyState (dual-mode), SearchBox, FilterChips — the mandatory skeleton for every list screen.

## Motion

150–250ms ease-out state feedback only (open/close, hover tints). No entrance choreography. `prefers-reduced-motion` honored.

## Iconography

`Icon.tsx` only (stroke icons, named registry). No emoji anywhere. Forward chevrons use `.op-chev-fwd` (flips under LTR).

## Hard bans

Raw hex/palette classes in components; physical left/right CSS; disabled-without-explanation commits (use `.wz-gate`); placebo buttons; Latin digits mid-Arabic (use `fmtCount`); nested cards; side-stripe accent borders on new components.
