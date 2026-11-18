import type { SettingsApi } from '../../shared/settings'
import type { DraftsApi } from '../../shared/drafts'
import type { ImagesApi } from '../../shared/images'

declare global {
  interface Window { settingsApi: SettingsApi; draftsApi: DraftsApi; imagesApi: ImagesApi }
}
