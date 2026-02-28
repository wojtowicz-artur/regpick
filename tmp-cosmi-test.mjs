import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { cosmiconfig } from 'cosmiconfig';

(async ()=>{
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'regpick-'));
  await fs.writeFile(path.join(tmp, 'regpick.json'), JSON.stringify({ registries: { parentreg: './pr' } }));
  const nested = path.join(tmp, 'a', 'b', 'c');
  await fs.mkdir(nested, { recursive: true });

  const explorer = cosmiconfig('regpick', { searchPlaces: ['regpick.json', '.regpickrc', '.regpickrc.json'] });
  const res = await explorer.search(nested);
  console.log('tmp:', tmp);
  console.log('nested:', nested);
  console.log('result:', res);
})();
