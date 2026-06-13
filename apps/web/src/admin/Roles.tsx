import { useTranslation } from 'react-i18next';

/**
 * The 6-role permission matrix (README §Roles) — static configuration by design;
 * user CRUD arrives with the API. Enforced per-endpoint server-side.
 */
const PERMS = ['createRequests', 'enterEvaluation', 'ratifyAwards', 'manageRoles', 'signContracts', 'readAudit'] as const;

const MATRIX: Record<string, readonly (typeof PERMS)[number][]> = {
  superAdmin: ['createRequests', 'enterEvaluation', 'ratifyAwards', 'manageRoles', 'signContracts', 'readAudit'],
  rocAdmin: ['ratifyAwards', 'readAudit'],
  evaluation: ['enterEvaluation'],
  auditor: ['readAudit'],
  operatorAdmin: ['createRequests'],
  operatorUser: ['createRequests'],
};

export default function Roles() {
  const { t: tr } = useTranslation();
  const roles = Object.keys(MATRIX);

  return (
    <section className="card">
      <h2>{tr('roles.title')}</h2>
      <p className="hint">{tr('roles.hint')}</p>
      <div style={{ overflowX: 'auto' }}>
        <table className="dtable roles-table">
          <thead>
            <tr>
              <th>{tr('roles.role')}</th>
              {PERMS.map((p) => (
                <th key={p}>{tr(`roles.perm.${p}`)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {roles.map((r) => (
              <tr key={r}>
                <td style={{ fontWeight: 600 }}>{tr(`roles.names.${r}`)}</td>
                {PERMS.map((p) => {
                  const ok = MATRIX[r]!.includes(p);
                  return (
                    <td key={p} className="roles-cell">
                      <span className={ok ? 'roles-yes' : 'roles-no'}>{ok ? '✓' : '—'}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="g-hint" style={{ marginTop: 14 }}>{tr('roles.scopeNote')}</p>
    </section>
  );
}
