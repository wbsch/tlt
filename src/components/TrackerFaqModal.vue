<script setup lang="ts">
import {
  TRACKER_FAQ_SECTIONS,
  type TrackerFaqInlineContent,
  type TrackerFaqRichText,
} from '@/content/trackerFaq';

const isRichTextArray = (
  value: TrackerFaqRichText,
): value is TrackerFaqInlineContent[] => Array.isArray(value);

defineEmits<{
  close: [];
}>();
</script>

<template>
  <div
    class="faq-modal-backdrop"
    data-testid="faq-modal-backdrop"
    @click="$emit('close')"
  >
    <div
      class="faq-modal"
      data-testid="faq-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="faq-modal-title"
      aria-describedby="faq-modal-description"
      @click.stop
    >
      <div class="faq-modal-header">
        <div class="faq-modal-copy">
          <div class="faq-kicker">Tracker Help</div>
          <h2 id="faq-modal-title">Frequently Asked Questions</h2>
          <p id="faq-modal-description" class="faq-modal-description">
            Quick usage help for the tracker, plus answers to the issues that
            usually cause confusion during a run.
          </p>
        </div>
        <button
          type="button"
          class="faq-close-button"
          data-testid="faq-close-button"
          @click="$emit('close')"
        >
          <span class="modal-close-icon" aria-hidden="true">
            <svg viewBox="0 0 12 12" focusable="false">
              <path d="M3 3l6 6M9 3 3 9" />
            </svg>
          </span>
          <span>Close</span>
        </button>
      </div>

      <div class="faq-intro-grid">
        <section class="faq-intro-card">
          <h3>Quick Start Guide</h3>
          <ol>
            <li>Upload your spoiler log via drag-and-drop.</li>
            <li>Track items, checks, and discovered entrances.</li>
            <li>Use the map and filters to plan your next route.</li>
          </ol>
        </section>
        <section class="faq-intro-card">
          <h3>Good to know</h3>
          <p>
            The tracker saves progress in your browser automatically. Use Export
            State to move that progress to another device.
          </p>
        </section>
      </div>

      <section
        v-for="section in TRACKER_FAQ_SECTIONS"
        :key="section.id"
        class="faq-section"
        :data-testid="`faq-section-${section.id}`"
      >
        <div class="faq-section-header">
          <h3>{{ section.title }}</h3>
          <p v-if="section.description">{{ section.description }}</p>
        </div>

        <div class="faq-accordion">
          <details
            v-for="item in section.items"
            :key="item.id"
            class="faq-item"
            :open="item.defaultOpen"
            :data-testid="`faq-item-${item.id}`"
          >
            <summary class="faq-question">
              <span>{{ item.question }}</span>
              <span class="faq-question-icon" aria-hidden="true">+</span>
            </summary>
            <div class="faq-answer">
              <template
                v-for="(block, blockIndex) in item.blocks"
                :key="blockIndex"
              >
                <p v-if="block.type === 'paragraph'">
                  <template v-if="isRichTextArray(block.text)">
                    <template
                      v-for="(entry, entryIndex) in block.text"
                      :key="`${blockIndex}-${entryIndex}`"
                    >
                      <span v-if="entry.type === 'text'">{{ entry.text }}</span>
                      <a
                        v-else
                        class="faq-inline-link"
                        :href="entry.href"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {{ entry.text }}
                      </a>
                    </template>
                  </template>
                  <template v-else>{{ block.text }}</template>
                </p>
                <ul v-else>
                  <li
                    v-for="(entry, entryIndex) in block.items"
                    :key="entryIndex"
                  >
                    <template v-if="isRichTextArray(entry)">
                      <template
                        v-for="(part, partIndex) in entry"
                        :key="`${blockIndex}-${entryIndex}-${partIndex}`"
                      >
                        <span v-if="part.type === 'text'">{{ part.text }}</span>
                        <a
                          v-else
                          class="faq-inline-link"
                          :href="part.href"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {{ part.text }}
                        </a>
                      </template>
                    </template>
                    <template v-else>{{ entry }}</template>
                  </li>
                </ul>
              </template>
            </div>
          </details>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.faq-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1925;
  background:
    radial-gradient(circle at top, rgb(8 47 73 / 35%), transparent 36%),
    rgb(0 0 0 / 58%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.faq-modal {
  width: min(64rem, 100%);
  max-height: calc(100vh - 2rem);
  max-height: calc(100dvh - 2rem);
  overflow: auto;
  border: 1px solid #475569;
  border-radius: 1rem;
  background:
    linear-gradient(180deg, rgb(15 23 42 / 98%), rgb(2 6 23 / 98%)), #0f172a;
  box-shadow: 0 20px 60px rgb(0 0 0 / 45%);
  padding: 1.25rem;
}

.faq-modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.faq-modal-copy {
  flex: 1 1 auto;
  min-width: 0;
}

.faq-kicker {
  display: inline-flex;
  margin-bottom: 0.5rem;
  border: 1px solid #0ea5e9;
  border-radius: 999px;
  padding: 0.2rem 0.55rem;
  color: #bae6fd;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.faq-modal h2 {
  margin: 0;
  font-size: clamp(1.35rem, 1rem + 1vw, 1.9rem);
}

.faq-modal-description {
  margin: 0.55rem 0 0;
  color: #cbd5e1;
  line-height: 1.5;
}

.faq-close-button {
  flex-shrink: 0;
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  background: #374151;
}

.faq-close-button:hover {
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

.faq-intro-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.9rem;
  margin-top: 1rem;
}

.faq-intro-card {
  border: 1px solid #334155;
  border-radius: 0.85rem;
  background: linear-gradient(180deg, #172554, #0f172a);
  padding: 1rem;
}

.faq-intro-card h3 {
  margin: 0 0 0.55rem;
  font-size: 0.98rem;
}

.faq-intro-card p,
.faq-intro-card ol {
  margin: 0;
  color: #dbeafe;
  line-height: 1.5;
}

.faq-intro-card ol {
  padding-left: 1.2rem;
}

.faq-section {
  margin-top: 1.25rem;
}

.faq-section-header {
  margin-bottom: 0.75rem;
}

.faq-section-header h3 {
  margin: 0;
  font-size: 1.02rem;
}

.faq-section-header p {
  margin: 0.35rem 0 0;
  color: #94a3b8;
  line-height: 1.45;
}

.faq-accordion {
  display: grid;
  gap: 0.75rem;
}

.faq-item {
  border: 1px solid #334155;
  border-radius: 0.85rem;
  background: linear-gradient(180deg, #111827, #0b1120);
  overflow: hidden;
}

.faq-question {
  list-style: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.95rem 1rem;
  cursor: pointer;
  font-weight: 700;
}

.faq-question::-webkit-details-marker {
  display: none;
}

.faq-question-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.65rem;
  height: 1.65rem;
  border-radius: 999px;
  background: #0f766e;
  color: #ecfeff;
  font-size: 1rem;
  line-height: 1;
  transition:
    transform 0.2s ease,
    background 0.2s ease;
}

.faq-item[open] .faq-question-icon {
  transform: rotate(45deg);
  background: #0891b2;
}

.faq-answer {
  border-top: 1px solid #1e293b;
  padding: 0.95rem 1rem 1rem;
  color: #dbe4f0;
}

.faq-answer p {
  margin: 0;
  line-height: 1.55;
}

.faq-inline-link {
  color: #7dd3fc;
  font-weight: 600;
}

.faq-inline-link:hover {
  color: #bae6fd;
}

.faq-answer p + p,
.faq-answer p + ul,
.faq-answer ul + p,
.faq-answer ul + ul {
  margin-top: 0.75rem;
}

.faq-answer ul {
  margin: 0;
  padding-left: 1.2rem;
  line-height: 1.55;
}

.faq-answer li + li {
  margin-top: 0.45rem;
}

@media (max-width: 760px) {
  .faq-modal {
    padding: 1rem;
  }

  .faq-intro-grid {
    grid-template-columns: 1fr;
  }
}
</style>
