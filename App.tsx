import React, { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { BiometricAuth } from '@aparajita/capacitor-biometric-auth';
import { openDb, getSetting, setSetting } from './db';
import { sha } from './util';
import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions';
import Payroll from './pages/Payroll';
import Crops from './pages/Crops';
import Reports from './pages/Reports';
import Home from './pages/Home';
import Masters from './pages/Masters';

const NAV: [string, string, string, React.FC][] = [
  ['dash', '📊', 'Dashboard', Dashboard], ['tx', '💰', 'Transactions', Transactions], ['pay', '👷', 'Payroll', Payroll],
  ['crop', '🌱', 'Crops', Crops], ['rep', '📑', 'Reports', Reports], ['home', '🏠', 'Home', Home], ['mst', '⚙️', 'Masters', Masters]];

function Lock({ onOpen }: { onOpen: () => void }) {
  const [mode, setMode] = useState<'wait' | 'enter' | 'create'>('wait'); const [pin, setPin] = useState(''); const [err, setErr] = useState('');
  const bio = async () => {
    if (!Capacitor.isNativePlatform()) return false;
    try { const i = await BiometricAuth.checkBiometry(); if (!i.isAvailable && !i.deviceIsSecure) return false;
      await BiometricAuth.authenticate({ reason: 'Unlock NSN Farms', allowDeviceCredential: true }); onOpen(); return true; } catch { return false; }
  };
  useEffect(() => { (async () => { const h = await getSetting('pin_hash'); if (Capacitor.isNativePlatform() && (await bio())) return; setMode(h ? 'enter' : 'create'); })(); }, []);
  const go = async () => {
    if (mode === 'create') { if (!/^\d{4,8}$/.test(pin)) return setErr('Use 4–8 digits'); await setSetting('pin_hash', await sha(pin)); onOpen(); }
    else if ((await sha(pin)) === (await getSetting('pin_hash'))) onOpen(); else { setErr('Wrong PIN'); setPin(''); }
  };
  return (<div className="lock"><h1>🌾 NSN Farms</h1>
    {mode === 'wait' ? <div>Authenticating…</div> : <>
      <div>{mode === 'create' ? 'Create an app PIN (4–8 digits)' : 'Enter PIN'}</div>
      <input type="password" inputMode="numeric" autoFocus value={pin} onChange={e => setPin(e.target.value)} onKeyDown={e => e.key === 'Enter' && go()} />
      {err && <div style={{ color: '#fecaca' }}>{err}</div>}
      <button className="btn gold" onClick={go}>{mode === 'create' ? 'Set PIN' : 'Unlock'}</button>
      {Capacitor.isNativePlatform() && mode === 'enter' && <button className="btn alt" onClick={bio}>Use biometrics</button>}</>}</div>);
}

export default function App() {
  const [ready, setReady] = useState(false); const [err, setErr] = useState(''); const [open, setOpen] = useState(false); const [tab, setTab] = useState('dash');
  const hiddenAt = useRef(0);
  useEffect(() => { openDb().then(() => setReady(true)).catch(e => setErr(e?.message || String(e))); }, []);
  useEffect(() => { // auto-lock after 2 min in background
    const h = () => { if (document.hidden) hiddenAt.current = Date.now(); else if (hiddenAt.current && Date.now() - hiddenAt.current > 120000) setOpen(false); };
    document.addEventListener('visibilitychange', h); return () => document.removeEventListener('visibilitychange', h);
  }, []);
  if (err) return <div className="lock"><h2>Cannot open database</h2><p>{err}</p></div>;
  if (!ready) return <div className="lock">Opening encrypted database…</div>;
  if (!open) return <Lock onOpen={() => setOpen(true)} />;
  const Cur = NAV.find(n => n[0] === tab)![3];
  return (<div className="shell">
    <aside className="side"><h1>🌾 NSN Farms</h1>{NAV.map(n => <button key={n[0]} className={'nb' + (tab === n[0] ? ' on' : '')} onClick={() => setTab(n[0])}>{n[1]} {n[2]}</button>)}
      <button className="nb" style={{ marginTop: 20 }} onClick={() => setOpen(false)}>🔒 Lock</button></aside>
    <main className="main"><div className="top"><h2>{NAV.find(n => n[0] === tab)![2]}</h2></div><Cur /></main>
    <nav className="bot">{NAV.map(n => <button key={n[0]} className={tab === n[0] ? 'on' : ''} onClick={() => setTab(n[0])}><span>{n[1]}</span>{n[2]}</button>)}</nav>
  </div>);
}
