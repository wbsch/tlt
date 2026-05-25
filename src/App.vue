<script setup lang="ts">
import { defineAsyncComponent, onBeforeUnmount, onMounted, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useAppStore } from './stores/app';
import { useSyncStatusStore } from './stores/syncStatus';
import { IMPRESSUM_HTML } from './content/impressum';
import FairyLoader from './components/FairyLoader.vue';
import TrackerFaqModal from './components/TrackerFaqModal.vue';
import { withBasePath } from '@packs/ootmm/utils/assetPath';
import { TRACKER_FAQ_OPEN_EVENT_NAME } from './utils/trackerFaq';
import {
  buildShareUrl,
  clearPendingShareImportConfirmation,
  clearSharePayloadFromCurrentUrl,
  collectPersistedStateFromLocalStorage,
  consumeShareImportConfirmationMessage,
  importShareStateFromCurrentUrl,
  encodeSnapshotToHashPayload,
  SHARE_IMPORT_CONFIRMATION_EVENT_NAME,
  SHARE_PARTIAL_IMPORT_MESSAGE,
  SHARE_STATUS_EVENT_NAME,
  stripCollectedLocations,
  consumeShareStatus,
  type ShareImportConfirmationPayload,
  type ShareImportIssue,
  type ShareStatusPayload,
} from './utils/shareState';

const appStore = useAppStore();
const syncStatusStore = useSyncStatusStore();
const { availablePacks, selectedPackId, currentPack, isLoading, error } =
  storeToRefs(appStore);
const { hasOtherTabsOpen, connectedTabCount } = storeToRefs(syncStatusStore);
const isResetConfirmOpen = ref(false);
const isInfoModalOpen = ref(false);
const isFaqModalOpen = ref(false);
const isShareImportConfirmOpen = ref(false);
const isShareImportDetailsOpen = ref(false);
const isDebugMode = ref(false);
const shareStatusMessage = ref('');
const shareImportConfirmMessage = ref('');
const shareImportIssues = ref<ShareImportIssue[]>([]);
const isShareMenuOpen = ref(false);
let shareStatusTimeoutId: number | null = null;
const buildCommitDate = __TLT_BUILD_COMMIT_DATE__;
const buildCommitHash = __TLT_BUILD_COMMIT_HASH__;
const ootmmVersionTag = __TLT_OOTMM_VERSION_TAG__;
const appLogoSrc = withBasePath('images/logo_last_tracker.png');
const infoModalLogoSrc = withBasePath('images/thelasttracker.avif');

const packComponents: Record<
  string,
  ReturnType<typeof defineAsyncComponent>
> = {
  ootmm: defineAsyncComponent(
    () => import('@packs/ootmm/components/OoTMMTracker.vue'),
  ),
};

function getPackComponent(packId: string) {
  return packComponents[packId] ?? null;
}

function performResetTrackerState() {
  const resetFn = (
    window as Window & {
      __TLT_RESET_TRACKER_STATE__?: () => void | Promise<void>;
    }
  ).__TLT_RESET_TRACKER_STATE__;
  if (typeof resetFn === 'function') {
    void Promise.resolve(resetFn()).catch((error) => {
      console.error(
        'Failed to reset tracker state via tracker handler:',
        error,
      );
      window.localStorage.clear();
      window.location.reload();
    });
    return;
  }
  window.localStorage.clear();
  window.location.reload();
}

function requestResetTrackerState() {
  isResetConfirmOpen.value = true;
}

function cancelResetTrackerState() {
  isResetConfirmOpen.value = false;
}

function confirmResetTrackerState() {
  isResetConfirmOpen.value = false;
  performResetTrackerState();
}

function openInfoModal() {
  isInfoModalOpen.value = true;
}

function closeInfoModal() {
  isInfoModalOpen.value = false;
}

function openFaqModal() {
  isFaqModalOpen.value = true;
}

function closeFaqModal() {
  isFaqModalOpen.value = false;
}

function openShareImportDetailsModal() {
  if (shareImportIssues.value.length === 0) return;
  isShareImportDetailsOpen.value = true;
}

