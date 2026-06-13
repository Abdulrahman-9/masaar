import { useTranslation } from 'react-i18next';
import Audit from './Audit';
import Compliance from './Compliance';
import Contracts from './Contracts';
import Mct from './Mct';
import Overview from './Overview';
import PathsGuide from './PathsGuide';
import Reports from './Reports';
import Roles from './Roles';
import Vendors from './Vendors';

export const ADMIN_SUBS = ['overview', 'mct', 'contracts', 'compliance', 'vendors', 'reports', 'paths', 'roles', 'audit'] as const;
export type AdminSub = (typeof ADMIN_SUBS)[number];

const SCREENS: Record<AdminSub, () => JSX.Element> = {
  overview: Overview,
  mct: Mct,
  contracts: Contracts,
  compliance: Compliance,
  vendors: Vendors,
  reports: Reports,
  paths: PathsGuide,
  roles: Roles,
  audit: Audit,
};

export default function AdminShell({ sub }: { sub: AdminSub }) {
  const { t: tr } = useTranslation();
  const Screen = SCREENS[sub];

  return (
    <>
      <div className="page-head">
        <h1>{tr('admin.title')}</h1>
        <nav className="subnav">
          {ADMIN_SUBS.map((k) => (
            <a key={k} className={`subnav__link${sub === k ? ' subnav__link--on' : ''}`} href={k === 'overview' ? '#/admin' : `#/admin/${k}`}>
              {tr(`admin.sub.${k}`)}
            </a>
          ))}
        </nav>
      </div>
      <Screen />
    </>
  );
}
