# Test launch on Hetzner

Goal: Fiduxa runs on a real server at **https://test.fiduxa.de**. The site is behind a password, PayPal stays in **sandbox** mode (no real money), and search engines are told not to index it. Every push to `main` that passes the tests deploys automatically.

What runs on the server, all in Docker:

| Container | Job |
|---|---|
| `caddy` | HTTPS certificate (automatic), password gate, routes `/api` to the API and everything else to the website |
| `web` | Next.js website |
| `api` | Express API |
| `worker` | Background jobs (emails, reminders, payouts, …) |
| `mongo` | Database `fiduxa_test`, not reachable from the internet, backed up nightly |

Cost: Hetzner **CX22** (2 vCPU, 4 GB RAM), about 4–5 €/month.

---

## 1. Create the server (Hetzner Cloud Console)

1. Go to https://console.hetzner.cloud, create a project called "Fiduxa", then **Add Server**:
   - Location: **Falkenstein** or **Nuremberg** (Germany)
   - Image: **Ubuntu 24.04**
   - Type: **CX22**
   - SSH key: add your Mac's key (`cat ~/.ssh/id_ed25519.pub`)
   - Name: `fiduxa-test`
2. Note the server's **IPv4 address**.

## 2. Point the domain to the server

At your domain provider, add a DNS record:

| Type | Name | Value |
|---|---|---|
| A | `test` | the server's IPv4 address |

It can take a few minutes until `test.fiduxa.de` resolves.

## 3. Prepare the server (once)

From your Mac:

```bash
scp deploy/hetzner/server-setup.sh root@SERVER_IP:/root/
ssh root@SERVER_IP 'bash /root/server-setup.sh'
```

At the end the script prints a **deploy key**. Add it on GitHub under **repo → Settings → Deploy keys → Add deploy key**, title "Hetzner test server", read access only.

## 4. Get the code onto the server and configure it

```bash
ssh root@SERVER_IP
sudo -iu deploy
git clone git@github.com:UjjvalDE/fiduxa.git /opt/fiduxa
cd /opt/fiduxa
```

**Gate and domain:**

```bash
cp deploy/hetzner/.env.example deploy/hetzner/.env
docker run --rm caddy:2-alpine caddy hash-password --plaintext 'CHOOSE-A-TESTER-PASSWORD'
nano deploy/hetzner/.env
```

In `.env`, fill in `ACME_EMAIL` and paste the hash into `GATE_PASSWORD_HASH`. Write every `$` in the hash as `$$`.

**App settings:**

```bash
cp server/.env.example server/.env
nano server/.env
```

Fill in `server/.env` as follows:

- **New secrets**, different from your Mac. Generate each one with `openssl rand -hex 32`:
  - `JWT_SECRET`
  - `BANK_DETAILS_ENCRYPTION_KEY`. Never change it later, or saved bank details become unreadable.
- **PayPal sandbox keys** (`PAYPALAPIKEY`, `PAYPALSECRET_KEY`). Do **not** set `PAYPAL_MODE=live`.
- **Email (`SMTP_*`, `SMTP_FROM`, `ADMIN_NOTIFICATION_EMAIL`):** your email provider's SMTP settings.
- **Leave empty:** Google and Apple login for now.
- **Leave out, the stack sets them itself:** `MONGODB_URI`, `NODE_ENV`, `PORT`, `PUBLIC_SITE_URL`, `CLIENT_URL` and `TRUST_PROXY`.

## 5. Start

```bash
bash deploy/hetzner/deploy.sh
```

The first build takes about 5–10 minutes. Then open **https://test.fiduxa.de**, sign in with `fiduxa` and the tester password, and the site should appear.

**First admin account:**

```bash
cd /opt/fiduxa/deploy/hetzner
docker compose --env-file .env exec api node src/scripts/create-admin.js
```

**Optional: dummy data** for click-testing (100 customers, 20 cleaners with test documents). All dummy email addresses end in `.invalid`, so no email ever reaches them.

```bash
docker compose --env-file .env exec -e NODE_ENV=staging api node src/scripts/seed-dummy.js generate
docker compose --env-file .env exec -e NODE_ENV=staging api node src/scripts/seed-dummy-documents.js
```

## 6. Automatic deploys from GitHub

1. On your Mac, create a key that only GitHub Actions uses:

   ```bash
   ssh-keygen -t ed25519 -N "" -C "github-actions-deploy" -f ~/.ssh/fiduxa_actions
   ```

2. Allow it on the server:

   ```bash
   ssh root@SERVER_IP "cat >> /home/deploy/.ssh/authorized_keys" < ~/.ssh/fiduxa_actions.pub
   ```

3. On GitHub, go to **repo → Settings → Secrets and variables → Actions** and add:
   - `TEST_SERVER_HOST`: the server IP
   - `TEST_SERVER_SSH_KEY`: the content of `~/.ssh/fiduxa_actions`, the private key. Paste it only here.

From then on, every push to `main` runs CI (all tests). When CI is green, the code is deployed. You can also start a deploy by hand under **Actions → Deploy test server → Run workflow**.

## 7. Day-to-day

| Task | Command (on the server, as `deploy`, in `/opt/fiduxa/deploy/hetzner`) |
|---|---|
| Status | `docker compose --env-file .env ps` |
| Logs | `docker compose --env-file .env logs -f api` (or `web`, `worker`, `caddy`) |
| Restart | `docker compose --env-file .env restart api worker` |
| Backup now | `bash backup.sh` (nightly at 03:15 automatically, kept 14 days in `backups/`) |
| Restore | `docker compose --env-file .env exec -T mongo mongorestore --gzip --archive=/backups/FILE.gz --drop` |

## Before the real launch (not part of the test launch)

- Company data on invoices: Steuernummer or USt-IdNr., HRB, managing director
- Impressum, AGB and Datenschutz updated (PayPal only; legal model Q1, VAT Q2)
- PayPal live credentials and `PAYPAL_MODE=live`
- Production domain `fiduxa.de`, remove the password gate and `noindex`
- Email domain with SPF and DKIM (also needed for Apple "Hide my email")
- Google and Apple login keys (redirect URIs listed in the OAuth notes)
