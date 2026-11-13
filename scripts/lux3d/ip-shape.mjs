/**
 * 奶蛙 IP 形体修正版：按真实参考图（小红书实拍 / 奶龙母体）重写形体描述。
 *
 * 上一版做错的地方（对照实拍）：
 *   ✗ 做成「上下均匀的蛋 + 一块贴图肚子」→ 看着像鸡蛋玩偶
 *   ✗ 头和肚子一样大 → 丢了 meme 的灵魂比例
 *   ✗ 眼睛太大、位置居中
 *   ✓ 真实是：**巨大圆鼓的奶油白肚腹占下半身 60%+**、**小头直接坐在肚子上没有脖子**、
 *     小绿眼在身体偏上、**灰褐色短手**（能捧腹）、短腿 + 棕褐宽脚掌带趾头
 *
 * 本文件只放提示词与共用描述，生成脚本 batch.mjs 从 roster.json 读。
 */
export const IP_SHAPE = {
  // 身体：上小下大的水滴，巨大奶油白肚腹
  body:
    "a chubby pear-shaped cartoon mascot whose lower two thirds is one enormous round bulging cream-white belly " +
    "that juts forward like a big ball, the upper body tapers into a small rounded head that sits directly on top of " +
    "the belly with absolutely no neck, matte warm creamy yellow surface everywhere except the big cream-white belly patch",

  face:
    "two small round eyes placed high on the upper body, pale mint-green eye whites with small black pupils and a single " +
    "white highlight dot, one very short thin straight mouth line below the eyes, no eyebrows, no nose",

  limbs:
    "two short stubby arms with round mitten hands in a muted olive-brown color, arms hanging down and slightly forward " +
    "so the hands can rest on the big belly, two very short legs ending in wide flat brown feet with three stubby toes each",

  style:
    "smooth stylized 3D cartoon mascot, clean soft clay-like shading, slightly uncanny deadpan expression, " +
    "no clothing, no accessories, no props",
};

/** T-Pose 描述（官方绑骨要求：双臂水平外展） */
export const T_POSE =
  "standing upright on two short legs, full body T-pose, both short arms stretched straight out horizontally to the " +
  "sides in a perfect T shape, palms facing forward, feet flat on the ground";

export const RENDER_HINT =
  "three-quarter front view, clean solid light grey background, full body visible, high quality PBR material";

/** 组装最终提示词 */
export function buildPrompt({ bodyColor = "warm creamy yellow", accessories = "", extra = "" } = {}) {
  const body = IP_SHAPE.body.replace("matte warm creamy yellow surface", `matte ${bodyColor} surface`);
  return [
    body,
    IP_SHAPE.face,
    IP_SHAPE.limbs,
    accessories,
    T_POSE,
    RENDER_HINT,
    extra,
  ].filter(Boolean).join(", ");
}
