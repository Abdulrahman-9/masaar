import { awardVerdict, variationOrdersCap } from '@masaar/scpp-rules';
import { CapMeter, KpiTile, PathBadge, SKINS, StatusPill, Stepper, VerdictStrip, WdRail, type SkinKey } from '@masaar/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

const CONTRACT = 10_000_000;
const ESTIMATE = 4_200_000;

export default function Gallery() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';

  const [skin, setSkin] = useState<SkinKey>('ledger');
  const [voPct, setVoPct] = useState(4.2);
  const [elapsed, setElapsed] = useState(8);
  const [bid, setBid] = useState(4_620_000);
  const [step, setStep] = useState(1);

  const cap = variationOrdersCap((voPct / 100) * CONTRACT, CONTRACT);
  const verdict = awardVerdict(bid, ESTIMATE);
  const steps = [t('gallery.step1'), t('gallery.step2'), t('gallery.step3'), t('gallery.step4')];

  return (
    <>
      <section className="card">
        <h2>{t('gallery.title')}</h2>
        <p className="hint">{t('gallery.hint')}</p>
        <div className="skin-tabs">
          {(['ledger', 'control', 'blueprint'] as const).map((k) => (
            <button
              key={k}
              className={`skin-tab${skin === k ? ' skin-tab--on' : ''}`}
              onClick={() => setSkin(k)}
            >
              {t(`gallery.skin${k.charAt(0).toUpperCase()}${k.slice(1)}`)}
            </button>
          ))}
        </div>
      </section>

      <div className={`${SKINS[skin]} skin-stage`}>
        <div className="g-group">
          <div className="g-label">{t('gallery.pills')}</div>
          <div className="g-row">
            <StatusPill status="planned">{t('gallery.pillPlanned')}</StatusPill>
            <StatusPill status="progress">{t('gallery.pillProgress')}</StatusPill>
            <StatusPill status="done">{t('gallery.pillDone')}</StatusPill>
            <StatusPill status="risk">{t('gallery.pillRisk')}</StatusPill>
            <StatusPill status="delayed">{t('gallery.pillDelayed')}</StatusPill>
            <StatusPill status="blocked">{t('gallery.pillBlocked')}</StatusPill>
          </div>
        </div>

        <div className="g-group">
          <div className="g-label">{t('gallery.paths')}</div>
          <div className="g-row">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((id) => (
              <PathBadge key={id} id={id} lang={lang} />
            ))}
          </div>
        </div>

        <div className="g-group">
          <div className="g-label">{t('gallery.kpis')}</div>
          <div className="g-grid4">
            <KpiTile label={t('kpi.openTenders')} value={18} />
            <KpiTile label={t('kpi.awaitingRatification')} value={4} />
            <KpiTile label={t('kpi.scheduleCompliance')} value={87} suffix="%" />
            <KpiTile label={t('kpi.avgAwardDays')} value={64} />
          </div>
        </div>

        <div className="g-grid2">
          <div className="g-group">
            <div className="g-label">{t('gallery.cap')}</div>
            <CapMeter result={cap} lang={lang} label={t('gallery.cap')} />
            <input
              type="range"
              min={0}
              max={13}
              step={0.1}
              value={voPct}
              onChange={(e) => setVoPct(Number(e.target.value))}
              aria-label={t('gallery.capHint')}
            />
            <div className="g-hint">{t('gallery.capHint')}</div>
          </div>

          <div className="g-group">
            <div className="g-label">{t('gallery.rail')}</div>
            <WdRail
              elapsed={elapsed}
              title={
                <>
                  {t('gallery.railTitle')}{' '}
                  <span className="mono" style={{ fontSize: 11 }}>
                    RU-PRJ-0341
                  </span>
                </>
              }
            />
            <input
              type="range"
              min={0}
              max={24}
              step={1}
              value={elapsed}
              onChange={(e) => setElapsed(Number(e.target.value))}
              aria-label={t('gallery.railHint')}
            />
            <div className="g-hint">{t('gallery.railHint')}</div>
          </div>
        </div>

        <div className="g-group">
          <div className="g-label">{t('gallery.verdictTitle')}</div>
          <div className="g-row" style={{ marginBottom: 12 }}>
            <div className="field">
              <label htmlFor="g-bid">{t('verdict.bid')}</label>
              <input
                id="g-bid"
                type="number"
                step={10_000}
                min={0}
                value={bid}
                onChange={(e) => setBid(Number(e.target.value) || 0)}
              />
            </div>
          </div>
          <VerdictStrip verdict={verdict} lang={lang} />
        </div>

        <div className="g-group">
          <div className="g-label">{t('gallery.stepper')}</div>
          <Stepper steps={steps} current={step} onSelect={setStep} />
        </div>
      </div>
    </>
  );
}
