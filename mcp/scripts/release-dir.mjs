// 冒烟脚本共用：没有在命令行给发布包目录时，找一个默认的。
// 依次看：环境变量 GDL_RELEASE_DIR；部署包的布局（../site/data，按 current.json 取）；资料库仓库的布局（../release 下最新的一个）。
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export function defaultReleaseDir() {
  if (process.env.GDL_RELEASE_DIR) return path.resolve(process.env.GDL_RELEASE_DIR);
  const siteData = path.join(here, '..', '..', 'site', 'data');
  try {
    const { release } = JSON.parse(readFileSync(path.join(siteData, 'current.json'), 'utf8'));
    const dir = path.join(siteData, 'release', release);
    if (existsSync(path.join(dir, 'manifest.json'))) return dir;
  } catch {
    /* 不是部署包的布局 */
  }
  const repoReleases = path.join(here, '..', '..', 'release');
  try {
    const names = readdirSync(repoReleases)
      .filter((n) => existsSync(path.join(repoReleases, n, 'manifest.json')))
      .sort();
    if (names.length) return path.join(repoReleases, names[names.length - 1]);
  } catch {
    /* 没有这个目录 */
  }
  throw new Error('找不到发布包目录。请把发布包目录作为第一个参数传入，或设置环境变量 GDL_RELEASE_DIR。');
}
