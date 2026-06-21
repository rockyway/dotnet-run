import { spawnSync } from 'node:child_process';

/**
 * Build the project in place (output lands in bin/ as usual, which is fine —
 * we run from a copy, so bin/ stays unlocked).
 *
 * @param {string} csproj
 * @param {string} configuration  Debug | Release
 */
export function build(csproj, configuration) {
  console.log(`==> dotnet build ${csproj} -c ${configuration}`);
  const res = spawnSync('dotnet', ['build', csproj, '-c', configuration], {
    stdio: 'inherit',
  });
  if (res.error) throw new Error(`failed to start dotnet: ${res.error.message}`);
  if (res.status !== 0) throw new Error(`dotnet build failed (exit ${res.status})`);
}
