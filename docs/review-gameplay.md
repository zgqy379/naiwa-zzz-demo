# 奶蛙零 · 玩法/战斗系统/打击感 深度审查

> 审查对象：`src/game/battle.mjs`、`combo.mjs`、`counter.mjs`、`movement.mjs`、`animation.mjs`、`moves.mjs`、`squad.mjs`、`src/vfx/cinematic.mjs`、`src/vfx/shake.mjs`、`src/vfx/impact.mjs`、`src/vfx/hitflash.mjs`
> 参照截图：`docs/test-shots/08-move / 09-attack / 10-attack / 11-combo / 12-mode-switch / 13-move-a`

## 问题清单（按严重度排序）

### 🔴 严重（影响核心玩法）

1. **连携系统完全失效 —— 永远无法触发**
   - 代码位置：`battle.mjs:172-184` `_swap()` + `main.mjs:283-293` `applyDamage()`
   - 现象：`applyDamage` 在 `grids>=3` 时把 `grids` 清零并调用 `cinematic.onChain()`，但**连携计数 `battle.comboCount++` 与 `squad.chainWindow` 从未被赋值**。`_swap()` 先执行 `this.combo=0; this.grids=0; this.windowT=-1; this.chainReady=false`，之后才 `if(this.combo>=3)` —— **读的是刚被清零的 `combo`**，条件恒为 false，终结技永不触发。
   - 为什么是问题：绝区零的连携是"换人入场 + 新角色带连携攻击"的核心爽点，这里整条链路是死代码。
   - 建议改法：`applyDamage` 里 `battle.grids>=3` 时 `squad.chainWindow = 4.0`、`squad.chainCount++`；`_swap` 用局部变量先存 `const prevCombo = this.combo` 再清零，最后 `if (prevCombo >= 3) this._finisher()`。

2. **弹反窗口与"实际受击判定"不同步 —— 玩家被白打**
   - 代码位置：`main.mjs:466-483` 与 `counter.mjs:88-99`
   - 现象：`counter.openWindow()` 开 0.25s 窗口，同时 `battle.oppAttackWindup=0.25`。但 `counter.step(dt)` 在 `windowT<=0` 时调用 `expire()` 把 `state` 置为 `"fail"`；而 `main.mjs:476-483` 的受击判定条件是 `counter.isWarning && oppAttackWindup>0` —— 窗口一旦 `expire`，`isWarning` 变 false，**`oppAttackWindup` 还 >0，受击分支直接不执行**，对手的攻击被吞掉，玩家无伤。
   - 建议改法：受击判定改为只看 `oppAttackWindup` 到期，不依赖 `counter.isWarning`；`expire()` 应在 `windowT<=0` 时返回 failed 并由 main 侧补一次受击。

3. **顿帧（hitstop）与慢镜叠加，实际手感只有 2~3 帧**
   - 代码位置：`main.mjs:266` `battle.freezeT = Math.max(battle.freezeT, tier==="ultimate"?0.3:heavy?0.1:0.06)`；`tuning.mjs:14-17` 定义了 `hitstopF=3/3/4/5` 但**从未被 main 使用**（只用到 `battle.mjs:144` 的旧路径）。
   - 现象：`applyDamage` 里 `0.06s ≈ 3.6 帧`（60fps），`heavy` 只有 `0.1s = 6 帧`，而 `cinematic.timeScale=0.3` 的慢镜同时把 `dt` 缩到 0.3 —— 玩家实际感知的冻结帧数接近 2~3 帧。截图 10-attack 里"砰"字 + 粒子已散开，但角色姿态几乎未变，说明顿帧窗口内动画根本没停。
   - 建议改法：`applyDamage` 改用 `TUNING.hitstopF*60` 换算（`light=3F≈0.05s` 保留，`heavy=4F≈0.067s`，`finisher=5F≈0.083s`），且**顿帧期间 `cinematic.timeScale` 必须锁 1.0**，否则双重折扣。

4. **输入缓冲窗口 0.35s 远大于段时长，导致"无脑连按"即可打满三段**
   - 代码位置：`combo.mjs:105` `bufferT = 0.35`；段时长 `comboTiming` 最短 `shell_naiji=[0.18,0.2,0.24]`。
   - 现象：0.35s 缓冲 > 单段 0.2s，玩家在第一段起手 0.15s 后按住攻击键，缓冲会一直挂到第三段结束 —— 三段连段变成"一键三连"，毫无节奏博弈。截图 11-combo 里角色仍处于攻击姿态但"连携 1/3"，说明连段与连携计数是两套数字。
   - 建议改法：缓冲窗口改为 `stageDur * 0.6`（约 0.12~0.22s），且**仅在当前段进度 >0.6 时接受缓冲**（即"段后半段开放输入"才符合连段窗口语义）。

### 🟡 中等（影响手感）

