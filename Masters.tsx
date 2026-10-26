import React, { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { q, save, del, update, exportAll, importAll, getSetting, setSetting } from '../db';
import { decryptText, encryptText, inr, saveFile, sha, today } from '../util';
import { Badge, Card, FormModal, Table, Tabs, useLoad, ask, FieldDef } from '../ui';

export default function Masters() {
  const [tab, setTab] = useState('emp');
  return (<><Tabs tabs={[['emp', 'Employees'], ['cat', 'Expense Master'], ['buy', 'Buyers'], ['bs', 'Opening Balances'], ['bk', 'Backup & Security']]} cur={tab} set={setTab} />
    {tab === 'emp' ? <Employees /> : tab === 'cat' ? <SimpleMaster table="exp_cats" title="Farm expense categories" /> : tab === 'buy' ? <SimpleMaster table="buyers" title="Revenue buyers" /> : tab === 'bs' ? <Opening /> : <Backup />}</>);
}

export function SimpleMaster({ table, title }: { table: 'exp_cats' | 'buyers' | 'home_cats'; title: string }) {
  const [edit, setEdit] = useState<any>(null);
  const [rows, reload] = useLoad(() => q(`SELECT * FROM ${table} ORDER BY active DESC,name`));
  return (<Card title={title} right={<button className="btn sm" onClick={() => setEdit({ active: 1 })}>+ Add</button>}>
    <Table rows={rows || []} cols={[{ h: 'Name', r: x => x.name }, { h: 'Status', r: x => <Badge t={x.active ? 'Active' : 'Inactive'} tone={x.active ? 'ok' : undefined} /> },
      { h: '', r: x => <><button className="btn sm alt" onClick={() => setEdit(x)}>Edit</button> <button className="btn sm alt" onClick={async () => { await update(table, x.id, { active: x.active ? 0 : 1 }); reload(); }}>{x.active ? 'Hide' : 'Show'}</button>
        <button className="btn sm red" onClick={async () => { if (ask('Delete? Past transactions keep the saved name.')) { await del(table, x.id); reload(); } }}>Del</button></> }]} />
    {edit && <FormModal title={edit.id ? 'Edit' : 'Add'} init={edit} onClose={() => setEdit(null)} fields={[{ k: 'name', label: 'Name', req: true }]} onSave={async v => { await save(table, { id: v.id, name: v.name, active: v.active ?? 1 }); reload(); }} />}
  </Card>);
}

function Employees() {
  const [edit, setEdit] = useState<any>(null); const [end, setEnd] = useState<any>(null);
  const [rows, reload] = useLoad(() => q(`SELECT * FROM employees ORDER BY active DESC,name`));
  const fields: FieldDef[] = [
    { k: 'name', label: 'Full name', req: true }, { k: 'phone', label: 'Phone', type: 'tel' }, { k: 'role', label: 'Role / work' },
    { k: 'pay_type', label: 'Pay type', type: 'select', req: true, opts: [{ v: 'daily', l: 'Daily wage' }, { v: 'monthly', l: 'Monthly salary' }] },
    { k: 'daily_wage', label: 'Daily wage (₹)', type: 'number', show: v => v.pay_type === 'daily', req: true },
    { k: 'monthly_salary', label: 'Monthly salary (₹)', type: 'number', show: v => v.pay_type === 'monthly', req: true },
    { k: 'join_date', label: 'Joining date', type: 'date' }, { k: 'end_date', label: 'Last working day (leave blank if working)', type: 'date' }, { k: 'notes', label: 'Notes', type: 'textarea' }];
  const remove = async (e: any) => {
    const n = (await q(`SELECT (SELECT COUNT(*) FROM attendance WHERE emp_id=?)+(SELECT COUNT(*) FROM advances WHERE emp_id=?)+(SELECT COUNT(*) FROM settlements WHERE emp_id=?) n`, [e.id, e.id, e.id]))[0].n;
    if (n) return alert('This employee has payroll history, so it cannot be deleted. Use "Delimit" to end employment and keep records intact.');
    if (ask(`Delete ${e.name}?`)) { await del('employees', e.id); reload(); }
  };
  return (<Card title="Employee master" right={<button className="btn sm" onClick={() => setEdit({ pay_type: 'daily', join_date: today() })}>+ Add</button>}>
    <p className="mut">Wage changes apply to future attendance only; past entries keep the wage locked at the time.</p>
    <Table rows={rows || []} cols={[
      { h: 'Name', r: x => <b>{x.name}</b> }, { h: 'Pay type', r: x => x.pay_type === 'daily' ? 'Daily wage' : 'Monthly salary' },
      { h: 'Rate', cls: 'r', r: x => inr(x.pay_type === 'daily' ? x.daily_wage : x.monthly_salary) },
      { h: 'Status', r: x => x.active ? <Badge t="Active" tone="ok" /> : <Badge t={`Ended ${x.end_date || ''}`} /> },
      { h: '', r: x => <><button className="btn sm alt" onClick={() => setEdit(x)}>Edit</button> {x.active ? <button className="btn sm gold" onClick={() => setEnd({ ...x, end_date: today() })}>Delimit</button>
        : <button className="btn sm alt" onClick={async () => { await update('employees', x.id, { active: 1, end_date: null }); reload(); }}>Reactivate</button>} <button className="btn sm red" onClick={() => remove(x)}>Delete</button></> }]} />
    {edit && <FormModal title={edit.id ? 'Edit employee' : 'Add employee'} fields={fields} init={edit} onClose={() => setEdit(null)}
      onSave={async v => { const active = v.end_date && v.end_date <= today() ? 0 : 1;
        await save('employees', { id: v.id, name: v.name, phone: v.phone, role: v.role, pay_type: v.pay_type, daily_wage: v.pay_type === 'daily' ? v.daily_wage : 0, monthly_salary: v.pay_type === 'monthly' ? v.monthly_salary : 0, join_date: v.join_date, end_date: v.end_date || null, active, notes: v.notes }); reload(); }} />}
    {end && <FormModal title={`Delimit ${end.name}`} init={end} saveLabel="End employment" onClose={() => setEnd(null)} fields={[{ k: 'end_date', label: 'Last working day', type: 'date', req: true }]}
      onSave={async v => { await update('employees', end.id, { end_date: v.end_date, active: v.end_date <= today() ? 0 : 1 }); reload(); }} />}
  </Card>);
}

function Opening() {
  const [edit, setEdit] = useState<any>(null);
  const [rows, reload] = useLoad(() => q(`SELECT * FROM bs_entries ORDER BY kind,name`));
  const K = { asset: 'Asset (land, machinery…)', liability: 'Liability (loan…)', equity: 'Owner capital' } as any;
  return (<Card title="Opening balances for Balance Sheet" right={<button className="btn sm" onClick={() => setEdit({ kind: 'asset' })}>+ Add</button>}>
    <Table rows={rows || []} cols={[{ h: 'Item', r: x => x.name }, { h: 'Type', r: x => K[x.kind] }, { h: 'Amount', cls: 'r', r: x => inr(x.amount) },
      { h: '', r: x => <><button className="btn sm alt" onClick={() => setEdit(x)}>Edit</button> <button className="btn sm red" onClick={async () => { if (ask('Delete?')) { await del('bs_entries', x.id); reload(); } }}>Del</button></> }]} />
    {edit && <FormModal title="Opening balance" init={edit} onClose={() => setEdit(null)} fields={[{ k: 'name', label: 'Item', req: true },
      { k: 'kind', label: 'Type', type: 'select', req: true, opts: Object.keys(K).map(v => ({ v, l: K[v] })) }, { k: 'amount', label: 'Amount (₹)', type: 'number', req: true }]}
      onSave={async v => { await save('bs_entries', { id: v.id, name: v.name, kind: v.kind, amount: v.amount }); reload(); }} />}
  </Card>);
}

function Backup() {
  const [msg, setMsg] = useState(''); const [pw, setPw] = useState(''); const [pin, setPin] = useState('');
  const doExport = async () => {
    try { let text = JSON.stringify(await exportAll()); if (pw) text = await encryptText(text, pw);
      await saveFile(`NSN_Farms_backup_${today()}${pw ? '_enc' : ''}.json`, new Blob([text], { type: 'application/json' })); setMsg('Backup created ✔'); } catch (e: any) { setMsg('Failed: ' + e.message); }
  };
  const doImport = async (f?: File) => {
    if (!f) return; try {
      let obj = JSON.parse(await f.text()); if (obj.nsnEncrypted) { if (!pw) return setMsg('Enter the backup password above first'); obj = JSON.parse(await decryptText(obj, pw)); }
      if (!ask('Restoring REPLACES all current data. Continue?')) return; await importAll(obj); setMsg('Restore complete ✔'); } catch (e: any) { setMsg('Restore failed: ' + (e.message || 'wrong password or file')); }
  };
  const setPinNow = async () => { if (!/^\d{4,8}$/.test(pin)) return setMsg('PIN must be 4–8 digits'); await setSetting('pin_hash', await sha(pin)); setPin(''); setMsg('PIN updated ✔'); };
  return (<>
    <Card title="Encrypted local database">
      <p>All data lives in an on-device SQLite database encrypted with SQLCipher (AES-256). The key is generated on first launch and held in the platform secure store. Nothing is sent to any server.</p>
      <p className="mut">Platform: {Capacitor.getPlatform()}</p></Card>
    <Card title="Backup & restore (JSON)">
      <label className="fld"><span>Backup password (optional but recommended — required again to restore)</span><input type="password" value={pw} onChange={e => setPw(e.target.value)} /></label>
      <div className="row"><button className="btn" onClick={doExport}>Export backup</button>
        <label className="btn alt">Import backup<input type="file" accept=".json,application/json" hidden onChange={e => { doImport(e.target.files?.[0]); e.target.value = ''; }} /></label></div></Card>
    <Card title="App lock"><div className="row"><input type="password" inputMode="numeric" placeholder="New PIN (4–8 digits)" value={pin} onChange={e => setPin(e.target.value)} /><button className="btn" onClick={setPinNow}>Set / change PIN</button></div>
      <p className="mut">Android/iOS also unlock with biometrics or device passcode. Windows uses the PIN.</p></Card>
    {msg && <div className={msg.includes('✔') ? 'pos' : 'err'}>{msg}</div>}
  </>);
}
