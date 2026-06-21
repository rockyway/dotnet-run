import { parseArgs } from 'node:util';

/**
 * Parse the dotnetrun CLI arguments.
 *
 * Everything after a standalone `--` is forwarded verbatim to the launched
 * executable; everything before it is parsed as tool options.
 *
 * @param {string[]} argv  process.argv.slice(2)
 * @returns {{ values: object, appArgs: string[] }}
 */
export function parseCliArgs(argv) {
  const sep = argv.indexOf('--');
  const toolArgs = sep === -1 ? argv : argv.slice(0, sep);
  const appArgs = sep === -1 ? [] : argv.slice(sep + 1);

  const { values } = parseArgs({
    args: toolArgs,
    allowNegative: true, // enables --no-build / --no-run
    allowPositionals: false,
    options: {
      project: { type: 'string', short: 'p' },
      configuration: { type: 'string', short: 'c', default: 'Debug' },
      temp: { type: 'string' },
      sync: { type: 'string', default: 'additive' },
      build: { type: 'boolean', default: true },
      run: { type: 'boolean', default: true },
      detach: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });

  return { values, appArgs };
}
