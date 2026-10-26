import React, { useEffect, useState } from 'react';
import { q, S, batch, insert, del } from '../db';
import { advanceBalance, cancelSettlement, createSettlement, paySettlements, unpaySettlement } from '../engine';
import { inr, num, today, monthKey, r2 } from '../util';
import { Badge, Card, FormModal, Modal, Table, Tabs, useLoad, ask } from '../ui';

const MULTS = [[0, 'Absent'], [0.5, 'Half day'], [1, 'Present'], [1.5, 'Overtime ×1.5'], [2, 'Double ×2']] as [number, string][];
const MODES = ['Cash', 'UPI', 'Bank transfer', 'Cheque'].map(v => ({ v, l: v }));

export default function Payroll() {
  const [tab, setTab] = useState('att');
  return (<><Tabs tabs={[['att', 'Attendance'], ['adv', 'Advances'], ['set', 'Settle Wages'], ['pay', 'Record Payments']]} cur={tab} set={setTab} />
    {tab === 'att' ? <Attendance /> : tab === 'adv' ? <Advances /> : tab === 'set' ? <Settle /> : <Payments />}</>);
}

function Attendance() {
  const [date, setDate] = useState(today()); const [crop, setCrop] = useState(''); const [marks, setMarks] = useState<Record<number, number>>({}); const [msg, setMsg] = useState('');
  const [d, reload] = useLoad(async () => {
    const emps = await q(`SELECT * FROM employees WHERE pay_type='daily' AND active=1 AND IFNULL(join_date,'')<=? AND (IFNULL(end_date,'')='' OR end_date>=?) ORDER BY name`, [date, date]);
    const att = await q(`SELECT * FROM attendance WHERE date=?`, [date]);
    const crops = await q(`SELECT * FROM crops ORDER BY protected DESC,name`);
    return { emps, att, crops };
  }, [date]);
  useEffect(() => { if (!d) return; const m: Record<number, number> = {}; d.att.forEach((a: any) => (m[a.emp_id] = a.mult)); setMarks(m); if (!crop && d.crops.length) setCrop(String(d.att[0]?.crop_id ?? d.crops[0].id)); }, [d]);
  const locked = (id: number) => d?.att.find((a: any) => a.emp_id === id && a.settlement_id);
  const save = async () => {
    if (!crop) return setMsg('Choose the crop / cost centre');
    const c = d!.crops.find((x: any) => String(x.id) === crop); const st: any[] = [];
    for (const e of d!.emps) {
      if (locked(e.id)) continue; const m = num(marks[e.id]);
      st.push(S(`DELETE FROM attendance WHERE emp_id=? AND date=? AND settlement_id IS NULL`, [e.id, date]));
      if (m > 0) st.push(S(`INSERT OR IGNORE INTO attendance(emp_id,emp_name,crop_id,crop_name,date,mult,wage) VALUES(?,?,?,?,?,?,?)`, [e.id, e.name, c.id, c.name, date, m, r2(num(e.daily_wage) * m)]));
    }
    await batch(st); setMsg('Attendance saved ✔'); reload();
  };
  const total = (d?.emps || []).reduce((a: number, e: any) => a + num(e.daily_wage) * num(marks[e.id]), 0);
  return (<>
    <div className="row"><input type="date" value={date} onChange={e => setDate(e.target.value)} />
      <select value={crop} onChange={e => setCrop(e.target.value)}>{(d?.crops || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <button className="btn alt" onClick={() => { const m: any = {}; d!.emps.forEach((e: any) => (m[e.id] = 1)); setMarks(m); }}>Mark all present</button>
      <button className="btn" onClick={save}>Save attendance</button></div>
    {msg && <div className="pos">{msg}</div>}
    <Card title={`Day wage total ${inr(total)}`}><Table rows={d?.emps || []} empty="No active daily-wage employees. Add them in Masters." cols={[
      { h: 'Worker', r: x => <b>{x.name}</b> }, { h: 'Daily wage', cls: 'r', r: x => inr(x.daily_wage) },
      { h: 'Attendance', r: x => locked(x.id) ? <Badge t="Settled 🔒" tone="ok" /> :
        <select value={num(marks[x.id])} onChange={e => setMarks({ ...marks, [x.id]: Number(e.target.value) })}>{MULTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select> },
      { h: 'Wage', cls: 'r', r: x => inr(num(x.daily_wage) * num(marks[x.id])) }]} /></Card>
  </>);
}

function Advances() {
  const [edit, setEdit] = useState<any>(null);
  const [d, reload] = useLoad(async () => ({
    emps: await q(`SELECT * FROM employees WHERE active=1 ORDER BY name`),
    rows: await q(`SELECT a.*,e.name ename FROM advances a JOIN employees e ON e.id=a.emp_id ORDER BY a.date DESC,a.id DESC`) }));
  return (<>
    <div className="row"><button className="btn" onClick={() => setEdit({ date: today() })}>+ Give advance</button></div>
    <Card title="Cash advances (recovered FIFO at settlement)"><Table rows={d?.rows || []} cols={[
      { h: 'Date', r: x => x.date }, { h: 'Employee', r: x => x.ename }, { h: 'Given', cls: 'r', r: x => inr(x.amount) },
      { h: 'Balance', cls: 'r', r: x => <b className={x.remaining > 0 ? 'neg' : ''}>{inr(x.remaining)}</b> }, { h: 'Notes', r: x => x.notes },
      { h: '', r: x => x.remaining === x.amount ? <button className="btn sm red" onClick={async () => { if (ask('Delete advance?')) { await del('advances', x.id); reload(); } }}>Del</button> : <span className="mut">in use</span> }]} /></Card>
    {edit && d && <FormModal title="Give advance" init={edit} onClose={() => setEdit(null)}
      fields={[{ k: 'emp_id', label: 'Employee', type: 'select', req: true, opts: d.emps.map((e: any) => ({ v: e.id, l: e.name })) }, { k: 'date', label: 'Date', type: 'date', req: true },
        { k: 'amount', label: 'Amount (₹)', type: 'number', req: true }, { k: 'notes', label: 'Notes' }]}
      onSave={async v => { if (v.amount <= 0) throw new Error('Amount must be positive'); await insert('advances', { emp_id: v.emp_id, date: v.date, amount: v.amount, remaining: v.amount, notes: v.notes }); reload(); }} />}
  </>);
}

function Settle() {
  const [emp, setEmp] = useState(''); const [from, setFrom] = useState(today().slice(0, 8) + '01'); const [to, setTo] = useState(today());
  const [month, setMonth] = useState(monthKey(today())); const [prev, setPrev] = useState<any>(null); const [mEdit, setMEdit] = useState<any>(null); const [err, setErr] = useState('');
  const [d, reload] = useLoad(async () => ({
    daily: await q(`SELECT * FROM employees WHERE pay_type='daily' ORDER BY active DESC,name`),
    monthly: await q(`SELECT * FROM employees WHERE pay_type='monthly' AND active=1 ORDER BY name`),
    done: await q(`SELECT emp_id FROM settlements WHERE kind='monthly' AND from_date=?`, [month + '-01']) }), [month]);
  const preview = async () => {
    setErr(''); if (!emp) return setErr('Select an employee');
    const rows = await q(`SELECT * FROM attendance WHERE emp_id=? AND date BETWEEN ? AND ? AND settlement_id IS NULL`, [Number(emp), from, to]);
    const gross = rows.reduce((a: number, r: any) => a + r.wage, 0); const adv = await advanceBalance(Number(emp));
    setPrev({ days: rows.reduce((a: number, r: any) => a + r.mult, 0), gross, adv, ded: adv });
  };
  const confirm = async () => {
    try { await createSettlement({ emp: d!.daily.find((e: any) => String(e.id) === emp), kind: 'daily', from, to, gross: prev.gross, maxDeduct: num(prev.ded) }); setPrev(null); reload(); setErr('Settlement created — go to Record Payments to pay it ✔'); }
    catch (e: any) { setErr(e.message); }
  };
  return (<>
    <Card title="Daily-wage settlement (date range)">
      <div className="row"><select value={emp} onChange={e => { setEmp(e.target.value); setPrev(null); }}><option value="">Employee…</option>{(d?.daily || []).map((e: any) => <option key={e.id} value={e.id}>{e.name}{e.active ? '' : ' (ended)'}</option>)}</select>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} /><input type="date" value={to} onChange={e => setTo(e.target.value)} />
        <button className="btn" onClick={preview}>Preview</button></div>
      {err && <div className={err.includes('✔') ? 'pos' : 'err'}>{err}</div>}
      {prev && <div><p>Days worked: <b>{prev.days}</b> · Gross wage: <b>{inr(prev.gross)}</b> · Advance outstanding: <b>{inr(prev.adv)}</b></p>
        <label className="fld"><span>Recover from advance now (₹) — oldest advances first</span><input type="number" value={prev.ded} onChange={e => setPrev({ ...prev, ded: Math.min(num(e.target.value), prev.adv, prev.gross) })} /></label>
        <p>Net payable: <b>{inr(prev.gross - Math.min(num(prev.ded), prev.gross))}</b></p><button className="btn gold" disabled={prev.gross <= 0} onClick={confirm}>Lock attendance & create settlement</button></div>}
    </Card>
    <Card title="Monthly salary payout" right={<input type="month" value={month} onChange={e => setMonth(e.target.value)} />}>
      <Table rows={d?.monthly || []} empty="No active monthly-salary employees." cols={[
        { h: 'Employee', r: x => <b>{x.name}</b> }, { h: 'Salary', cls: 'r', r: x => inr(x.monthly_salary) },
        { h: '', r: x => d!.done.some((r: any) => r.emp_id === x.id) ? <Badge t="Processed" tone="ok" /> : <button className="btn sm" onClick={() => setMEdit({ emp: x, gross: x.monthly_salary, ded: 0 })}>Process</button> }]} /></Card>
    {mEdit && <FormModal title={`Salary ${month} — ${mEdit.emp.name}`} init={mEdit} onClose={() => setMEdit(null)}
      fields={[{ k: 'gross', label: 'Gross salary this month (₹) — adjust for leave/bonus', type: 'number', req: true }, { k: 'ded', label: 'Recover from advance (₹)', type: 'number' }]}
      onSave={async v => { const [y, m] = month.split('-').map(Number); const last = new Date(y, m, 0).getDate();
        await createSettlement({ emp: mEdit.emp, kind: 'monthly', from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}`, gross: v.gross, maxDeduct: v.ded }); reload(); }} />}
  </>);
}

function Payments() {
  const [f, setF] = useState('due'); const [sel, setSel] = useState<number[]>([]); const [pay, setPay] = useState(false);
  const [rows, reload] = useLoad(() => q(`SELECT * FROM settlements WHERE status=? ORDER BY COALESCE(paid_date,to_date) DESC,id DESC`, [f]), [f]);
  useEffect(() => setSel([]), [f]);
  const tot = (rows || []).filter((r: any) => sel.includes(r.id)).reduce((a: number, r: any) => a + r.net, 0);
  const tog = (id: number) => setSel(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));
  return (<>
    <Tabs tabs={[['due', 'Unpaid'], ['paid', 'Paid']]} cur={f} set={setF} />
    {f === 'due' && <div className="row"><button className="btn alt" onClick={() => setSel((rows || []).map((r: any) => r.id))}>Select all</button>
      <button className="btn" disabled={!sel.length} onClick={() => setPay(true)}>Record payment ({sel.length}) — {inr(tot)}</button></div>}
    <Card><Table rows={rows || []} empty="Nothing here" cols={[
      ...(f === 'due' ? [{ h: '', r: (x: any) => <input type="checkbox" checked={sel.includes(x.id)} onChange={() => tog(x.id)} /> }] : []),
      { h: 'Employee', r: x => <b>{x.emp_name}</b> }, { h: 'Type', r: x => x.kind }, { h: 'Period', r: x => `${x.from_date} → ${x.to_date}` },
      { h: 'Gross', cls: 'r', r: x => inr(x.gross) }, { h: 'Advance', cls: 'r', r: x => inr(x.adv_ded) }, { h: 'Net', cls: 'r', r: x => <b>{inr(x.net)}</b> },
      ...(f === 'paid' ? [{ h: 'Paid on', r: (x: any) => `${x.paid_date} (${x.mode})` }] : []),
      { h: '', r: x => f === 'due' ? <button className="btn sm red" onClick={async () => { if (ask('Cancel settlement? Attendance and advances will be restored.')) { await cancelSettlement(x.id); reload(); } }}>Cancel</button>
        : <button className="btn sm alt" onClick={async () => { if (ask('Mark as unpaid?')) { await unpaySettlement(x.id); reload(); } }}>Undo</button> }]} /></Card>
    {pay && <FormModal title="Record wage payment" saveLabel="Confirm payment" init={{ date: today(), mode: 'Cash' }} onClose={() => setPay(false)}
      fields={[{ k: 'date', label: 'Payment date', type: 'date', req: true }, { k: 'mode', label: 'Mode', type: 'select', opts: MODES, req: true }]}
      onSave={async v => { await paySettlements(sel, v.date, v.mode); setSel([]); reload(); }} />}
  </>);
}
