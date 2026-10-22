// Shared test settings. Target the bundle (default) or the modular source:
//   FLUX_TARGET=source  → ../index.html (separate css/js files)
//   FLUX_URL=…          → any served copy, e.g. http://localhost:8080/index.html
//   CHROMIUM_PATH=…     → a specific Chromium; otherwise Playwright's own
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const BUNDLE = path.resolve(here, '../../flux-canvas.html');
export const SOURCE = path.resolve(here, '../index.html');
// the older suites were written when Draw was the default tool; ?tool=pen keeps them drawing on a plain drag
export const PLAIN = process.env.FLUX_URL || pathToFileURL(process.env.FLUX_TARGET === 'source' ? SOURCE : BUNDLE).href;
export const BASE = PLAIN + '?tool=pen';
export const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
export const OUT = process.env.FLUX_OUT || path.resolve(here, 'out');
fs.mkdirSync(OUT, { recursive: true });
const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : null);
export const LAUNCH = exe ? { executablePath: exe } : {};
