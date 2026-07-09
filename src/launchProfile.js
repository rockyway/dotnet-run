import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Resolve the launch profile to apply, mirroring `dotnet run`'s own selection:
 * - an explicit name must exist in launchSettings.json (throws if not).
 * - with no name, the first profile whose commandName is "Project" is used
 *   (matches `dotnet run`'s default — see
 *   https://learn.microsoft.com/en-us/aspnet/core/fundamentals/environments).
 * - returns null if there's no launchSettings.json, or (default case only)
 *   no eligible profile — callers treat that as "nothing to apply".
 *
 * @param {string} projectDir  directory containing the .csproj
 * @param {string|undefined} profileName
 * @returns {{ name: string, env: Record<string,string>, applicationUrl?: string, commandLineArgs?: string, externalUrlConfiguration: boolean } | null}
 */
export function resolveLaunchProfile(projectDir, profileName) {
  const path = join(projectDir, 'Properties', 'launchSettings.json');
  if (!existsSync(path)) {
    if (profileName) throw new Error(`launchSettings.json not found: ${path}`);
    return null;
  }

  let json;
  try {
    json = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new Error(`Failed to parse ${path}: ${err.message}`);
  }
  const profiles = json.profiles ?? {};

  if (profileName) {
    const profile = profiles[profileName];
    if (!profile) {
      const names = Object.keys(profiles).join(', ') || '(none)';
      throw new Error(`Launch profile "${profileName}" not found in ${path}. Available: ${names}`);
    }
    return normalizeProfile(profileName, profile);
  }

  const defaultEntry = Object.entries(profiles).find(([, p]) => p.commandName === 'Project');
  return defaultEntry ? normalizeProfile(defaultEntry[0], defaultEntry[1]) : null;
}

function normalizeProfile(name, profile) {
  return {
    name,
    env: profile.environmentVariables ?? {},
    applicationUrl: profile.applicationUrl,
    commandLineArgs: profile.commandLineArgs,
    externalUrlConfiguration: profile.externalUrlConfiguration === true,
  };
}

/**
 * Minimal command-line splitter for a profile's `commandLineArgs` string,
 * supporting double-quoted segments (the only quoting launchSettings.json
 * commonly needs).
 *
 * @param {string} str
 * @returns {string[]}
 */
export function splitCommandLine(str) {
  const args = [];
  const re = /"([^"]*)"|(\S+)/g;
  let match;
  while ((match = re.exec(str)) !== null) {
    args.push(match[1] ?? match[2]);
  }
  return args;
}
