import { StatusPill } from '@masaar/ui';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store';

/** Append-only audit log (8.1-e) — newest first; no edit or delete exists. */
export default function Audit() {
  const { t: tr } = useTranslation();
  const { state } = useStore();
  const entries = [...state.audit].reverse();

  return (
    <section className="card">
      <h2>{tr('audit.title')}</h2>
      <p className="hint">{tr('audit.hint')}</p>
      {entries.length === 0 ? (
        <StatusPill status="planned">{tr('audit.empty')}</StatusPill>
      ) : (
        <table className="dtable">
          <thead>
            <tr>
              <th>{tr('audit.ts')}</th>
              <th>{tr('audit.action')}</th>
              <th>{tr('audit.target')}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={`${e.ts}-${i}`}>
                <td className="mono" style={{ fontSize: 11.5 }}>{e.ts.replace('T', ' ').slice(0, 19)}</td>
                <td className="mono" style={{ fontSize: 11.5 }}>{e.action}</td>
                <td className="mono">{e.target}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
