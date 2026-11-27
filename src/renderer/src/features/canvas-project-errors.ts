/** A renderer can hot reload while an older preload or main process is still running. */
export function canvasProjectListError(error: unknown, hasListProjects: boolean): string {
  if (!hasListProjects || (error instanceof Error && /no handler registered for.*whiteboard:canvas-project-list/i.test(error.message))) {
    return '画布工程接口尚未更新。请完全退出并重新启动灵稿 AI；开发模式请先停止再重新运行 npm run dev。'
  }
  return '无法连接画布工程服务，请重试；若仍失败，请查看应用日志。'
}
