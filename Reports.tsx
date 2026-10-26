import React, { useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { cropPnl, balanceSheet } from '../engine';
import { fyRange, inr, saveFile, toCsv, today } from '../util';
import { Card, Table, Tabs, useLoad } from '../ui';

export default function Reports() {
  const fy = fyRange(); const [from, setFrom] = useState(fy[0]); const [to, setTo] = useState(fy[1]); const [tab, setTab] = useState('pnl');
  const [d] = useLoad(async () => ({ p: await cropPnl(from, to), b: await balanceSheet() }), [from, to]);
  if (!d) return <div className="mut">Loading…</div>;
  const { p, b } = d; const t = p.totals;
  const pnlRows = [...p.rows.map(r => [r.name, r.revenue, r.direct, r.labor, r.overhead, r.profit, r.roi.toFixed(1) + '%']), ['TOTAL', t.revenue, t.direct, t.labor, t.overhead, t.profit, t.roi.toFixed(1) + '%']];
  const bsRows = (): (string | number)[][] => [['ASSETS', ''], ...b.assets, ['Total assets', b.totalAssets], ['LIABILITIES', ''], ...b.liabs, ['EQUITY', ''], ...b.eq, ['Total liabilities + equity', b.totalLE]];
  const pnlHead = ['Crop', 'Revenue', 'Direct exp', 'Labour', 'Overhead share', 'Net profit', 'ROI'];

  const csv = () => saveFile(`NSN_${tab === 'pnl' ? 'CropPnL' : 'BalanceSheet'}_${today()}.csv`, new Blob([toCsv(tab === 'pnl' ? [pnlHead, ...pnlRows] : [['Item', 'Amount'], ...bsRows()])], { type: 'text/csv' }));
  const pdf = () => {
    const doc = new jsPDF({ format: 'a4' });
    doc.setFontSize(16); doc.text('NSN Farms', 14, 16); doc.setFontSize(10); doc.text(`Generated ${today()}  |  Period ${from} to ${to}`, 14, 22);
    autoTable(doc, { startY: 28, head: [pnlHead], body: pnlRows.map(r => r.map((c, i) => i && i < 6 ? inr(c) : String(c))), headStyles: { fillColor: [27, 67, 50] }, styles: { fontSize: 8 } });
    doc.addPage(); doc.setFontSize(14); doc.text('Farm Balance Sheet (current position)', 14, 16);
    autoTable(doc, { startY: 22, head: [['Item', 'Amount']], body: bsRows().map(r => [String(r[0]), r[1] === '' ? '' : inr(r[1])]), headStyles: { fillColor: [27, 67, 50] }, styles: { fontSize: 9 } });
    saveFile(`NSN_Report_${today()}.pdf`, doc.output('blob'));
  };
  const section = (title: string, rows: [string, number][]) => (<>
    <tr><td colSpan={2}><b>{title}</b></td></tr>{rows.map(([n, v]) => <tr key={n}><td>{n}</td><td className="r">{inr(v)}</td></tr>)}</>);

  return (<>
    <div className="row"><input type="date" value={from} onChange={e => setFrom(e.target.value)} /><input type="date" value={to} onChange={e => setTo(e.target.value)} />
      <button className="btn" onClick={pdf}>Export A4 PDF</button><button className="btn alt" onClick={csv}>Export CSV</button></div>
    <Tabs tabs={[['pnl', 'Crop-wise P&L'], ['bs', 'Balance Sheet']]} cur={tab} set={setTab} />
    {tab === 'pnl' ? (<Card title="Profit & Loss by crop">
      <Table rows={[...p.rows, { id: 't', name: 'TOTAL', ...t }]} cols={[
        { h: 'Crop', r: x => <b>{x.name}</b> }, { h: 'Revenue', cls: 'r', r: x => inr(x.revenue) }, { h: 'Direct', cls: 'r', r: x => inr(x.direct) },
        { h: 'Labour', cls: 'r', r: x => inr(x.labor) }, { h: 'Overhead', cls: 'r', r: x => inr(x.overhead) },
        { h: 'Net profit', cls: 'r', r: x => <b className={x.profit < 0 ? 'neg' : 'pos'}>{inr(x.profit)}</b> }, { h: 'ROI', cls: 'r', r: x => x.roi.toFixed(1) + '%' }]} />
      <p className="mut">Overhead pool {inr(p.pool)} (overhead expenses + overhead-tagged wages + monthly salaries) is allocated by revenue share.</p></Card>
    ) : (<Card title="Farm Balance Sheet">
      <div className="tw"><table><tbody>{section('ASSETS', b.assets)}<tr><td><b>Total assets</b></td><td className="r"><b>{inr(b.totalAssets)}</b></td></tr>
        {section('LIABILITIES', b.liabs)}{section('EQUITY', b.eq)}<tr><td><b>Total liabilities + equity</b></td><td className="r"><b>{inr(b.totalLE)}</b></td></tr></tbody></table></div>
      <p className={Math.abs(b.totalAssets - b.totalLE) < 0.5 ? 'pos' : 'neg'}>{Math.abs(b.totalAssets - b.totalLE) < 0.5 ? '✔ Balanced' : '✖ Out of balance'}</p>
      <p className="mut">Enter land, machinery, loans and capital under Masters → Opening balances. Cash is derived from them plus all transactions.</p></Card>)}
  </>);
}