function openShareImportConfirmModal(message: string) {
  if (message.length === 0) return;
  isShareMenuOpen.value = false;
  shareImportConfirmMessage.value = message;
  isShareImportConfirmOpen.value = true;
}

function closeShareImportConfirmModal() {
  isShareImportConfirmOpen.value = false;
  shareImportConfirmMessage.value = '';
}

function cancelShareImportConfirmation() {
  clearPendingShareImportConfirmation();
  clearSharePayloadFromCurrentUrl();
  closeShareImportConfirmModal();
}

function confirmShareImport() {
  const result = importShareStateFromCurrentUrl(() => true);
  closeShareImportConfirmModal();
  if (result === 'imported' || result === 'partial') {
    window.location.reload();
  }
}

function closeShareImportDetailsModal() {
  isShareImportDetailsOpen.value = false;
}

function formatShareImportValue(value: unknown): string {
  if (value === undefined) {
    return 'Not imported';
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

function handleWindowKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') {
    return;
  }

  if (isShareMenuOpen.value) {
    isShareMenuOpen.value = false;
    return;
  }

  if (isInfoModalOpen.value) {
    event.preventDefault();
    closeInfoModal();
    return;
  }

  if (isShareImportConfirmOpen.value) {
    event.preventDefault();
    cancelShareImportConfirmation();
    return;
  }

  if (isFaqModalOpen.value) {
    event.preventDefault();
    closeFaqModal();
    return;
  }

  if (isShareImportDetailsOpen.value) {
    event.preventDefault();
    closeShareImportDetailsModal();
    return;
  }

  if (!isResetConfirmOpen.value) {
    return;
  }

  event.preventDefault();
  cancelResetTrackerState();
}

function debugActivateAll() {
  const debugFn = (
    window as Window & { __TLT_DEBUG_ACTIVATE_ALL__?: () => void }
  ).__TLT_DEBUG_ACTIVATE_ALL__;
  if (typeof debugFn === 'function') {
    debugFn();
  }
}

async function debugDumpAutotracker() {
  const dumpFn = (
    window as Window & {
      __TLT_DEBUG_DUMP_AUTOTRACKER__?: () => boolean | Promise<boolean>;
    }
  ).__TLT_DEBUG_DUMP_AUTOTRACKER__;

  if (typeof dumpFn !== 'function') {
    setShareStatus('Autotracker dump unavailable');
    return;
  }

  try {
    const didDump = await Promise.resolve(dumpFn());
    setShareStatus(
      didDump ? 'Autotracker dump downloaded' : 'Autotracker dump unavailable',
    );
  } catch (error) {
    console.error('Failed to dump autotracker state:', error);
    setShareStatus('Failed to dump autotracker');
  }
}

function clearShareStatusTimeout() {
  if (shareStatusTimeoutId === null) {
    return;
  }
  window.clearTimeout(shareStatusTimeoutId);
  shareStatusTimeoutId = null;
}

function setShareStatus(
  message: string,
  issues: ShareImportIssue[] = [],
  options: {
    preserveDetailsVisibility?: boolean;
  } = {},
) {
  clearShareStatusTimeout();
  shareStatusMessage.value = message;
  shareImportIssues.value = issues;
  if (issues.length === 0) {
    isShareImportDetailsOpen.value = false;
  } else if (!options.preserveDetailsVisibility) {
    isShareImportDetailsOpen.value = true;
  }
  shareStatusTimeoutId = window.setTimeout(() => {
    shareStatusMessage.value = '';
    shareStatusTimeoutId = null;
  }, 4000);
}

function handleShareStatusEvent(event: Event) {
  const detail = (event as CustomEvent<ShareStatusPayload>).detail;
  const message = detail?.message;
  if (typeof message !== 'string' || message.length === 0) return;
  const shouldPreservePartialImportDetails =
    message === SHARE_PARTIAL_IMPORT_MESSAGE &&
    !Array.isArray(detail?.issues) &&
    shareImportIssues.value.length > 0;
  setShareStatus(
    message,
    detail.issues ??
      (message === SHARE_PARTIAL_IMPORT_MESSAGE ? shareImportIssues.value : []),
    {
      preserveDetailsVisibility: shouldPreservePartialImportDetails,
    },
  );
}

