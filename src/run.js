import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Launch the copied executable from the temp run directory.
 *
 * @param {string} tempDir   run directory (cwd for the process)
 * @param {string} exeName   executable file name (e.g. Rephlo.exe)
 * @param {string[]} appArgs args forwarded to the executable
 * @param {boolean} detach   true = launch and return; false = attach + wait
 * @returns {Promise<number>} exit code (0 when detached)
 */
export function launch(tempDir, exeName, appArgs, detach) {
  const exePath = join(tempDir, exeName);
  if (!existsSync(exePath)) {
    throw new Error(`Executable not found: ${exePath} (did the build/copy run?)`);
  }

  const argStr = appArgs.length ? ` ${appArgs.join(' ')}` : '';
  console.log(`==> run ${exePath}${argStr}`);

  if (detach) {
    const child = spawn(exePath, appArgs, {
      cwd: tempDir,
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    console.log(`==> launched detached (PID ${child.pid})`);
    return Promise.resolve(0);
  }

  return new Promise((resolve, reject) => {
    const child = spawn(exePath, appArgs, { cwd: tempDir, stdio: 'inherit' });

    const forward = () => { if (!child.killed) child.kill(); };
    process.on('SIGINT', forward);
    process.on('SIGTERM', forward);

    child.on('error', reject);
    child.on('exit', (code) => {
      process.off('SIGINT', forward);
      process.off('SIGTERM', forward);
      resolve(code ?? 0);
    });
  });
}
