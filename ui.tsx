import React, { useEffect, useState, ReactNode } from 'react';
import { num } from './util';

export function useLoad<T>(fn: () => Promise<T>, deps: any[] = []): [T | undefined, () => void] {
  const [d, setD] = useState<T>(); const [n, setN] = useState(0);
  useEffect(() => { let ok = true; fn().then(r => ok && setD(r)).catch(e => console.error(e)); return () => { ok = false; }; }, [...deps, n]);
  return [d, () => setN(x => x + 1)];
}

export const Modal = ({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) => (
  <div className="ov" onClick={onClose}><div className="md" onClick={e => e.stopPropagation()}>
    <div className="mh"><b>{title}</b><button className="x" onClick={onClose}>✕</button></div>{children}</div></div>
);

export type FieldDef = { k: string; label: string; type?: 'text' | 'number' | 'date' | 'select' | 'textarea' | 'tel'; opts?: { v: any; l: string }[]; req?: boolean; show?: (v: any) => boolean; ro?: boolean };

export function FormModal({ title, fields, init, onSave, onClose, onChange, saveLabel }: {
  title: string; fields: FieldDef[]; init: any; onSave: (v: any) => Promise<any>; onClose: () => void; onChange?: (v: any, k: string) => any; saveLabel?: string }) {
  const [v, setV] = useState<any>(init); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k: string, val: any) => { let nv = { ...v, [k]: val }; if (onChange) nv = onChange(nv, k); setV(nv); };
  const submit = async () => {
    for (const f of fields) if ((!f.show || f.show(v)) && f.req && (v[f.k] === '' || v[f.k] == null)) return setErr(`${f.label} is required`);
    const out = { ...v }; for (const f of fields) if (f.type === 'number') out[f.k] = num(out[f.k]);
    setBusy(true);
    try { await onSave(out); onClose(); } catch (e: any) { setErr(e?.message || String(e)); setBusy(false); }
  };
  return (
    <Modal title={title} onClose={onClose}>
      {fields.filter(f => !f.show || f.show(v)).map(f => (
        <label className="fld" key={f.k}><span>{f.label}{f.req ? ' *' : ''}</span>
          {f.type === 'select' ? (
            <select value={String(v[f.k] ?? '')} disabled={f.ro} onChange={e => set(f.k, f.opts!.find(o => String(o.v) === e.target.value)?.v ?? '')}>
              <option value="">— select —</option>{f.opts!.map(o => <option key={String(o.v)} value={String(o.v)}>{o.l}</option>)}</select>
          ) : f.type === 'textarea' ? <textarea rows={2} value={v[f.k] ?? ''} onChange={e => set(f.k, e.target.value)} />
          : <input type={f.type || 'text'} step={f.type === 'number' ? 'any' : undefined} inputMode={f.type === 'number' ? 'decimal' : undefined}
              readOnly={f.ro} value={v[f.k] ?? ''} onChange={e => set(f.k, e.target.value)} />}
        </label>))}
      {err && <div className="err">{err}</div>}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn alt" onClick={onClose}>Cancel</button>
        <button className="btn" disabled={busy} onClick={submit}>{saveLabel || 'Save'}</button></div>
    </Modal>
  );
}

export function Table({ cols, rows, empty }: { cols: { h: string; r: (x: any, i: number) => ReactNode; cls?: string }[]; rows: any[]; empty?: string }) {
  return (<div className="tw"><table><thead><tr>{cols.map((c, i) => <th key={i} className={c.cls}>{c.h}</th>)}</tr></thead>
    <tbody>{rows.length ? rows.map((r, i) => <tr key={r.id ?? i}>{cols.map((c, j) => <td key={j} className={c.cls}>{c.r(r, i)}</td>)}</tr>)
      : <tr><td colSpan={cols.length} className="mut">{empty || 'No records'}</td></tr>}</tbody></table></div>);
}
export const Card = ({ title, right, children }: { title?: string; right?: ReactNode; children: ReactNode }) =>
  <div className="card">{title && <h3><span>{title}</span><span>{right}</span></h3>}{children}</div>;
export const Tabs = ({ tabs, cur, set }: { tabs: [string, string][]; cur: string; set: (k: string) => void }) =>
  <div className="tabs">{tabs.map(([k, l]) => <button key={k} className={'tab' + (cur === k ? ' on' : '')} onClick={() => set(k)}>{l}</button>)}</div>;
export const Kpi = ({ label, value, tone }: { label: string; value: string; tone?: 'gold' | 'red' }) =>
  <div className={'kpi ' + (tone || '')}><small>{label}</small><b>{value}</b></div>;
export const Badge = ({ t, tone }: { t: string; tone?: 'ok' | 'warn' | 'bad' }) => <span className={'badge ' + (tone || '')}>{t}</span>;
export const ask = (m: string) => window.confirm(m);
