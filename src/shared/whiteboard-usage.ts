export interface UsageTotal { known: number; missing: number; calls: number }
/** Missing provider fields stay unknown; only explicitly reported values are summed. */
export function summarizeUsage(values: readonly (number | null)[]): UsageTotal {
  return values.reduce<UsageTotal>((result, value) => {
    if (value === null || !Number.isSafeInteger(value) || value < 0) result.missing++
    else result.known += value
    return result
  }, { known: 0, missing: 0, calls: values.length })
}
export function formatUsageSummary(values: readonly (number | null)[]): string {
  const result = summarizeUsage(values)
  if (!result.calls) return '暂无调用'
  if (result.missing === result.calls) return '未提供'
  return result.missing ? `已知 ${result.known}，${result.missing} 次未提供` : String(result.known)
}
