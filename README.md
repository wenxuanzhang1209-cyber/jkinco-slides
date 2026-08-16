<p align="left">
  <img src="https://github.com/wenxuanzhang1209-cyber/jkinco-slides/actions/workflows/ci.yml/badge.svg" />
  <img src="https://img.shields.io/github/license/wenxuanzhang1209-cyber/jkinco-slides" />
  <img src="https://img.shields.io/github/v/release/wenxuanzhang1209-cyber/jkinco-slides?label=release" />
</p>

# JKinco Slides — AI 原生可编辑 PPT 平台

## 界面预览

![JKinco Slides 编辑器](docs/screenshots/editor.png)

按照《JKinco Slides 世界级 AI 原生可编辑 PPT 平台——成熟产品开发方案》(v1.0) 从零完成的完整实现。
产品本体：**一个 AI Native、对象级可编辑、设计级交互、支持 PPTX 往返的 Web Presentation Studio。**

## 快速开始

```bash
# 依赖（Node ≥ 20，pnpm 9）
pnpm install

# 运行全部单元测试（269 个）
pnpm -r test

# 运行全部类型检查
pnpm -r typecheck

# 启动开发服务器（http://localhost:4173）
pnpm --filter @jkinco/web dev

# 生产构建
pnpm --filter @jkinco/web build

# E2E 测试（Playwright，需先 npx playwright install chromium）
pnpm --filter @jkinco/web test:e2e
```

## 目录结构

```
apps/
  web/                  React + Vite + Tailwind 编辑器 Web 应用
packages/
  scene-schema/         语义 Scene Graph 核心 Schema（§3/§37，960×540 pt）
  command-engine/       命令系统：validate → execute → inverse + 序列化（§38/§7.2）
  slide-engine/         文档引擎：选择、视口、几何、吸附、剪贴板、快捷键、持久化
  rich-text/            文本测量、压缩、§5.3 溢出处理顺序
  layout-engine/        语义版式模式 ×10 + 约束求解器 + 质量评分 + 密度门禁（§14/§5）
  diagram-engine/       原生图示对象 + 10 种布局算法（§11）
  chart-engine/         Data-native 图表：ECharts 选项、类型推荐、数据绑定（§12）
  renderer/             Slide → SVG / 打印 HTML（§17）
  qa-engine/            Visual QA：几何/排版/内容/视觉/整册检查 + 自动修复（§15）
  style-engine/         主题应用、Style DNA 提取、封面/章节语法、A/B/C 变体（§10/§28）
  brand-engine/         企业 Brand Kit：Logo/字体/页脚/保密标识/水印/锁定规则（§30）
  ai-sdk/               可插拔模型 Provider + 任务分级路由（§40，离线确定性回退）
  ai-planner/           Deck Graph、Storyboard、渐进式生成管线（§4/§9/§26/§8.3）
  ai-editor/            作用域 AI 编辑（对象/选区/页/章节/整册 → 命令序列）（§27）
  pptx-export/          真 PPTX 导出（PptxGenJS：文本仍是文本、形状仍是形状）（§17）
  pptx-import/          高保真 PPTX 导入（原生/近似/预览/不支持分级，永不静默破坏）（§16）
  collaboration/        Yjs 命令日志 CRDT + Presence 实时协同（§19/§20）
  design-system/        Design Tokens（§8.1 动效规范）+ Radix 无障碍组件
```

## 已实现的方案要点

