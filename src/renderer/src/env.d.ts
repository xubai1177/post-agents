import type { SettingsApi } from '../../shared/settings'
import type { DraftsApi } from '../../shared/drafts'
import type { TopicsApi } from '../../shared/topics'
import type { ImagesApi } from '../../shared/images'

declare global {
  interface Window { settingsApi: SettingsApi; draftsApi: DraftsApi; imagesApi: ImagesApi; topicsApi: TopicsApi }
}
