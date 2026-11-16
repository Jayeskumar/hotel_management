TableWise — on-premise installation
===================================

OPENING TABLEWISE
  On this PC: Start menu → TableWise (or the desktop icon).
  On tablets, phones, kitchen screens and other counters on the SAME Wi-Fi / LAN:
  open a browser and go to  http://<this-PC's-IP-address>:8080
  (Settings → System inside TableWise shows the exact address and a QR code to scan.)

  Tip: give this PC a fixed IP address in your router so the address never changes.

THE TABLEWISE SERVICE
  TableWise runs as a Windows service ("TableWise Restaurant Server") and starts
  automatically with Windows — nobody needs to log in. Keep this PC switched on during service.
    net stop TableWise      stop      (from an Administrator command prompt)
    net start TableWise     start

WHERE YOUR DATA IS
  C:\ProgramData\TableWise\
    pgdata\    the database (do not edit)
    backups\   automatic backups — one every night at 11 pm and before every upgrade
    logs\      log files to send to support
    config.json  ports and backup settings (stop the service before editing)

  COPY THE BACKUPS FOLDER TO A USB DRIVE OR CLOUD STORAGE REGULARLY. If this PC's disk
  fails, the backups are your only copy of your sales history.

SUPPORT COMMANDS (Administrator command prompt, in C:\Program Files\TableWise)
  tablewise info                                   status, ports, network addresses
  tablewise backup                                 take a backup now
  tablewise restore "D:\backup\tablewise-….dump"   restore a backup (the service restarts)
  tablewise reset-password owner@example.com NewPassword123

UPGRADING
  Run the new TableWise-Setup-x.y.z.exe. Your data is kept, and a backup is taken
  automatically before the new version starts.

UNINSTALLING
  Settings → Apps → TableWise → Uninstall. You will be asked whether to keep your data.
