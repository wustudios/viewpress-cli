export class CommandUsageError extends Error {
  readonly commandPath: string | undefined;

  constructor(message: string, commandPath?: string) {
    super(message);
    this.commandPath = commandPath;
  }
}
