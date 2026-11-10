# 用 gh api 部署 dist 到 gh-pages（绕过 git 协议限制）
$ErrorActionPreference = "Stop"

# === 发布闸门（2026-11-09 制作人要求拦截）===
# 未显式放行前一律拒绝部署；放行前先核对 docs/evidence/final-alignment-20261109.md 第 1-5 步。
# 放行方式：在同一会话里把环境变量 NAIWA_DEPLOY_OK 设为 1，再运行本脚本。
if ($env:NAIWA_DEPLOY_OK -ne "1") {
    Write-Output "DEPLOY-BLOCKED: 发布闸门未放行，本次未向 gh-pages 提交任何文件。"
    Write-Output "先看 E:\naiwa-zzz\docs\evidence\final-alignment-20261109.md（收口清单）。"
    Write-Output "确认报告书口径、视频规格、提交台账都对齐后，设置环境变量 NAIWA_DEPLOY_OK=1 再跑。"
    exit 1
}
$report = "E:\naiwa-zzz\docs\报告书.md"
if (Test-Path $report) {
    $head = (Get-Content $report -TotalCount 8 -Encoding UTF8) -join "`n"
    if ($head -match "深圳站" -or $head -match "董青云（个人参赛") {
        Write-Output "DEPLOY-BLOCKED: 报告书抬头仍是废弃口径（深圳站 / 董青云），先修再发。"
        exit 1
    }
}
# === 闸门结束 ===

$repo = "zgqy379/naiwa-zzz-demo"
$dist = "E:\naiwa-zzz\dist"

Write-Output "=== 收集文件 ==="
$files = @()
$files += Get-Item "$dist\index.html"
# 必须带 .nojekyll：gh-pages 默认走 Jekyll，会去扫 GLB / JS 并导致
# "Page build failed"。Vite 会把 public/.nojekyll 原样复制进 dist。
if (Test-Path "$dist\.nojekyll") { $files += Get-Item "$dist\.nojekyll" }
$files += Get-ChildItem "$dist\assets" -File
$files += Get-ChildItem "$dist\asset" -File
# 首页视频背景（2026-11-11 新增）：漏掉这一行，线上 index.html 里的
# ./bg/title.mp4 与 title-poster.jpg 会 404，WebGL 透镜的 VideoTexture 也拿不到画面。
# 注意：该脚本走 GitHub Contents API 逐文件 PUT，单个 11MB 视频的 base64 body
# 极可能超限；现役发布通道是魔搭 Static 创空间（git push master），本脚本仅留作备份。
if (Test-Path "$dist\bg") { $files += Get-ChildItem "$dist\bg" -File }
if (Test-Path "$dist\portrait") { $files += Get-ChildItem "$dist\portrait" -File }
# Aholo World 减面街区 GLB（2026-11-09 新增）。漏掉这一行，
# 线上运行时会 404，画面静默降级成没有写实层，与已录视频 / 报告书不一致。
if (Test-Path "$dist\world") {
    $files += Get-ChildItem "$dist\world" -File
}

Write-Output "共 $($files.Count) 个文件"

foreach ($f in $files) {
    $rel = $f.FullName.Substring($dist.Length + 1).Replace("\", "/")
    $content = [Convert]::ToBase64String([IO.File]::ReadAllBytes($f.FullName))
    
    # 获取现有 sha（若文件已存在）
    $sha = ""
    try {
        $sha = gh api "/repos/$repo/contents/$rel" --jq ".sha" 2>$null
    } catch { $sha = "" }
    
    # 构建 JSON body
    $body = @{
        message = "deploy: update $rel"
        content = $content
        branch  = "gh-pages"
    }
    if ($sha -match '^[a-f0-9]{40}$') { $body.sha = $sha }
    $json = $body | ConvertTo-Json -Compress
    
    # 写入临时文件（避免命令行长度限制）
    $tmp = [IO.Path]::GetTempFileName()
    [IO.File]::WriteAllText($tmp, $json)
    
    try {
        gh api -X PUT "/repos/$repo/contents/$rel" --input $tmp 2>&1 | Out-Null
        Write-Output "OK: $rel"
    } catch {
        Write-Output "FAIL: $rel - $($_.Exception.Message)"
    }
    Remove-Item $tmp -ErrorAction SilentlyContinue
}

# 每个文件一次 PUT = 一次 commit = 一次 Pages 构建。20 次连续 push 会让
# 前 19 次构建被后续 push 打断（实测全部报 "Page build failed"）。
# 全部传完后再主动触发一次干净构建，让站点稳定落在最终 commit 上。
try {
    gh api -X POST "/repos/$repo/pages/builds" 2>&1 | Out-Null
    Write-Output "Pages build triggered"
} catch {
    Write-Output "WARN: 主动触发 Pages 构建失败，等待 GitHub 自动构建即可"
}

Write-Output "=== 完成 ==="
