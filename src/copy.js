import { spawnSync } from 'node:child_process';
import { mkdirSync, cpSync } from 'node:fs';

/**
 * Sync the build output directory into the run (temp) directory.
 *
 * @param {string} srcDir   build output dir (TargetDir)
 * @param {string} destDir  temp run dir
 * @param {'additive'|'mirror'} mode
 */
export function syncOutput(srcDir, destDir, mode) {
  mkdirSync(destDir, { recursive: true });
  console.log(`==> copy (${mode}) ${srcDir} -> ${destDir}`);

  if (process.platform === 'win32') {
    robocopy(srcDir, destDir, mode);
  } else {
    rsyncOrCp(srcDir, destDir, mode);
  }
}

function robocopy(src, dest, mode) {
  // /MT = multithreaded. additive => /E (copy incl. empty dirs, keep extras),
  // mirror => /MIR (mirror tree, purge extras). Quieten the noisy output.
  const args = [src, dest, '/MT', '/NFL', '/NDL', '/NP', '/NJH', '/NJS'];
  args.push(mode === 'mirror' ? '/MIR' : '/E');

  const res = spawnSync('robocopy', args, { stdio: 'inherit' });
  if (res.error) throw new Error(`failed to start robocopy: ${res.error.message}`);
  // robocopy uses exit codes 0-7 for success (bits indicate what it did);
  // 8 and above mean a real failure.
  if (res.status >= 8) {
    throw new Error(
      `robocopy failed (exit ${res.status}). ` +
      `A locked file (e.g. a still-running prior instance) is the usual cause.`
    );
  }
}

function rsyncOrCp(src, dest, mode) {
  const hasRsync = spawnSync('rsync', ['--version'], { stdio: 'ignore' }).status === 0;
  if (hasRsync) {
    const args = ['-a'];
    if (mode === 'mirror') args.push('--delete');
    args.push(src.endsWith('/') ? src : `${src}/`, dest); // trailing slash = copy contents
    const res = spawnSync('rsync', args, { stdio: 'inherit' });
    if (res.status !== 0) throw new Error(`rsync failed (exit ${res.status})`);
  } else {
    // No rsync: fall back to a recursive copy (additive; cannot purge).
    cpSync(src, dest, { recursive: true });
  }
}
