import { config } from '../../app/config'
import type { ObservationApi } from './adapter'
import { httpApi } from './http'
import { mockApi } from './mock/mockApi'

/** Exactly one adapter per build: mock (Illustrative demo) or the agreed HTTP contract. */
export const api: ObservationApi = config.useMock ? mockApi : httpApi
