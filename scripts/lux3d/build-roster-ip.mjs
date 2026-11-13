/**
 * 按真实 IP 形体（scripts/lux3d/ip-shape.mjs）重写花名册的 16 只提示词。
 * 底形由 ip-shape.mjs 统一提供（巨大奶油腹 + 小头无脖 + 绿眼圈圆眼 + 灰褐短手 + 短腿宽脚带趾），
 * 每只只改**配色**与**配件**——这正是该 IP 在网上的原生玩法（换装 / cos / 深色变体）。
 *
 * 用法：node scripts/lux3d/build-roster-ip.mjs
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { buildPrompt } from "./ip-shape.mjs";

const ROOT = "E:/naiwa-zzz";
const OUT = path.join(ROOT, "scripts", "lux3d", "roster.json");

/** 16 只：id / 名字 / 底色 / 配件（不改底形） */
const CAST = [
  { id: "shell_naiwa", name: "奶蛙", color: "warm creamy yellow", acc: "wearing small round black sunglasses over the small eyes and a thin gold chain necklace lying across the top of the cream belly", note: "亮黄底色 + 黑色圆墨镜 + 小金链（IP 原型）" },
  { id: "shell_naidou", name: "奶豆", color: "warm caramel brown", acc: "wearing a floppy olive bucket hat tilted on one side of the head and a small olive apron tied around the middle of the cream belly", note: "焦糖棕底色 + 渔夫帽 + 围裙" },
  { id: "shell_xiaonaiwa", name: "小奶蛙", color: "pale mint green", acc: "a noticeably smaller body than the other characters, wearing a tiny round pink candy wrapper as a little hat on the head", note: "薄荷绿底色 + 迷你体型 + 粉糖纸小帽" },
  { id: "shell_naidan", name: "奶蛋", color: "pure milk white", acc: "wearing a small broken eggshell cap on the head and a mustard-yellow apron tied around the middle of the cream belly", note: "纯奶白底色 + 蛋壳帽 + 芥末黄围裙" },
  { id: "shell_nashu", name: "奶鼠", color: "warm grey brown", acc: "with two big round mouse ears on top of the head and a thin long mouse tail curling out from behind the body", note: "灰褐底色 + 圆鼠耳 + 长鼠尾" },
  { id: "shell_naigou", name: "奶狗", color: "caramel tan", acc: "with two floppy droopy dog ears hanging down on the sides of the head and a red plaid scarf around the neck", note: "焦糖棕底色 + 垂耳 + 红格围巾" },
  { id: "shell_naifen", name: "奶粉", color: "milk powder white", acc: "wearing a small plain white folded cap on the head and a pale pink apron tied around the middle of the cream belly", note: "奶粉白底色 + 白帽 + 淡粉围裙" },
  { id: "shell_naiji", name: "奶鸡", color: "pale creamy yellow", acc: "wearing a tiny soft red fabric hat shaped like a rooster crest on the top of the head and a small orange scarf around the neck", note: "奶黄底色 + 布艺红鸡冠帽 + 橙围巾" },
  { id: "shell_naimao", name: "奶猫", color: "cool light grey", acc: "with two pointed cat ears on top of the head, thin whiskers on the cheeks and a long cat tail curling out from behind the body", note: "冷灰底色 + 猫耳 + 猫须 + 长猫尾" },
  { id: "shell_naishi", name: "奶屎", color: "olive green", acc: "with a small blob of green slime sitting on top of the head and a few green splatter marks on the body", note: "橄榄绿底色 + 头顶绿泥 + 泥点" },
  { id: "shell_dounai", name: "豆奶", color: "soy milk cream white", acc: "wearing a small blue milk-bottle cap on the head and a pale blue apron tied around the middle of the cream belly", note: "乳白底色 + 蓝奶瓶盖 + 淡蓝围裙" },
  { id: "shell_naitu", name: "奶兔", color: "snow white", acc: "with a pair of very long upright rabbit ears with pink inner ears on top of the head and a small round cotton tail behind the body", note: "雪白底色 + 长兔耳 + 粉耳芯 + 棉尾" },
  { id: "shell_naiyu", name: "奶鱼", color: "pale sky blue", acc: "with two translucent blue fish fins on the sides of the head and a wide blue tail fin behind the body", note: "天蓝底色 + 半透明鱼鳍 + 宽尾鳍" },
  { id: "shell_naicha", name: "奶茶", color: "milk tea brown", acc: "with a small teapot spout and a round teapot lid knob growing out of the top of the head", note: "奶茶棕底色 + 茶壶嘴与盖钮" },
  { id: "shell_naiping", name: "奶瓶", color: "milk white", acc: "with a small silver baby-bottle nipple on the top of the head and pale blue overalls straps over the shoulders", note: "奶白底色 + 银色奶嘴 + 蓝色背带裤" },
  { id: "shell_xigema", name: "西格玛奶蛙", color: "deep olive brown", acc: "wearing black sunglasses, a thick dark stubble beard around the mouth and a battered black tank top over the cream belly", note: "深橄榄褐底色 + 墨镜 + 络腮胡 + 黑背心（家族硬汉）" },
];

const roster = {
  _note: "奶蛙 IP 真实设定（2026-11-13 用真实浏览器核对小红书/抖音搜索结果页 + 奶蛙档案局/奶蛙百科交叉验证）：奶蛙 = 黄色奶油蛋形身体、头与躯干一体无脖子、**巨大的奶油白肚腹**占下半身大半、凸起小圆眼且眼白泛绿（黑小瞳 + 白高光）、一条细小笔直嘴线、**深橄榄褐连指手套手**与短腿宽脚掌（带趾头）、核心动作捧腹大笑。本花名册据此固定**底形**（见 scripts/lux3d/ip-shape.mjs），16 只只靠配色与配件区分——正是该 IP 在网上的原生玩法。",
  _shapeSource: "scripts/lux3d/ip-shape.mjs（buildPrompt 统一拼装底形）",
  _pose: "standing upright on two short legs, full body T-pose, both short arms stretched straight out horizontally to the sides in a perfect T shape, palms facing forward, feet flat on the ground",
  _tail: "three-quarter front view, clean solid light grey background, stylized cartoon 3D render, high quality PBR material",
  _style: "cartoon",
  _version: "G1",
  _faces: 30000,
  _actions: "Idle_Loop,Walk_Loop,Jog_Fwd_Loop,Sword_Regular_A,Sword_Regular_B,Sword_Regular_C,Sword_Regular_Combo,Hit_Chest,Roll,Death01",
  characters: CAST.map((c) => ({
    id: c.id,
    name: c.name,
    glb: c.id === "shell_naiwa" ? "naiwa_laugh_g1_runtime.glb" : c.id.replace("shell_", "naiwa_") + "_runtime.glb",
    distinctive: c.note,
    prompt: buildPrompt({ bodyColor: c.color, accessories: c.acc }),
  })),
};

writeFileSync(OUT, JSON.stringify(roster, null, 2) + "\n", "utf8");
console.log(`✓ 已重写花名册：${roster.characters.length} 只（底形统一 + 逐只配色/配件）`);
roster.characters.forEach((c) => console.log("  " + c.id.padEnd(18) + c.name.padEnd(9) + c.prompt.length + " 字"));
