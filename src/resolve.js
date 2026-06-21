import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve as resolvePath, extname, basename } from 'node:path';

const isWindows = process.platform === 'win32';
const exeExt = isWindows ? '.exe' : '';

/**
 * Resolve everything needed to build, copy, and run a .NET project.
 *
 * @param {string} projectArg   path to a .csproj file or a directory containing one
 * @param {string} configuration  Debug | Release
 * @returns {{ csproj: string, projectDir: string, assemblyName: string, targetDir: string, exeName: string }}
 */
export function resolveProject(projectArg, configuration) {
  const csproj = findCsproj(projectArg);
  const projectDir = resolvePath(csproj, '..');

  const props = queryMsbuild(csproj, configuration);
  let assemblyName = props.AssemblyName;
  let targetDir = props.TargetDir;

  // Fallback: locate the freshly produced exe by scanning the bin tree.
  if (!assemblyName || !targetDir || !existsSync(targetDir)) {
    const found = scanForExe(join(projectDir, 'bin', configuration));
    if (found) {
      targetDir = found.dir;
      assemblyName = assemblyName || basename(found.exe, exeExt);
    }
  }

  if (!assemblyName) {
    // Last resort: assume assembly name matches the project file name.
    assemblyName = basename(csproj, '.csproj');
  }
  if (!targetDir) {
    throw new Error(
      `Could not determine build output directory for ${csproj}. ` +
      `Try building first, or pass an explicit --temp.`
    );
  }

  return {
    csproj,
    projectDir,
    assemblyName,
    targetDir: stripTrailingSep(targetDir),
    exeName: assemblyName + exeExt,
  };
}

function findCsproj(projectArg) {
  const p = resolvePath(projectArg);
  if (!existsSync(p)) throw new Error(`Project path not found: ${p}`);

  if (statSync(p).isFile()) {
    if (extname(p) !== '.csproj') {
      throw new Error(`Not a .csproj file: ${p}`);
    }
    return p;
  }

  const csprojs = readdirSync(p).filter((f) => f.endsWith('.csproj'));
  if (csprojs.length === 0) throw new Error(`No .csproj found in directory: ${p}`);
  if (csprojs.length > 1) {
    throw new Error(
      `Multiple .csproj files in ${p}: ${csprojs.join(', ')}. ` +
      `Point --project at a specific file.`
    );
  }
  return join(p, csprojs[0]);
}

/**
 * Ask MSBuild for the resolved properties. Works without a prior build
 * (it's an evaluation, not a compile). Returns {} if the query fails.
 */
function queryMsbuild(csproj, configuration) {
  const res = spawnSync(
    'dotnet',
    [
      'msbuild', csproj,
      '-getProperty:AssemblyName',
      '-getProperty:TargetDir',
      '-getProperty:OutputType',
      `-p:Configuration=${configuration}`,
      '-nologo',
    ],
    { encoding: 'utf8' }
  );

  if (res.status !== 0 || !res.stdout) return {};

  try {
    const parsed = JSON.parse(res.stdout);
    return parsed.Properties ?? {};
  } catch {
    return {};
  }
}

/** Recursively find the newest *.exe (or extension-less binary) under a dir. */
function scanForExe(root) {
  if (!existsSync(root)) return null;

  let best = null;
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (isWindows ? entry.name.endsWith('.exe') : looksExecutable(full)) {
        const mtime = statSync(full).mtimeMs;
        if (!best || mtime > best.mtime) best = { exe: full, dir, mtime };
      }
    }
  };
  walk(root);
  return best;
}

function looksExecutable(file) {
  // On *nix the apphost binary has no extension (e.g. "Rephlo", not "Rephlo.dll").
  return extname(file) === '';
}

function stripTrailingSep(p) {
  return p.replace(/[\\/]+$/, '');
}
