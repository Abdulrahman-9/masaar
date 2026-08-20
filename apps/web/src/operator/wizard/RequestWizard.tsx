import { detectSplitRisk, METHODS, minParticipants, stageByKey, suggestMethod } from '@masaar/scpp-rules';
import { addWorkingDays, toIso, toUtcDate } from '@masaar/working-days';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { loadSession } from '../../session';
import { calendarOf, defaultStageKeys, faForFieldId, fieldsOfOperator, todayIso, useStore } from '../../store';
import { fmtCount, fmtMoney } from '../derive';
import { Icon } from '../Icon';
import WizardShell, { type WizardStep } from './WizardShell';

const STAGE_WD: Record<string, number> = {
  cost: 5, approval: 5, preq: 10, announce: 15, invite: 5, 'tech-open': 4,
  'tech-analysis': 8, 'comm-open': 3, 'comm-analysis': 10, ratify: 6, sign: 4,
};
const CATS = ['supply', 'services', 'works'] as const;
const BASES = ['market', 'priorContracts', 'engineering'] as const;

export default function RequestWizard() {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language === 'ar' ? 'ar' : 'en') as 'ar' | 'en';
  const { state, dispatch } = useStore();

  const [name, setName] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  const [desc, setDesc] = useState('');
  const [value, setValue] = useState(74800);
  const [basis, setBasis] = useState<string | null>(null);
  const [override, setOverride] = useState<number | null>(null);
  const [just, setJust] = useState('');
  const [reviewed, setReviewed] = useState(false);

  // the request belongs to a field; the field's Service Contract sets the FA (§7.1)
  const myOperatorId = loadSession()?.companyId;
  const myFields = fieldsOfOperator(state, myOperatorId);
  const [fieldId, setFieldId] = useState(myFields[0]?.id ?? '');
  const myFaRaw = faForFieldId(state, fieldId); // number | null — null = no effective contract
  const faUnresolvable = myFaRaw == null;
  const myFa = myFaRaw ?? 0; // for the MCT preview: 0 is conservative (treats as above authority)

  const suggestion = suggestMethod({ estimatedValueUSD: Math.max(value, 0) });
  const methodId = override ?? suggestion.method.id;
  const method = METHODS.find((m) => m.id === methodId)!;
  const needJust = override != null && override !== suggestion.method.id;
  const minInv = minParticipants(method.key);

  // split-risk (7.2) against existing requests under a synthetic budget code
  const budgetCode = (cat ?? 'REQ').toUpperCase().slice(0, 3);
  // §7.2: group at the OPERATOR + budget code (matches the server; catches a cross-field split
  // under one budget). Threshold = the MINIMUM contract FA across the fields in this budget's
  // group — mirrors the server exactly (min-FA, not just the selected field's). Fail closed:
  // when the FA is unresolvable, skip detection and warn instead of feeding 0 (silent all-clear).
  const budgetGroup = state.tenders.filter((x) => x.operatorId === myOperatorId && x.budgetCode === budgetCode);
  const groupFaList = [...new Set([fieldId, ...budgetGroup.map((x) => x.fieldId)])]
    .map((fid) => faForFieldId(state, fid))
    .filter((n): n is number => n != null);
  const groupFa = groupFaList.length ? Math.min(...groupFaList) : myFa;
  const splitGroups = faUnresolvable
    ? []
    : detectSplitRisk(
        [
          ...state.tenders.filter((x) => x.operatorId === myOperatorId).map((x) => ({ id: x.code, budgetCode: x.budgetCode, estimatedValueUSD: x.estimatedValueUSD, raisedOn: x.createdOn })),
          { id: 'NEW', budgetCode, estimatedValueUSD: value, raisedOn: todayIso() },
        ],
        groupFa,
      ).filter((g) => g.requestIds.includes('NEW'));

  // generated plan (working days from today) — the live calendar so planned dates skip holidays too
  const cal = calendarOf(state);
  const keys = defaultStageKeys(methodId);
  let cursor = toUtcDate(todayIso());
  const stageDates: Record<string, { plannedFrom: string; plannedTo: string }> = {};
  const planRows: { key: string; dur: number; from: string; to: string }[] = [];
  let total = 0;
  for (const key of keys) {
    const dur = STAGE_WD[key] ?? 5;
    const from = addWorkingDays(cursor, 1, cal);
    const to = addWorkingDays(from, dur - 1, cal);
    stageDates[key] = { plannedFrom: toIso(from), plannedTo: toIso(to) };
    planRows.push({ key, dur, from: toIso(from), to: toIso(to) });
    cursor = to;
    total += dur;
  }
  const award = toIso(cursor);

  const bracket = value <= 10_000 ? 0 : value <= 100_000 ? 1 : 2;

  const steps: WizardStep[] = [
    {
      label: t('wizreq.s0'), title: t('wizreq.s0'), sub: t('wizreq.sub0'),
      help: { t: t('wizreq.help0'), r: 'SCPP 6.2' },
      conditions: [
        { t: t('wizreq.cName'), ok: name.trim().length >= 5 },
        { t: t('wizreq.cField'), ok: !!fieldId && !faUnresolvable },
        { t: t('wizreq.cCat'), ok: !!cat },
      ],
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="wz-field">
            <label className="wz-field__l">{t('wizreq.name')}</label>
            <input className="wz-in" dir="auto" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('wizreq.namePh')} />
          </div>
          {/* the field decides the Financial Authority (§7.1), which drives path + MCT — pick it first */}
          <div className="wz-field">
            <label className="wz-field__l">{t('wizreq.field')}</label>
            <select className="wz-in" value={fieldId} onChange={(e) => setFieldId(e.target.value)}>
              {myFields.length === 0 && <option value="">{t('wizreq.noFields')}</option>}
              {myFields.map((f) => {
                const ffa = faForFieldId(state, f.id);
                return <option key={f.id} value={f.id}>{(lang === 'ar' ? f.name : f.nameEn ?? f.name)}{ffa != null ? ` — ${fmtMoney(ffa)}` : ` — ${t('wizreq.noContract')}`}</option>;
              })}
            </select>
            {faUnresolvable && <span className="wz-field__l" style={{ fontWeight: 400, color: 'var(--status-delayed)' }}>{t('wizreq.faUnresolvable')}</span>}
          </div>
          <div className="wz-field">
            <label className="wz-field__l">{t('wizreq.cat')}</label>
            <div className="wz-grid3">
              {CATS.map((c) => (
                <button key={c} className={`wz-cardbtn${cat === c ? ' wz-cardbtn--on' : ''}`} onClick={() => setCat(c)}>
                  <span className="wz-cardbtn__t">{t(`wizreq.cat_${c}`)}</span>
                  <span className="wz-cardbtn__d">{t(`wizreq.catd_${c}`)}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="wz-field">
            <label className="wz-field__l">{t('wizreq.desc')} <small>— {t('wizreq.descOpt')}</small></label>
            <textarea className="wz-ta" rows={3} dir="auto" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={t('wizreq.descPh')} />
          </div>
        </div>
      ),
    },
    {
      label: t('wizreq.s1'), title: t('wizreq.s1'), sub: t('wizreq.sub1'),
      help: { t: t('wizreq.help1'), r: 'SCPP 6.9' },
      conditions: [
        { t: t('wizreq.cValue'), ok: value > 0 },
        { t: t('wizreq.cBasis'), ok: !!basis },
      ],
      content: (
        <div className="wz-grid2">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="wz-field">
              <label className="wz-field__l">{t('wizreq.value')}</label>
              <input className="wz-in wz-in--mono" inputMode="numeric" value={String(value)} onChange={(e) => setValue(Number(e.target.value.replace(/[^0-9]/g, '')) || 0)} style={{ fontSize: 17, height: 46 }} />
              <span className="wz-field__l" style={{ fontWeight: 400, color: 'var(--ink-3)' }}>{t('wizreq.current')} <b className="op-code" style={{ color: 'var(--ink-1)' }}>{fmtMoney(value)}</b></span>
            </div>
            <div className="wz-field">
              <label className="wz-field__l">{t('wizreq.basis')}</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {BASES.map((b) => (
                  <button key={b} className={`wz-chip${basis === b ? ' wz-chip--on' : ''}`} style={{ borderRadius: 9, height: 36, justifyContent: 'flex-start' }} onClick={() => setBasis(b)}>{t(`wizreq.basis_${b}`)}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="wz-side-box">
            <div className="wz-side-box__l">{t('wizreq.thresholds')}</div>
            {[
              { r: '≤ $10,000', p: t('wizreq.th0') },
              { r: '$10,000 – $100,000', p: t('wizreq.th1') },
              { r: '> $100,000', p: t('wizreq.th2') },
            ].map((th, i) => (
              <div key={i} className="wz-kv" style={{ padding: '9px 12px', borderRadius: 8, border: i === bracket ? '2px solid var(--status-progress)' : '1px solid var(--border-1)', background: i === bracket ? 'var(--status-progress-bg)' : 'var(--bg-card)' }}>
                <b style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink-1)' }}>{th.r}</b>
                <span style={{ fontSize: 11.5 }}>{th.p}</span>
              </div>
            ))}
            {splitGroups.length > 0 && (
              <div className="wz-note wz-note--danger">
                <Icon name="clock" size={14} />
                <span>{t('wizreq.split')} <b className="op-code" style={{ fontSize: 10 }}>(SCPP 7.2)</b></span>
              </div>
            )}
          </div>
        </div>
      ),
    },
    {
      label: t('wizreq.s2'), title: t('wizreq.s2'), sub: t('wizreq.sub2'),
      help: { t: t('wizreq.help2'), r: 'SCPP 11' },
      conditions: needJust
        ? [{ t: t('wizreq.cPath'), ok: true }, { t: t('wizreq.cJust'), ok: just.trim().length >= 20 }]
        : [{ t: t('wizreq.cPathMatch'), ok: true }],
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ border: '2px solid var(--status-progress)', background: 'var(--status-progress-bg)', borderRadius: 12, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <span className="op-pathchip__no" style={{ width: 34, height: 34, fontSize: 13 }}>{String(suggestion.method.id).padStart(2, '0')}</span>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 700 }}>{suggestion.method[lang]}</span>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--status-progress)', background: 'var(--bg-card)', padding: '2px 9px', borderRadius: 999 }}>{t('wizreq.sysSuggest')}</span>
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 4, lineHeight: 1.7 }}>{lang === 'ar' ? suggestion.reasonAr : suggestion.reasonEn}</div>
            </div>
            <button className={override == null ? 'op-btn-nav' : 'op-btn-ghost'} onClick={() => setOverride(null)}>{override == null ? `✓ ${t('wizreq.accepted')}` : t('wizreq.accept')}</button>
          </div>
          <div className="wz-side-box__l">{t('wizreq.orOther')}</div>
          <div className="wz-grid3" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            {METHODS.filter((m) => m.id !== suggestion.method.id).map((m) => (
              <button key={m.id} className={`wz-cardbtn${override === m.id ? ' wz-cardbtn--on' : ''}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: '10px 12px' }} onClick={() => setOverride(m.id)}>
                <span className="op-pathchip__no">{String(m.id).padStart(2, '0')}</span>
                <span className="wz-cardbtn__t" style={{ fontSize: 12 }}>{m[lang]}</span>
              </button>
            ))}
          </div>
          {needJust && (
            <div className="wz-note wz-note--warn" style={{ flexDirection: 'column', gap: 6 }}>
              <label className="wz-field__l" style={{ color: 'var(--status-risk)' }}>{t('wizreq.justLabel')}</label>
              <textarea className="wz-ta" rows={2} dir="auto" value={just} onChange={(e) => setJust(e.target.value)} placeholder={t('wizreq.justPh')} style={{ background: 'var(--bg-card)', borderColor: 'var(--brand-amber-100)' }} />
            </div>
          )}
          {minInv > 0 && <span className="wz-side-box__l" style={{ color: 'var(--ink-3)' }}>{t('wizreq.minInv')}: <b className="op-code">{minInv}</b></span>}
        </div>
      ),
    },
    {
      label: t('wizreq.s3'), title: t('wizreq.s3'), sub: t('wizreq.sub3'),
      help: { t: t('wizreq.help3'), r: 'SCPP 8 · 11' },
      conditions: [{ t: t('wizreq.cReviewed'), ok: reviewed }],
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="wz-card" style={{ boxShadow: 'none' }}>
            <table className="op-tbl" style={{ fontSize: 12.5 }}>
              <thead><tr><th>{t('wizreq.stage')}</th><th>{t('wizreq.durWd')}</th><th>{t('wizreq.range')}</th></tr></thead>
              <tbody>
                {planRows.map((r) => (
                  <tr key={r.key}>
                    <td style={{ fontWeight: 500 }}>{stageByKey(r.key)?.[lang] ?? r.key}</td>
                    <td className="op-code">{r.dur}</td>
                    <td className="op-code" style={{ color: 'var(--ink-2)' }}>{r.from.slice(5)} → {r.to.slice(5)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: 'var(--ink-2)', flexWrap: 'wrap' }}>
            <span>{t('wizreq.total')}: <b className="op-code">{fmtCount(total, lang)}</b> {t('wizreq.wd')}</span>
            <span className="op-task__mdot" />
            <span>{t('wizreq.awardExp')}: <b className="op-code">{award}</b></span>
            <span className="op-task__mdot" />
            <span style={{ color: 'var(--ink-3)' }}>{t('wizreq.weekendNote')}</span>
          </div>
          <button className={`wz-check${reviewed ? ' wz-check--on' : ''}`} onClick={() => setReviewed(!reviewed)}>
            <span className="wz-check__m">✓</span>{t('wizreq.reviewedLabel')}
          </button>
        </div>
      ),
    },
    {
      label: t('wizreq.s4'), title: t('wizreq.s4'), sub: t('wizreq.sub4'),
      help: { t: t('wizreq.help4'), r: 'SCPP 6.9 · 12.2' },
      conditions: [{ t: t('wizreq.cAll'), ok: true }],
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { k: t('wizreq.name'), v: name || '—' },
            { k: t('wizreq.cat'), v: cat ? t(`wizreq.cat_${cat}`) : '—' },
            { k: t('wizreq.value'), v: `${fmtMoney(value)} (${basis ? t(`wizreq.basis_${basis}`) : '—'})` },
            { k: t('wizreq.s2'), v: `${String(methodId).padStart(2, '0')} — ${method[lang]}${needJust ? ` (${t('wizreq.withJust')})` : ` (${t('wizreq.sysSuggest')})`}` },
            { k: t('wizreq.total'), v: `${fmtCount(total, lang)} ${t('wizreq.wd')} — ${t('wizreq.awardExp')} ${award}` },
          ].map((r, i) => (
            <div key={i} className="wz-reviewrow"><span>{r.k}</span><span>{r.v}</span></div>
          ))}
          <div className="wz-note wz-note--info">
            <Icon name="clock" size={15} />
            <span>{t('wizreq.finalNote')}</span>
          </div>
        </div>
      ),
    },
  ];

  return (
    <WizardShell
      title={t('wizreq.title')}
      tenderName={name || t('wizreq.newTender')}
      code="REQ-DRAFT"
      steps={steps}
      finalLabel={t('wizreq.final')}
      doneHash="#/operator"
      exitHash="#/operator"
      success={{ title: t('wizreq.doneTitle'), desc: t('wizreq.doneDesc'), audit: `REQ · SUBMITTED · ${fmtMoney(value)}` }}
      onFinish={() => {
        dispatch({
          type: 'CREATE_TENDER',
          operatorId: myOperatorId,
          fieldId: fieldId || undefined,
          title: { ar: name, en: name },
          budgetCode,
          estimatedValueUSD: value,
          methodId,
          overrideJustification: needJust ? just.trim() : undefined,
          stageDates,
        });
      }}
    />
  );
}
