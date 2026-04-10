export class CliError extends Error {
  code: string;
  exit_code: number;

  constructor(message: string, options?: { code?: string; exit_code?: number }) {
    super(message);
    this.name = 'CliError';
    this.code = options?.code ?? 'CLI_ERROR';
    this.exit_code = options?.exit_code ?? 1;
  }
}

export class ConfigError extends CliError {
  constructor(message: string) {
    super(message, { code: 'CONFIG_ERROR', exit_code: 2 });
    this.name = 'ConfigError';
  }
}

export const toCliError = (error: unknown): CliError => {
  if (error instanceof CliError) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  return new CliError(message, { code: 'UNEXPECTED_ERROR', exit_code: 1 });
};
