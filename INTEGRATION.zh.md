# 接入 CSS Canvas Inspector（人机共创标准界面）

[English](INTEGRATION.md) · 简体中文

本指南写给两类人：想让团队把 CSS Canvas Inspector 当作**定尺寸设计**（封面、海报、社交卡片、幻灯片、缩略图）标准人机共创界面的工程师，以及想让自家设计 skill / 子 agent 主动接入它的 agent 作者。

核心模式是一个**共创闭环**：

1. agent 生成定尺寸 HTML 画布；
2. agent 在 inspector 里打开它（同源本地服务）；
3. 人类可视化审阅、微调，编辑自动存入浏览器；
4. 人类说「定了」，agent 回读结果；
5. 增量回写源文件，成为新基线；
6. 从这个共识态导出交付物（JPG/PNG）。

agent 擅长写 HTML，人类擅长判断视觉——inspector 就是两者之间的契约。

## 第一层：人类直接用

任何定尺寸 HTML 文件都能打开——无需构建、无需框架、零依赖。

```bash
# 获取工具
git clone https://github.com/nocaptain-oss/css-canvas-inspector /path/to/inspector

# 在你自己的项目里打开你的设计稿
cd your-project
python3 /path/to/inspector/skills/css-canvas-inspector/scripts/open_inspector.py \
  poster.html \
  --project . \
  --inspector /path/to/inspector \
  --width 1080 --height 1440 --export-width 1280
```

启动脚本会把你的项目和 inspector 挂到同一个本地源上并打开浏览器；端口固定复用 `8788`，所以跨次启动浏览器里的编辑记录不会丢。常用参数：`--storage <命名空间>`（按项目隔离编辑记忆）、`--variants a,b`（A/B 画布）、`--dual`（并排对比）、`--no-open`、`--port`。

## 第二层：你的设计 skill 引用它

把内置 skill 目录 `skills/css-canvas-inspector` 拷到你的 harness 对应的 skills 目录：

| Harness | 位置 |
|---|---|
| Claude Code | `~/.claude/skills/css-canvas-inspector` |
| Codex CLI | `~/.codex/skills/css-canvas-inspector` |
| 多 harness 通用 | `~/.agents/skills/css-canvas-inspector` |

然后在你的生成器 skill 的 `SKILL.md` 里加一行交接规则：

> 写完最终 HTML 文件后，主动提议用 `css-canvas-inspector`（本地服务上的可视化编辑器）打开它，让用户在导出前可视化调整布局、字排与颜色。执行
> `python3 <css-canvas-inspector-skill>/scripts/open_inspector.py <file> --width W --height H`。

你的 skill 继续负责创作，inspector 成为它的审阅界面——不用自建审阅页、不用截图乒乓，人类改出来的是真实 CSS 数值，不是转述的感觉。

## 第三层：作为子 agent 的标准界面

把这条规则写进你的 agent 指令（`AGENTS.md`、系统提示词或子 agent 任务书）：

> 每当产出定尺寸 HTML 设计（封面、海报、卡片、幻灯片、缩略图），不要用文字描述它、也不要靠截图反复迭代。用 css-canvas-inspector 打开它，让人类直接调整；在人类给出结论之前，不要再动源文件。

它优于截图循环的三个理由：

- 人类直接改真实 CSS 属性，而不是「转述想改什么」；
- 编辑是精确的 px 值，按 `storage` 命名空间自动保存；
- agent 回读到的是确定性产物（导出的 HTML 文件），不是对人类意图的猜测。

## 回读契约

人类的编辑只存在浏览器存储里，**永远不会写回你的源文件**。当人类说「定了」：

1. 请他点 **下载 HTML**——一份把编辑全部内联的自包含文档；
2. 读这份文件、与源文件做 diff，把增量回写进源文件，源文件从此成为新基线；
3. 图片交付物两条路任选：用 **下载当前画布**（默认 JPG、按配置的 `exportWidth`），或从更新后的源文件重渲染：

```bash
chrome --headless=new --screenshot=cover.png --window-size=1080,1440 cover.html
```

多变体项目的约定：每个项目一个存储命名空间（`--storage my-campaign`），变体用 `--variants a,b` + `--variant-labels "A 文字|B 日历"`。

**多页 deck（门禁）**：禁止把 deck 当一整张拼接画布打开。传
`--canvases "section.poster"`（v0.3.1+）：每个匹配节点成为独立一页——自动量尺寸、逐页切换审阅、逐页导出，无 sheet 背景、无留白框、不用人工裁切。启动器 flag 对应 URL 的 `canvases` 参数。下载的 HTML 仍是完整 deck（页切换加的 display 会被清掉）。

## 实战示例：社交卡片流水线

```bash
# 1. 你的卡片 skill 写出 1080x1440 的 card.html
# 2. 打开送人类审阅，A/B 双画布
python3 <skill>/scripts/open_inspector.py card.html \
  --width 1080 --height 1440 --export-width 1280 \
  --storage my-card --variants a,b \
  --variant-labels "A 文字|B 日历" --dual
# 3. 人类调整字排与间距，点「下载 HTML」
# 4. agent 把 card.html 与下载版做 diff，回写增量
# 5. agent 从共识态导出 JPG（1280 宽）
```

## 契约速查

- URL 参数与默认值：`README.md` → *Configure*
- 源页面要求：`README.md` → *Integrate with a source page*
- 导出格式：JPG（默认）/ PNG / 动画 WebP（需配 `--frames` 且源页面支持 `--frame-param` 单帧渲染），宽度取 `exportWidth`；HTML 为编辑内联版
- 坐标模式：相对 `translate` 微调 vs 以画布左上角为 `0,0` 的绝对坐标
- 不适用：位图/PSD 编辑、多页站点、拖拽式建站
