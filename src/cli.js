import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, isAbsolute, resolve as resolvePath } from 'node:path';

import { parseCliArgs } from './args.js';
import { resolveWorktree } from './worktree.js';
import { resolveProject } from './resolve.js';
import { build } from './build.js';
import { syncOutput } from './copy.js';
import { launch } from './run.js';
import { resolveLaunchProfile, splitCommandLine } from './launchProfile.js';

const HELP = `dotnetrun — build a .NET project, copy its output to a temp dir, and run it there.

Runs the binary from a separate folder so bin/ stays unlocked and coding
agents/tools can keep rebuilding.

Usage:
  dotnetrun --project <path> [options] [-- <app args>]
  dotnetrun --project <path> [options] --args <app args>

Options:
  -p, --project <path>        .csproj file or directory containing one (required)
  -b, --branch <name>         run against the Git worktree registered for <name>
                              (--project, --temp resolve relative to that worktree)
  -c, --configuration <cfg>   Debug | Release            (default: Debug)
      --temp <path>           explicit run dir           (default: <tempRoot>/<name>-dev)
      --sync <additive|mirror> copy mode                 (default: additive)
      --no-build              skip build (copy + run only)
      --no-run               build + copy only
      --detach               launch and return (default: attach, stream logs, Ctrl+C stops)
      --launch-profile <name> apply a profile from Properties/launchSettings.json
                              (env vars, applicationUrl, commandLineArgs)
                              default: first profile with commandName "Project"
                              (same default dotnet run uses)
      --no-launch-profile     don't apply any launch profile
      --env <KEY=VALUE>       set an env var on the child (repeatable, highest
                              precedence — overrides the launch profile)
  -h, --help                 show this help
      --                      forward all following args to the executable
      --args                  same as --, but survives PowerShell (which drops a bare --)

Examples:
  dotnetrun --project ./TodoApp.UI
  dotnetrun -b feature/login --project ./TodoApp.UI
  dotnetrun -p ./TodoApp.UI -c Release --detach
  dotnetrun -p ./TodoApp.UI -- --enable-langfuse
  dotnetrun -p ./TodoApp.UI --args --enable-langfuse   # PowerShell-safe
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

  if (values.branch) {
    const worktreeDir = resolveWorktree(values.branch, process.cwd());
    console.log(`==> branch  : ${values.branch} (${worktreeDir})`);
    process.chdir(worktreeDir);
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

  const profileName = values['launch-profile'];
  if (profileName && values['no-launch-profile']) {
    throw new Error('--launch-profile and --no-launch-profile are mutually exclusive');
  }

  let env;
  let effectiveAppArgs = appArgs;

  if (!values['no-launch-profile']) {
    const profile = resolveLaunchProfile(resolved.projectDir, profileName);
    if (profile) {
      env = { ...process.env, ...profile.env, DOTNET_LAUNCH_PROFILE: profile.name };
      if (profile.applicationUrl && !profile.externalUrlConfiguration && !env.ASPNETCORE_URLS) {
        env.ASPNETCORE_URLS = profile.applicationUrl;
      }
      if (appArgs.length === 0 && profile.commandLineArgs) {
        effectiveAppArgs = splitCommandLine(profile.commandLineArgs);
      }
      console.log(`==> launch-profile: ${profile.name}${profileName ? '' : ' (default)'}`);
    }
  }

  if (values.env?.length) {
    env = env ?? { ...process.env };
    for (const kv of values.env) {
      const eq = kv.indexOf('=');
      if (eq === -1) throw new Error(`invalid --env "${kv}" (expected KEY=VALUE)`);
      env[kv.slice(0, eq)] = kv.slice(eq + 1);
    }
  }

  if (values.run) {
    return await launch(tempDir, resolved.exeName, effectiveAppArgs, values.detach, env);
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
