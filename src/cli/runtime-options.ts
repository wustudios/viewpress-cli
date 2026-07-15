interface RuntimeOptions {
  apiUrl?: string;
  json: boolean;
  nonInteractive: boolean;
  timeoutSec: number;
}

let runtimeOptions: RuntimeOptions = {
  json: false,
  nonInteractive: false,
  timeoutSec: 30,
};

export function setRuntimeOptions(options: RuntimeOptions): void {
  runtimeOptions = options;
}

export function getRuntimeOptions(): RuntimeOptions {
  return runtimeOptions;
}
