import { Command } from 'commander';
import { createRequire } from 'node:module';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { registerGenCommand } from './commands/gen.js';
import { registerInitCommand } from './commands/init.js';
import { registerLogsCommand } from './commands/logs.js';
import { registerRunCommand } from './commands/run.js';
import { registerSecretsCommand } from './commands/secrets.js';
import { toCliError } from './core/errors.js';

const require = createRequire(import.meta.url);
const packageMetadata = require('../package.json') as {
  name?: string;
  version?: string;
};

const packageName = packageMetadata.name ?? 'av-cli';
const packageVersion = packageMetadata.version ?? '0.0.0';

const program = new Command();

program
  .name(packageName)
  .description('AV CLI V1 entrypoint')
  .version(packageVersion)
  .configureHelp({ sortSubcommands: true })
  .showHelpAfterError()
  .option('--debug', 'Enable verbose logging');

registerInitCommand(program);
registerGenCommand(program);
registerRunCommand(program);
registerLogsCommand(program);
registerSecretsCommand(program);

const isExecutedDirectly = (): boolean => {
  const entryPath = process.argv[1];
  if (!entryPath) {
    return false;
  }

  return import.meta.url === pathToFileURL(entryPath).href;
};

const run = async (argv: string[] = process.argv): Promise<void> => {
  await program.parseAsync(argv);
};

if (isExecutedDirectly()) {
  run().catch((error) => {
    const cliError = toCliError(error);
    console.error(`[${cliError.code}] ${cliError.message}`);
    process.exit(cliError.exit_code);
  });
}

export { program, run };
