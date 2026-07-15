export class CliError extends Error {
  readonly details: unknown;
  readonly exitCode: number;
  readonly hint: string | undefined;
  readonly status: number | undefined;
  readonly type: string;

  constructor(options: {
    details?: unknown;
    exitCode: number;
    hint?: string;
    message: string;
    status?: number;
    type: string;
  }) {
    super(options.message);
    this.name = 'CliError';
    this.details = options.details;
    this.exitCode = options.exitCode;
    this.hint = options.hint;
    this.status = options.status;
    this.type = options.type;
  }
}
