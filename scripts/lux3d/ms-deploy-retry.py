"""魔搭部署：触发 + 轮询状态（失败自动重试）。只调 OpenAPI。"""
import json, os, pickle, sys, time
import requests

CRED = os.path.join(os.path.expanduser("~"), ".modelscope", "credentials", "cookies")
API = "https://www.modelscope.cn/openapi/v1"
owner, repo = "zgqy379", "naiwa-zero-demo"

jar = pickle.load(open(CRED, "rb"))
cookies = {c.name: c.value for c in jar}
sess = requests.Session()
sess.cookies.update(cookies)
sess.headers.update({
    "User-Agent": "Mozilla/5.0",
    "Referer": f"https://www.modelscope.cn/studios/{owner}/{repo}",
})


def status():
    try:
        d = sess.get(f"{API}/studios/{owner}/{repo}", timeout=60).json()
        data = d.get("data") or {}
        return data.get("status"), (data.get("runtime") or {}).get("error_message")
    except Exception as e:
        return "ERR", str(e)[:80]


def trigger():
    r = sess.post(f"{API}/studios/{owner}/{repo}/deploy", timeout=120)
    body = r.text[:300]
    try:
        body = json.dumps(r.json().get("data"), ensure_ascii=False)
    except Exception:
        pass
    return r.status_code, body


print("当前状态:", status())
attempts = int(sys.argv[1]) if len(sys.argv) > 1 else 4
for a in range(1, attempts + 1):
    st, err = status()
    if st in ("Running", "running", "Succeeded", "Ready"):
        print(f"[{a}] 已是 {st}，无需重部署")
        break
    print(f"[{a}] 状态 {st} 触发部署…")
    code, body = trigger()
    print(f"    trigger {code}: {body}")
    t0 = time.time()
    while time.time() - t0 < 900:
        time.sleep(15)
        st, err = status()
        if st in ("Running", "running", "Succeeded", "Ready"):
            print(f"    -> {st}（用时 {int(time.time() - t0)}s）")
            break
        if st in ("DeployFailed", "RunningFailed", "BUILDING_FAILED"):
            print(f"    -> {st} err={err}")
            break
    else:
        print("    -> 超时未收敛")
    if st in ("Running", "running", "Succeeded", "Ready"):
        break
    time.sleep(20)

st, err = status()
print("最终状态:", st, "err=", err)
