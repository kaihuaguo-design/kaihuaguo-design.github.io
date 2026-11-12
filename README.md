# PORTFOLIO · 郭凯华 2026 UI 作品集（神凰版）

一镜到底的「神凰」开场动效 + 关于我 + Figma 作品集在线阅读 + 结束页与高清 PDF 下载，共四幕：01 首页 → 02 关于我 → 03 目录 → 04 结束。纯静态网站（HTML / CSS / JS），不需要构建，直接上传到 GitHub Pages 即可访问。

## 目录结构

```
index.html            页面结构
style.css             样式（神凰配色：深海蓝 + 鎏金）
app.js                交互：序列帧播放、前景抠像、四幕切换与镜头推移、关于我 / 结束页入场、作品阅读页、下载
frames/hd/*.webp      神凰序列帧 1920×1080（358 帧，约 30 MB）
frames/sd/*.webp      神凰序列帧 1280×720（省流档，约 16 MB）
frames/still/*.webp   2880 超清静帧：首页定格帧、末帧（停下来看的画面）
masks/*.webp          前景遮罩 960×540（每张上下两帧，让神凰挡在标题前面）
works/<作品>/NN-1280|2560|3840.webp   作品集每页三档清晰度
works/about/portrait-*.webp           「关于我」里的肖像卡
portfolio/portfolio-2026.pdf          完整作品集 PDF（39 页，3840×2160）
.nojekyll             让 GitHub Pages 原样发布静态文件
本地预览.command      双击即可在本机预览（效果和发布后一致）
tools/build-local.py  生成 local/ 本地包（见下）
local/*.js            本地包：双击 index.html 打开时用，不上传（.gitignore 已排除）
```

## 发布到 GitHub Pages

网址：https://kaihuaguo-design.github.io/

- 仓库：GitHub 组织 `kaihuaguo-design` 下的 `kaihuaguo-design.github.io`（公开）。
- 发布方式：Settings → Pages → Deploy from a branch，`main` / `(root)`。以后改完内容，推送到 `main` 一两分钟后自动更新：

   ```bash
   git push origin main --tags
   ```

## 访问量与下载量

用 GoatCounter（免费、不用 Cookie、不加载统计脚本，只发一个 1 像素的计数请求，对加载速度没有影响）：

- **访问量**：每次打开网站记一次，后台首页的 Pageviews / Visitors。
- **下载量**：每次点“下载 PDF”（顶部导航、结束页、阅读页底部）记一次，后台事件 `download-pdf`。
- 本机预览（双击打开、localhost）不计数。
- 查看：https://kaihuaguo-design.goatcounter.com （注册 GoatCounter 时站点代码填 `kaihuaguo-design`）。

> 本地预览：双击 `本地预览.command`（会自动打开浏览器；等同于在本文件夹运行 `python3 -m http.server 8000`）。
> 直接双击 index.html 也是完整效果：浏览器不许网页读取本地图片的画面，鼠标的流体玻璃本来做不了折射，所以本地打开时改从 `local/` 里的本地包加载同一批画面。
> `local/` 只在本机使用，不随 GitHub 发布（线上不需要）。换了序列帧或遮罩后运行 `python3 tools/build-local.py` 重新生成；没有 `local/` 时页面照常能看，只是没有流体尾巴。

## 清晰度与加载速度

| 项目 | 做法 |
| --- | --- |
| 开场视频 | 原片只有 1080p 且压缩较重，先用 macOS 自带的苹果视频超分（VideoToolbox，4 倍，按视频模式逐帧处理，前后帧不闪）放大到 7680 宽，再缩回 2880 调色，最后出 1920 序列帧——等于“高清原片缩小”，和白虎站同一个道理。调色：色阶拉开、天空提纯成晴空蓝、羽毛提白、鎏金提饱和、天空去色带。WebP 总量 30 MB（原凤凰站 62 MB） |
| 停留画面 | 首页定格帧和末帧（关于我 / 目录 / 结束都停在这一帧）另出 2880 宽超清静帧，序列帧到齐后再加载；屏幕物理宽度不到 2000 像素时不加载 |
| 起播速度 | 先拉首帧和开场「骨架帧」（每 4 帧一张，约 3.5 MB），按实测网速估算剩余帧能及时补齐就立刻开播，其余在后台补 |
| 网速自适应 | 先实测前 12 帧的下载速度，补齐开场预计超过 9 秒就自动切 720p；省流模式 / 2G / 低内存设备直接用 720p |
| 前景抠像 | 原 640×360 遮罩用 1080p 原帧做引导滤波精修到 960×540，并补回冠羽尖，边缘无锯齿 |
| 作品页 | 每页 1280 / 2560 / 3840 三档，`srcset` 按屏幕宽度和像素密度自动选；首两页优先加载，其余懒加载；手机上点开放大直接用 3840 超清图 |
| PDF | 39 页，每页 3840×2160，JPEG 4:4:4（不做色度抽样，小字边缘不糊），31 MB |

## 屏幕适配

已走查：手机 320 / 375 竖屏、平板 768 竖屏、桌面 1024 / 1920 横屏。竖屏时画面裁成中间一条、标题移到下方、目录卡片 2×2；≤360px 时导航收成图标 + 「下载PDF」。

## 修改内容

- 姓名 / 邮箱 / 微信：`app.js` 顶部的 `CONTACT`，填上邮箱或微信会显示在结束页，点击可复制。
- 关于我的文字与经历：`index.html` 里的 `.about`；肖像图在 `works/about/`。
- 作品标题与每页说明（图片 alt）：`app.js` 里的 `WORKS`。
- 目录卡片文字：`index.html` 里的 `.cards`。

版本记录见 [CHANGELOG.md](CHANGELOG.md)。
