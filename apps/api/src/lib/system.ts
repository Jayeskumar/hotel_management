/**
 * Hooks the on-prem launcher provides to the API (backups, data location).
 * In the cloud these are absent and the related endpoints report "not available".
 */
export interface BackupInfo {
  file: string;
  sizeBytes: number;
  createdAt: string;
}

export interface SystemHooks {
  dataDir?: string;
  backupNow?: () => Promise<BackupInfo>;
  listBackups?: () => Promise<BackupInfo[]>;
}
