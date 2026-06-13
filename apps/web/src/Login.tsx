import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiLogin } from './api/endpoints';
import { isApiMode } from './config';
import { saveSession, type Role } from './session';

/**
 * Login — two-step flow (SSO → 2FA). In api mode it authenticates against the
 * backend (httpOnly-cookie session); in local mode it produces a mock session.
 * Either way the role-scoped session shape is identical.
 */
export default function Login({ onLogin }: { onLogin: () => void }) {
  const { t } = useTranslation();
  const [step, setStep] = useState<'sso' | 'otp'>('sso');
  const [role, setRole] = useState<Role>('operator-admin');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const persist = (name: string) =>
    saveSession({ name, role, company: role === 'operator-admin' ? 'Basra Energy Company' : undefined });

  const finish = async () => {
    if (!/^\d{6}$/.test(code) || busy) return;
    setError('');
    if (isApiMode) {
      setBusy(true);
      try {
        const apiRole = role === 'roc-admin' ? 'ROC_ADMIN' : 'OPERATOR_ADMIN';
        const res = await apiLogin(apiRole, code);
        persist(res.user.name);
        onLogin();
      } catch {
        setError(t('login.failed'));
      } finally {
        setBusy(false);
      }
      return;
    }
    persist(role === 'operator-admin' ? 'م. أحمد عبد الرحمن' : 'د. سارة الجبوري');
    onLogin();
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <img src="/logo.svg" alt="Masaar" style={{ height: 36 }} />
        <h1>{t('login.title')}</h1>
        <p className="hint">{t('login.hint')}</p>

        {step === 'sso' ? (
          <>
            <div className="field" style={{ marginBottom: 16 }}>
              <label>{t('login.role')}</label>
              <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
                <option value="operator-admin">{t('login.roleOperator')}</option>
                <option value="roc-admin">{t('login.roleRoc')}</option>
              </select>
            </div>
            <button className="btn btn--primary login-sso" onClick={() => setStep('otp')}>
              {t('login.sso')}
            </button>
            <p className="g-hint" style={{ marginTop: 12 }}>{t('login.ssoNote')}</p>
          </>
        ) : (
          <>
            <div className="field" style={{ marginBottom: 16 }}>
              <label htmlFor="otp">{t('login.otp')}</label>
              <input
                id="otp"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && void finish()}
                autoFocus
              />
            </div>
            {error && <p className="g-hint late-num" style={{ marginBottom: 10 }}>{error}</p>}
            <button className="btn btn--primary login-sso" disabled={!/^\d{6}$/.test(code) || busy} onClick={() => void finish()}>
              {busy ? '…' : t('login.verify')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
