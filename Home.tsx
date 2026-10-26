import React, { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { q, save, del } from '../db';
import { inr, num, today } from '../util';
import { Card, FormModal, Table, useLoad, ask, Kpi } from '../ui';
import { SimpleMaster } from './Masters';

/** Personal / household ledger. Fully separate tables — never part of farm P&L or balance sheet. */
export default function Home() {
  const [month, setMonth] = useState(today().slice(0, 7)); const [edit, setEdit] = useState<any>(null); const [cats, setCats] = useState(false);
  const [d, reload] = useLoad(async () => {
    const rows = await q(`SELECT * FROM home_expenses WHERE substr(date,1,7)=? ORDER BY date DESC,id DESC`, [month]);
    const by = await q(`SELECT cat_name n,SUM(amount) v FROM home_expenses WHERE substr(date,1,7)=? GROUP BY cat_name ORDER BY v DESC`, [month]);
    const c = await q(`SELECT * FROM home_cats WHERE active=1 ORDER BY name`);
    return { rows, by, c };
  }, [month]);
  const total = (d?.rows || []).reduce((a: number, r: any) => a + num(r.amount), 0);
  const fields = [
    { k: 'date', label: 'Date', type: 'date' as const, req: true },
    { k: 'cat_id', label: 'Category', type: 'select' as const, req: true, opts: (d?.c || []).map((c: any) => ({ v: c.id, l: c.name })) },
    { k: 'amount', label: 'Amount (₹)', type: 'number' as const, req: true },
    { k: 'mode', label: 'Payment mode', type: 'select' as const, opts: ['Cash', 'UPI', 'Card', 'Bank transfer'].map(v => ({ v, l: v })) },
    { k: 'notes', label: 'Notes', type: 'textarea' as const }];
  return (<>
    <div className="row">
      <input type="month" value={month} onChange={e => setMonth(e.target.value)} />
      <button className="btn" onClick={() => setEdit({ date: today(), mode: 'UPI' })}>+ Add home expense</button>
      <button className="btn alt" onClick={() => setCats(true)}>Expense master</button>
    </div>
    <div className="grid"><Kpi label={`Home spend — ${month}`} value={inr(total)} tone="gold" /></div>
    <Card title="By category">
      {d?.by.length ? <div style={{ height: 200 }}><ResponsiveContainer><BarChart data={d.by.map((x: any) => ({ n: x.n, v: num(x.v) }))}>
        <XAxis dataKey="n" fontSize={11} /><YAxis fontSize={11} width={50} /><Tooltip formatter={(v: any) => inr(v)} /><Bar dataKey="v" fill="#D4A373" /></BarChart></ResponsiveContainer></div> : <div className="mut">No entries this month.</div>}
    </Card>
    <Card title="Home expenses (separate from farm accounts)">
      <Table rows={d?.rows || []} cols={[
        { h: 'Date', r: x => x.date }, { h: 'Category', r: x => x.cat_name }, { h: 'Mode', r: x => x.mode }, { h: 'Notes', r: x => x.notes },
        { h: 'Amount', cls: 'r', r: x => inr(x.amount) },
        { h: '', r: x => <><button className="btn sm alt" onClick={() => setEdit(x)}>Edit</button> <button className="btn sm red" onClick={async () => { if (ask('Delete?')) { await del('home_expenses', x.id); reload(); } }}>Del</button></> }]} />
    </Card>
    {edit && d && <FormModal title={edit.id ? 'Edit home expense' : 'Add home expense'} fields={fields} init={edit} onClose={() => setEdit(null)}
      onSave={async v => { const c = d.c.find((x: any) => x.id === v.cat_id); await save('home_expenses', { id: v.id, date: v.date, cat_id: v.cat_id, cat_name: c?.name ?? v.cat_name, amount: v.amount, mode: v.mode, notes: v.notes }); reload(); }} />}
    {cats && <div className="ov" onClick={() => { setCats(false); reload(); }}><div className="md" onClick={e => e.stopPropagation()}>
      <SimpleMaster table="home_cats" title="Home expense master" /><button className="btn alt" onClick={() => { setCats(false); reload(); }}>Close</button></div></div>}
  </>);
}
