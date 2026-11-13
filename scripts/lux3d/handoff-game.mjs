import fs from 'node:fs/promises';
const SHOTS = 'C:/Users/dqy/AppData/Local/Temp/opencode/naiwa-audit-20261111/shots';
async function main() {
  const task = await taskSpace('naiwa-show-game');
  const tabs = await task.tabs();
  for (const t of tabs) {
    console.log('  ' + (t.label || '(unlabeled)') + '  ' + String(t.url).slice(0, 90));
  }
  // 把整个任务空间的控制权交还用户（页面保持打开）
  await task.handOff();
  console.log('  handOff done');
}
main().catch((e) => { console.log('ERROR: ' + String(e && e.stack ? e.stack : e)); });