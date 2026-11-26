/// <reference types="vite/client" />

import type { DiscoveryApi } from '../../shared/discovery'
import type { SettingsApi } from '../../shared/settings'
import type { DraftsApi } from '../../shared/drafts'
import type { TopicsApi } from '../../shared/topics'
import type { ImagesApi } from '../../shared/images'
import type { UpdatesApi } from '../../shared/updates'
import type { WorkspaceApi } from '../../shared/workspace'

declare global {
  interface Window { discoveryApi: DiscoveryApi; settingsApi: SettingsApi; draftsApi: DraftsApi; imagesApi: ImagesApi; topicsApi: TopicsApi; workspaceApi: WorkspaceApi; updatesApi: UpdatesApi }
}