| 方案章节 | 实现 |
|---|---|
| §0 五个引擎 | Narrative Planner / Slide Compiler / Layout Engine / AI Co-editor / PPTX Round-trip |
| §2 Hybrid DOM+SVG | 文本 DOM、形状/连线 SVG、图表 ECharts、统一 960×540 逻辑坐标 |
| §3 语义 Scene Graph | role / semantic(topic, importance, sourceIds, aiEditable) |
| §4 生成链路 | 研究 → 叙事 → Deck Graph（只生成结构不生成坐标）→ Storyboard → 版式 → 约束求解 → QA |
| §5 少文字硬约束 | 标题≤18 / 正文≤120 / 项目符号≤5 / 字号下限 18；密度分（≤60 良好，>85 拆页）；§5.3 五步顺序（缩小字号是最后手段） |
| §6 编辑器布局 | 缩略图轨道 / 画布 / 上下文检查器 / 底部 AI Bar / ⌘K 命令面板 |
| §7 编辑手感 | 框选、多选、Alt 复制、Shift 约束、方向键 1/10pt、吸附 + 智能参考线、无限 Undo、复制/粘贴保留样式、锁定/隐藏、层级、对齐/分布 |
| §7.2 AI 复用命令系统 | AI 的所有修改都是可撤销、可回放、可审计的 Command |
| §8 动效规范 | 80–350ms 分档时长、拖拽零延迟（预览+松手提交） |
| §9 Storyboard | 生成前确认故事线：改顺序/删除/合并/增加/改核心信息/图为主/数据为主 |
| §10 Style DNA | 6 套子风格主题 + 从历史 PPT 确定性提取 Style DNA |
| §11 Diagram-native | 全部真对象，10 种布局算法（层次/DAG/泳道/时间线/放射/矩阵/架构/漏斗/环/金字塔） |
| §12 Data-native | 图表绑定数据集，"Update deck" 全册刷新 |
| §13 AI 右键 | 按元素类型（Text/Diagram/Image/Slide）出 AI 动作 |
| §14 三层 Layout | 语义模式 → 约束求解器 → 质量评分（层级/对齐/间距/平衡/密度/对比/品牌/相似度惩罚），3–8 候选 |
| §15 Visual QA | 五组检查 + 自动修复命令 + Ready 状态 |
| §16 PPTX 导入 | 文本/形状/图片/连线/表格/图表解析，元素分级，SmartArt 转换 |
| §17 真 PPTX 导出 | PPTX/JSON/SVG/PNG/PDF 打印视图 |
| §18 演示模式 | 演讲者视图/备注/计时器/激光笔/画笔/聚光灯/演讲稿/预计时长/Q&A 预测 |
| §19 协同 | Yjs 命令日志 CRDT + 实时光标 Presence + 分享权限 UI |
| §25/§26 首页与新建 | "你要讲什么？" 主入口、最多 3 个澄清问题、Storyboard、渐进式构建 |
| §27 AI 修改范围 | 对象/选区/页/所选页/章节/整册 |
| §28 多变体 | A Executive / B Visual / C Technical |
| §30 Brand Kit | Logo/主辅色/页脚/保密标识/水印/管理员锁定 |
| §34 版本控制 | 命名 checkpoint 保存/列表/恢复 |
| §35 MVP 清单 | 20 项全部实现 |
| §43 测试门禁 | 单元 269 项 + PPTX 往返语料 + Playwright E2E 6 项 |
| §44 手感细节 | 双击即编辑/选框精准/吸附不粘/拖拽无延迟/复制粘贴保样式/AI 可撤销/缩略图实时/导出不错位 |

## 测试结果（全部通过）

- **单元测试：269 passed / 269**（19 个包 + Web 应用）
- **类型检查：0 errors**（全部包，strict + noUncheckedIndexedAccess）
- **生产构建：成功**
- **Playwright E2E：6 passed / 6**（创建→生成→Storyboard→构建→编辑→拖拽→Undo→导入→导出→分享→演示→AI 修改）

## AI 说明

- 默认使用 `LocalRuleProvider`（确定性离线规则引擎）：无需 API Key 即可完整跑通生成、精简、改写、版式、密度门禁与 QA。
- 通过 `createDefaultRouter({ openai: { apiKey, baseURL, model } })` 接入 OpenAI 兼容端点后，推理任务自动路由到真实模型（§40 可插拔）。