function handleShareImportConfirmationEvent(event: Event) {
  const detail = (event as CustomEvent<ShareImportConfirmationPayload>).detail;
  const message = detail?.message;
  if (typeof message !== 'string' || message.length === 0) return;
  openShareImportConfirmModal(message);
}

function handleTrackerFaqOpen() {
  openFaqModal();
}

async function exportState(includeCollected = false) {
  isShareMenuOpen.value = false;
  try {
    let snapshot = collectPersistedStateFromLocalStorage();
    if (!includeCollected) {
      snapshot = stripCollectedLocations(snapshot);
    }
    const payload = encodeSnapshotToHashPayload(snapshot);
    const shareUrl = buildShareUrl(new URL(window.location.href), payload);

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(shareUrl);
      setShareStatus(
        includeCollected
          ? 'Full state exported to clipboard'
          : 'State exported to clipboard',
      );
      return;
    }

    window.prompt('Copy this state export URL:', shareUrl);
    setShareStatus('State export ready');
  } catch (error) {
    console.error('Failed to export state:', error);
    setShareStatus('Failed to export state');
  }
}

function toggleShareMenu() {
  isShareMenuOpen.value = !isShareMenuOpen.value;
}

function handleDocumentClick(event: MouseEvent) {
  if (!isShareMenuOpen.value) return;
  const target = event.target as HTMLElement;
  if (target.closest('.export-button-group')) return;
  isShareMenuOpen.value = false;
}

function initializeDebugMode() {
  const params = new URLSearchParams(window.location.search);
  isDebugMode.value =
    params.get('debug') === '1' || params.get('devmode') === '1';
}

onMounted(() => {
  initializeDebugMode();
  const pendingShareImportConfirmation =
    consumeShareImportConfirmationMessage();
  if (pendingShareImportConfirmation) {
    openShareImportConfirmModal(pendingShareImportConfirmation);
  }
  const pendingShareStatus = consumeShareStatus();
  if (pendingShareStatus) {
    setShareStatus(pendingShareStatus.message, pendingShareStatus.issues ?? []);
  }
  window.addEventListener('keydown', handleWindowKeydown);
  window.addEventListener(
    SHARE_IMPORT_CONFIRMATION_EVENT_NAME,
    handleShareImportConfirmationEvent,
  );
  window.addEventListener(SHARE_STATUS_EVENT_NAME, handleShareStatusEvent);
  window.addEventListener(TRACKER_FAQ_OPEN_EVENT_NAME, handleTrackerFaqOpen);
  document.addEventListener('click', handleDocumentClick);
  appStore.initialize();
});

onBeforeUnmount(() => {
  clearShareStatusTimeout();
  window.removeEventListener('keydown', handleWindowKeydown);
  window.removeEventListener(
    SHARE_IMPORT_CONFIRMATION_EVENT_NAME,
    handleShareImportConfirmationEvent,
  );
  window.removeEventListener(SHARE_STATUS_EVENT_NAME, handleShareStatusEvent);
  window.removeEventListener(TRACKER_FAQ_OPEN_EVENT_NAME, handleTrackerFaqOpen);
  document.removeEventListener('click', handleDocumentClick);
});
</script>