5. **闪避方向随机 —— 操作无预期**
   - 代码位置：`battle.mjs:194-198` `Math.random() > 0.5 ? 1 : -1`
   - 现象：`_dodge()` 不按输入方向、不按面向，纯随机左右。`movement.mjs:66-67` 里已经实现了"输入方向优先、无输入向后"的正确逻辑，但 `battle.mjs` 完全没用它，等于把 `Movement.dodgeDir` 架空。
   - 建议改法：`_dodge` 改为读 `this.player.move.dodgeDir` 并按 `dodgeDistance` 位移；`battle.mjs` 里 `player` 引用实际上没接到 `squad.active.move`（main 里 `squad.active.move` 才是真身），需要把 `battle.player` 换成 `squad.active`。

6. **攻击前冲 0.5 单位 + 判定框 2.6，等于"隔空打人"**
   - 代码位置：`battle.mjs:127-132` 前冲 `dir*0.5`；`combo.mjs:21-48` `range` 2.2~2.8；`main.mjs:317-318` `lunge(dir, mv.anim.strike*0.8)`
   - 现象：截图 09/10 里两个角色模型几乎贴在一起（Z 向也重叠），但判定框 range 2.2~2.8 远大于模型间距 —— 玩家在 2.6 单位外就能命中，**视觉与判定完全脱节**。`movement.lunge` 速度 `8.0 * (attackLungeT/0.15)` 在 0.15s 内只走 0.6 单位，与 `battle.mjs` 的 0.5 硬位移重复计算。
   - 建议改法：攻击前冲统一由 `movement.lunge` 负责（`battle.mjs` 删掉 `player.x += dir*0.5`），`lunge` 速度改为 `range * 0.7 / strike` 使位移终点≈判定框边缘；`range` 下调到 1.6~2.0 与模型间距匹配。

7. **16 只角色"换壳即换招"实际只有 3 档数值，动作风格未接入动画**
   - 代码位置：`moves.mjs:27-205` 定义 6 种 `ATTACK_STYLE`（SLASH/THRUST/SLAM/SPIN/PECK/LASH），但 `animation.mjs:127-156` `_attack(dt, stage)` **只用 `stage`（1/2/3）和 `power=stage/3` 算旋转/缩放**，完全没读 `style`。
   - 现象：`moves.mjs` 里的 `anim.windup/strike/recover/lean/squash` 五维参数**在 main 里只用了 `windup` 和 `strike`**（`main.mjs:303,318`），`lean`、`squash`、`recover` 全部未传进 `ProceduralAnim`。结果 16 只角色的攻击动作只有"大小"差异，没有"轨迹"差异 —— 突刺、砸地、鞭击的视觉语言完全一致。
   - 建议改法：`ProceduralAnim.play` 接收 `style` 参数，`_attack` 按 style 分支：THRUST 加 `position.z` 前冲 + `rotation.x` 减小；SLAM 加 `position.y` 上举再下砸；SPIN 加 `rotation.y` 环绕；LASH 加 `rotation.z` 弧线。

8. **程序化动画无"重心转移"，像木偶**
   - 代码位置：`animation.mjs:107-125` `_idle` / `_move`；`127-156` `_attack`
   - 现象：idle 只有 `position.y` 正弦 + `rotation.z` 微摆，**没有 `rotation.x` 呼吸前倾、没有 `position.x` 重心侧移**；`_move` 的 `rotation.x=0.12` 是常数，不随速度变化 —— 截图 08-move / 13-move-a 里角色像"平移的馒头"，没有走路应有的前倾+对侧手臂摆动暗示。
   - 建议改法：idle 加 `rotation.x = sin(phase*0.5)*0.02` + `position.x = sin(phase*0.33)*0.015`；`_move` 的 `rotation.x` 改为 `0.08 + speedRatio*0.15`，并加 `rotation.z = sin(movePhase)*0.08`（已有但幅度太小，从 0.06 提到 0.1）。

9. **对手 AI 攻击无预警视觉，弹反只能靠背板**
   - 代码位置：`main.mjs:466-471` 对手攻击前摇只设 `counter.openWindow()`，**没有任何模型/材质预警**（对比 `battle.mjs:202-216` 的 `_flashOpponent` 只在玩家命中时闪白）。
   - 现象：截图 09/10/11 全程看不到对手身上有任何"我要打了"的信号，0.25s 窗口对新手等于不存在。
   - 建议改法：`counter.openWindow()` 时给对手 `emissive` 打红/白闪（复用 `_flashOpponent` 但改红色 `0xff3b3b`），并在对手头顶弹一个"！"DOM 元素。

10. **慢镜 `timeScale=0.3` 与 `cinematic.slowmoT` 双头驱动，互相打架**
    - 代码位置：`main.mjs:436` `const timeScale = cinematic.timeScale`；`main.mjs:286-289` 又用 `mv.chain.slowmo` 覆盖 `cinematic.slowmoT`；`tuning.mjs:31-35` 还有 `chain.slowmoScale/slowmoS` 从未被 main 读取。
    - 现象：三套慢镜参数（`cinematic.slowmoT`、`cinematic.timeScale`、`TUNING.chain.*`）只有第一套生效，另外两套是死参数。连携时 `cinematic.slowmoT` 被设成 `mv.chain.slowmo`（0.25~0.6s），但 `timeScale` 只看 `slowmoT>0` 就返回 0.3，**所有角色都变 0.3 倍速，包括玩家输入** —— 连携期间玩家操作被拖慢。
    - 建议改法：慢镜只作用于对手/AI/粒子，玩家 `move.step` 用未缩放的 `rawDt`；`TUNING.chain.*` 删除或接入 `cinematic`。

