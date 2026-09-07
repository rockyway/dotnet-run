import { parseArgs } from 'node:util';

/**
 * Parse the dotnetrun CLI arguments.
 *
 * Everything after a standalone `--` or `--args` is forwarded verbatim to the
 * launched executable; everything before it is parsed as tool options.
 *
 * `--args` exists because PowerShell's automatic `$args` array silently drops
 * a bare `--` token before it reaches the child process (npm's generated
 * `.ps1` shim has no `param()` block, so args flow through `$args`) — `--`
 * works in bash/cmd but not through that shim. `--args` is a normal string
 * token, so it survives.
 *
 * @param {string[]} argv  process.argv.slice(2)
 * @returns {{ values: object, appArgs: string[] }}
 */
export function parseCliArgs(argv) {
  const sep = argv.findIndex((a) => a === '--' || a === '--args');
  let toolArgs = sep === -1 ? argv : argv.slice(0, sep);
  const appArgs = sep === -1 ? [] : argv.slice(sep + 1);

  // Stripped out before parseArgs: node:util's `allowNegative` treats any
  // `--no-<X>` token as negating option `<X>` if `<X>` is declared — even
  // when `<X>` (here "launch-profile") is a string option, not boolean. That
  // silently swallows a co-declared `no-launch-profile` boolean option, so
  // `--no-launch-profile` is handled manually instead.
  const noLaunchProfile = toolArgs.includes('--no-launch-profile');
  if (noLaunchProfile) {
    toolArgs = toolArgs.filter((a) => a !== '--no-launch-profile');
  }

  const { values } = parseArgs({
    args: toolArgs,
    allowNegative: true, // enables --no-build / --no-run
    allowPositionals: false,
    options: {
      project: { type: 'string', short: 'p' },
      branch: { type: 'string', short: 'b' },
      configuration: { type: 'string', short: 'c', default: 'Debug' },
      temp: { type: 'string' },
      sync: { type: 'string', default: 'additive' },
      build: { type: 'boolean', default: true },
      run: { type: 'boolean', default: true },
      detach: { type: 'boolean', default: false },
      'launch-profile': { type: 'string' },
      env: { type: 'string', multiple: true },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });

  return { values: { ...values, 'no-launch-profile': noLaunchProfile }, appArgs };
}
