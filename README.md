# 北斗三维星座态势 / BeiDou Earth Constellation

一个基于 Vite、React、TypeScript、CesiumJS 和 satellite.js 构建的北斗卫星星座三维可视化网页应用。

An interactive 3D BeiDou constellation visualization built with Vite, React, TypeScript, CesiumJS, and satellite.js.

![BeiDou Earth Constellation preview](docs/images/beidou-earth-preview.jpg)

## 功能特性

- 三维地球场景，展示北斗卫星位置、标签和轨道线。
- 基于公开 TLE 数据和 SGP4 模型推算卫星位置。
- 卫星列表支持官方北京时间发射日期、发射场、轨道类型筛选、搜索和排序。
- 支持播放/暂停、时间倍速和回到当前时间。
- 在线加载 CelesTrak 公开数据，并提供本地快照作为网络失败时的备用数据。

## 移动端适配

界面支持桌面和移动端视口。在小屏幕上，状态栏和控制面板会叠放在全屏 Cesium 场景之上，同时保留卫星列表、筛选和时间播放控制。

<img src="docs/images/beidou-earth-mobile.png" alt="BeiDou Earth Constellation mobile preview" width="320" />

## 数据来源

- 官方公开信息：发射日期和星座背景参考 [北斗卫星导航系统官网](http://www.beidou.gov.cn/)。
- 公开轨道数据：TLE 记录来自 [CelesTrak BeiDou GP elements](https://celestrak.org/NORAD/elements/gp.php?GROUP=beidou&FORMAT=tle)。
- 公开目录元数据：卫星目录字段来自 [CelesTrak SATCAT](https://celestrak.org/satcat/search.php)。
- 本地快照：`public/data/` 下的文件是公开数据缓存，用于离线或网络异常时回退显示。

## 本地运行

```bash
npm install
npm run dev
```

打开 Vite 输出的本地地址，通常是 `http://localhost:5173/`。

## 构建检查

```bash
npm run build
npm run lint
```

## 许可证

MIT

---

## Features

- 3D Earth scene with BeiDou satellite positions, labels, and orbit tracks.
- Satellite positions propagated from public TLE data with the SGP4 model.
- Satellite list with official Beijing launch dates, launch sites, orbit type filters, search, and sorting.
- Simulation controls for play/pause, speed, and returning to current time.
- CelesTrak online data with local snapshot fallback.

## Responsive Layout

The interface supports desktop and mobile viewports. On smaller screens, the status bar and controls stack over the full-screen Cesium scene while preserving the satellite list, filters, and playback controls.

## Data Sources

- Official public information: launch dates and constellation background are referenced from the [BeiDou Navigation Satellite System official website](http://www.beidou.gov.cn/).
- Public orbital data: TLE records are loaded from [CelesTrak BeiDou GP elements](https://celestrak.org/NORAD/elements/gp.php?GROUP=beidou&FORMAT=tle).
- Public catalog metadata: satellite catalog fields are loaded from [CelesTrak SATCAT](https://celestrak.org/satcat/search.php).
- Local snapshots: files under `public/data/` are cached public-data fallbacks for offline or network-failure scenarios.

## Run Locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite, usually `http://localhost:5173/`.

## Build

```bash
npm run build
npm run lint
```

## License

MIT
