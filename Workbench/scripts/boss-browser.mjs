// 共享：启动带反检测的持久化浏览器上下文（专用 profile，登录态长期保留）。
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "rebrowser-playwright";

const workbenchRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
export const BOSS_PROFILE_DIR = path.join(workbenchRoot, "data", "boss-profile");

const ANTI_DETECT_INIT = () => {
  Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  Object.defineProperty(navigator, "languages", { get: () => ["zh-CN", "zh"] });
  Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3] });
  window.chrome = window.chrome || { runtime: {} };
};

// 有头模式优先系统 Chrome/Edge（捆绑 Chromium 在部分 Windows GPU 环境白屏）。
async function launchPersistent(headful) {
  const attempts = headful
    ? [{ channel: "chrome" }, { channel: "msedge" }, { args: ["--disable-gpu"] }]
    : [{}];
  let lastError = null;
  for (const options of attempts) {
    try {
      return await chromium.launchPersistentContext(BOSS_PROFILE_DIR, {
        headless: !headful,
        viewport: headful ? null : { width: 1366, height: 850 },
        locale: "zh-CN",
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        ...options,
      });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export async function openBossContext({ headful = false } = {}) {
  const context = await launchPersistent(headful);
  await context.addInitScript(ANTI_DETECT_INIT);
  return context;
}
