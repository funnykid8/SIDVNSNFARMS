import { q, S, batch } from './db';
import { num, r2 } from './util';

const one = async (sql: string, p: any[] = []) => num((await q(sql, p))[0]?.s);
const mapSum = (rows: any[]) => Object.fromEntries(rows.map(r => [r.id, num(r.s)]));

/** Crop-wise P&L for a period. Overhead (overhead expenses + overhead labour + monthly salaries) is
 *  allocated to crops by revenue share (equal split when there is no revenue). */
export async function cropPnl(from: string, to: string) {
  const crops = await q(`SELECT * FROM crops ORDER BY name`);
  const rev = mapSum(await q(`SELECT crop_id id,SUM(amount) s FROM revenues WHERE date BETWEEN ? AND ? GROUP BY crop_id`, [from, to]));
  const exp = mapSum(await q(`SELECT crop_id id,SUM(amount) s FROM expenses WHERE date BETWEEN ? AND ? GROUP BY crop_id`, [from, to]));
  const lab = mapSum(await q(`SELECT crop_id id,SUM(wage) s FROM attendance WHERE date BETWEEN ? AND ? GROUP BY crop_id`, [from, to]));
  const sal = await one(`SELECT SUM(gross) s FROM settlements WHERE kind='monthly' AND to_date BETWEEN ? AND ?`, [from, to]);
  const oh = crops.find(c => c.type === 'overhead');
  const pool = (oh ? (exp[oh.id] || 0) + (lab[oh.id] || 0) : 0) + sal;
  const base = crops.filter(c => c.type !== 'overhead').map(c => ({
    id: c.id, name: c.name, type: c.type, revenue: rev[c.id] || 0, direct: exp[c.id] || 0, labor: lab[c.id] || 0, overhead: 0, cost: 0, profit: 0, roi: 0 }));
  const totalRev = base.reduce((a, c) => a + c.revenue, 0);
  base.forEach(c => {
    const share = totalRev > 0 ? c.revenue / totalRev : base.length ? 1 / base.length : 0;
    c.overhead = r2(pool * share); c.cost = c.direct + c.labor + c.overhead;
    c.profit = c.revenue - c.cost; c.roi = c.cost > 0 ? (c.profit / c.cost) * 100 : 0;
  });
  const sum = (k: string) => base.reduce((a, c: any) => a + c[k], 0);
  const t = { revenue: sum('revenue'), direct: sum('direct'), labor: sum('labor'), overhead: pool, cost: 0, profit: 0, roi: 0 };
  // if no crops exist, the pool is still a cost
  t.cost = t.direct + t.labor + t.overhead; t.profit = t.revenue - t.cost; t.roi = t.cost > 0 ? (t.profit / t.cost) * 100 : 0;
  const laborTotal = t.labor + sal; // labour incl. overhead-tagged wages & monthly salaries
  return { rows: base, pool, totals: t, laborTotal, salaries: sal };
}

/** Current financial position. Balances by construction:
 *  Cash = capital + liabilities - fixed assets + received revenue - expenses - wages paid - advances given. */
export async function balanceSheet() {
  const kind = (k: string) => one(`SELECT SUM(amount) s FROM bs_entries WHERE kind=?`, [k]);
  const [fa, lia, cap] = [await kind('asset'), await kind('liability'), await kind('equity')];
  const rev = await one(`SELECT SUM(amount) s FROM revenues`), recv = await one(`SELECT SUM(received) s FROM revenues`);
  const exp = await one(`SELECT SUM(amount) s FROM expenses`);
  const settledGross = await one(`SELECT SUM(gross) s FROM settlements`);
  const unsettled = await one(`SELECT SUM(wage) s FROM attendance WHERE settlement_id IS NULL`);
  const netPaid = await one(`SELECT SUM(net) s FROM settlements WHERE status='paid'`);
  const netDue = await one(`SELECT SUM(net) s FROM settlements WHERE status='due'`);
  const advGiven = await one(`SELECT SUM(amount) s FROM advances`), advOut = await one(`SELECT SUM(remaining) s FROM advances`);
  const cash = cap + lia - fa + recv - exp - netPaid - advGiven;
  const profit = rev - exp - (settledGross + unsettled);
  const assets = [['Fixed assets (land, machinery, etc.)', fa], ['Cash & bank (derived)', cash], ['Receivables from buyers', rev - recv], ['Advances to workers', advOut]] as [string, number][];
  const liabs = [['Loans & other liabilities', lia], ['Wages payable (settled, unpaid)', netDue], ['Wages accrued (unsettled attendance)', unsettled]] as [string, number][];
  const eq = [['Owner capital', cap], ['Retained earnings (profit to date)', profit]] as [string, number][];
  const tot = (a: [string, number][]) => a.reduce((x, y) => x + y[1], 0);
  return { assets, liabs, eq, totalAssets: tot(assets), totalLE: tot(liabs) + tot(eq) };
}

