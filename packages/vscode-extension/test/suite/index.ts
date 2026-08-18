import { readdir } from 'node:fs/promises';
import * as path from 'node:path';

import Mocha from 'mocha';

export async function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'tdd', color: true });
  const files = await readdir(__dirname);
  for (const file of files.filter((name) => name.endsWith('.test.js'))) {
    mocha.addFile(path.resolve(__dirname, file));
  }
  await new Promise<void>((resolve, reject) => {
    mocha.run((failures) =>
      failures > 0 ? reject(new Error(`${failures} test(s) failed.`)) : resolve(),
    );
  });
}