<template>
  <div class="app-container">
    <header class="app-header">
      <div class="app-brand" @click="openInfoModal">
        <img :src="appLogoSrc" alt="The Last Tracker logo" class="app-logo" />
        <div class="app-brand-title">
          <h1>The Last Tracker</h1>
          <button
            type="button"
            class="info-icon-button"
            data-testid="info-impressum-button"
            aria-label="Open info"
            title="Open info"
            @click="openInfoModal"
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              aria-hidden="true"
              focusable="false"
            >
              <path
                d="M12 2a10 10 0 1 0 10 10A10.01 10.01 0 0 0 12 2zm0 4.5a1.25 1.25 0 1 1-1.25 1.25A1.25 1.25 0 0 1 12 6.5zm1.5 10h-3a1 1 0 0 1 0-2H11v-3h-.5a1 1 0 0 1 0-2H12a1 1 0 0 1 1 1v4h.5a1 1 0 0 1 0 2z"
              />
            </svg>
          </button>
        </div>
      </div>

      <div class="header-actions">
        <div class="pack-selector">
          <label for="pack-select">Tracker Pack:</label>
          <select
            id="pack-select"
            v-model="selectedPackId"
            data-testid="pack-select"
            :disabled="isLoading"
            @change="appStore.loadPack(selectedPackId)"
          >
            <option
              v-for="pack in availablePacks"
              :key="pack.id"
              :value="pack.id"
            >
              {{ pack.name }}
            </option>
          </select>
        </div>
        <div
          v-if="hasOtherTabsOpen"
          class="sync-status-badge"
          data-testid="multi-tab-sync-badge"
          :title="`Live sync active across ${connectedTabCount} tabs`"
        >
          SYNC: {{ connectedTabCount }} TABS
        </div>
        <button
          type="button"
          class="faq-button"
          data-testid="faq-open-button"
          @click="openFaqModal"
        >
          FAQ
        </button>
        <button
          v-if="isDebugMode"
          type="button"
          class="debug-activate-all-button"
          data-testid="debug-activate-all-button"
          @click="debugActivateAll"
        >
          Debug: Activate All
        </button>
        <button
          v-if="isDebugMode"
          type="button"
          class="debug-activate-all-button"
          data-testid="debug-autotracker-dump-button"
          @click="debugDumpAutotracker"
        >
          Debug: Dump Autotracker
        </button>
        <div class="export-button-group">
          <button
            type="button"
            class="export-button"
            data-testid="export-state-button"
            @click="exportState(false)"
          >
            EXPORT STATE
          </button>
          <button
            type="button"
            class="export-dropdown-toggle"
            data-testid="export-dropdown-toggle"
            aria-label="Export options"
            @click="toggleShareMenu"
          >
            ⋮
          </button>
          <div
            v-if="isShareMenuOpen"
            class="export-dropdown-menu"
            data-testid="export-dropdown-menu"
          >
            <button
              type="button"
              class="export-dropdown-item"
              @click="exportState(true)"
            >
              Include collected locations
            </button>
          </div>
        </div>
        <span
          v-if="shareStatusMessage"
          class="export-status"
          role="status"
          aria-live="polite"
        >
          {{ shareStatusMessage }}
        </span>
        <button
          v-if="shareImportIssues.length > 0"
          type="button"
          class="share-details-button"
          data-testid="share-status-details-button"
          @click="openShareImportDetailsModal"
        >
          Import Details
        </button>
        <button
          type="button"
          class="reset-button"
          data-testid="reset-tracker-state-button"
          @click="requestResetTrackerState"
        >
          RESET TRACKER STATE
        </button>
      </div>
    </header>

    <main class="app-main">
      <div v-if="isLoading" class="loading" role="status" aria-live="polite">
        <FairyLoader label="Loading tracker..." />
      </div>

      <div v-else-if="error" class="error">
        {{ error }}
      </div>

      <component
        :is="getPackComponent(selectedPackId)"
        v-else-if="currentPack"
        :tracker="currentPack"
      />
    </main>

    <div v-if="isFaqModalOpen" data-testid="faq-modal-shell">
      <TrackerFaqModal @close="closeFaqModal" />
    </div>

    <div
      v-if="isShareImportConfirmOpen"
      class="share-import-confirm-backdrop"
      data-testid="share-import-confirm-backdrop"
      @click="cancelShareImportConfirmation"
    >
      <div
        class="share-import-confirm-modal"
        data-testid="share-import-confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-import-confirm-title"
        aria-describedby="share-import-confirm-description"
        @click.stop
      >
        <h2 id="share-import-confirm-title">Shared tracker URL detected</h2>
        <p id="share-import-confirm-description">
          {{ shareImportConfirmMessage }}
        </p>
        <div class="share-import-confirm-actions">
          <button
            type="button"
            class="share-import-confirm-cancel"
            data-testid="share-import-confirm-cancel-button"
            @click="cancelShareImportConfirmation"
          >
            Keep Current State
          </button>
          <button
            type="button"
            class="share-import-confirm-apply"
            data-testid="share-import-confirm-apply-button"
            @click="confirmShareImport"
          >
            Import Shared State
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="isShareImportDetailsOpen"
      class="share-import-details-backdrop"
      data-testid="share-import-details-backdrop"
      @click="closeShareImportDetailsModal"
    >
      <div
        class="share-import-details-modal"
        data-testid="share-import-details-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-import-details-title"
        aria-describedby="share-import-details-description"
        @click.stop
      >
        <h2 id="share-import-details-title">
          Some shared state could not be imported
        </h2>
        <p id="share-import-details-description">
          These fields were ignored or adjusted while loading the saved state.
        </p>
        <div class="share-import-details-summary">
          {{ shareImportIssues.length }} affected field{{
            shareImportIssues.length === 1 ? '' : 's'
          }}
        </div>
        <ul class="share-import-details-list">
          <li
            v-for="(issue, index) in shareImportIssues"
            :key="`${issue.path}-${index}`"
            class="share-import-details-item"
          >
            <div class="share-import-details-path">{{ issue.path }}</div>
            <div class="share-import-details-reason">{{ issue.reason }}</div>
            <div class="share-import-details-values">
              <div class="share-import-details-value-group">
                <span class="share-import-details-label">Received</span>
                <pre>{{ formatShareImportValue(issue.received) }}</pre>
              </div>
              <div class="share-import-details-value-group">
                <span class="share-import-details-label">Imported</span>
                <pre>{{ formatShareImportValue(issue.imported) }}</pre>
              </div>
            </div>
          </li>
        </ul>
        <div class="share-import-details-actions">
          <button
            type="button"
            class="share-import-details-close"
            data-testid="share-import-details-close-button"
            @click="closeShareImportDetailsModal"
          >
            Close
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="isInfoModalOpen"
      class="info-modal-backdrop"
      data-testid="info-impressum-backdrop"
      @click="closeInfoModal"
    >
      <div
        class="info-modal"
        data-testid="info-impressum-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="info-impressum-title"
        @click.stop
      >
        <div class="info-modal-header">
          <img
            :src="infoModalLogoSrc"
            alt="The Last Tracker logo"
            class="info-modal-logo"
          />
          <button
            type="button"
            class="info-modal-close"
            data-testid="info-impressum-close-button"
            @click="closeInfoModal"
          >
            <span class="modal-close-icon" aria-hidden="true">
              <svg viewBox="0 0 12 12" focusable="false">
                <path d="M3 3l6 6M9 3 3 9" />
              </svg>
            </span>
            <span>Close</span>
          </button>
        </div>
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div class="info-modal-content" v-html="IMPRESSUM_HTML" />
        <div class="info-modal-footer">
          <div class="info-modal-footer-row">
            <span class="info-modal-footer-label"
              >Current build commit date</span
            >
            <span
              class="info-modal-footer-value"
              data-testid="info-build-commit-date"
            >
              {{ buildCommitDate }}
            </span>
          </div>
          <div class="info-modal-footer-row">
            <span class="info-modal-footer-label"
              >Current build commit hash</span
            >
            <span
              class="info-modal-footer-value"
              data-testid="info-build-commit-hash"
            >
              {{ buildCommitHash }}
            </span>
          </div>
          <div class="info-modal-footer-row">
            <span class="info-modal-footer-label">OoTMM version tag</span>
            <span
              class="info-modal-footer-value"
              data-testid="info-ootmm-version-tag"
            >
              {{ ootmmVersionTag }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="isResetConfirmOpen"
      class="reset-confirm-backdrop"
      data-testid="reset-tracker-confirm-backdrop"
      @click="cancelResetTrackerState"
    >
      <div
        class="reset-confirm-modal"
        data-testid="reset-tracker-confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reset-tracker-confirm-title"
        aria-describedby="reset-tracker-confirm-description"
        @click.stop
      >
        <h2 id="reset-tracker-confirm-title">Reset tracker state?</h2>
        <p id="reset-tracker-confirm-description">
          This clears your current tracker progress and reloads the page.
        </p>
        <div class="reset-confirm-actions">
          <button
            type="button"
            class="reset-confirm-cancel"
            data-testid="reset-tracker-confirm-cancel-button"
            @click="cancelResetTrackerState"
          >
            Cancel
          </button>
          <button
            type="button"
            class="reset-confirm-apply"
            data-testid="reset-tracker-confirm-apply-button"
            @click="confirmResetTrackerState"
          >
            Reset Tracker State
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.app-header {
  background: #2a2a2a;
  padding: 1rem 2rem;
  border-bottom: 2px solid #404040;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.app-brand {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  cursor: pointer;
  user-select: none;
}

.app-brand-title {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.app-brand h1 {
  margin-left: 0.875rem;
}

.app-logo {
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 0.375rem;
  object-fit: cover;
  display: block;
  transform: scale(2.3);
  transform-origin: center;
}

.app-header h1 {
  font-size: 1.5rem;
  font-weight: 600;
}

.pack-selector {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.pack-selector label {
  font-size: 0.875rem;
  color: #9ca3af;
}

.reset-button {
  background: #7f1d1d;
  border: 1px solid #fca5a5;
  font-size: 0.75rem;
  font-weight: 700;
}

.faq-button {
  background: #1d4ed8;
  border: 1px solid #93c5fd;
  font-size: 0.75rem;
  font-weight: 700;
}

.faq-button:hover {
  background: #2563eb;
}

.reset-button:hover {
  background: #991b1b;
}

.debug-activate-all-button {
  background: #444;
  border: 1px solid #666;
  font-size: 0.75rem;
  font-weight: 700;
}

.debug-activate-all-button:hover {
  background: #555;
}

.export-button-group {
  position: relative;
  display: inline-flex;
}

.export-button {
  background: #155e75;
  border: 1px solid #67e8f9;
  border-right: none;
  border-radius: 0.25rem 0 0 0.25rem;
  font-size: 0.75rem;
  font-weight: 700;
}

.export-button:hover {
  background: #0e7490;
}

.export-dropdown-toggle {
  background: #155e75;
  border: 1px solid #67e8f9;
  border-radius: 0 0.25rem 0.25rem 0;
  font-size: 0.75rem;
  font-weight: 700;
  padding: 0.25rem 0.35rem;
  cursor: pointer;
  color: inherit;
  line-height: 1;
}

.export-dropdown-toggle:hover {
  background: #0e7490;
}

.export-dropdown-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 0.25rem;
  background: #1f1f1f;
  border: 1px solid #67e8f9;
  border-radius: 0.25rem;
  box-shadow: 0 4px 12px rgb(0 0 0 / 40%);
  z-index: 100;
  min-width: max-content;
}

.export-dropdown-item {
  display: block;
  width: 100%;
  background: none;
  border: none;
  color: #e5e7eb;
  font-size: 0.75rem;
  padding: 0.5rem 0.75rem;
  cursor: pointer;
  text-align: left;
  white-space: nowrap;
}

.export-dropdown-item:hover {
  background: #155e75;
}

.export-status {
  font-size: 0.75rem;
  color: #67e8f9;
}

.share-details-button {
  background: #3f3f46;
  border: 1px solid #93c5fd;
  font-size: 0.75rem;
  font-weight: 700;
  white-space: nowrap;
}

.share-details-button:hover {
  background: #52525b;
}

.sync-status-badge {
  display: inline-flex;
  align-items: center;
  border: 1px solid #2b6cb0;
  border-radius: 999px;
  background: #0f2f4f;
  color: #c8e6ff;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  padding: 0.2rem 0.6rem;
  white-space: nowrap;
}

.info-icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.9rem;
  height: 1.9rem;
  border-radius: 999px;
  border: 1px solid #4b5563;
  background: #1f2937;
  color: #d1d5db;
  padding: 0;
  flex-shrink: 0;
}

.info-icon-button svg {
  fill: currentcolor;
}

.info-icon-button:hover {
  background: #374151;
}

.info-icon-button:focus-visible {
  outline: 2px solid #60a5fa;
  outline-offset: 2px;
}

.app-main {
  flex: 1;
  overflow: hidden;
}

.loading,
.error {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-size: 1.125rem;
}

.error {
  color: #ef4444;
}

.share-import-confirm-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1975;
  background: rgb(0 0 0 / 55%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.share-import-confirm-modal {
  width: min(30rem, 100%);
  border: 1px solid #525252;
  border-radius: 0.5rem;
  background: #1f1f1f;
  box-shadow: 0 16px 50px rgb(0 0 0 / 45%);
  padding: 1rem 1rem 0.875rem;
}

.share-import-confirm-modal h2 {
  margin: 0 0 0.5rem;
  font-size: 1.1rem;
}

.share-import-confirm-modal p {
  margin: 0;
  color: #d1d5db;
}

.share-import-confirm-actions {
  margin-top: 1rem;
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.share-import-confirm-cancel {
  background: #4b5563;
}

.share-import-confirm-cancel:hover {
  background: #6b7280;
}

.share-import-confirm-apply {
  background: #155e75;
  border: 1px solid #67e8f9;
}

.share-import-confirm-apply:hover {
  background: #0e7490;
}

.share-import-details-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1950;
  background: rgb(0 0 0 / 55%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.share-import-details-modal {
  width: min(56rem, 100%);
  max-height: calc(100vh - 2rem);
  max-height: calc(100dvh - 2rem);
  overflow: auto;
  border: 1px solid #525252;
  border-radius: 0.5rem;
  background: #1f1f1f;
  box-shadow: 0 16px 50px rgb(0 0 0 / 45%);
  padding: 1rem 1rem 0.875rem;
}

.share-import-details-modal h2 {
  margin: 0 0 0.5rem;
  font-size: 1.1rem;
}

.share-import-details-modal p {
  margin: 0;
  color: #d1d5db;
}

.share-import-details-summary {
  margin-top: 0.75rem;
  font-size: 0.85rem;
  color: #93c5fd;
}

.share-import-details-list {
  list-style: none;
  margin: 1rem 0 0;
  padding: 0;
  display: grid;
  gap: 0.75rem;
}

.share-import-details-item {
  border: 1px solid #3f3f46;
  border-radius: 0.5rem;
  background: #111827;
  padding: 0.75rem;
}

.share-import-details-path {
  font-family:
    ui-monospace,
    SFMono-Regular,
    Menlo,
    Monaco,
    Consolas,
    Liberation Mono,
    Courier New,
    monospace;
  font-size: 0.8rem;
  color: #f9fafb;
  word-break: break-word;
}

.share-import-details-reason {
  margin-top: 0.35rem;
  color: #cbd5e1;
  font-size: 0.85rem;
}

.share-import-details-values {
  margin-top: 0.65rem;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
}

.share-import-details-value-group {
  min-width: 0;
}

.share-import-details-label {
  display: block;
  margin-bottom: 0.25rem;
  color: #9ca3af;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.share-import-details-value-group pre {
  margin: 0;
  border-radius: 0.375rem;
  background: #020617;
  color: #e2e8f0;
  padding: 0.65rem;
  font-size: 0.75rem;
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-word;
}

.share-import-details-actions {
  margin-top: 1rem;
  display: flex;
  justify-content: flex-end;
}

.share-import-details-close {
  background: #374151;
}

.share-import-details-close:hover {
  background: #4b5563;
}

.info-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1900;
  background: rgb(0 0 0 / 45%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.info-modal {
  width: min(36rem, 100%);
  max-height: calc(100vh - 2rem);
  max-height: calc(100dvh - 2rem);
  overflow: auto;
  border: 1px solid #525252;
  border-radius: 0.5rem;
  background: #1f1f1f;
  box-shadow: 0 16px 50px rgb(0 0 0 / 45%);
  padding: 1rem 1rem 0.875rem;
}

.info-modal h2 {
  margin: 0;
  font-size: 1.1rem;
  text-align: center;
}

.info-modal-header {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  margin-bottom: 0.9rem;
  min-height: 2.5rem;
}

.info-modal-logo {
  width: auto;
  max-width: min(100%, clamp(6.5rem, 22vw, 10rem));
  max-height: clamp(6.5rem, 22vw, 10rem);
  height: auto;
  border-radius: 1rem;
  object-fit: contain;
  display: block;
}

.info-modal-content {
  color: #d1d5db;
  line-height: 1.42;
}

.info-modal-content :deep(section) {
  margin: 0.875rem 0 0;
}

.info-modal-content :deep(section:first-child) {
  margin-top: 0;
}

.info-modal-content :deep(h3) {
  margin: 0 0 0.375rem;
  font-size: 0.95rem;
  color: #f3f4f6;
}

.info-modal-content :deep(p) {
  margin: 0;
}

.info-modal-content :deep(ul) {
  margin: 0;
  padding-left: 1.2rem;
}

.info-modal-content :deep(li + li) {
  margin-top: 0.2rem;
}

.info-modal-content :deep(a) {
  color: #93c5fd;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.info-modal-content :deep(a:hover) {
  color: #bfdbfe;
}

.info-modal-content :deep(.info-important) {
  margin-top: 1rem;
  border-top: 1px solid #3f3f46;
  padding-top: 0.75rem;
}

.info-modal-footer {
  margin-top: 1rem;
  border-top: 1px solid #3f3f46;
  padding-top: 0.75rem;
  display: grid;
  gap: 0.55rem;
}

.info-modal-footer-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  font-size: 0.85rem;
}

.info-modal-footer-label {
  color: #9ca3af;
}

.info-modal-footer-value {
  color: #f3f4f6;
  font-family:
    ui-monospace,
    SFMono-Regular,
    Menlo,
    Monaco,
    Consolas,
    Liberation Mono,
    Courier New,
    monospace;
  text-align: right;
}

@media (max-width: 520px) {
  .share-import-details-values {
    grid-template-columns: 1fr;
  }

  .info-modal-footer-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.2rem;
  }

  .info-modal-footer-value {
    text-align: left;
  }
}

.info-modal-close {
  position: absolute;
  top: 0;
  right: 0;
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  background: #374151;
}

.info-modal-close:hover {
  background: #4b5563;
}

.modal-close-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.1rem;
  height: 1.1rem;
  border: 1px solid currentColor;
  border-radius: 999px;
}

.modal-close-icon svg {
  width: 0.62rem;
  height: 0.62rem;
  stroke: currentColor;
  stroke-width: 1.7;
  fill: none;
  stroke-linecap: round;
}

.reset-confirm-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgb(0 0 0 / 55%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.reset-confirm-modal {
  width: min(28rem, 100%);
  border: 1px solid #525252;
  border-radius: 0.5rem;
  background: #1f1f1f;
  box-shadow: 0 16px 50px rgb(0 0 0 / 45%);
  padding: 1rem 1rem 0.875rem;
}

.reset-confirm-modal h2 {
  margin: 0 0 0.5rem;
  font-size: 1.1rem;
}

.reset-confirm-modal p {
  margin: 0;
  color: #d1d5db;
}

.reset-confirm-actions {
  margin-top: 1rem;
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.reset-confirm-cancel {
  background: #4b5563;
}

.reset-confirm-cancel:hover {
  background: #6b7280;
}

.reset-confirm-apply {
  background: #991b1b;
  border: 1px solid #fca5a5;
}

.reset-confirm-apply:hover {
  background: #b91c1c;
}

@media (max-width: 700px) {
  .app-header {
    padding: 1rem;
    flex-direction: column;
    align-items: flex-start;
  }

  .header-actions {
    width: 100%;
  }

  .pack-selector {
    width: 100%;
  }

  .pack-selector select {
    flex: 1;
    min-width: 0;
  }

  .share-import-confirm-actions {
    flex-direction: column-reverse;
    align-items: stretch;
  }
}

@media (max-width: 900px) {
  .app-main {
    overflow-y: auto;
  }
}
</style>
