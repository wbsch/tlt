<script setup lang="ts">
import { computed, inject } from 'vue';
import OoTMMGridItemTile from './OoTMMGridItemTile.vue';
import {
  itemGridRenderContextKey,
  type GridCanvas,
  type GridItem,
  type ResolvedGridArray,
  type ResolvedGridNode,
  type ResolvedGridSection,
  type ResolvedItemGrid,
} from './itemGridSchema';

defineOptions({
  name: 'OoTMMGridNode',
});

const props = defineProps<{
  node: ResolvedGridNode;
  parentScale: number;
}>();

const context = inject(itemGridRenderContextKey);

if (!context) {
  throw new Error('OoTMMGridNode requires item grid render context');
}

const nodeScale = computed(() => {
  return ((props.node as { scale?: number }).scale || 1) * props.parentScale;
});

function sectionOrientation(
  section: ResolvedGridSection,
): 'vertical' | 'horizontal' {
  return section.orientation || 'vertical';
}
</script>

<template>
  <div
    v-if="node.type === 'array'"
    class="grid-array"
    :class="[
      (node as ResolvedGridArray).orientation,
      { 'grid-array--no-wrap': (node as ResolvedGridArray).wrap === false },
    ]"
    :style="context.getArrayStyle(node as ResolvedGridArray)"
  >
    <OoTMMGridNode
      v-for="(child, idx) in (node as ResolvedGridArray).content"
      :key="idx"
      :node="child"
      :parent-scale="nodeScale"
    />
  </div>

  <div
    v-else-if="node.type === 'section'"
    class="grid-section"
    :style="context.getSectionStyle(node as ResolvedGridSection)"
  >
    <div v-if="(node as ResolvedGridSection).title" class="grid-section__title">
      {{ (node as ResolvedGridSection).title }}
    </div>
    <div
      class="grid-section__content"
      :class="sectionOrientation(node as ResolvedGridSection)"
    >
      <OoTMMGridNode
        v-for="(child, idx) in (node as ResolvedGridSection).content"
        :key="idx"
        :node="child"
        :parent-scale="nodeScale"
      />
    </div>
  </div>

  <div v-else-if="node.type === 'itemgrid'" class="item-grid">
    <div
      v-for="(row, rowIdx) in (node as ResolvedItemGrid).rows"
      :key="rowIdx"
      class="item-row"
    >
      <OoTMMGridItemTile
        v-for="(itemId, colIdx) in row"
        :key="colIdx"
        :item-id="itemId"
        :style="
          context.getGridItemStyle(
            context.parseMargin((node as ResolvedItemGrid).item_margin),
            ((node as ResolvedItemGrid).item_size || 32) * nodeScale,
          )
        "
      />
    </div>
  </div>

  <OoTMMGridItemTile
    v-else-if="node.type === 'item'"
    :item-id="(node as GridItem).item"
    :style="context.getItemStyle(node as GridItem, nodeScale)"
  />

  <div
    v-else-if="node.type === 'canvas'"
    class="grid-canvas"
    :style="context.getCanvasStyle(node as GridCanvas, nodeScale)"
  >
    <OoTMMGridItemTile
      v-for="(canvasChild, idx) in (node as GridCanvas).content"
      :key="idx"
      :item-id="canvasChild.item"
      :style="context.getItemStyle(canvasChild, nodeScale)"
      :canvas-item="true"
    />
  </div>
</template>

<style scoped>
.grid-array {
  display: flex;
}

.grid-array.vertical {
  flex-direction: column;
}

.grid-array.horizontal {
  flex-direction: row;
  flex-wrap: wrap;
  align-items: flex-start;
}

.grid-array.horizontal.grid-array--no-wrap {
  flex-wrap: nowrap;
}

.grid-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-self: flex-start;
  position: relative;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.grid-section__title {
  position: absolute;
  top: 0;
  left: 12px;
  padding: 0 6px;
  transform: translateY(-50%);
  font-size: 12px;
  font-weight: 600;
  color: #f0f0f0;
  line-height: 1.2;
  letter-spacing: 0.02em;
  background: #232323;
}

.grid-section__content {
  display: flex;
  gap: 8px;
}

.grid-section__content.vertical {
  flex-direction: column;
}

.grid-section__content.horizontal {
  flex-direction: row;
  flex-wrap: wrap;
  align-items: flex-start;
}

.item-grid {
  display: flex;
  flex-direction: column;
}

.item-row {
  display: flex;
  flex-direction: row;
}

.grid-canvas {
  display: block;
  position: relative;
}
</style>
