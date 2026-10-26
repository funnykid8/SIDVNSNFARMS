# NSN Farms ERP — browser + native

Original React screens and business logic retained. Browser mode uses SQLite (sql.js) persisted in IndexedDB. Native mode continues using the original Capacitor SQLite implementation.

## Run
`npm install` then `npm run dev` or `npm run build`.

## Deploy
- **Vercel:** Import GitHub repository; Vite preset, build `npm run build`, output `dist`.
- **Netlify:** Import GitHub repository; configuration in `netlify.toml`.
- **GitHub Pages:** Repository Settings → Pages → Source: GitHub Actions. Push to `main`.

## Important browser storage limits
Data is saved **only in the current browser/profile/device**, not shared across devices. Clearing site storage or using private browsing can erase it. Export JSON backups regularly. Browser PIN does **not** encrypt IndexedDB; use trusted devices. The native app retains its original encrypted SQLite storage. For secure shared accounts and cloud sync, a server-side database and authentication are needed.

Browser SQLite WebAssembly is loaded from cdnjs; the website needs network access on first load.
