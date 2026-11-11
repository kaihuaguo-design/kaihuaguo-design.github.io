# PORTFOLIO · 郭凯华 2026 UI 作品集（神凰版）

一镜到底的「神凰」开场动效 + Figma 作品集在线阅读 + 高清 PDF 下载。纯静态网站（HTML / CSS / JS），不需要构建，直接上传到 GitHub Pages 即可访问。

## 目录结构

```
index.html            页面结构
style.css             样式（神凰配色：深海蓝 + 鎏金）
app.js                交互：序列帧播放、前景抠像、目录、作品阅读页、下载
frames/hd/*.webp      神凰序列帧 1920×1080（358 帧，约 24 MB）
frames/sd/*.webp      神凰序列帧 1280×720（省流档，约 13 MB）
masks/*.webp          前景遮罩 960×540（每张上下两帧，让神凰挡在标题前面）
works/<作品>/NN-1280|2560|3840.webp   作品集每页三档清晰度
portfolio/portfolio-2026.pdf          完整作品集 PDF（39 页，3840×2160）
.nojekyll             让 GitHub Pages 原样发布静态文件
```

## 发布到 GitHub Pages

1. 在 GitHub 新建一个仓库（例如 `portfolio`）。
2. 在本文件夹里执行：

   ```bash
   git remote add origin https://github.com/<你的用户名>/portfolio.git
   ```

   ```bash
   git push -u origin main --tags
   ```

3. 仓库 Settings → Pages → Source 选 `Deploy from a branch`，分支选 `main` / `(root)`，保存。
4. 一两分钟后访问 `https://<你的用户名>.github.io/portfolio/`。

> 本地预览：在本文件夹运行 `python3 -m http.server 8000`，打开 http://localhost:8000 。直接双击 index.html 也能打开（会自动退回普通图片加载）。

## 清晰度与加载速度

| 项目 | 做法 |
| --- | --- |
| 开场视频 | 用 1920×1080 原片重新出帧（原凤凰站是 1280×720 JPG），调色（提对比、天空更通透、鎏金更暖）+ 自适应锐化，WebP 编码后总量反而从 62 MB 降到 24 MB |
| 起播速度 | 先拉首帧和开场「骨架帧」（每 4 帧一张，约 2.7 MB），按实测网速估算剩余帧能及时补齐就立刻开播，其余在后台补 |
| 网速自适应 | 先实测前 12 帧的下载速度，补齐开场预计超过 9 秒就自动切 720p；省流模式 / 2G / 低内存设备直接用 720p |
| 前景抠像 | 原 640×360 遮罩用 1080p 原帧做引导滤波精修到 960×540，并补回冠羽尖，边缘无锯齿 |
| 作品页 | 每页 1280 / 2560 / 3840 三档，`srcset` 按屏幕宽度和像素密度自动选；首两页优先加载，其余懒加载；手机上点开放大直接用 3840 超清图 |
| PDF | 39 页，每页 3840×2160，JPEG 4:4:4（不做色度抽样，小字边缘不糊），31 MB |

## 屏幕适配

已走查：手机 320 / 375 竖屏、平板 768 竖屏、桌面 1024 / 1920 横屏。竖屏时画面裁成中间一条、标题移到下方、目录卡片 2×2；≤360px 时导航收成图标 + 「下载PDF」。

## 修改内容

- 姓名 / 邮箱 / 微信：`app.js` 顶部的 `CONTACT`，填上邮箱或微信会显示在结尾页，点击可复制。
- 作品标题与每页说明（图片 alt）：`app.js` 里的 `WORKS`。
- 目录卡片文字：`index.html` 里的 `.cards`。

版本记录见 [CHANGELOG.md](CHANGELOG.md)。
