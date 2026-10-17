# 一念 · 自动求佛

> 在线访问：<https://orsonandrew.github.io/yinian-prayer/>  
> GitHub 仓库：<https://github.com/OrsonAndrew/yinian-prayer>

一个本地优先的禅意数字道场：点击金环叩拜、实时累积功德、可视化求佛过程，还可以设定每日定时自动叩拜。页面同时收录 12 处可访问的免费在线礼佛、木鱼与求签站点。

![一念 · 自动求佛 预览](./preview-desktop.png)

## 使用

直接双击 `index.html` 即可打开。页面自身不依赖任何外部资源或后端，离线也能求佛；只有点开「十方山门」里的第三方站点时需要联网。

也可以在当前目录启动一个静态服务器：

```powershell
py -3 -m http.server 8765
```

然后访问 <http://127.0.0.1:8765/>。

## 功能

- **求佛可视化**：金环进度、佛光、涟漪、功德浮字、粒子、香雾与「发心 → 叩首 → 回向」流程指示。
- **功德记录**：今日功德、累计功德、连续修行天数、七日柱状图、修行阶位与今日行迹，全部保存在浏览器 `localStorage`。
- **每日自动**：设定时辰与每次叩拜次数（18 / 36 / 108 拜）。到点后页面会在前台自动叩拜并播放完整动画。错过时辰可点「补今日功课」。
- **今日祈愿**：写下最多 60 字的愿望，供于佛前，只保存在本机。
- **木鱼声**：使用 Web Audio API 实时合成，无外部音频文件。
- **十方山门**：12 个免费在线礼佛、静心、求签与木鱼站点，支持分类筛选、新窗口访问与复制网址。
- **响应式**：桌面、平板与手机均可使用；支持 `prefers-reduced-motion`。

## 每日自动的边界

浏览器页面关闭后无法继续执行定时任务，因此「每日自动」需要**保持页面打开，并尽量留在前台**（后台标签页的定时器可能被浏览器节流）。页面不会上传任何数据，也不依赖服务器。

如果希望关机后仍然自动执行，需要把定时任务放到服务器、浏览器扩展或自动化工具中，这不是纯静态网页能做到的。

## 数据

- 存储键：`yinian-auto-prayer-v1`
- 清除方式：浏览器开发者工具 → Application → Local Storage，删除对应键；或在页面「修行录 → 今日行迹 → 清除」清除行迹（不会重置功德）。
- 所有功德均为本地虚拟数值，仅作文化体验与娱乐。

## 收录站点

| 道场 | 网址 | 类别 |
| --- | --- | --- |
| 拜拜 | https://baifo.life/ | 在线佛堂 |
| 随缘佛堂 | https://fo.wfqmj.com/ | 在线佛堂 |
| 赛博佛堂 | https://noheart2019.github.io/FoTang/ | 数字供佛 |
| 真如禅寺 · 网络佛堂 | https://zhenru.org/online-buddhist-temple.php | 寺院线上 |
| 净心道场 | https://rushiwowen.co/zen | 静心空间 |
| 赛博求签 | https://noheart2019.github.io/FoTang/qiuqian.html | 在线求签 |
| 拜拜 · 每日一签 | https://qian.baifo.life/ | 在线求签 |
| 968T · 电子木鱼 | https://968t.com/tools/wooden-fish/ | 电子木鱼 |
| UD5 · 电子木鱼 | https://www.ud5.com/tool/digital-wooden-fish | 电子木鱼 |
| 电子木鱼 · 赛博真经 | https://xzwzl6.github.io/dianzimuyu/ | 电子木鱼 |
| ToolKK · 电子木鱼 | https://www.toolkk.com/tools/wooden-fish | 电子木鱼 |
| 新木鱼 WoodenFish | https://nonloop.github.io/muyu/ | 电子木鱼 |

收录信息核验于 2026 年 10 月。第三方站点可能调整地址、功能或收费策略，以原站实际内容为准。

## 说明

本站是数字文化体验，不是宗教服务机构。功德是浏览器里的虚拟计数，不具宗教或现实效力。第三方链接归原站所有，本站不参与其内容与运营。
