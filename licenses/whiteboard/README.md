# 白板动画第三方资源

- Xiaolai Regular（小赖字体），SIL Open Font License 1.1。字体及许可证与 whiteboard-video Skill 随附的文件一致；字体 SHA-256：`e2f68daf0e72777a8cf58bc83de1b98634b251e537ddbfca24b0ae50d1802da2`。上游：https://github.com/lxgw/kose-font
- Rough.js 4.6.6，MIT；`scripts/whiteboard-rough.js` 与 npm 包 `roughjs@4.6.6` 的 `bundled/rough.js` 一致。上游：https://github.com/rough-stuff/rough
- Rough.js 依赖 hachure-fill 0.5.2、path-data-parser 0.1.0、points-on-curve 0.2.0、points-on-path 0.2.1，均使用 MIT 许可证，原文及版权声明随附。
- FFmpeg 7.1.5 的源码、LGPL 2.1 许可证和构建参数由 `scripts/prepare-ffmpeg.cjs` 下载、校验并在 macOS 打包时附带。
- 白板逐笔渲染器 `scripts/whiteboard-svg-render.html` 改编自 trustfuture/simon-skills 的 whiteboard-video `lib/render.html`，MIT；上游提交 `cc2b45da836db0fa78b77357f96faafcaad19c16`，源文件 SHA-256：`6a585e53dd58b673660687033cb336567cee027e839063574c20107d22f23475`。源码：https://github.com/trustfuture/simon-skills/tree/cc2b45da836db0fa78b77357f96faafcaad19c16/skills/whiteboard-video
