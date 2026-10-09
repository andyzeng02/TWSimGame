import { validateWorld, type World } from '@twsim/sim-core';
import { Game } from './game';
import { MapView } from './map/MapView';
import { Hud } from './ui/Hud';
import { byId } from './ui/format';
import { drawSilhouette } from './ui/loading';
import { setupAbout } from './ui/about';
import './style.css';

// 有正式世界檔（npm run build-world 產出的 kaohsiung.json）就用它，否則用草稿世界
const worlds = import.meta.glob<World>('../../../data/world/*.json', { eager: true, import: 'default' });
const world =
  Object.entries(worlds).find(([path]) => path.endsWith('/kaohsiung.json'))?.[1] ??
  Object.entries(worlds).find(([path]) => path.endsWith('/kaohsiung.sample.json'))?.[1];

async function main() {
  if (!world) throw new Error('找不到世界檔：data/world/kaohsiung.sample.json');
  const errors = validateWorld(world);
  if (errors.length) throw new Error(`世界檔有誤：\n${errors.join('\n')}`);

  const loading = byId('loading');
  const loadingText = byId('loading-text');
  const loadingBar = byId('loading-bar');
  const fillShape = drawSilhouette(document.getElementById('loading-shape') as unknown as SVGSVGElement, world);
  fillShape?.(0.05);
  const map = await MapView.create(byId('map'), world, (msg, f) => {
    loadingText.textContent = msg;
    loadingBar.style.width = `${Math.round(f * 100)}%`;
    fillShape?.(f);
  });
  loading.hidden = true;
  byId('attribution').textContent = map.attribution;
  if (map.warnings.length) {
    const box = byId('warnings');
    box.textContent = map.warnings.join(' ');
    box.hidden = false;
  }

  // 網址可帶 ?seed=123 重現特定一局
  const seedParam = Number(new URLSearchParams(location.search).get('seed'));
  const game = new Game(world, Number.isFinite(seedParam) && seedParam > 0 ? seedParam : undefined);
  new Hud(game, map);
  setupAbout(world);

  // 開發時方便從瀏覽器主控台查看
  Object.assign(window, { game, map });
}

main().catch((e: unknown) => {
  console.error(e);
  byId('loading-text').textContent = `載入失敗：${e instanceof Error ? e.message : String(e)}`;
});
