import { fileURLToPath } from 'url';
import { readFile } from 'fs/promises';

import errorCatcher from './errorCatcher';

async function getVersion(): Promise<string | null> {
  const packagePath = fileURLToPath(new URL('../package.json', import.meta.url));
  const [error, file] = await errorCatcher(
    readFile(packagePath, { encoding: 'utf8' })
  );
  if (error) return null;

  const contents = JSON.parse(file);
  if (!contents.version) return null;

  return contents.version;
}

export default getVersion;
