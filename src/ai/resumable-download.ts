import * as FileSystem from 'expo-file-system/legacy';

export type ResumePhase = 'download' | 'resume' | 'retry';

type Snapshot = {
  url: string;
  fileUri: string;
  options?: Record<string, unknown>;
  resumeData?: string;
};

async function readSnapshot(path: string): Promise<Snapshot | null> {
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return null;
    const parsed = JSON.parse(await FileSystem.readAsStringAsync(path)) as Snapshot;
    if (!parsed?.url || !parsed?.fileUri) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeSnapshot(path: string, snap: Snapshot) {
  await FileSystem.writeAsStringAsync(path, JSON.stringify(snap));
}

async function clearSnapshot(path: string) {
  await FileSystem.deleteAsync(path, { idempotent: true });
}

async function fileSize(uri: string): Promise<number> {
  const info = await FileSystem.getInfoAsync(uri);
  return info.exists && 'size' in info && typeof info.size === 'number' ? info.size : 0;
}

function isOkStatus(status: number | undefined) {
  return status == null || (status >= 200 && status < 300);
}

type Task = ReturnType<typeof FileSystem.createDownloadResumable>;

async function captureResume(task: Task, snapshotPath: string, url: string, dest: string) {
  try {
    const paused = await task.pauseAsync();
    await writeSnapshot(snapshotPath, {
      url: paused.url || url,
      fileUri: paused.fileUri || dest,
      options: paused.options as Record<string, unknown> | undefined,
      resumeData: paused.resumeData,
    });
  } catch {
    const savable = task.savable();
    if (savable?.resumeData) {
      await writeSnapshot(snapshotPath, {
        url: savable.url || url,
        fileUri: savable.fileUri || dest,
        options: savable.options as Record<string, unknown> | undefined,
        resumeData: savable.resumeData,
      });
    }
  }
}

async function runAttempt(opts: {
  url: string;
  dest: string;
  expectedBytes: number;
  snapshotPath: string;
  resume: boolean;
  phase: ResumePhase;
  onProgress: (written: number, total: number, phase: ResumePhase) => void;
}): Promise<void> {
  const { url, dest, expectedBytes, snapshotPath, resume, phase, onProgress } = opts;
  const total = Math.max(expectedBytes, 1);
  let snapshot = resume ? await readSnapshot(snapshotPath) : null;
  if (snapshot && snapshot.url !== url) {
    snapshot = null;
    await clearSnapshot(snapshotPath);
  }

  const existing = await fileSize(dest);
  if (existing === expectedBytes) {
    onProgress(expectedBytes, total, phase);
    await clearSnapshot(snapshotPath);
    return;
  }

  const canResume = Boolean(resume && snapshot?.resumeData && existing > 0);
  if (!canResume && existing > 0) {
    await FileSystem.deleteAsync(dest, { idempotent: true });
  }

  await writeSnapshot(snapshotPath, {
    url,
    fileUri: dest,
    resumeData: canResume ? snapshot?.resumeData : undefined,
    options: snapshot?.options,
  });

  const task = FileSystem.createDownloadResumable(
    url,
    dest,
    {},
    (p) => {
      const written = p.totalBytesWritten || 0;
      const expected = Math.max(p.totalBytesExpectedToWrite || expectedBytes, 1);
      onProgress(written, expected, phase);
    },
    canResume ? snapshot?.resumeData : undefined,
  );

  let result: { status?: number } | undefined;
  try {
    result = canResume ? await task.resumeAsync() : await task.downloadAsync();
  } catch (error) {
    await captureResume(task, snapshotPath, url, dest);
    throw error;
  }

  if (!result || !isOkStatus(result.status)) {
    await captureResume(task, snapshotPath, url, dest);
    throw Error(`Download failed (${result?.status ?? 'no result'})`);
  }

  const size = await fileSize(dest);
  if (size !== expectedBytes) {
    await captureResume(task, snapshotPath, url, dest);
    throw Error(`Download incomplete. Expected ${expectedBytes} bytes, got ${size}.`);
  }

  await clearSnapshot(snapshotPath);
  onProgress(expectedBytes, total, phase);
}

/**
 * Download a file with resume support. On failure: retry resume once, then restart.
 */
export async function downloadResumableFile(opts: {
  url: string;
  dest: string;
  expectedBytes: number;
  snapshotPath: string;
  onProgress?: (written: number, total: number, phase: ResumePhase) => void;
}): Promise<void> {
  const { url, dest, expectedBytes, snapshotPath, onProgress } = opts;
  const report = onProgress ?? (() => undefined);
  const destDir = dest.slice(0, dest.lastIndexOf('/') + 1);
  if (destDir) await FileSystem.makeDirectoryAsync(destDir, { intermediates: true });

  if ((await fileSize(dest)) === expectedBytes) {
    report(expectedBytes, expectedBytes, 'download');
    await clearSnapshot(snapshotPath);
    return;
  }

  if (typeof FileSystem.createDownloadResumable !== 'function') {
    const result = await FileSystem.downloadAsync(url, dest);
    if (!result || result.status < 200 || result.status >= 300) {
      throw Error(`Download failed (${result?.status ?? 'no result'})`);
    }
    const size = await fileSize(dest);
    if (size !== expectedBytes) {
      await FileSystem.deleteAsync(dest, { idempotent: true });
      throw Error(`Download incomplete. Expected ${expectedBytes} bytes, got ${size}.`);
    }
    report(expectedBytes, expectedBytes, 'download');
    return;
  }

  try {
    await runAttempt({
      url,
      dest,
      expectedBytes,
      snapshotPath,
      resume: true,
      phase: 'download',
      onProgress: report,
    });
    return;
  } catch {
    report(await fileSize(dest), expectedBytes, 'retry');
  }

  try {
    await runAttempt({
      url,
      dest,
      expectedBytes,
      snapshotPath,
      resume: true,
      phase: 'resume',
      onProgress: report,
    });
    return;
  } catch {
    await FileSystem.deleteAsync(dest, { idempotent: true });
    await clearSnapshot(snapshotPath);
    report(0, expectedBytes, 'retry');
  }

  await runAttempt({
    url,
    dest,
    expectedBytes,
    snapshotPath,
    resume: false,
    phase: 'retry',
    onProgress: report,
  });
}