export const advanceBalance = (empId: number) => one(`SELECT SUM(remaining) s FROM advances WHERE emp_id=?`, [empId]);

/** Creates a 'due' settlement: locks attendance, recovers advances FIFO (oldest first). */
export async function createSettlement(o: { emp: any; kind: 'daily' | 'monthly'; from: string; to: string; gross: number; maxDeduct: number; notes?: string }) {
  const { emp, kind, from, to, gross } = o;
  if (gross <= 0) throw new Error('Nothing to settle');
  const advs = await q(`SELECT * FROM advances WHERE emp_id=? AND remaining>0 ORDER BY date,id`, [emp.id]);
  let left = Math.min(num(o.maxDeduct), gross), ded = 0; const st = [] as ReturnType<typeof S>[];
  const allocs: [number, number][] = [];
  for (const a of advs) { if (left <= 0) break; const t = r2(Math.min(a.remaining, left)); left = r2(left - t); ded = r2(ded + t); allocs.push([a.id, t]); }
  st.push(S(`INSERT INTO settlements(emp_id,emp_name,kind,from_date,to_date,gross,adv_ded,net,status,notes) VALUES(?,?,?,?,?,?,?,?, 'due', ?)`,
    [emp.id, emp.name, kind, from, to, r2(gross), ded, r2(gross - ded), o.notes ?? null]));
  const sid = `(SELECT MAX(id) FROM settlements)`;
  for (const [aid, t] of allocs) {
    st.push(S(`INSERT INTO adv_alloc(settlement_id,advance_id,amount) VALUES(${sid},?,?)`, [aid, t]));
    st.push(S(`UPDATE advances SET remaining=ROUND(remaining-?,2) WHERE id=?`, [t, aid]));
  }
  if (kind === 'daily') st.push(S(`UPDATE attendance SET settlement_id=${sid} WHERE emp_id=? AND date BETWEEN ? AND ? AND settlement_id IS NULL`, [emp.id, from, to]));
  await batch(st);
}

export async function cancelSettlement(id: number) {
  const s = (await q(`SELECT * FROM settlements WHERE id=?`, [id]))[0];
  if (!s || s.status !== 'due') throw new Error('Only unpaid settlements can be cancelled');
  const al = await q(`SELECT * FROM adv_alloc WHERE settlement_id=?`, [id]);
  await batch([
    ...al.map(a => S(`UPDATE advances SET remaining=ROUND(remaining+?,2) WHERE id=?`, [a.amount, a.advance_id])),
    S(`DELETE FROM adv_alloc WHERE settlement_id=?`, [id]),
    S(`UPDATE attendance SET settlement_id=NULL WHERE settlement_id=?`, [id]),
    S(`DELETE FROM settlements WHERE id=?`, [id]),
  ]);
}
export const paySettlements = (ids: number[], date: string, mode: string) =>
  batch(ids.map(id => S(`UPDATE settlements SET status='paid',paid_date=?,mode=? WHERE id=? AND status='due'`, [date, mode, id])));
export const unpaySettlement = (id: number) => batch([S(`UPDATE settlements SET status='due',paid_date=NULL,mode=NULL WHERE id=?`, [id])]);
