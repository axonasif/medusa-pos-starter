// Small adb accessibility helper for the isolated emulator. Never print field
// values (including credentials); print labels and bounds only.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const adb = process.env.ASTHA_ADB || '/Users/volatile/Library/Android/sdk/platform-tools/adb';
const device = process.env.ASTHA_ANDROID_DEVICE || 'emulator-5580';
export function command(...args) {
  return execFileSync(adb, ['-s', device, ...args], { encoding: 'utf8', timeout: 20000 });
}
export function nodes() {
  const localPath = fileURLToPath(new URL('../.local/window.xml', import.meta.url));
  command('shell', 'uiautomator', 'dump', '/sdcard/astha-window.xml');
  command('pull', '/sdcard/astha-window.xml', localPath);
  return [...readFileSync(localPath, 'utf8').matchAll(/<node\s+([^>]+)>?/g)].map((match) => {
    const attributes = Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((attribute) => [attribute[1], attribute[2]]));
    const bounds = (attributes.bounds || '').match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/)?.slice(1).map(Number);
    return { ...attributes, bounds };
  });
}
export function tap(node) {
  if (!node?.bounds) throw new Error('UI target not found');
  const [left, top, right, bottom] = node.bounds;
  command('shell', 'input', 'tap', String(Math.round((left + right) / 2)), String(Math.round((top + bottom) / 2)));
}

if (process.argv[2] === 'list') {
  console.log(nodes().filter((node) => node.text || node['content-desc'] || node.class?.endsWith('EditText')).map((node) => ({
    label: node.password === 'true' || node.class?.endsWith('EditText') ? '[input]' : node.text || node['content-desc'],
    class: node.class,
    bounds: node.bounds,
    clickable: node.clickable,
  })));
} else if (process.argv[2] === 'tap') {
  const label = process.argv[3];
  const matches = nodes().filter((node) => node.text === label || node['content-desc'] === label);
  tap(matches.find((node) => node.clickable === 'true') || matches[0]);
}
