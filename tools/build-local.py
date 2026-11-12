#!/usr/bin/env python3
"""生成 local/ 脚本包：让双击 index.html（file://）打开时，鼠标流体玻璃也能做真实折射。

浏览器把本地图片当作“别的网站”的图，画进画布后 WebGL 就读不到画面；改用 data: 地址就没有这个限制。
本脚本把 frames/hd/*.webp 和 masks/*.webp 按每 8 张一组，写成 local/fNN.js、local/mNN.js；
frames/still/ 里的超清静帧各写一个 local/sNNNN.js。
只在本机使用（.gitignore 已排除），换了序列帧或遮罩后重新运行一次即可：

    python3 tools/build-local.py
"""
import base64, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PACK = 8  # 和 app.js 里的 PACK 一致


def build(kind, folder, digits):
    src = os.path.join(ROOT, folder)
    names = sorted(f for f in os.listdir(src) if f.endswith('.webp') and len(f) == digits + 5)
    count = 0
    for g in range(0, len(names), PACK):
        urls = []
        for f in names[g:g + PACK]:
            with open(os.path.join(src, f), 'rb') as fh:
                urls.append('"data:image/webp;base64,' + base64.b64encode(fh.read()).decode() + '"')
        name = f'{kind}{g // PACK:02d}'
        with open(os.path.join(ROOT, 'local', name + '.js'), 'w') as out:
            out.write(f'__phxPack("{name}",[' + ','.join(urls) + ']);\n')
        count += 1
    return len(names), count


if __name__ == '__main__':
    os.makedirs(os.path.join(ROOT, 'local'), exist_ok=True)
    for f in os.listdir(os.path.join(ROOT, 'local')):
        if f.endswith('.js'):
            os.remove(os.path.join(ROOT, 'local', f))
    nf, pf = build('f', 'frames/hd', 4)
    nm, pm = build('m', 'masks', 3)
    still = os.path.join(ROOT, 'frames', 'still')
    for f in sorted(os.listdir(still)) if os.path.isdir(still) else []:
        if f.endswith('.webp'):
            with open(os.path.join(still, f), 'rb') as fh:
                url = 'data:image/webp;base64,' + base64.b64encode(fh.read()).decode()
            with open(os.path.join(ROOT, 'local', 's' + f[:4] + '.js'), 'w') as out:
                out.write(f'__phxPack("s{f[:4]}",["{url}"]);\n')
    size = sum(os.path.getsize(os.path.join(ROOT, 'local', f)) for f in os.listdir(os.path.join(ROOT, 'local')))
    print(f'序列帧 {nf} 张 → {pf} 个包，遮罩 {nm} 张 → {pm} 个包，共 {size / 1e6:.1f} MB')
    sys.exit(0 if nf and nm else 1)
