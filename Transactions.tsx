import React, { useState } from 'react';
import { q, save, del } from '../db';
import { fyRange, inr, num, today } from '../util';
import { Card, FormModal, Table, Tabs, useLoad, ask, FieldDef } from '../ui';

const MODES = ['Cash', 'UPI', 'Bank transfer', 'Cheque', 'Credit'].map(v => ({ v, l: v }));

export default function Transactions() {
  const [seg, setSeg] = useState('exp'); const fy = fyRange();
  const [from, setFrom] = useState(fy[0]); const [to, setTo] = useState(fy[1]); const [s, setS] = useState('');
  const [edit, setEdit] = useState<any>(null);
  const isExp = seg === 'exp';
  const [data, reload] = useLoad(async () => {
    const like = `%${s}%`;
    const rows = isExp
      ? await q(`SELECT * FROM expenses WHERE date BETWEEN ? AND ? AND (IFNULL(crop_name,'')||IFNULL(cat_name,'')||IFNULL(notes,'')) LIKE ? ORDER BY date DESC,id DESC`, [from, to, like])
      : await q(`SELECT * FROM revenues WHERE date BETWEEN ? AND ? AND (IFNULL(crop_name,'')||IFNULL(buyer_name,'')||IFNULL(notes,'')) LIKE ? ORDER BY date DESC,id DESC`, [from, to, like]);
    const crops = await q(`SELECT * FROM crops ORDER BY name`);
    const cats = await q(`SELECT * FROM exp_cats WHERE active=1 ORDER BY name`);
    const buyers = await q(`SELECT * FROM buyers WHERE active=1 ORDER BY name`);
    return { rows, crops, cats, buyers };
  }, [seg, from, to, s]);
  const total = (data?.rows || []).reduce((a: number, r: any) => a + num(r.amount), 0);

  const openForm = (r?: any) => setEdit(r || { date: today(), mode: 'Cash', unit: 'kg', received: 0 });
  const expFields: FieldDef[] = [
    { k: 'date', label: 'Date', type: 'date', req: true },
    { k: 'crop_id', label: 'Crop / cost centre', type: 'select', req: true, opts: (data?.crops || []).map((c: any) => ({ v: c.id, l: c.type === 'overhead' ? c.name + ' (overhead)' : c.name })) },
    { k: 'cat_id', label: 'Expense category', type: 'select', req: true, opts: (data?.cats || []).map((c: any) => ({ v: c.id, l: c.name })) },
    { k: 'amount', label: 'Amount (₹)', type: 'number', req: true },
    { k: 'mode', label: 'Payment mode', type: 'select', opts: MODES }, { k: 'notes', label: 'Notes', type: 'textarea' }];
  const revFields: FieldDef[] = [
    { k: 'date', label: 'Date', type: 'date', req: true },
    { k: 'crop_id', label: 'Crop', type: 'select', req: true, opts: (data?.crops || []).filter((c: any) => c.type !== 'overhead').map((c: any) => ({ v: c.id, l: c.name })) },
    { k: 'buyer_id', label: 'Buyer', type: 'select', req: true, opts: (data?.buyers || []).map((c: any) => ({ v: c.id, l: c.name })) },
    { k: 'qty', label: 'Quantity', type: 'number' }, { k: 'unit', label: 'Unit (kg, nuts, bags…)' }, { k: 'rate', label: 'Rate (₹ per unit)', type: 'number' },
    { k: 'amount', label: 'Total amount (₹)', type: 'number', req: true },
    { k: 'received', label: 'Amount received so far (₹)', type: 'number' }, { k: 'notes', label: 'Notes', type: 'textarea' }];

  const onSave = async (v: any) => {
    const crop = data!.crops.find((c: any) => c.id === v.crop_id);
    if (isExp) {
      const cat = data!.cats.find((c: any) => c.id === v.cat_id) || { name: v.cat_name };
      await save('expenses', { id: v.id, date: v.date, crop_id: v.crop_id, crop_name: crop?.name, cat_id: v.cat_id, cat_name: cat.name, amount: v.amount, mode: v.mode, notes: v.notes });
    } else {
      if (v.received > v.amount) throw new Error('Received cannot exceed the total amount');
      const b = data!.buyers.find((c: any) => c.id === v.buyer_id) || { name: v.buyer_name };
      await save('revenues', { id: v.id, date: v.date, crop_id: v.crop_id, crop_name: crop?.name, buyer_id: v.buyer_id, buyer_name: b.name, qty: v.qty, unit: v.unit, rate: v.rate, amount: v.amount, received: v.received, notes: v.notes });
    }
    reload();
  };
  const calc = (v: any, k: string) => (!isExp && (k === 'qty' || k === 'rate') ? { ...v, amount: Math.round(num(v.qty) * num(v.rate) * 100) / 100 } : v);

  return (<>
    <Tabs tabs={[['exp', 'Farm Expenses'], ['rev', 'Crop Revenue']]} cur={seg} set={setSeg} />
    <div className="row">
      <input placeholder="Search…" value={s} onChange={e => setS(e.target.value)} />
      <input type="date" value={from} onChange={e => setFrom(e.target.value)} /><input type="date" value={to} onChange={e => setTo(e.target.value)} />
      <button className="btn" onClick={() => openForm()}>+ Add</button>
    </div>
    <Card title={`${isExp ? 'Expenses' : 'Revenue'} — total ${inr(total)}`}>
      <Table rows={data?.rows || []} cols={isExp ? [
        { h: 'Date', r: x => x.date }, { h: 'Crop', r: x => x.crop_name }, { h: 'Category', r: x => x.cat_name }, { h: 'Notes', r: x => x.notes },
        { h: 'Amount', cls: 'r', r: x => inr(x.amount) },
        { h: '', r: x => <><button className="btn sm alt" onClick={() => openForm(x)}>Edit</button> <button className="btn sm red" onClick={async () => { if (ask('Delete this entry?')) { await del('expenses', x.id); reload(); } }}>Del</button></> }]
      : [
        { h: 'Date', r: x => x.date }, { h: 'Crop', r: x => x.crop_name }, { h: 'Buyer', r: x => x.buyer_name }, { h: 'Qty', r: x => `${x.qty || ''} ${x.unit || ''}` },
        { h: 'Amount', cls: 'r', r: x => inr(x.amount) }, { h: 'Pending', cls: 'r', r: x => <span className={x.amount - x.received > 0 ? 'neg' : ''}>{inr(x.amount - x.received)}</span> },
        { h: '', r: x => <><button className="btn sm alt" onClick={() => openForm(x)}>Edit</button> <button className="btn sm red" onClick={async () => { if (ask('Delete this entry?')) { await del('revenues', x.id); reload(); } }}>Del</button></> }]} />
    </Card>
    {edit && data && <FormModal title={(edit.id ? 'Edit ' : 'Add ') + (isExp ? 'expense' : 'revenue')} fields={isExp ? expFields : revFields} init={edit} onSave={onSave} onClose={() => setEdit(null)} onChange={calc} />}
  </>);
}
