export {
  createApiClient,
  type ApiClient,
  type ApiClientOptions,
  type ClassRow,
  type MatchedLearningGainRow,
} from './client';
export {
  createSyncQueue,
  makeEvent,
  type DeadLetter,
  type EventContext,
  type FlushResult,
  type QueueStorage,
  type SyncQueue,
  type SyncQueueOptions,
} from './sync-queue';
export { ApiError, isRetryableError, toApiError, type ApiErrorCode } from './errors';
