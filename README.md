# ALAMIN BHAI PRO

A starter full-stack Free Fire top-up storefront with:
- Public diamond package list and order form
- bKash and Nagad manual payment instructions
- Server-side order storage in SQLite
- Admin login and order status management
- WhatsApp order notification

## Run locally

1. Install Node.js 20 or newer.
2. Copy `.env.example` to `.env`.
3. Set a long random `SESSION_SECRET` and a strong, unique `ADMIN_PASSWORD`.
4. Set the correct bKash/Nagad merchant numbers only if you are authorized to receive business payments.
5. Run:

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## Deploy

Deploy this Node.js project to a host that supports persistent storage (for example, a Node web service with a persistent disk/volume). Set all variables from `.env.example` in the host's environment settings. Set `NODE_ENV=production`, use HTTPS, and mount persistent storage for the SQLite database path.

Do not upload `.env` or secrets to GitHub. Do not use a temporary filesystem for the database: orders may disappear after a restart/redeploy. Use a managed database for production scale.

## Important limitations

- This starter uses manual payment verification. A Transaction ID is only a customer claim; an admin must verify payment in the official merchant account before marking it Paid/Completed.
- It does not process or collect payments automatically.
- It does not deliver diamonds automatically. An authorized top-up provider/API and its official documentation are required before adding automation.
- The included package prices are sample values. Update them to your actual approved prices before launch.
- Admin credentials are configured by environment variables on first startup. If the admin user already exists, changing `ADMIN_PASSWORD` alone does not rotate the existing password; use a proper admin password-reset migration before production.
- Use only authorized top-up sources and follow Garena/provider terms. This is an independent store concept, not an official Garena website.

## Before public launch

- Replace sample prices and merchant payment numbers.
- Use a strong unique admin password and random session secret.
- Configure HTTPS and persistent database storage.
- Add backups, CSRF protection, audit logs, and a production-grade session store.
- Test orders and payment verification with small, authorized test transactions.
