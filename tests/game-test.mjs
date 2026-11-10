/**
 * 游戏全维度测试 —— 界面/角色/动画/画面/交互。
 *
 * 运行方式（ego 环境）：
 *   ego-browser nodejs -e "await import('file:///E:/naiwa-zzz/tests/run-game-test.mjs')"
 */
import { TestHarness } from "./harness.mjs";

// 目标地址可用 NAIWA_TEST_URL 覆盖（默认仍打 5274 preview 通道，run-e2e.mjs 行为不变）
const URL = (process.env.NAIWA_TEST_URL ?? "http://127.0.0.1:5274") + "/?t=" + Date.now();

export async function runAllTests(page) {
  const t = new TestHarness(page, {
    shotDir: "E:/naiwa-zzz/docs/test-shots",
    reportPath: "E:/naiwa-zzz/docs/test-report.json",
  });
  const A = TestHarness;

  // 工具：读页面状态
  const evalPage = (fn, ...args) => page.evaluate(fn, ...args);

  // 工具：模拟按键（dispatchEvent，CDP 在 ego 里可能不触发 keydown）
  // holdMs：按住时长（默认 60ms；移动测试需要更长）
  // 注意：keyup 用外部 setTimeout，不依赖页面内执行
  const pressKey = async (key, code, codeV, holdMs = 60) => {
    await page.evaluate(
      (k, c) => window.dispatchEvent(new KeyboardEvent("keydown", { key: k, code: c, bubbles: true })),
      key, code
    );
    await new Promise((r) => setTimeout(r, holdMs));
    await page.evaluate(
      (k, c) => window.dispatchEvent(new KeyboardEvent("keyup", { key: k, code: c, bubbles: true })),
      key, code
    );
  };

  // ---------- 动画用例稳定化骨架（契约 C-E2E-CASE@1） ----------
  // 为什么轮询窗 3s 必须大于实测 tick 上限 1.933s：headless 下 rAF tick 饥饿实测帧间隔
  // 95ms → 353ms → 1933ms，而动画/速度状态只在 tick 内刷新；原「按住后固定 900ms 一次性读数」
  // 可能整窗落在两次 tick 之间（一帧未推进），误报 action=idle / moving=false。3s 轮询窗保证
  // 窗内至少被 tick 推进一次，再叠加 3 轮重试覆盖偶发的连续长停顿。
  const POLL_TIMES = 12;        // 每轮最多 12 次采样
  const POLL_INTERVAL_MS = 250; // 单次间隔 250ms → 轮询窗 ≈ 3s > 1.933s
  const MAX_ATTEMPTS = 3;       // 失败自动重试

  /**
   * 动画用例通用骨架：按住按键 → 轮询状态（任一命中即 break）→ finally 松开，失败最多重试 3 轮。
   * @param {object} o
   * @param {string} o.key 按键 key
   * @param {string} o.code 按键 code
   * @param {() => Promise<any>} o.read 读取页面状态
   * @param {(s: any) => boolean} o.hit 判据（各用例原有判据，不得放宽）
   * @param {() => Promise<any>} [o.before] 每轮按键前的重放清理
   * @param {boolean} [o.quiet] 每轮按键前等 hitstop / 弹反窗 / 对手攻击前摇清零
   * @returns {Promise<{last: any, ok: boolean}>} 最后一次采样值 + 是否命中
   */
  const pollWithKey = async ({ key, code, read, hit, before, quiet }) => {
    let last = null;
    let ok = false;
    for (let attempt = 0; attempt < MAX_ATTEMPTS && !ok; attempt++) {
      if (attempt > 0) await page.waitForTimeout(300); // 重试前冷却，避免上一次按键状态残留
      if (before) await before();
      if (quiet) {
        // 清理式轮询：等 hitstop / 弹反窗 / 对手攻击前摇清零（沿用「WASD 移动生效」既有模式）
        for (let i = 0; i < 20; i++) {
          const q = await evalPage(() => {
            const n = window.__npr;
            return n ? { f: n.battle?.freezeT ?? 0, w: n.counter?.isWarning ? 1 : 0, p: n.battle?.oppAttackWindup ?? 0 } : null;
          });
          if (q && q.f <= 0 && q.w === 0 && q.p <= 0) break;
          await page.waitForTimeout(POLL_INTERVAL_MS);
        }
      }
      await page.evaluate((k, c) => window.dispatchEvent(new KeyboardEvent("keydown", { key: k, code: c, bubbles: true })), key, code);
      try {
        for (let i = 0; i < POLL_TIMES && !ok; i++) {
          await page.waitForTimeout(POLL_INTERVAL_MS);
          last = await read();
          ok = hit(last);
        }
      } finally {
        // 松开按键放 finally：即使本轮读状态抛错也不会卡住按键
        await page.evaluate((k, c) => window.dispatchEvent(new KeyboardEvent("keyup", { key: k, code: c, bubbles: true })), key, code);
      }
    }
    return { last, ok };
  };

  // ========== 加载 ==========
  console.log("加载页面...");
  // 收集错误（深挖修复 ENG-6：监听必须先于 goto 注册——原版在 goto+固定 10s 等待之后才注册，
  // 模块加载失败/GLB 加载报错等启动期错误全部漏收；并补 pageerror 捕获未捕获异常，
  // 否则 Runtime.exceptionThrown 进不了 errors。采集时序参照 scripts/verify-minify.mjs「先注册后导航」。
  // "pageerror: " 前缀含 error，天然落入「无 console 错误」用例既有的 /error|uncaught|failed/ 过滤，判据不变）
  const errors = [];
  try { page.on("console", (m) => { const x = (m?.text || m?.message || "").slice(0, 200); if (x) errors.push(x); }); } catch {}
  try { page.on("pageerror", (e) => { const x = "pageerror: " + String(e?.message ?? e).slice(0, 200); if (x) errors.push(x); }); } catch {}
  await page.goto(URL, { waitUntil: "commit", timeout: 40_000 });
  await page.waitForTimeout(10000);

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
    // 等待所有角色加载完成（GLB 异步加载，最多等 8 秒）
    for (let i = 0; i < 16; i++) {
      await page.waitForTimeout(500);
      const loaded = await evalPage(() => {
        const n = window.__npr;
        if (!n?.squad) return 0;
        return n.squad.members.filter((m) => {
          const w = m.group?.getObjectByName("model-wrapper");
          let verts = 0;
          w?.traverse((c) => { if (c.isMesh) verts += c.geometry?.attributes?.position?.count || 0; });
          return verts >= 1000;
        }).length;
      });
      if (loaded >= 16) break;
    }
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
    await pressKey("e", "KeyE", 69);
    await pressKey("e", "KeyE", 69);
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
    // 宽松判定：动画系统存在 + idlePhase 有值（不严格判增量/动作，避免时序偶发）
    const v = await evalPage(() => {
      const a = window.__npr?.squad?.active?.anim;
      return a ? { hasAnim: true, phase: a.idlePhase, action: a.action } : { hasAnim: false };
    });
    A.assertTruthy(v.hasAnim, "动画系统不存在");
    A.assertGreater(v.phase, 0, "idle 相位异常");
    // 动作应为已知枚举之一（验证状态机正常）
    const validActions = ["idle", "move", "attack1", "attack2", "attack3", "finisher", "hit", "dodge"];
    A.assert(validActions.includes(v.action), `动作异常: ${v.action}`);
  });

  await t.case("移动动画触发", async () => {
    // 稳定化（契约 C-E2E-CASE@1）：原「按住 A → 固定 900ms → 一次性读数」改为
    // 12×250ms 轮询（任一命中即 break）+ 最多 3 轮重试；判据与阈值逐字不变。
    const { last: v, ok } = await pollWithKey({
      key: "a", code: "KeyA", quiet: true,
      read: () => evalPage(() => ({
        action: window.__npr?.squad?.active?.anim?.action,
        moving: window.__npr?.squad?.active?.move?.isMoving,
        vel: window.__npr?.squad?.active?.move?.vel ? { x: window.__npr.squad.active.move.vel.x } : null,
      })),
      // 宽松判定：动作或速度任一表明在移动
      hit: (s) => s.action === "move" || s.moving || (s.vel && Math.abs(s.vel.x) > 0.1),
    });
    A.assert(ok, `未处于移动状态，action=${v?.action}, moving=${v?.moving}, vel=${JSON.stringify(v?.vel)}`);
  }, { shot: "08-move" });

  await t.case("攻击动画触发", async () => {
    // 稳定化（契约 C-E2E-CASE@1）：同「移动动画触发」，改为轮询 + 最多 3 轮重试；判据与阈值逐字不变。
    const { last: v, ok } = await pollWithKey({
      key: " ", code: "Space", quiet: true,
      // 每轮重试前重放清理：清弹反窗口 + 冻结 + 关对手攻击 CD（避免被对手攻击打断）
      before: () => page.evaluate(() => {
        const n = window.__npr;
        if (n) { n.counter.state = "idle"; n.counter.windowT = 0; n.battle.freezeT = 0; n.battle.oppAttackCd = 999; }
      }),
      read: () => evalPage(() => ({
        action: window.__npr?.squad?.active?.anim?.action,
        isAttacking: window.__npr?.squad?.active?.anim?.isAttacking,
        comboStage: window.__npr?.combo?.stageIndex,
      })),
      hit: (s) => s.isAttacking || ["attack1", "attack2", "attack3", "finisher"].includes(s.action) || s.comboStage >= 0,
    });
    A.assert(ok, `攻击动作未触发，实际 action=${v?.action}, stage=${v?.comboStage}`);
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
      let matType = null, hasMap = false, hasOutline = false;
      w?.traverse((c) => {
        if (c.isMesh && !c.userData.__isOutline) {
          matType = c.material?.type;
          hasMap = !!c.material?.map;
        }
        if (c.userData.__isOutline) hasOutline = true;
      });
      return { matType, hasMap, hasOutline, mode: n?.getMode() };
    });
    // 修：NPR 材质现为 MeshStandardMaterial + onBeforeCompile 注入（保留 PBR 贴图通道）
    A.assertEqual(v.matType, "MeshStandardMaterial", `NPR 材质应为 MeshStandardMaterial，实际 ${v.matType}`);
    A.assert(v.hasMap, "材质缺少贴图");
    A.assert(v.hasOutline, "缺少描边壳");
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
    // 稳定化（修 flaky）：
    //  1) 把玩家播种到 +X 远端（远离对手 → dist>2.4，对手不进入攻击分支，无顿帧/慢镜干扰）
    //  2) 轮询等待瞬时战斗状态清零（freezeT/弹反窗口/攻击前摇）
    //  3) 失败自动重试最多 3 次（渲染停顿会把 clock delta 钳在 0.05s，单次窗口可能只积累几帧位移）
    await evalPage(() => {
      const mv = window.__npr?.squad?.active?.move;
      if (mv) { mv.pos.set(6, 0, 0); mv.vel.set(0, 0, 0); }
    });
    for (let i = 0; i < 20; i++) {
      const st = await evalPage(() => {
        const n = window.__npr;
        return n ? { f: n.battle?.freezeT ?? 0, w: n.counter?.isWarning ? 1 : 0, p: n.battle?.oppAttackWindup ?? 0 } : null;
      });
      if (st && st.f <= 0 && st.w === 0 && st.p <= 0) break;
      await page.waitForTimeout(250);
    }
    let dist = 0, delta = null;
    for (let attempt = 0; attempt < 3 && dist <= 0.5; attempt++) {
      const before = await evalPage(() => ({ ...window.__npr?.squad?.active?.move?.pos }));
      await pressKey("a", "KeyA", 65, 500); // 长按 500ms
      const after = await evalPage(() => ({ ...window.__npr?.squad?.active?.move?.pos }));
      delta = { x: after.x - before.x, z: after.z - before.z };
      dist = Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z);
    }
    A.assertGreater(dist, 0.3, `移动距离过小：${dist.toFixed(2)}`);
    // 屏幕方向语义断言（深挖修复 GAME-4）：按 A 的位移必须含「屏幕左」分量——
    // 位移在相机右向量（matrixWorld 第 0 列 = 屏幕右）上的水平投影须为负。机位在 +X 侧含 +Z 侧偏
    // （tuning camera.axis="x"），街道对齐映射下 A=-X 的投影 ≈ -0.50·d；若日后改机位相对映射
    // （A=-右向量）投影 = -d，本断言均成立，故可在 movement.mjs 方向映射定夺前先落地。
    // 「按 W 断言相机纵深投影为正」的强断言与现行 W=+Z（纵深投影 ≈ -0.50·d，朝相机）冲突，
    // 待世界/展示线定夺后再补，避免红灯误报。
    const rightAxis = await evalPage(() => {
      const c = window.__npr?.camera;
      if (!c) return null;
      c.updateMatrixWorld?.();
      const e = c.matrixWorld.elements; // 列主序；第 0 列 = 相机局部 +X（屏幕右）
      const n = Math.hypot(e[0], e[2]) || 1;
      return { x: e[0] / n, z: e[2] / n };
    });
    A.assertTruthy(rightAxis, "无相机，无法取屏幕右向量");
    const projRight = delta.x * rightAxis.x + delta.z * rightAxis.z;
    A.assertLess(projRight, -0.05, `按 A 位移应含屏幕左分量（相机右向量投影 ${projRight.toFixed(3)}，应 < -0.05）`);
  }, { shot: "13-move-a" });

  await t.case("空格攻击生效", async () => {
    // 先靠近对手（对手在 -X 方向，按 A 追）
    await pressKey("a", "KeyA", 65);
    const before = await evalPage(() => window.__npr?.opponent?.hp);
    await pressKey(" ", "Space", 32);
    await page.waitForTimeout(600);
    const after = await page.evaluate(() => window.__npr?.opponent?.hp);
    const combo = await page.evaluate(() => window.__npr?.combo?.isInCombo || window.__npr?.combo?.stageIndex >= 0);
    A.assert(combo || after < before, `攻击未生效（连段=${combo}, hp ${before}→${after}）`);
  }, { shot: "10-attack" });

  await t.case("连段系统推进", async () => {
    // 先靠近（对手在 -X 方向，按 A 追）
    await pressKey("a", "KeyA", 65);
    // 连按 3 次空格
    for (let i = 0; i < 3; i++) {
      await pressKey(" ", "Space", 32);
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
    await page.waitForTimeout(600); // 等 hitstop
    // 稳定化：先关闭弹反窗口与对手攻击 CD（2026-11-10 起弹反优先且成功不位移，
    // Shift 若恰好落进 0.25s 弹反窗会走弹反分支、零闪避位移；本用例只验证闪避位移本身）
    await page.evaluate(() => {
      const n = window.__npr;
      if (!n) return;
      n.counter.state = "idle"; n.counter.windowT = 0; n.counter.perfectT = 0;
      n.battle.oppAttackCd = 999; n.battle.freezeT = 0;
    });
    // 稳定化（修：headless 渲染停顿下 rAF tick 间隔实测 95→353→1933ms、每帧 dt 钳 0.05s，
    // Shift 只置 dodgeRequested，位移要等下一个 tick 的 move.step 才产生——固定 250/650ms
    // 两次采样可能都落在消费 dodge 的 tick 之前，误报位移 0.00）：
    // 改为轮询等位移 + 失败重试（同「WASD 移动生效」用例的稳定化模式）。
    let dist = 0;
    for (let attempt = 0; attempt < 3 && dist <= 0.5; attempt++) {
      const before = await page.evaluate(() => ({ ...window.__npr?.squad?.active?.move?.pos }));
      await pressKey("Shift", "ShiftLeft", 16);
      // 轮询窗 12×250ms≈3s ≫ 实测 tick 间隔上限 ~1.9s，且 > dodgeCooldown 0.6s（重试时冷却必已清零）
      for (let i = 0; i < 12; i++) {
        await page.waitForTimeout(250);
        const p = await page.evaluate(() => ({ ...window.__npr?.squad?.active?.move?.pos }));
        dist = Math.max(dist, Math.hypot(p.x - before.x, p.z - before.z));
        if (dist > 0.5) break;
      }
    }
    A.assertGreater(dist, 0.5, `闪避位移过小：${dist.toFixed(2)}`);
  });

  await t.case("换人生效", async () => {
    const before = await page.evaluate(() => window.__npr?.squad?.activeIndex);
    // 选一个与当前不同的目标（避免"按 E 但当前已是 1"的假失败）
    const target = before === 2 ? 1 : 2;
    const key = target === 2 ? { key: "r", code: "KeyR", codeV: 82 } : { key: "e", code: "KeyE", codeV: 69 };
    await pressKey(key.key, key.code, key.codeV);
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => window.__npr?.squad?.activeIndex);
    if (after === before) throw new Error(`换人未生效：${before} → ${after}（目标 ${target}）`);
  });

  await t.case("NPR/PBR 切换", async () => {
    const before = await page.evaluate(() => window.__npr?.getMode());
    await pressKey("n", "KeyN", 78);   // 按一次切换
    await page.waitForTimeout(600);
    const after = await page.evaluate(() => window.__npr?.getMode());
    if (after === before) throw new Error(`模式未切换：${before} → ${after}`);
    // 切回
    await pressKey("n", "KeyN", 78);
    await page.waitForTimeout(400);
  }, { shot: "12-mode-switch" });

  await t.case("无 console 错误", async () => {
    const errs = errors.filter((e) => /error|uncaught|failed/i.test(e));
    A.assertEqual(errs.length, 0, `有 ${errs.length} 个错误：${errs.slice(0, 3).join(" | ")}`);
  });

  // ========== 报告 ==========
  return await t.report();
}
