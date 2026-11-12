"""查魔搭创空间部署状态（只读 OpenAPI，展开 data）。"""
import json, os, pickle
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

r = sess.get(f"{API}/studios/{owner}/{repo}", timeout=60)
d = r.json()
data = d.get("data") or {}
print("top keys:", ", ".join(data.keys()))
print(json.dumps(data, ensure_ascii=False, indent=1)[:3000])
