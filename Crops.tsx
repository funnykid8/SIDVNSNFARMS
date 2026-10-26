import React, { useState } from 'react';
import { q, save, del, insert, update } from '../db';
import { daysBetween, inr, num, today } from '../util';
import { Badge, Card, FormModal, Table, Tabs, useLoad, ask, FieldDef } from '../ui';

const TYPES = [{ v: 'perennial', l: 'Perennial (coconut, cocoa…)' }, { v: 'seasonal', l: 'Seasonal (banana, paddy, turmeric, ginger…)' }];
const CSTATUS = ['Planned', 'Active', 'Harvested'].map(v => ({ v, l: v }));

export default function Crops() {
  const [tab, setTab] = useState('crops');
  return (<><Tabs tabs={[['crops', 'Crop Master'], ['fert', 'Fertilizer Plan']]} cur={tab} set={setTab} />{tab === 'crops' ? <CropMaster /> : <FertPlan />}</>);
}

function CropMaster() {
  const [edit, setEdit] = useState<any>(null);
  const [rows, reload] = useLoad(() => q(`SELECT * FROM crops ORDER BY protected DESC,name`));
  const fields: FieldDef[] = [
    { k: 'name', label: 'Crop / plot name', req: true }, { k: 'type', label: 'Crop type', type: 'select', req: true, opts: TYPES },
    { k: 'block', label: 'Farm block' }, { k: 'area', label: 'Area (acres)', type: 'number' },
    { k: 'start_date', label: 'Start / planting date', type: 'date', req: true },
    { k: 'harvest_date', label: 'Planned harvest date', type: 'date', show: v => v.type === 'seasonal', req: true },
    { k: 'status', label: 'Status', type: 'select', opts: CSTATUS }, { k: 'notes', label: 'Notes', type: 'textarea' }];
  const remove = async (c: any) => {
    const used = (await q(`SELECT (SELECT COUNT(*) FROM expenses WHERE crop_id=?)+(SELECT COUNT(*) FROM revenues WHERE crop_id=?)+(SELECT COUNT(*) FROM attendance WHERE crop_id=?)+(SELECT COUNT(*) FROM fert_plan WHERE crop_id=?) n`, [c.id, c.id, c.id, c.id]))[0].n;
    if (used) return alert('This crop has transactions or plans. Set its status to Harvested instead of deleting.');
    if (ask(`Delete ${c.name}?`)) { await del('crops', c.id); reload(); }
  };
  return (<>
    <div className="row"><button className="btn" onClick={() => setEdit({ type: 'seasonal', status: 'Planned', start_date: today() })}>+ Add crop</button></div>
    <Card><Table rows={rows || []} cols={[
      { h: 'Crop', r: x => <b>{x.name}</b> }, { h: 'Type', r: x => x.type }, { h: 'Block', r: x => x.block }, { h: 'Acres', r: x => x.area || '' },
      { h: 'Start', r: x => x.start_date }, { h: 'Planned harvest', r: x => x.harvest_date },
      { h: 'Days left', r: x => x.type === 'seasonal' && x.harvest_date && x.status !== 'Harvested' ? <span className={daysBetween(today(), x.harvest_date) < 0 ? 'neg' : ''}>{daysBetween(today(), x.harvest_date)}</span> : '' },
      { h: 'Status', r: x => <Badge t={x.status} tone={x.status === 'Harvested' ? 'ok' : x.status === 'Planned' ? 'warn' : undefined} /> },
      { h: '', r: x => x.protected ? <span className="mut">protected</span> : <><button className="btn sm alt" onClick={() => setEdit(x)}>Edit</button> <button className="btn sm red" onClick={() => remove(x)}>Del</button></> }]} /></Card>
    {edit && <FormModal title={edit.id ? 'Edit crop' : 'Add crop'} fields={fields} init={edit} onClose={() => setEdit(null)}
      onSave={async v => { if (v.type === 'seasonal' && v.harvest_date < v.start_date) throw new Error('Harvest date cannot be before the start date'); await save('crops', { ...v, protected: 0 }); reload(); }} />}
  </>);
}

