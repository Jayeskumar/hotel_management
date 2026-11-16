# On-premise edition (Windows installer)

The cloud and on-premise editions are built from **the same code**. One setting —
`DEPLOYMENT_MODE=cloud|onprem` — switches the behaviour that differs:

| | Cloud | On-premise |
|---|---|---|
| Tenancy | many organisations, self-serve signup | exactly one organisation, created by the setup wizard |
| Web app | served by nginx (or the API with `WEB_DIR`) | served by the API on one port (8080) |
| Database | managed PostgreSQL | private PostgreSQL 17 bundled in the installer, listening on 127.0.0.1 only |
| Licensing | subscription (not enforced in code) | offline signed licence key, 30-day trial |
| Backups | managed by the database provider | nightly + before every upgrade + on demand, kept in `C:\ProgramData\TableWise\backups` |
| Cookies | `Secure` (HTTPS) | not `Secure` (plain HTTP on the restaurant LAN) |

## What the installer does

`TableWise-Setup-<version>-x64.exe` (~53 MB) installs:

```
C:\Program Files\TableWise\
  app\server.mjs        the API + launcher, bundled into one file (apps/api/src/onprem/launcher.ts)
  app\web\              the built web app
  app\drizzle\          database migrations
  node\node.exe         Node.js 22 runtime
  pgsql\                PostgreSQL 17 server binaries (official EnterpriseDB build)
  service\              WinSW 2.12 service wrapper + TableWiseService.xml
  tablewise.cmd         support commands
C:\ProgramData\TableWise\   (created on first run; kept on upgrade/uninstall unless the user chooses to delete it)
  config.json  pgdata\  backups\  logs\
```

1. Stops the service if this is an upgrade, replaces the program files (data is untouched).
2. Restricts `C:\ProgramData\TableWise` to SYSTEM + Administrators (it holds the database and secrets).
3. Registers the **"TableWise Restaurant Server"** Windows service: automatic (delayed) start,
   restarts on failure, rolling logs.
4. Adds a firewall rule allowing `node.exe` from the **local subnet only**.
5. Starts the service and waits until it answers, then adds Start-menu/desktop shortcuts that open
   TableWise in a chrome-less Edge window (plus a "Kitchen Display" shortcut).

On first start the launcher generates a random database password and JWT secret (nothing secret is
inside the installer), creates the PostgreSQL cluster, runs migrations and serves the web app.
The browser shows the **setup wizard** to create the owner account and first branch.

Other devices (waiter tablets, kitchen screens, more counters) open `http://<server-pc-ip>:8080`.
**Settings → System** shows the address with a QR code. Advise customers to give the server PC a
fixed IP in their router.

### Requirements
Windows 10/11 64-bit, 4 GB RAM (8 GB recommended), SSD, ~1 GB free disk plus room for backups,
the PC left switched on during service. Wired LAN for the server PC is recommended.

## Licences

Licences are verified offline with an Ed25519 public key compiled into the server.

```bash
# once, before the first customer release — keep the private key offline
npm run license:keygen -- --out ~/tablewise-vendor/license-private.pem
git add apps/api/src/lib/license-public-key.ts && git commit -m "Production licence key"

# per customer
npm run license:issue -- --key ~/tablewise-vendor/license-private.pem \
  --customer "Thendral Foods Pvt Ltd" --outlets 3 --edition standard --expires 2027-12-31
```

The customer pastes the key in **Settings → System → Licence**.

* **Trial:** 30 days from first start, 1 branch.
* **When a trial or licence expires**, new orders are blocked (HTTP 402, message in Tamil/English).
  Open bills can still be settled and all reports stay available, so a restaurant is never stuck
  mid-service with unpaid tables.
* `maxOutlets` limits how many branches can be created.
* The repository ships with a **development key** (`tools/license/dev-private-key.pem`). Builds warn
  about it and `--release` builds (and tagged CI releases) refuse to package it.
* Licence state lives in the database, so restoring an old backup also restores the licence that was
  active then; re-enter the key if needed.

## Backups and restore

* Nightly at 23:00 (configurable in `config.json`: `backupHour`, `backupKeep` = 14).
* Automatically before a new version runs its migrations (`…-pre-upgrade.dump`).
* **Settings → System → Back up now**, or `tablewise backup`.
* Restore: `tablewise restore "D:\backups\tablewise-20261116-230000-nightly.dump"` from an
  Administrator prompt. It queues the restore and restarts the service, which backs up the current
  data first (`…-before-restore.dump`) and then restores. (On Windows only the service account can
  touch the database files, so the restore always runs inside the service.)
* Backups are PostgreSQL custom-format dumps. **Customers must copy them off the PC** (USB / cloud
  drive) — a disk failure otherwise loses everything. Consider offering a paid off-site backup add-on.

## Support commands

From an Administrator command prompt in `C:\Program Files\TableWise`:

```
tablewise info                                  version, ports, LAN addresses, recent backups
tablewise backup                                backup now (service must be running)
tablewise restore <file.dump>                   restore (service restarts)
tablewise reset-password <email> <new-password> reset a password and unlock the account
```

Logs: `C:\ProgramData\TableWise\logs\TableWise.out.log` (server) and `postgresql.log`.

## Building the installer

Works on Linux, macOS or Windows (needs Node 22, `makensis`, `unzip`, `curl`):

```bash
sudo apt-get install -y nsis unzip          # Debian/Ubuntu
node packaging/windows/build.mjs            # → dist/windows/TableWise-Setup-<version>-x64.exe
node packaging/windows/build.mjs --release  # refuses the development licence key
```

Downloads are cached in `.cache/windows`; PostgreSQL and WinSW downloads are checked against pinned
SHA-256 checksums. Versions can be overridden with `NODE_WIN_VERSION`, `PG_WIN_VERSION` (+ `PG_WIN_SHA256`).

The GitHub Actions workflow **Windows installer** builds it on demand or for every `v*` tag and
attaches it to a GitHub release.

### Code signing
Unsigned installers trigger Windows SmartScreen warnings ("Windows protected your PC"). Buy an OV/EV
code-signing certificate and add repository secrets `WINDOWS_SIGN_PFX_BASE64` and
`WINDOWS_SIGN_PASSWORD`; the build signs with `osslsigncode` automatically. (EV certificates on
hardware tokens need signing on a machine with the token, or a cloud signing service.)

## Linux / server rooms

The same image runs on Linux with Docker (`docker compose up`, see README). Set
`DEPLOYMENT_MODE=onprem` and `COOKIE_SECURE=false` for a LAN install without HTTPS.

## Test checklist on real Windows (before shipping)

The installer is built and the bundled server was tested end to end on Linux with real PostgreSQL
binaries, but these must be checked on Windows 10 and 11 machines:

- [ ] Fresh install as Administrator → service running, setup wizard opens from the shortcut
- [ ] A phone/tablet on the same Wi-Fi opens `http://<ip>:8080` (firewall rule works on Public and Private networks)
- [ ] Reboot → service starts without anyone logging in
- [ ] `tablewise backup`, `tablewise restore`, `tablewise reset-password`
- [ ] Upgrade by running a newer installer → data kept, pre-upgrade backup present
- [ ] Uninstall with "keep data", reinstall → data still there; uninstall with "delete data"
- [ ] Thermal-printer bill printing from Edge (Tamil text renders)
- [ ] Antivirus (Windows Defender, Quick Heal, etc.) does not quarantine node.exe/postgres.exe
