/** Keep the current directory first without losing older entries. */
export function rememberWorkspace(recent: readonly string[], directory: string): string[] {
  return directory ? [directory, ...recent.filter(item => item !== directory)] : [...recent]
}
