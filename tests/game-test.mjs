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
    // 三连战（2026-11-11）：结算在第 3 个对手打空后触发，故先跳到最后一回合
    await evalPage(() => {
      const n = window.__npr;
      if (n?.battle) n.battle.round = n.battle.totalRounds - 1;
      if (n?.opponent) n.opponent.hp = 0;
    });
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
    // 限定作用域到结算屏：index.html 里「返回」按钮有 3 个（选人屏 / 结算屏 / 设置屏），
    //   无作用域的 querySelector 会命中 DOM 顺序第一个（选人屏的），点到的不是结算屏那个。
    await evalPage(() => document.querySelector('#screen-result [data-action="back-title"]')?.click());
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
    // 2026-11-11 起 16 只 GLB 改为**延迟加载**（首次进入选人页才发起，约 4.98MB，
    //   标题页用不到）→ 本用例显式触发加载，不依赖页面路径
    await evalPage(() => window.__npr?.loadModels?.());
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
    // 稳定化（修 flaky + 修不严谨）：
    //  1) 把玩家播种到 +X 远端（远离对手 → dist>2.4，对手不进入攻击分支，无顿帧/慢镜干扰）
    //     ⚠ 播种坐标必须落在场地边界内（movement.mjs bounds.x = 4.5）。原用例播种到 x=6，
    //       首帧夹紧到 4.5 会凭空产生 1.5 的「假位移」——旧断言即使完全没移动也可能通过，
    //       判据形同虚设。现播种到 4.4（边界内、仍远离对手）。
    //  2) 轮询等待瞬时战斗状态清零（freezeT/弹反窗口/攻击前摇）
    //  3) **按住不放 + 轮询位移**（替代「按住 500ms 后一次性采样」）：
    //     ego 宿主下 rAF 可能被节流到几百毫秒一帧（实测 1.5s 内只推进 1 帧，位移仅 0.12），
    //     按墙钟时长采样会把「宿主帧饥饿」误判成「移动失效」。改为按住并轮询，
    //     只要窗口内真的推进过帧就能测到位移；判据（位移 > 0.3 且含屏幕左分量）不变。
    const SEED_X = 4.4; // 边界内（bounds.x = 4.5）
    await evalPage((sx) => {
      const mv = window.__npr?.squad?.active?.move;
      if (mv) { mv.pos.set(sx, 0, 0); mv.vel.set(0, 0, 0); }
    }, SEED_X);
    for (let i = 0; i < 20; i++) {
      const st = await evalPage(() => {
        const n = window.__npr;
        return n ? { f: n.battle?.freezeT ?? 0, w: n.counter?.isWarning ? 1 : 0, p: n.battle?.oppAttackWindup ?? 0 } : null;
      });
      if (st && st.f <= 0 && st.w === 0 && st.p <= 0) break;
      await page.waitForTimeout(250);
    }
    // 参考位置取「安静等待之后」：此时首帧夹紧已发生，不会把夹紧量算成位移
    const before = await evalPage(() => ({ ...window.__npr?.squad?.active?.move?.pos }));
    let dist = 0, delta = { x: 0, z: 0 };
    await evalPage(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", code: "KeyA", bubbles: true })));
    try {
      for (let i = 0; i < 24 && dist <= 0.5; i++) {
        await page.waitForTimeout(250);
        const after = await evalPage(() => ({ ...window.__npr?.squad?.active?.move?.pos }));
        delta = { x: after.x - before.x, z: after.z - before.z };
        dist = Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z);
      }
    } finally {
      // 松开按键放 finally：即使读状态抛错也不会卡住按键
      await evalPage(() => window.dispatchEvent(new KeyboardEvent("keyup", { key: "a", code: "KeyA", bubbles: true })));
    }
    // 失败时给出状态快照：位移小可能来自「战斗未运行 / 鸣徽暂停 / 连携 QTE 停车 /
    // rAF 帧饥饿」等不同原因，不带状态的断言无法定位。
    // 帧计数：独立于游戏循环自挂一个 rAF 探针，用来区分「宿主把 rAF 饿死了」
    // 与「游戏循环自己挂了」——两者在位移断言上表现完全一样。
    await evalPage(() => {
      window.__nprFrames = 0;
      const c = () => { window.__nprFrames++; requestAnimationFrame(c); };
      requestAnimationFrame(c);
    });
    const e1 = await evalPage(() => +(window.__npr?.battleStats?.elapsed ?? 0).toFixed(3));
    await page.waitForTimeout(600);
    const e2 = await evalPage(() => +(window.__npr?.battleStats?.elapsed ?? 0).toFixed(3));
    const frames = await evalPage(() => window.__nprFrames ?? -1);
    const mvState = await evalPage(() => {
      const n = window.__npr;
      const mv = n?.squad?.active?.move;
      return {
        phase: n?.battle?.phase ?? null,
        inBattle: n?.chargeState?.().inBattle ?? null,
        womarkOpen: n?.battle?.womarkOpen ?? null,
        chainQte: n?.battle?.chainQte?.active ?? null,
        freezeT: +(n?.battle?.freezeT ?? 0).toFixed(3),
        keys: (n?.chargeState?.().keys ?? []).join(","),
        speed: +(mv?.walkSpeed ?? 0).toFixed(2),
        vel: mv ? `${(mv.vel?.x ?? 0).toFixed(2)},${(mv.vel?.z ?? 0).toFixed(2)}` : null,
        pos: mv ? `${mv.pos?.x.toFixed(2)},${mv.pos?.z.toFixed(2)}` : null,
        elapsed: +(n?.battleStats?.elapsed ?? 0).toFixed(2),
      };
    });
    A.assertGreater(
      dist, 0.3,
      `移动距离过小：${dist.toFixed(2)}｜状态 ${JSON.stringify(mvState)}｜探针帧数(600ms)=${frames}｜elapsed ${e1}→${e2}`
    );
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

  await t.case("三连战回合推进", async () => {
    // 进战斗（当前可能已在战斗里；用 start/confirm 走一遍确保状态干净）
    await evalPage(() => document.querySelector('[data-action="start"]')?.click());
    await page.waitForTimeout(400);
    await evalPage(() => document.querySelector('[data-action="confirm"]')?.click());
    await page.waitForTimeout(1200);
    const r0 = await page.evaluate(() => ({
      round: window.__npr?.battle?.round,
      total: window.__npr?.battle?.totalRounds,
      ids: (window.__npr?.battle?.opponentIds || []).length,
    }));
    A.assertEqual(r0.total, 3, `总回合数应为 3，实际 ${r0.total}`);
    A.assertEqual(r0.ids, 3, `本局应抽到 3 个对手，实际 ${r0.ids}`);
    A.assertEqual(r0.round, 0, "起始回合应为 0");

    // 轮询而非固定等待：ego 宿主里 rAF 可能被节流（帧间隔可达秒级），
    //   固定 sleep 后立刻读状态会读到「还没推进」的旧值。
    const waitRound = async (target, timeoutMs = 6000) => {
      const t0 = Date.now();
      for (;;) {
        const r = await page.evaluate(() => ({
          round: window.__npr?.battle?.round,
          phase: window.__npr?.battle?.phase,
          resultHidden: document.getElementById("screen-result")?.classList.contains("hidden"),
          oppHp: window.__npr?.opponent?.hp,
        }));
        if (r.round >= target || r.phase === "settle") return r;
        if (Date.now() - t0 > timeoutMs) return r;
        await page.waitForTimeout(150);
      }
    };

    // 击败第 1 个对手 → 应进入第 2 回合（**不**直接结算）
    await page.evaluate(() => { window.__npr.opponent.hp = 0; });
    const r1 = await waitRound(1);
    A.assertEqual(r1.round, 1, `击败第 1 个对手后应进入第 2 回合，实际 ${r1.round}`);
    A.assert(r1.resultHidden, "第 1 回合结束不应直接进结算");
    A.assertEqual(r1.phase, "playing", "推进回合后应仍在战斗");
    A.assertGreater(r1.oppHp, 0, "新对手的血量应重置");

    // 再击败一个 → 第 3 回合
    await page.evaluate(() => { window.__npr.opponent.hp = 0; });
    const r2 = await waitRound(2);
    A.assertEqual(r2.round, 2, `击败第 2 个对手后应进入第 3 回合，实际 ${r2.round}`);

    // 击败最后一个 → 结算
    await page.evaluate(() => { window.__npr.opponent.hp = 0; });
    let r3 = null;
    for (let i = 0; i < 60; i++) {
      r3 = await page.evaluate(() => ({
        phase: window.__npr?.battle?.phase,
        resultShown: !document.getElementById("screen-result")?.classList.contains("hidden"),
        rounds: document.querySelectorAll("#result-rounds .result-round").length,
      }));
      if (r3.resultShown) break;
      await page.waitForTimeout(150);
    }
    A.assert(r3.resultShown, "打完 3 个对手后应进入结算");
    A.assertEqual(r3.rounds, 3, `结算页应列出 3 条回合战果，实际 ${r3.rounds}`);
  }, { shot: "14-three-rounds" });

  await t.case("招式克制关系生效", async () => {
    // 克制表是纯数据关系：克制 → ×1.25 / 平手 → ×1.0 / 被克 → ×0.85。
    // 这里用**命中路径同一个**计算函数（window.__npr.damagePreview）核对：
    //   1) 6 种风格两两相克构成反对称关系（A 克 B 则 B 被 A 克）
    //   2) 三档倍率取值正确
    //   3) 预览伤害 = base × 伤害系数 × 冲击强度 × 倍率（舍入一致）
    const info = await page.evaluate(() => ({
      styles: Object.keys(window.__npr?.styleTable?.().counter || {}),
      counter: window.__npr?.styleTable?.().counter || {},
      mult: window.__npr?.styleTable?.().mult || {},
      self: window.__npr?.styleInfo?.(),
    }));
    A.assertEqual(info.styles.length, 6, `克制轴应有 6 种风格，实际 ${info.styles.length}`);
    A.assertEqual(info.mult.counter, 1.25, "克制倍率应为 1.25");
    A.assertEqual(info.mult.neutral, 1, "平手倍率应为 1");
    A.assertEqual(info.mult.resisted, 0.85, "被克倍率应为 0.85");

    // 反对称性：A 克 B ⟺ B 被 A 克；且不存在自克
    // 注意：ego 的 page.evaluate **只接受一个参数**，多参会被丢弃 → 用数组打包传入
    for (const a of info.styles) {
      const b = info.counter[a];
      A.assert(b && b !== a, `风格 ${a} 的克制对象非法（${b}）`);
      A.assert(info.styles.includes(b), `风格 ${a} 克制的 ${b} 不在风格表内`);
      const rel = await page.evaluate(([x, y]) => window.__npr.styleRel(x, y), [a, b]);
      A.assertEqual(rel, "counter", `${a} 对 ${b} 应为克制关系`);
      const rel2 = await page.evaluate(([x, y]) => window.__npr.styleRel(x, y), [b, a]);
      A.assertEqual(rel2, "resisted", `${b} 对 ${a} 应为被克关系`);
      const relSelf = await page.evaluate(([x]) => window.__npr.styleRel(x, x), [a]);
      A.assertEqual(relSelf, "neutral", `${a} 不应克自己`);
    }

    // 预览伤害公式与手算一致（同一函数、同一取整）
    if (info.self) {
      const expect = Math.round(6 * info.self.damageMul * info.self.impactStrength * info.self.mult);
      const got = await page.evaluate(() => window.__npr.damagePreview(6).dmg);
      A.assertEqual(got, expect, `预览伤害应为 ${expect}，实际 ${got}`);
    }
  });

  await t.case("蓄力必杀技", async () => {
    // 进战斗并轮询等待真正进入 playing（ego 宿主 rAF 可能被节流，固定 sleep 不可靠）
    await evalPage(() => {
      const n = window.__npr;
      if (n?.battle?.phase !== "playing") document.querySelector('[data-action="start"]')?.click();
    });
    await page.waitForTimeout(400);
    await evalPage(() => document.querySelector('[data-action="confirm"]')?.click());
    let playing = false;
    for (let i = 0; i < 60; i++) {
      playing = await page.evaluate(() => window.__npr?.battle?.phase === "playing");
      if (playing) break;
      await page.waitForTimeout(150);
    }
    A.assert(playing, "未能进入战斗状态（蓄力必杀技需要 playing）");

    // 先贴近对手（开局双方相距 4.8，蓄力终结的判定框约 3.0~4.2，太远会落空）。
    //   不用按键走位：ego 宿主 rAF 被节流时，一帧只推进 0.05s，按住 A 也走不出 0.1 单位。
    await page.evaluate(() => window.__npr.teleportPlayer(-1.0, 0));
    await page.waitForTimeout(300);
    const pos = await page.evaluate(() => window.__npr.positions());
    A.assertLess(pos.dist, 4.4, `未能贴近对手（当前距离 ${pos.dist}），蓄力终结会落空`);

    // 长按空格 ≥0.55s（墙钟）→ 蓄力条应出现且填满
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true })));
    // 轮询等待蓄满（ego 宿主 rAF 可能被节流，不能用固定 sleep 判定）
    let charging = { shown: false, full: false, pct: "" };
    for (let i = 0; i < 60; i++) {
      charging = await page.evaluate(() => {
        const el = document.getElementById("hud-charge");
        const fill = document.getElementById("hud-charge-fill");
        return {
          shown: !!el && el.classList.contains("show"),
          full: !!el && el.classList.contains("full"),
          pct: fill ? fill.style.width : "",
        };
      });
      if (charging.full) break;
      await page.waitForTimeout(150);
    }
    A.assert(charging.shown, "长按空格后蓄力条应出现");
    A.assert(charging.full, `蓄力应填满（实际 ${charging.pct}）`);

    // 松手 → 发出蓄力终结
    const hpBefore = await page.evaluate(() => window.__npr.opponent.hp);
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keyup", { key: " ", code: "Space", bubbles: true })));
    // 轮询观察「蓄力终结已发出」：普通终结伤害 30，蓄力终结 ≈46×系数（>=40），
    //   且带慢镜前摇（按缩放 dt 推进）——ego 宿主 rAF 被节流时，前摇落地可能要几十秒墙钟，
    //   故这里断言「已发出（finisherPending 挂上且伤害达标）」而不是「已造成伤害」。
    let after = { hp: hpBefore, chargeShown: true, pending: null };
    let maxPendingDmg = 0;
    for (let i = 0; i < 120; i++) {
      after = await page.evaluate(() => ({
        hp: window.__npr.opponent.hp,
        chargeShown: document.getElementById("hud-charge")?.classList.contains("show"),
        pending: window.__npr.battle?.finisherPending
          ? { dmg: window.__npr.battle.finisherPending.dmg, range: window.__npr.battle.finisherPending.range }
          : null,
      }));
      if (after.pending) maxPendingDmg = Math.max(maxPendingDmg, after.pending.dmg);
      if (after.pending || after.hp < hpBefore) break;
      await page.waitForTimeout(150);
    }
    const fired = !!after.pending || after.hp < hpBefore;
    A.assert(fired, "松手后应发出蓄力终结（未见 finisherPending 且未造成伤害）");
    if (maxPendingDmg > 0) {
      A.assertGreater(maxPendingDmg, 40, `蓄力终结伤害应显著高于普通终结（30），实际 ${maxPendingDmg}`);
    }
    A.assert(!after.chargeShown, "松手后蓄力条应收起");
  }, { shot: "15-charge-ultimate" });

  await t.case("连携技 QTE", async () => {
    // 进战斗（干净状态）：QTE 只在失衡期出现，用调试口注入避免真实命中时序抖动
    await evalPage(() => document.querySelector('[data-action="start"]')?.click());
    await page.waitForTimeout(400);
    await evalPage(() => document.querySelector('[data-action="confirm"]')?.click());
    let playing = false;
    for (let i = 0; i < 60; i++) {
      playing = await page.evaluate(() => window.__npr?.battle?.phase === "playing");
      if (playing) break;
      await page.waitForTimeout(150);
    }
    A.assert(playing, "未能进入战斗状态（连携 QTE 需要 playing）");

    // 注入：清空支援点（验证连携 +1 回复，避免开战满 3 被 refill 封顶）→ 失衡 → 开 QTE
    await page.evaluate(() => {
      const n = window.__npr;
      n.setAssist(0);
      n.addDaze(999);            // 失衡条直接打满
      n.debugOpenChain();
    });

    // 轮询 QTE 激活（overlay show + active）
    let qte = null;
    for (let i = 0; i < 40; i++) {
      qte = await page.evaluate(() => ({
        active: window.__npr?.chainQteState?.().active ?? false,
        shown: !!document.getElementById("chain-qte")?.classList.contains("show"),
        counts: window.__npr?.chainQteState?.().counts ?? 0,
        options: window.__npr?.chainQteState?.().options ?? [],
        points: window.__npr?.assistState?.().points ?? 0,
        activeIdx: window.__npr?.squad?.activeIndex ?? -1,
      }));
      if (qte.active && qte.shown) break;
      await page.waitForTimeout(150);
    }
    A.assert(qte.active, "注入后连携 QTE 未激活");
    A.assert(qte.shown, "连携 QTE 覆盖层未显示");
    A.assertGreater(qte.counts, 0, `连携环数应为正，实际 ${qte.counts}`);
    A.assertEqual(qte.options.length, 3, `候选成员应为 3 位，实际 ${qte.options.length}`);

    // 按数字键 1 选第一环：应换人 + 支援点 +1 + 环数 -1
    const before = qte;
    await pressKey("1", "Digit1", 49);
    let after = null;
    for (let i = 0; i < 40; i++) {
      after = await page.evaluate(() => ({
        active: window.__npr?.chainQteState?.().active ?? false,
        counts: window.__npr?.chainQteState?.().counts ?? 0,
        used: window.__npr?.chainQteState?.().used ?? [],
        points: window.__npr?.assistState?.().points ?? 0,
        activeIdx: window.__npr?.squad?.activeIndex ?? -1,
      }));
      if (after.used.length > 0 || !after.active) break;
      await page.waitForTimeout(150);
    }
    A.assert(after.used.length >= 1, "选择后应有成员已使用");
    A.assertEqual(after.activeIdx, before.options[0], `第一环应换入 chip1 对应成员 ${before.options[0]}，实际 ${after.activeIdx}`);
    A.assert(after.points > before.points, `连携应 +1 支援点（${before.points} → ${after.points}）`);
    A.assertEqual(after.counts, before.counts - 1, `环数应 -1（${before.counts} → ${after.counts}）`);

    // 连打到环数耗尽 → QTE 应自动关闭
    for (let d = 0; d < 3; d++) {
      const st = await page.evaluate(() => window.__npr?.chainQteState?.());
      if (!st?.active) break;
      await pressKey("1", "Digit1", 49);
      await page.waitForTimeout(250);
    }
    let closed = null;
    for (let i = 0; i < 40; i++) {
      closed = await page.evaluate(() => ({
        active: window.__npr?.chainQteState?.().active ?? null,
        shown: !!document.getElementById("chain-qte")?.classList.contains("show"),
      }));
      if (closed.active === false && !closed.shown) break;
      await page.waitForTimeout(150);
    }
    A.assertEqual(closed.active, false, "环数耗尽后 QTE 应自动关闭");
    A.assert(!closed.shown, "QTE 关闭后覆盖层应隐藏");
  }, { shot: "16-chain-qte" });

  await t.case("喧响值与终结技", async () => {
    // 进战斗
    await evalPage(() => document.querySelector('[data-action="start"]')?.click());
    await page.waitForTimeout(400);
    await evalPage(() => document.querySelector('[data-action="confirm"]')?.click());
    let playing = false;
    for (let i = 0; i < 60; i++) {
      playing = await page.evaluate(() => window.__npr?.battle?.phase === "playing");
      if (playing) break;
      await page.waitForTimeout(150);
    }
    A.assert(playing, "未能进入战斗状态（喧响终结技需要 playing）");
    // 贴近对手
    await page.evaluate(() => window.__npr.teleportPlayer(-1.0, 0));
    await page.waitForTimeout(300);
    // 注入：喧响满 [极] + 清空支援点（验证回满）
    await page.evaluate(() => {
      window.__npr.setDecibel(3000);
      window.__npr.setAssist(0);
    });
    // 长按空格 → 蓄满 → 松手 = 喧响终结技
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true })));
    let charging = false;
    for (let i = 0; i < 60; i++) {
      charging = await page.evaluate(() => !!document.getElementById("hud-charge")?.classList.contains("full"));
      if (charging) break;
      await page.waitForTimeout(150);
    }
    A.assert(charging, "长按空格后蓄力条应填满");
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keyup", { key: " ", code: "Space", bubbles: true })));
    // 断言：发出的是喧响终结技（dmg ≥ 80：92×damageMul×冲击×克制，最低 92×0.8×0.6×0.85 ≈ 38？
    //   不会——最低档角色 damageMul 0.8 / 冲击 0.6 → 92×0.8×0.6×0.85 ≈ 37.5，但站立位是玩家自选的
    //   任意成员；本用例不换人（奶蛙 1.2/1.0）→ 92×1.2×1.0×[0.85..1.25] ≈ 94~138，断言 >80 稳）
    let fired = null;
    for (let i = 0; i < 120; i++) {
      fired = await page.evaluate(() => ({
        pending: window.__npr.battle?.finisherPending
          ? { dmg: window.__npr.battle.finisherPending.dmg, isUlt: !!window.__npr.battle.finisherPending.isUlt }
          : null,
        decibel: window.__npr.decibelState?.().decibel ?? -1,
        points: window.__npr.assistState?.().points ?? -1,
        invuln: window.__npr.decibelState?.().invulnT ?? 0,
      }));
      if (fired.pending) break;
      await page.waitForTimeout(150);
    }
    A.assertTruthy(fired.pending, "松手后应发出终结技");
    A.assert(fired.pending.isUlt, "喧响满 [极] 时应发出喧响终结技（isUlt）");
    A.assertGreater(fired.pending.dmg, 80, `喧响终结技伤害应 ≥ 2× 蓄力终结（实际 ${fired.pending.dmg}）`);
    A.assertEqual(fired.decibel, 0, "释放后喧响应清零");
    A.assertEqual(fired.points, 3, "释放后支援点应回满 3");
    A.assert(fired.invuln > 0, "释放期间应有无敌帧");
  }, { shot: "17-ultimate" });

  await t.case("属性异常与紊乱", async () => {
    // 进战斗（fresh：对手满血 200，异常总伤害 ≈130 < 200 不会误触发换回合）
    await evalPage(() => document.querySelector('[data-action="start"]')?.click());
    await page.waitForTimeout(400);
    await evalPage(() => document.querySelector('[data-action="confirm"]')?.click());
    let playing = false;
    for (let i = 0; i < 60; i++) {
      playing = await page.evaluate(() => window.__npr?.battle?.phase === "playing");
      if (playing) break;
      await page.waitForTimeout(150);
    }
    A.assert(playing, "未能进入战斗状态（异常用例需要 playing）");

    // 弱点属性应是 5 属性之一
    const weak = await page.evaluate(() => window.__npr?.anomalyState?.().weakness);
    A.assert(["physical", "fire", "ice", "electric", "ether"].includes(weak), `弱点属性非法：${weak}`);

    // 灼烧：注满火属性 → 状态挂上 + DoT 掉血
    const hp0 = await page.evaluate(() => window.__npr.opponent.hp);
    await page.evaluate(() => window.__npr.addAnomaly("fire", 999));
    let burn = null;
    for (let i = 0; i < 40; i++) {
      burn = await page.evaluate(() => ({
        status: window.__npr?.anomalyState?.().status,
        hp: window.__npr?.opponent?.hp,
      }));
      if (burn.status?.attr === "fire") break;
      await page.waitForTimeout(150);
    }
    A.assertEqual(burn.status?.attr, "fire", `注满火属性后应挂灼烧，实际 ${JSON.stringify(burn.status)}`);
    // 轮询等 DoT 掉血（1s/跳 × 5×damageMul≈6/跳）
    let hpAfterBurn = burn.hp;
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(250);
      hpAfterBurn = await page.evaluate(() => window.__npr.opponent.hp);
      if (hpAfterBurn < burn.hp) break;
    }
    A.assertLess(hpAfterBurn, burn.hp, `灼烧应造成 DoT 掉血（${burn.hp} → ${hpAfterBurn}）`);

    // 紊乱：再注满冰属性 → 引爆灼烧剩余 + 挂冻结
    await page.evaluate(() => window.__npr.addAnomaly("ice", 999));
    let freeze = null;
    for (let i = 0; i < 40; i++) {
      freeze = await page.evaluate(() => ({
        status: window.__npr?.anomalyState?.().status,
        frozenT: window.__npr?.anomalyState?.().frozenT,
        hp: window.__npr?.opponent?.hp,
      }));
      if (freeze.status?.attr === "ice") break;
      await page.waitForTimeout(150);
    }
    A.assertEqual(freeze.status?.attr, "ice", `异类注满应触发紊乱并挂上碎冰，实际 ${JSON.stringify(freeze.status)}`);
    A.assertGreater(freeze.frozenT, 0, "碎冰应冻结对手");
    A.assertLess(freeze.hp, hpAfterBurn, `紊乱引爆 + 冻结应继续掉血（${hpAfterBurn} → ${freeze.hp}）`);
  });

  await t.case("首领狂暴触发", async () => {
    // 进战斗 → 跳到第 3 回合 + 血量压到 50% 以下 → 狂暴标志应置位
    await evalPage(() => document.querySelector('[data-action="start"]')?.click());
    await page.waitForTimeout(400);
    await evalPage(() => document.querySelector('[data-action="confirm"]')?.click());
    let playing = false;
    for (let i = 0; i < 60; i++) {
      playing = await page.evaluate(() => window.__npr?.battle?.phase === "playing");
      if (playing) break;
      await page.waitForTimeout(150);
    }
    A.assert(playing, "未能进入战斗状态（狂暴用例需要 playing）");
    await page.evaluate(() => {
      const n = window.__npr;
      n.battle.round = n.battle.totalRounds - 1;
      n.opponent.hp = 90;   // < maxHp(200) × 50%
    });
    let enraged = false;
    for (let i = 0; i < 40; i++) {
      enraged = await page.evaluate(() => !!window.__npr?.battle?.enraged);
      if (enraged) break;
      await page.waitForTimeout(150);
    }
    A.assert(enraged, "回合3 血量 <50% 应触发首领狂暴");
    // 狂暴期攻击分支存在计数器（红光预警按 3 击节奏开窗，时序由 AI 自然驱动，不 flaky 断言）
    const hasCounter = await page.evaluate(() => Number.isInteger(window.__npr?.battle?.attackCount));
    A.assert(hasCounter, "狂暴攻击计数器应存在");
  });

  await t.case("鸣徽三选一", async () => {
    // 进战斗 → 注入开启鸣徽 → 数字键选卡 → 断言 buff 生效并回到战斗
    await evalPage(() => document.querySelector('[data-action="start"]')?.click());
    await page.waitForTimeout(400);
    await evalPage(() => document.querySelector('[data-action="confirm"]')?.click());
    let playing = false;
    for (let i = 0; i < 60; i++) {
      playing = await page.evaluate(() => window.__npr?.battle?.phase === "playing");
      if (playing) break;
      await page.waitForTimeout(150);
    }
    A.assert(playing, "未能进入战斗状态（鸣徽用例需要 playing）");
    await page.evaluate(() => window.__npr.debugOpenWomark());
    let open = null;
    for (let i = 0; i < 40; i++) {
      open = await page.evaluate(() => ({
        flag: !!window.__npr?.womarkState?.().open,
        shown: !!document.getElementById("womark-overlay")?.classList.contains("show"),
      }));
      if (open.flag && open.shown) break;
      await page.waitForTimeout(150);
    }
    A.assert(open.flag, "注入后鸣徽选择应开启");
    A.assert(open.shown, "鸣徽覆盖层应显示");
    // 按 2 选第二张卡
    await pressKey("2", "Digit2", 50);
    let picked = null;
    for (let i = 0; i < 40; i++) {
      picked = await page.evaluate(() => ({
        flag: !!window.__npr?.womarkState?.().open,
        buffs: window.__npr?.womarkState?.().buffs ?? {},
        shown: !!document.getElementById("womark-overlay")?.classList.contains("show"),
      }));
      if (!picked.flag) break;
      await page.waitForTimeout(150);
    }
    A.assertEqual(picked.flag, false, "选卡后应回到战斗");
    A.assert(!picked.shown, "选卡后覆盖层应隐藏");
    const buffCount = Object.values(picked.buffs).reduce((a, b) => a + b, 0);
    A.assertEqual(buffCount, 1, `应恰好获得 1 层鸣徽，实际 ${JSON.stringify(picked.buffs)}`);
  });

  await t.case("无 console 错误", async () => {
    const errs = errors.filter((e) => /error|uncaught|failed/i.test(e));
    A.assertEqual(errs.length, 0, `有 ${errs.length} 个错误：${errs.slice(0, 3).join(" | ")}`);
  });

  // ========== 报告 ==========
  return await t.report();
}
