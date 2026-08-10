import { useSyncExternalStore } from 'react';
import {
  courseHasActiveInstall,
  getPackInstallJob,
  getPackInstallJobsVersion,
  subscribePackInstallJobs,
  type PackInstallJob,
} from '@/packs/pack-install-jobs';

function subscribe(cb: () => void) {
  return subscribePackInstallJobs(cb);
}

/** Subscribe to install-job updates (version counter). */
export function usePackInstallJobsVersion(): number {
  return useSyncExternalStore(
    subscribe,
    getPackInstallJobsVersion,
    getPackInstallJobsVersion,
  );
}

export function usePackInstallJob(key: string): PackInstallJob | undefined {
  // Reading the version subscribes; then read the latest job for this key.
  usePackInstallJobsVersion();
  return getPackInstallJob(key);
}

export function useCourseInstallActive(
  categoryCode: string,
  subjectCode: string,
): boolean {
  usePackInstallJobsVersion();
  return courseHasActiveInstall(categoryCode, subjectCode);
}
