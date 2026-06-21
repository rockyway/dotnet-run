import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, isAbsolute, resolve as resolvePath } from 'node:path';

import { parseCliArgs } from './args.js';
import { resolveProject } from './resolve.js';
import { build } from './build.js';
import { syncOutput } from './copy.js';
import { launch } from './run.js';

const HELP = `dotnetrun — build a .NET project, copy its output to a temp dir, and run it there.

Runs the binary from a separate folder so bin/ stays unlocked and coding
agents/tools can keep rebuilding.

Usage:
  dotnetrun --project <path> [options] [-- <app args>]

Options:
  -p, --project <path>        .csproj file or directory containing one (required)
  -c, --configuration <cfg>   Debug | Release            (default: Debug)
      --temp <path>           explicit run dir           (default: <tempRoot>/<name>-dev)
      --sync <additive|mirror> copy mode                 (default: additive)
      --no-build              skip build (copy + run only)
      --no-run               build + copy only
      --detach               launch and return (default: attach, stream logs, Ctrl+C stops)
  -h, --help                 show this help
      --                      forward all following args to the executable

Examples:
  dotnetrun --project ./Rephlo.UI
  dotnetrun -p ./Rephlo.UI -c Release --detach
  dotnetrun -p ./Rephlo.UI -- --enable-langfuse
`;

/**
 * Default root for the run/temp directory, adapted to the OS.
 * Windows: D:\\temp (falls back to the system temp dir if D:\\ is absent).
 * macOS/Linux: the system temp dir.
 */
function defaultTempRoot() {
  if (process.platform === 'win32') {
    return existsSync('D:\\') ? 'D:\\temp' : tmpdir();
  }
  return tmpdir();
}

export async function run(argv) {
  const { values, appArgs } = parseCliArgs(argv);

  if (values.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (!values.project) {
    process.stdout.write(HELP);
    throw new Error('--project is required');
  }

  const configuration = normalizeConfiguration(values.configuration);
  const mode = normalizeSync(values.sync);

  const resolved = resolveProject(values.project, configuration);

  const tempDir = values.temp
    ? (isAbsolute(values.temp) ? values.temp : resolvePath(values.temp))
    : join(defaultTempRoot(), `${resolved.assemblyName.toLowerCase()}-dev`);

  console.log(`==> project : ${resolved.csproj}`);
  console.log(`==> assembly: ${resolved.assemblyName} (${configuration})`);
  console.log(`==> runDir  : ${tempDir}`);

  if (values.build) {
    build(resolved.csproj, configuration);
  } else {
    console.log('==> skip build (--no-build)');
  }

  syncOutput(resolved.targetDir, tempDir, mode);

  if (values.run) {
    return await launch(tempDir, resolved.exeName, appArgs, values.detach);
  }
  console.log('==> skip run (--no-run)');
  return 0;
}

function normalizeConfiguration(value) {
  const v = String(value).toLowerCase();
  if (v === 'debug') return 'Debug';
  if (v === 'release') return 'Release';
  throw new Error(`invalid --configuration "${value}" (expected Debug or Release)`);
}

function normalizeSync(value) {
  const v = String(value).toLowerCase();
  if (v === 'additive' || v === 'mirror') return v;
  throw new Error(`invalid --sync "${value}" (expected additive or mirror)`);
}
