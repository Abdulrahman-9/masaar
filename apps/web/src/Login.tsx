import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { saveSession, type Role } from './session';

/**
 * Login — the screen missing from the original prototypes, designed on the
 * base skin. Azure AD + real 2FA arrive with the backend; this mock keeps the
 * exact two-step flow and produces the role-scoped session.
 */
export default function Login({ onLogin }: { onLogin: () => void }) {
  const { t } = useTranslation();
  const [step, setStep] = useState<'sso' | 'otp'>('sso');
  const [role, setRole] = useState<Role>('operator-admin');
  const [code, setCode] = useState('');

  const finish = () => {
    if (!/^\d{6}$/.test(code)) return;
    saveSession({
      name: role === 'operator-admin' ? 'م. أحمد عبد الرحمن' : 'د. سارة الجبوري',
      role,
      company: role === 'operator-admin' ? 'Basra Energy Company' : undefined,
    });
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
                onKeyDown={(e) => e.key === 'Enter' && finish()}
                autoFocus
              />
            </div>
            <button className="btn btn--primary login-sso" disabled={!/^\d{6}$/.test(code)} onClick={finish}>
              {t('login.verify')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
