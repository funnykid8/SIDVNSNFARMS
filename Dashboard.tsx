import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { q } from '../db';
import { cropPnl, balanceSheet } from '../engine';
import { addDays, fyRange, inr, lastMonths, num, today } from '../util';
import { Card, Kpi, Table, useLoad } from '../ui';

const COLORS = ['#1B4332', '#D4A373', '#B91C1C', '#2D6A4F', '#A98467', '#52796F', '#6B705C', '#CB997E'];
const byMonth = (rows: any[]) => Object.fromEntries(rows.map(r => [r.m, num(r.s)]));

export default function Dashboard() {
  const fy = fyRange();
  const [d] = useLoad(async () => {
    const p = await cropPnl(fy[0], fy[1]); const bs = await balanceSheet();
    const rev = byMonth(await q(`SELECT substr(date,1,7) m,SUM(amount) s FROM revenues GROUP BY m`));
    const exp = byMonth(await q(`SELECT substr(date,1,7) m,SUM(amount) s FROM expenses GROUP BY m`));
    const lab = byMonth(await q(`SELECT substr(date,1,7) m,SUM(wage) s FROM attendance GROUP BY m`));
    const sal = byMonth(await q(`SELECT substr(to_date,1,7) m,SUM(gross) s FROM settlements WHERE kind='monthly' GROUP BY m`));
    const trend = lastMonths(6).map(m => ({ m, Revenue: rev[m] || 0, Outflow: (exp[m] || 0) + (lab[m] || 0) + (sal[m] || 0) }));
    const cats = (await q(`SELECT cat_name n,SUM(amount) v FROM expenses WHERE date BETWEEN ? AND ? GROUP BY cat_name ORDER BY v DESC`, fy)).map(c => ({ n: c.n || 'Uncategorised', v: num(c.v) }));
    const ferts = await q(`SELECT f.*,c.name cname FROM fert_plan f JOIN crops c ON c.id=f.crop_id WHERE f.status='Planned' AND f.plan_date<=? ORDER BY f.plan_date LIMIT 8`, [addDays(today(), 14)]);
    const harv = await q(`SELECT * FROM crops WHERE IFNULL(harvest_date,'')<>'' AND status<>'Harvested' AND harvest_date<=? ORDER BY harvest_date LIMIT 6`, [addDays(today(), 30)]);
    const due = num((await q(`SELECT SUM(net) s FROM settlements WHERE status='due'`))[0]?.s);
    return { p, bs, trend, cats, ferts, harv, due };
  });
  if (!d) return <div className="mut">Loading…</div>;
  const t = d.p.totals, recv = d.bs.assets[2][1], adv = d.bs.assets[3][1];
  return (<>
    <div className="mut" style={{ marginBottom: 8 }}>Financial year {fy[0]} → {fy[1]}</div>
    <div className="grid">
      <Kpi label="Revenue" value={inr(t.revenue)} />
      <Kpi label="Direct expenses" value={inr(t.direct)} tone="red" />
      <Kpi label="Labour costs" value={inr(d.p.laborTotal)} tone="gold" />
      <Kpi label="Net profit" value={inr(t.profit)} tone={t.profit < 0 ? 'red' : undefined} />
      <Kpi label="Receivables" value={inr(recv)} tone="gold" />
      <Kpi label="Wages due to pay" value={inr(d.due)} tone="red" />
      <Kpi label="Advances outstanding" value={inr(adv)} tone="gold" />
    </div>
    <Card title="6-month cash-flow trend">
      <div style={{ height: 240 }}><ResponsiveContainer><BarChart data={d.trend}>
        <XAxis dataKey="m" fontSize={11} /><YAxis fontSize={11} width={50} /><Tooltip formatter={(v: any) => inr(v)} /><Legend />
        <Bar dataKey="Revenue" fill="#1B4332" /><Bar dataKey="Outflow" fill="#B91C1C" /></BarChart></ResponsiveContainer></div>
    </Card>
    <Card title="Expense breakdown (FY)">
      {d.cats.length ? <div style={{ height: 260 }}><ResponsiveContainer><PieChart>
        <Pie data={d.cats} dataKey="v" nameKey="n" innerRadius={55} outerRadius={90} label={(e: any) => e.n}>
          {d.cats.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip formatter={(v: any) => inr(v)} /></PieChart></ResponsiveContainer></div>
        : <div className="mut">No expenses recorded in this financial year.</div>}
    </Card>
    <Card title="Fertilizer tasks due / overdue (next 14 days)">
      <Table rows={d.ferts} empty="Nothing due" cols={[
        { h: 'Date', r: x => <span className={x.plan_date < today() ? 'neg' : ''}>{x.plan_date}</span> },
        { h: 'Crop', r: x => x.cname }, { h: 'Product', r: x => x.product }, { h: 'Qty', r: x => `${x.qty} ${x.unit || ''}` }]} />
    </Card>
    <Card title="Harvests due within 30 days">
      <Table rows={d.harv} empty="None" cols={[{ h: 'Crop', r: x => x.name }, { h: 'Block', r: x => x.block }, { h: 'Planned harvest', r: x => x.harvest_date }]} />
    </Card>
  </>);
}
