import { describe, expect, spyOn, test } from 'bun:test';

import { showHelp } from '../src/commands/show-help.ts';

describe('showHelp', () => {
  test('writes the usage text', () => {
    const stdoutWrite = spyOn(process.stdout, 'write').mockImplementation(() => true);

    try {
      showHelp();
      expect(stdoutWrite).toHaveBeenCalledWith(expect.stringContaining('Usage: viewpress'));
    } finally {
      stdoutWrite.mockRestore();
    }
  });
});
