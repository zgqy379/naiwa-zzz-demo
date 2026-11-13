"""魔搭 Static 创空间：强制触发部署 + 轮询静态资源是否生效。

为什么需要「强制」：平台 API 返回的 `status=Running` 指的是**上一个**运行实例，
master 已经推了新提交但静态资源没重建时，状态仍然是 Running —— 此时必须再 POST
一次 deploy 才会重建。`ms-deploy-retry.py` 默认会跳过 Running 状态，这里加 --force。

用法：python scripts/lux3d/ms-force-deploy.py [--attempts 4] [--wait 900]
"""
import json, os, pickle, sys, time
import requests

CRED = os.path.join(os.path.expanduser("~"), ".modelscope", "credentials", "cookies")
API = "https://www.modelscope.cn/openapi/v1"
OWNER, REPO = "zgqy379", "naiwa-zero-demo"
ENTRY = "assets/index-CDoGGTde.js"   # 本轮定版入口（改了要同步）

argv = sys.argv[1:]
def arg(k, d):
    i = argv.index(k) if k in argv else -1
    return argv[i + 1] if i >= 0 and i + 1 < len(argv) else d
ATTEMPTS = int(arg("--attempts", 4))
WAIT = int(arg("--wait", 900))

jar = pickle.load(open(CRED, "rb"))
cookies = {c.name: c.value for c in jar}
sess = requests.Session()
sess.cookies.update(cookies)
sess.headers.update({
    "User-Agent": "Mozilla/5.0",
    "Referer": f"https://www.modelscope.cn/studios/{OWNER}/{REPO}",
})

def status():
    try:
        d = sess.get(f"{API}/studios/{OWNER}/{REPO}", timeout=60).json()
        data = d.get("data") or {}
        rt = data.get("runtime") or {}
        return data.get("status"), rt.get("status"), rt.get("error_message")
    except Exception as e:
        return "ERR", "ERR", str(e)[:80]

def trigger():
    r = sess.post(f"{API}/studios/{OWNER}/{REPO}/deploy", timeout=120)
    try:
        body = json.dumps(r.json().get("data"), ensure_ascii=False)
    except Exception:
        body = r.text[:200]
    return r.status_code, body

def entry_ok():
    try:
        r = requests.get(f"https://{OWNER}-{REPO}.ms.show/{ENTRY}", timeout=25)
        return r.status_code
    except Exception:
        return 0

print("当前:", status())
for a in range(1, ATTEMPTS + 1):
    print(f"[{a}] 强制触发部署 …")
    code, body = trigger()
    print(f"    trigger {code}: {body}")
    t0 = time.time()
    while time.time() - t0 < WAIT:
        time.sleep(15)
        st, rt, err = status()
        e = entry_ok()
        if e == 200:
            print(f"    -> 入口生效 {ENTRY}（用时 {int(time.time()-t0)}s，状态 {st}/{rt}）")
            break
        if rt in ("DeployFailed", "RunningFailed"):
            print(f"    -> {rt} err={err}")
            break
    else:
        print("    -> 超时未收敛")
    if entry_ok() == 200:
        break
    time.sleep(20)

print("最终:", status(), "entry:", entry_ok())
