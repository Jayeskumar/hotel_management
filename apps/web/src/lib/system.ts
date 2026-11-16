import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export type LicenseState = 'cloud' | 'licensed' | 'trial' | 'trial_expired' | 'expired';

export interface SystemInfo {
  mode: 'cloud' | 'onprem';
  version: string;
  setupRequired: boolean;
  signupAllowed: boolean;
  license: { state: LicenseState; canOperate: boolean; daysLeft: number | null };
}

/** Public installation info: decides between sign-in and first-run setup, and drives licence banners. */
export function useSystemInfo() {
  return useQuery({
    queryKey: ['system-info'],
    queryFn: () => api.get<SystemInfo>('/system/info'),
    staleTime: 60_000,
  });
}