function FertPlan() {
  const [cid, setCid] = useState(''); const [edit, setEdit] = useState<any>(null); const [done, setDone] = useState<any>(null);
  const [d, reload] = useLoad(async () => {
    const crops = (await q(`SELECT * FROM crops WHERE type<>'overhead' ORDER BY name`));
    const rows = await q(`SELECT f.*,c.name cname FROM fert_plan f JOIN crops c ON c.id=f.crop_id ${cid ? 'WHERE f.crop_id=' + Number(cid) : ''} ORDER BY f.plan_date`);
    return { crops, rows };
  }, [cid]);
  const cropOpts = (d?.crops || []).map((c: any) => ({ v: c.id, l: c.name }));
  const fields: FieldDef[] = [
    { k: 'crop_id', label: 'Crop', type: 'select', req: true, opts: cropOpts }, { k: 'plan_date', label: 'Planned date', type: 'date', req: true },
    { k: 'product', label: 'Fertilizer / input', req: true }, { k: 'qty', label: 'Quantity', type: 'number' }, { k: 'unit', label: 'Unit (kg, L, bags)' },
    { k: 'method', label: 'Method (basal, drip, foliar…)' }, { k: 'est_cost', label: 'Estimated cost (₹)', type: 'number' }, { k: 'notes', label: 'Notes', type: 'textarea' }];
  const total = (d?.rows || []).reduce((a: number, r: any) => a + num(r.est_cost), 0);
  return (<>
    <div className="row">
      <select value={cid} onChange={e => setCid(e.target.value)}><option value="">All crops</option>{cropOpts.map((o: any) => <option key={o.v} value={o.v}>{o.l}</option>)}</select>
      <button className="btn" onClick={() => setEdit({ plan_date: today(), status: 'Planned' })}>+ Plan entry</button>
    </div>
    <Card title={`Fertilizer schedule — estimated ${inr(total)}`}><Table rows={d?.rows || []} cols={[
      { h: 'Date', r: x => <span className={x.status === 'Planned' && x.plan_date < today() ? 'neg' : ''}>{x.plan_date}</span> }, { h: 'Crop', r: x => x.cname },
      { h: 'Input', r: x => x.product }, { h: 'Qty', r: x => `${x.qty || ''} ${x.unit || ''}` }, { h: 'Method', r: x => x.method },
      { h: 'Est. ₹', cls: 'r', r: x => inr(x.est_cost) },
      { h: 'Status', r: x => <Badge t={x.status} tone={x.status === 'Done' ? 'ok' : x.status === 'Skipped' ? undefined : x.plan_date < today() ? 'bad' : 'warn'} /> },
      { h: '', r: x => <>{x.status === 'Planned' && <button className="btn sm gold" onClick={() => setDone({ ...x, done_date: today(), actual_cost: x.est_cost, post: 'yes' })}>Done</button>} <button className="btn sm alt" onClick={() => setEdit(x)}>Edit</button> <button className="btn sm red" onClick={async () => { if (ask('Delete plan entry?')) { await del('fert_plan', x.id); reload(); } }}>Del</button></> }]} /></Card>
    {edit && <FormModal title={edit.id ? 'Edit plan entry' : 'New plan entry'} fields={fields} init={edit} onClose={() => setEdit(null)} onSave={async v => { await save('fert_plan', { id: v.id, crop_id: v.crop_id, plan_date: v.plan_date, product: v.product, qty: v.qty, unit: v.unit, method: v.method, est_cost: v.est_cost, status: v.status || 'Planned', notes: v.notes }); reload(); }} />}
    {done && <FormModal title="Mark application done" saveLabel="Confirm" init={done} onClose={() => setDone(null)}
      fields={[{ k: 'done_date', label: 'Date applied', type: 'date', req: true }, { k: 'actual_cost', label: 'Actual cost (₹)', type: 'number' },
        { k: 'post', label: 'Also record as farm expense (Fertilizer)?', type: 'select', opts: [{ v: 'yes', l: 'Yes, post to expenses' }, { v: 'no', l: 'No' }] }]}
      onSave={async v => {
        await update('fert_plan', done.id, { status: 'Done', done_date: v.done_date, actual_cost: v.actual_cost });
        if (v.post === 'yes' && v.actual_cost > 0) {
          const cat = (await q(`SELECT * FROM exp_cats WHERE name LIKE 'Fertili%' LIMIT 1`))[0];
          await insert('expenses', { date: v.done_date, crop_id: done.crop_id, crop_name: done.cname, cat_id: cat?.id ?? null, cat_name: cat?.name ?? 'Fertilizer', amount: v.actual_cost, mode: 'Cash', notes: `Fertilizer plan: ${done.product}` });
        }
        reload(); }} />}
  </>);
}
