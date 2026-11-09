/**
 * 游戏全维度测试 —— 界面/角色/动画/画面/交互。
 *
 * 运行方式（ego 环境）：
 *   ego-browser nodejs -e "await import('file:///E:/naiwa-zzz/tests/run-game-test.mjs')"
 */
import { TestHarness } from "./harness.mjs";

const URL = "http://127.0.0.1:5274/?t=" + Date.now();

export async function runAllTests(page) {
  const t = new TestHarness(page, {
    shotDir: "E:/naiwa-zzz/docs/test-shots",
    reportPath: "E:/naiwa-zzz/docs/test-report.json",
  });
  const A = TestHarness;

  // 工具：读页面状态
  const evalPage = (fn, ...args) => page.evaluate(fn, ...args);

  // ========== 加载 ==========
  console.log("加载页面...");
  await page.goto(URL, { waitUntil: "commit", timeout: 40_000 });
  await page.waitForTimeout(10000);

  // 收集错误
  const errors = [];
  try { page.on("console", (m) => { const x = (m?.text || m?.message || "").slice(0, 200); if (x) errors.push(x); }); } catch {}

  // ========== 1. 界面维度 ==========
  console.log("\n【界面维度】");
  t.group("界面");

  await t.case("主界面显示", async () => {
    const v = await evalPage(() => ({
      visible: !document.getElementById("screen-title")?.classList.contains("hidden"),
      logo: document.querySelector(".logo-main")?.textContent,
      buttons: document.querySelectorAll("#screen-title .menu-btn").length,
    }));
    A.assert(v.visible, "主界面未显示");
    A.assertEqual(v.logo, "奶蛙零", "标题文字错误");
    A.assertGreater(v.buttons, 0, "没有按钮");
  }, { shot: "01-title" });

  await t.case("选人界面显示", async () => {
    await evalPage(() => document.querySelector('[data-action="start"]')?.click());
    await page.waitForTimeout(600);
    const v = await evalPage(() => ({
      visible: !document.getElementById("screen-select")?.classList.contains("hidden"),
      cards: document.querySelectorAll(".char-card").length,
      name: document.getElementById("showcase-name")?.textContent,
    }));
    A.assert(v.visible, "选人界面未显示");
    A.assertEqual(v.cards, 16, `角色卡片数应为 16，实际 ${v.cards}`);
    A.assertTruthy(v.name, "展示台无角色名");
  }, { shot: "02-select" });

  await t.case("切换角色更新展示台", async () => {
    await evalPage(() => document.querySelectorAll(".char-card")[5]?.click());
    await page.waitForTimeout(400);
    const name = await evalPage(() => document.getElementById("showcase-name")?.textContent);
    A.assertEqual(name, "奶狗", `展示台应显示奶狗，实际 ${name}`);
  }, { shot: "03-select-switch" });

  await t.case("战斗界面显示", async () => {
    await evalPage(() => document.querySelector('[data-action="confirm"]')?.click());
    await page.waitForTimeout(1200);
    const v = await evalPage(() => ({
      hudVisible: document.getElementById("ui")?.style.display === "block",
      elapsed: document.querySelector(".timer-num")?.textContent,
      hpBar: !!document.querySelector(".bar-fill"),
      keys: document.querySelectorAll(".key").length,
    }));
    A.assert(v.hudVisible, "HUD 未显示");
    A.assertTruthy(v.elapsed, "已用时间无内容");
    A.assert(v.hpBar, "血条不存在");
    A.assertGreater(v.keys, 0, "无技能键");
  }, { shot: "04-battle" });

  await t.case("结算界面显示", async () => {
    // 不限时：直接把对手 HP 打空触发结算
    await evalPage(() => { if (window.__npr?.opponent) window.__npr.opponent.hp = 0; });
    await page.waitForTimeout(1200);
    const v = await evalPage(() => ({
      visible: !document.getElementById("screen-result")?.classList.contains("hidden"),
      grade: document.getElementById("result-grade")?.textContent,
      stats: document.querySelectorAll(".result-stat").length,
      rewards: document.querySelectorAll(".reward-chip").length,
    }));
    A.assert(v.visible, "结算界面未显示");
    A.assertTruthy(v.grade, "无评价");
    A.assertEqual(v.stats, 4, `统计项应为 4，实际 ${v.stats}`);
    A.assertGreater(v.rewards, 0, "无奖励");
  }, { shot: "05-result" });

  await t.case("返回主界面", async () => {
    await evalPage(() => document.querySelector('[data-action="back-title"]')?.click());
    await page.waitForTimeout(600);
    const v = await evalPage(() => ({
      titleVisible: !document.getElementById("screen-title")?.classList.contains("hidden"),
      resultHidden: document.getElementById("screen-result")?.classList.contains("hidden"),
    }));
    A.assert(v.titleVisible, "主界面未显示");
    A.assert(v.resultHidden, "结算界面未隐藏");
  }, { shot: "06-back-title" });

  // ========== 2. 角色维度 ==========
  console.log("\n【角色维度】");
  t.group("角色");

  await t.case("16 只角色全部加载", async () => {
    const v = await evalPage(() => {
      const n = window.__npr;
      if (!n?.squad) return { error: "no squad" };
      return {
        count: n.squad.members.length,
        loaded: n.squad.members.map((m) => {
          const w = m.group?.getObjectByName("model-wrapper");
          let verts = 0;
          w?.traverse((c) => { if (c.isMesh) verts += c.geometry?.attributes?.position?.count || 0; });
          return verts;
        }),
      };
    });
    A.assertEqual(v.count, 16, `角色数应为 16，实际 ${v.count}`);
    const unloaded = v.loaded.filter((x) => x < 1000).length;
    A.assertEqual(unloaded, 0, `有 ${unloaded} 只角色未加载（顶点 < 1000）`);
  });

  await t.case("角色切换生效", async () => {
    // 进战斗
    await evalPage(() => document.querySelector('[data-action="start"]')?.click());
    await page.waitForTimeout(400);
    await evalPage(() => document.querySelector('[data-action="confirm"]')?.click());
    await page.waitForTimeout(800);
    const before = await evalPage(() => window.__npr?.squad?.activeIndex);
    // 按 E 换人
    await page.cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "e", code: "KeyE", windowsVirtualKeyCode: 69 });
    await page.cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "e", code: "KeyE", windowsVirtualKeyCode: 69 });
    await page.waitForTimeout(400);
    const after = await evalPage(() => window.__npr?.squad?.activeIndex);
    A.assertNotEqual?.(after, before, "换人未生效");
    if (after === before) throw new Error(`换人未生效：${before} → ${after}`);
  }, { shot: "07-swap" });

  await t.case("角色属性正确", async () => {
    const v = await evalPage(() => {
      const n = window.__npr;
      return n?.squad?.members.map((m) => ({
        name: m.name,
        hp: m.maxHp,
        dmg: m.damageMul,
        spd: m.speedMul,
        grid: m.gridMul,
      }));
    });
    A.assertGreater(v.length, 0, "无角色数据");
    const m = v[0];
    A.assertGreater(m.hp, 0, "HP 异常");
    A.assertGreater(m.dmg, 0, "伤害异常");
  });

  // ========== 3. 动画维度 ==========
  console.log("\n【动画维度】");
  t.group("动画");

  await t.case("idle 动画推进", async () => {
    const v = await evalPage(async () => {
      const n = window.__npr;
      const a = n?.squad?.active?.anim;
      if (!a) return { error: "no anim" };
      const before = a.idlePhase;
      await new Promise((r) => setTimeout(r, 800));
      return { before, after: a.idlePhase, action: a.action, hasAnim: true };
    });
    // idle 相位应随时间推进（宽松判定：只要动画系统存在且相位有值）
    A.assertTruthy(v.hasAnim, "动画系统不存在");
    A.assertGreater(v.after, 0, "idle 相位异常");
    // 相位应变化（允许小误差）
    if (v.after <= v.before) {
      // 再等一次（可能刚好在边界）
      const v2 = await evalPage(async () => {
        const a = window.__npr?.squad?.active?.anim;
        const b = a?.idlePhase;
        await new Promise((r) => setTimeout(r, 500));
        return { before: b, after: a?.idlePhase };
      });
      A.assertGreater(v2.after, v2.before, `idle 相位未推进: ${v2.before} → ${v2.after}`);
    }
  });

  await t.case("移动动画触发", async () => {
    await page.cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "a", code: "KeyA", windowsVirtualKeyCode: 65 });
    await page.waitForTimeout(800);
    const v = await evalPage(() => ({
      action: window.__npr?.squad?.active?.anim?.action,
      moving: window.__npr?.squad?.active?.move?.isMoving,
    }));
    A.assertEqual(v.action, "move", `移动动作应为 move，实际 ${v.action}`);
    A.assert(v.moving, "未处于移动状态");
    await page.cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", windowsVirtualKeyCode: 65 });
  }, { shot: "08-move" });

  await t.case("攻击动画触发", async () => {
    await page.cdp("Input.dispatchKeyEvent", { type: "keyDown", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
    await page.waitForTimeout(150);
    await page.cdp("Input.dispatchKeyEvent", { type: "keyUp", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
    await page.waitForTimeout(400);
    const v = await evalPage(() => ({
      action: window.__npr?.squad?.active?.anim?.action,
      isAttacking: window.__npr?.squad?.active?.anim?.isAttacking,
      comboStage: window.__npr?.combo?.stageIndex,
    }));
    const attacked = v.isAttacking || ["attack1", "attack2", "attack3", "finisher"].includes(v.action) || v.comboStage >= 0;
    A.assert(attacked, `攻击动作未触发，实际 action=${v.action}, stage=${v.comboStage}`);
  }, { shot: "09-attack" });

  await t.case("受击动画触发", async () => {
    const v = await evalPage(() => {
      const n = window.__npr;
      const oa = n?.opponentAnim;
      if (!oa) return { error: "no opponentAnim" };
      oa.play("hit", 0.22);
      return { action: oa.action };
    });
    A.assertEqual(v.action, "hit", `受击动作应为 hit，实际 ${v.action}`);
  });

  // ========== 4. 画面维度 ==========
  console.log("\n【画面维度】");
  t.group("画面");

  await t.case("NPR 材质生效", async () => {
    const v = await evalPage(() => {
      const n = window.__npr;
      const m = n?.squad?.active;
      const w = m?.group?.getObjectByName("model-wrapper");
      let matType = null, hasMap = false;
      w?.traverse((c) => {
        if (c.isMesh && !c.userData.__isOutline) {
          matType = c.material?.type;
          hasMap = !!c.material?.map;
        }
      });
      return { matType, hasMap, mode: n?.getMode() };
    });
    A.assertEqual(v.matType, "MeshToonMaterial", `NPR 材质应为 MeshToonMaterial，实际 ${v.matType}`);
    A.assert(v.hasMap, "材质缺少贴图");
  });

  await t.case("贴图尺寸正常", async () => {
    const v = await evalPage(() => {
      const n = window.__npr;
      const m = n?.squad?.active;
      const w = m?.group?.getObjectByName("model-wrapper");
      let size = null;
      w?.traverse((c) => {
        if (c.isMesh && !c.userData.__isOutline && c.material?.map?.image) {
          size = { w: c.material.map.image.width, h: c.material.map.image.height };
        }
      });
      return size;
    });
    A.assertTruthy(v, "无贴图");
    A.assertEqual(v.w, 1024, `贴图宽度应为 1024，实际 ${v.w}`);
  });

  await t.case("Bloom 后处理启用", async () => {
    const v = await evalPage(() => {
      // 通过检查 composer 是否存在
      const n = window.__npr;
      return { hasPostfx: !!n?.postfx, bloomEnabled: n?.postfx?.bloom?.enabled };
    });
    A.assert(v.hasPostfx, "后处理未初始化");
    A.assert(v.bloomEnabled, "Bloom 未启用");
  });

  await t.case("渲染统计正常", async () => {
    // 读 scene 里的 mesh 总数（不依赖 renderer.info，后者会被后处理重置）
    const v = await evalPage(() => {
      const n = window.__npr;
      let meshCount = 0, vertTotal = 0;
      n?.scene?.traverse?.((c) => {
        if (c.isMesh) {
          meshCount++;
          vertTotal += c.geometry?.attributes?.position?.count || 0;
        }
      });
      return { meshCount, vertTotal, geometries: n?.renderer?.info?.memory?.geometries };
    });
    A.assertGreater(v.meshCount, 10, `mesh 数过少：${v.meshCount}`);
    A.assertGreater(v.vertTotal, 10000, `顶点总数过少：${v.vertTotal}`);
  });

  await t.case("相机位置合理", async () => {
    const v = await evalPage(() => {
      const c = window.__npr?.camera;
      return c ? { x: c.position.x, y: c.position.y, z: c.position.z, fov: c.fov } : null;
    });
    A.assertTruthy(v, "无相机");
    A.assertGreater(v.y, 0.5, "相机高度异常");
    A.assertGreater(v.fov, 20, "FOV 异常");
  });

  // ========== 5. 交互维度 ==========
  console.log("\n【交互维度】");
  t.group("交互");

  await t.case("WASD 移动生效", async () => {
    // 等待 hitstop 结束（避免冻结导致位移为 0）
    await page.waitForTimeout(600);
    const before = await evalPage(() => ({ ...window.__npr?.squad?.active?.move?.pos }));
    await page.cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "a", code: "KeyA", windowsVirtualKeyCode: 65 });
    await page.waitForTimeout(900);
    await page.cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", windowsVirtualKeyCode: 65 });
    const after = await evalPage(() => ({ ...window.__npr?.squad?.active?.move?.pos }));
    const dist = Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z);
    A.assertGreater(dist, 0.5, `移动距离过小：${dist.toFixed(2)}`);
  }, { shot: "13-move-a" });

  await t.case("空格攻击生效", async () => {
    // 先靠近对手（对手在 -X 方向，按 A 追）
    await page.cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "a", code: "KeyA", windowsVirtualKeyCode: 65 });
    await page.waitForTimeout(1500);
    await page.cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", windowsVirtualKeyCode: 65 });
    const before = await evalPage(() => window.__npr?.opponent?.hp);
    await page.cdp("Input.dispatchKeyEvent", { type: "keyDown", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
    await page.waitForTimeout(150);
    await page.cdp("Input.dispatchKeyEvent", { type: "keyUp", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
    await page.waitForTimeout(600);
    const after = await page.evaluate(() => window.__npr?.opponent?.hp);
    const combo = await page.evaluate(() => window.__npr?.combo?.isInCombo || window.__npr?.combo?.stageIndex >= 0);
    A.assert(combo || after < before, `攻击未生效（连段=${combo}, hp ${before}→${after}）`);
  }, { shot: "10-attack" });

  await t.case("连段系统推进", async () => {
    // 先靠近（对手在 -X 方向，按 A 追）
    await page.cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "a", code: "KeyA", windowsVirtualKeyCode: 65 });
    await page.waitForTimeout(1200);
    await page.cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", windowsVirtualKeyCode: 65 });
    // 连按 3 次空格
    for (let i = 0; i < 3; i++) {
      await page.cdp("Input.dispatchKeyEvent", { type: "keyDown", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
      await page.waitForTimeout(150);
      await page.cdp("Input.dispatchKeyEvent", { type: "keyUp", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
      await page.waitForTimeout(400);
    }
    const v = await page.evaluate(() => ({
      stage: window.__npr?.combo?.stageIndex,
      comboCount: window.__npr?.combo?.comboCount,
      oppHp: window.__npr?.opponent?.hp,
    }));
    A.assert(v.comboCount > 0 || v.stage >= 0 || v.oppHp < 200, `连段未推进，stage=${v.stage}, count=${v.comboCount}`);
  }, { shot: "11-combo" });

  await t.case("闪避生效", async () => {
    const before = await page.evaluate(() => ({ ...window.__npr?.squad?.active?.move?.pos }));
    await page.cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "Shift", code: "ShiftLeft", windowsVirtualKeyCode: 16 });
    await page.waitForTimeout(80);
    await page.cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "Shift", code: "ShiftLeft", windowsVirtualKeyCode: 16 });
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => ({ ...window.__npr?.squad?.active?.move?.pos }));
    const dist = Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z);
    A.assertGreater(dist, 0.3, `闪避位移过小：${dist.toFixed(2)}`);
  });

  await t.case("换人生效", async () => {
    const before = await page.evaluate(() => window.__npr?.squad?.activeIndex);
    await page.cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "e", code: "KeyE", windowsVirtualKeyCode: 69 });
    await page.cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "e", code: "KeyE", windowsVirtualKeyCode: 69 });
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => window.__npr?.squad?.activeIndex);
    if (after === before) throw new Error(`换人未生效：${before} → ${after}`);
  });

  await t.case("NPR/PBR 切换", async () => {
    const before = await page.evaluate(() => window.__npr?.getMode());
    await page.cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "n", code: "KeyN", windowsVirtualKeyCode: 78 });
    await page.cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "n", code: "KeyN", windowsVirtualKeyCode: 78 });
    await page.waitForTimeout(600);
    const after = await page.evaluate(() => window.__npr?.getMode());
    if (after === before) throw new Error(`模式未切换：${before} → ${after}`);
    // 切回
    await page.cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "n", code: "KeyN", windowsVirtualKeyCode: 78 });
    await page.cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "n", code: "KeyN", windowsVirtualKeyCode: 78 });
    await page.waitForTimeout(400);
  }, { shot: "12-mode-switch" });

  await t.case("无 console 错误", async () => {
    const errs = errors.filter((e) => /error|uncaught|failed/i.test(e));
    A.assertEqual(errs.length, 0, `有 ${errs.length} 个错误：${errs.slice(0, 3).join(" | ")}`);
  });

  // ========== 报告 ==========
  return await t.report();
}
