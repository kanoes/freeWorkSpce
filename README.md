# freeWorkSpce

交易账本现已迁到 `React + Vite`，并继续保持：

- `IndexedDB` 本地存储
- `Firebase Auth + Firestore` 云同步
- CSV 导入与手动录入共用一套交易 schema
- 现物 / 信用分开统计
- 分红规则快照与 2026-04-01 起的分红口径

## 本地开发

```bash
npm install
npm run dev
```

## 生产构建

```bash
npm run build
```

构建产物会输出到 `dist/`。

## GitHub Pages

项目已在 [vite.config.js](/Users/enkanoe/Documents/Personal/freeWorkSpce/vite.config.js) 里配置：

- `base: '/freeWorkSpce/'`

这适配当前的 GitHub Pages 地址：

- `https://kanoes.github.io/freeWorkSpce/`

如果以后仓库名变化，需要同步修改这个 `base`。

## 主要目录

- [src/App.jsx](/Users/enkanoe/Documents/Personal/freeWorkSpce/src/App.jsx)：React 主界面
- [src/main.jsx](/Users/enkanoe/Documents/Personal/freeWorkSpce/src/main.jsx)：React 入口
- [src/styles.css](/Users/enkanoe/Documents/Personal/freeWorkSpce/src/styles.css)：React 新增样式层
- [app.js](/Users/enkanoe/Documents/Personal/freeWorkSpce/app.js)：保留下来的交易内核、IndexedDB、CSV、Firebase 逻辑
- [styles.css](/Users/enkanoe/Documents/Personal/freeWorkSpce/styles.css)：原有视觉基础样式
