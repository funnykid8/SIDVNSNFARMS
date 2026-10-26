import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';

const DB_NAME = 'nsnfarms';
const sqlite = new SQLiteConnection(CapacitorSQLite);
let db: SQLiteDBConnection;

/** Tables included in JSON backups (settings/PIN are deliberately excluded). */
export const TABLES = ['crops','fert_plan','exp_cats','expenses','buyers','revenues','employees','attendance',
  'advances','settlements','adv_alloc','bs_entries','home_cats','home_expenses'];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS crops(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,type TEXT NOT NULL,block TEXT,area REAL DEFAULT 0,start_date TEXT,harvest_date TEXT,status TEXT DEFAULT 'Active',protected INTEGER DEFAULT 0,notes TEXT);
CREATE TABLE IF NOT EXISTS fert_plan(id INTEGER PRIMARY KEY AUTOINCREMENT,crop_id INTEGER NOT NULL,plan_date TEXT NOT NULL,product TEXT NOT NULL,qty REAL DEFAULT 0,unit TEXT,method TEXT,est_cost REAL DEFAULT 0,status TEXT DEFAULT 'Planned',done_date TEXT,actual_cost REAL DEFAULT 0,notes TEXT);
CREATE TABLE IF NOT EXISTS exp_cats(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS expenses(id INTEGER PRIMARY KEY AUTOINCREMENT,date TEXT NOT NULL,crop_id INTEGER,crop_name TEXT,cat_id INTEGER,cat_name TEXT,amount REAL NOT NULL,mode TEXT,notes TEXT);
CREATE TABLE IF NOT EXISTS buyers(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS revenues(id INTEGER PRIMARY KEY AUTOINCREMENT,date TEXT NOT NULL,crop_id INTEGER,crop_name TEXT,buyer_id INTEGER,buyer_name TEXT,qty REAL DEFAULT 0,unit TEXT,rate REAL DEFAULT 0,amount REAL NOT NULL,received REAL DEFAULT 0,notes TEXT);
CREATE TABLE IF NOT EXISTS employees(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,phone TEXT,role TEXT,pay_type TEXT NOT NULL,monthly_salary REAL DEFAULT 0,daily_wage REAL DEFAULT 0,join_date TEXT,end_date TEXT,active INTEGER DEFAULT 1,notes TEXT);
CREATE TABLE IF NOT EXISTS attendance(id INTEGER PRIMARY KEY AUTOINCREMENT,emp_id INTEGER NOT NULL,emp_name TEXT,crop_id INTEGER,crop_name TEXT,date TEXT NOT NULL,mult REAL NOT NULL,wage REAL NOT NULL,settlement_id INTEGER);
CREATE UNIQUE INDEX IF NOT EXISTS ux_att ON attendance(emp_id,date);
CREATE TABLE IF NOT EXISTS advances(id INTEGER PRIMARY KEY AUTOINCREMENT,emp_id INTEGER NOT NULL,date TEXT NOT NULL,amount REAL NOT NULL,remaining REAL NOT NULL,notes TEXT);
CREATE TABLE IF NOT EXISTS settlements(id INTEGER PRIMARY KEY AUTOINCREMENT,emp_id INTEGER NOT NULL,emp_name TEXT,kind TEXT NOT NULL,from_date TEXT,to_date TEXT,gross REAL NOT NULL,adv_ded REAL DEFAULT 0,net REAL NOT NULL,status TEXT DEFAULT 'due',paid_date TEXT,mode TEXT,notes TEXT);
CREATE TABLE IF NOT EXISTS adv_alloc(id INTEGER PRIMARY KEY AUTOINCREMENT,settlement_id INTEGER NOT NULL,advance_id INTEGER NOT NULL,amount REAL NOT NULL);
CREATE TABLE IF NOT EXISTS bs_entries(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,kind TEXT NOT NULL,amount REAL NOT NULL,notes TEXT);
CREATE TABLE IF NOT EXISTS home_cats(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS home_expenses(id INTEGER PRIMARY KEY AUTOINCREMENT,date TEXT NOT NULL,cat_id INTEGER,cat_name TEXT,amount REAL NOT NULL,mode TEXT,notes TEXT);
CREATE TABLE IF NOT EXISTS settings(k TEXT PRIMARY KEY,v TEXT);
`;

export async function openDb() {
  if (!Capacitor.isNativePlatform() && Capacitor.getPlatform() !== 'electron') {
    throw new Error('Encrypted storage needs the Android, iOS or Windows (Electron) build. Browser mode is not supported.');
  }
  // Random 256-bit passphrase generated once; the plugin keeps it in iOS Keychain / Android Keystore-backed storage.
  const stored = (await sqlite.isSecretStored()).result;
  if (!stored) {
    const b = new Uint8Array(32); crypto.getRandomValues(b);
    await sqlite.setEncryptionSecret(Array.from(b, x => x.toString(16).padStart(2, '0')).join(''));
  }
  const exists = (await sqlite.isConnection(DB_NAME, false)).result;
  db = exists ? await sqlite.retrieveConnection(DB_NAME, false)
              : await sqlite.createConnection(DB_NAME, true, 'secret', 1, false);
  await db.open();
  await db.execute(SCHEMA);
  await seed();
}

async function seed() {
  if (!(await q('SELECT id FROM crops WHERE protected=1')).length)
    await run(`INSERT INTO crops(name,type,status,protected) VALUES('General Farm Overhead','overhead','Active',1)`);
  if (!(await q('SELECT id FROM exp_cats')).length)
    for (const n of ['Diesel','Seeds / Planting Material','Fertilizer','Pesticide','Rent / Lease','Repairs & Maintenance','Electricity','Transport','Irrigation','Other'])
      await run('INSERT INTO exp_cats(name) VALUES(?)', [n]);
  if (!(await q('SELECT id FROM home_cats')).length)
    for (const n of ['Petrol','Diesel','Grocery','Entertainment','Travel','Utilities','Medical','Education','Dining','Other'])
      await run('INSERT INTO home_cats(name) VALUES(?)', [n]);
}

export async function q<T = any>(sql: string, p: any[] = []): Promise<T[]> {
  return ((await db.query(sql, p)).values ?? []) as T[];
}
export async function run(sql: string, p: any[] = []) { return db.run(sql, p); }
/** Atomic multi-statement transaction. */
export async function batch(stmts: { statement: string; values: any[] }[]) { await db.executeSet(stmts, true); }
export const S = (statement: string, values: any[] = []) => ({ statement, values });

export async function insert(table: string, o: any) {
  const k = Object.keys(o);
  const r = await run(`INSERT INTO ${table}(${k.join(',')}) VALUES(${k.map(() => '?').join(',')})`, k.map(x => o[x] ?? null));
  return r.changes?.lastId;
}
export async function update(table: string, id: number, o: any) {
  const k = Object.keys(o);
  await run(`UPDATE ${table} SET ${k.map(x => x + '=?').join(',')} WHERE id=?`, [...k.map(x => o[x] ?? null), id]);
}
export async function save(table: string, o: any) {
  const { id, ...rest } = o;
  return id ? update(table, id, rest) : insert(table, rest);
}
export const del = (table: string, id: number) => run(`DELETE FROM ${table} WHERE id=?`, [id]);

export async function getSetting(k: string) { return (await q('SELECT v FROM settings WHERE k=?', [k]))[0]?.v as string | undefined; }
export async function setSetting(k: string, v: string) { await run('INSERT OR REPLACE INTO settings(k,v) VALUES(?,?)', [k, v]); }

export async function exportAll() {
  const tables: any = {};
  for (const t of TABLES) tables[t] = await q(`SELECT * FROM ${t}`);
  return { app: 'NSN Farms', version: 1, exported: new Date().toISOString(), tables };
}
export async function importAll(data: any) {
  if (data?.app !== 'NSN Farms' || !data.tables) throw new Error('Not an NSN Farms backup file');
  const st = TABLES.map(t => S(`DELETE FROM ${t}`));
  for (const t of TABLES)
    for (const r of data.tables[t] ?? []) {
      const k = Object.keys(r);
      st.push(S(`INSERT INTO ${t}(${k.join(',')}) VALUES(${k.map(() => '?').join(',')})`, k.map(x => r[x])));
    }
  await batch(st);
  await seed();
}