### 🟢 轻微（打磨项）

11. **终结技 `freezeT=0.8s` 但慢镜 `1.4s`，顿帧结束后仍在慢镜，节奏拖沓**
    - `battle.mjs:187` vs `cinematic.mjs:65-70`。建议终结 `freezeT` 降到 0.4s，慢镜 `1.0s`，且慢镜期间 `timeScale` 从 0.3 提到 0.45。

12. **连携窗口 2s 但 `squad.chainWindow=4.0`，两处不一致**
    - `tuning.mjs:10` `comboWindowS=2.0`（battle.mjs 用）vs `squad.mjs:148` `chainWindow=4.0`。建议统一为 2.5s，并在 HUD 显示倒计时环。

13. **震屏幅度偏小，ultimate 2.6° 在 40° FOV 下几乎不可见**
    - `tuning.mjs:20-28`。截图 09/10 里相机几乎没动。建议 `light/medium/heavy/ultimate` 提到 `0.4/0.8/1.4/2.4` 并加 `position` 偏移（当前只转 `rotation.x/z`）。

14. **受击反馈 `hit` 动作 0.18s 太短，且 `hitShake` 用 `Math.random()` 每帧抖动**
    - `animation.mjs:189-202`。建议时长提到 0.28s，抖动改用 `sin(t*80)` 的确定性衰减，避免"癫痫感"。

15. **`moves.mjs` 的 `impact.shape`（ring/line/arc/cloud/multi）完全没被消费**
    - `impact.mjs:185-196` 只有 4 档固定配置，`shape` 字段是死数据。建议按 shape 切换 Shockwave 几何（ring→RingGeometry，line→拉长 Plane，arc→TorusGeometry 片段）。

16. **对手 HP 200，玩家单段伤害 5~30，连段 DPS 与 HP 曲线不匹配**
    - `main.mjs:202` `opponent={hp:200}`；`combo.mjs` 三段 6/12/24。三连一套 42 伤害 + 失衡 3 格，需要 5 套连段才能击倒，但 90s 计时（`TUNING.roundTotalS`，虽标注不限时但 HUD 仍显示 ELAPSED）内打 5 套偏紧。建议对手 HP 降到 120 或把 finisher 伤害提到 40。

## 与绝区零的战斗差距

| 机制 | 绝区零 | 奶蛙零 | 差距 |
|---|---|---|---|
| 弹反窗口 | 约 0.15~0.25s，但**有明确视觉预警**（敌人武器闪光 + 音效） | 0.25s 窗口**零预警**，玩家无法反应 | 缺预警层，博弈不成立 |
| 连段窗口 | 段间可"预输入"，但**必须在前段命中后**才接受缓冲 | 0.35s 缓冲 > 段时长，可无脑连按 | 节奏博弈缺失 |
| 连携 | 失衡满 → 换人入场带连携攻击 + 专属演出 | 失衡满只触发慢镜，换人攻击是**独立于失衡**的 Tab 行为，且终结技死代码 | 核心爽点未打通 |
| 顿帧 | 轻击 2~3F、重击 4~6F、终结 8~12F | 3~5F 定义了但实际只生效 2~3F | 打击感弱一档 |
| 闪避 | 方向由输入决定，无输入后撤 | **随机左右** | 操作不可预期 |
| 角色差异 | 每角色独立动作模组 + 判定框 + 冲击帧 | 16 只共享同一套 `_attack`，仅数值不同 | "换壳即换招"名不副实 |

## 优先修复建议（Top 5，按性价比排序）

1. **修连携死代码（0.5 天）** — `main.mjs:283-293` 补 `squad.chainWindow=4.0`、`squad.chainCount++`；`battle.mjs:172-184` 用局部变量存 `combo` 再判终结。这是绝区零的核心爽点，不修等于没连携。
2. **修顿帧被慢镜双重折扣（0.5 天）** — `main.mjs:266` 改用 `TUNING.hitstopF/60`，`main.mjs:436` 慢镜期间锁 `timeScale=1.0` 只缩对手。打击感立刻提升一档。
3. **接 `ATTACK_STYLE` 到 `ProceduralAnim`（1 天）** — `animation.mjs:_attack` 按 6 种 style 分支轨迹，`play()` 传 `style`。16 只角色的差异从"数值"升级到"动作"，直接回应比赛"换壳即换招"的评分点。
4. **加对手攻击预警（0.5 天）** — `counter.openWindow()` 时给对手 `emissive` 红闪 + 头顶"!"DOM。让 0.25s 弹反窗口真正可用。
5. **修闪避方向 + 输入缓冲窗口（0.5 天）** — `battle.mjs:_dodge` 改读 `movement.dodgeDir`；`combo.mjs:105` 缓冲窗口改 `stageDur*0.6` 且仅在段进度 >0.6 时接受。消除"无脑连按"和"随机闪避"两个手感杀手。
