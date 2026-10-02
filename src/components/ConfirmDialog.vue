<script setup lang="ts">
/**
 * A modal confirmation box. Mount it (v-if) to ask; it emits `confirm` or
 * `cancel` and the parent unmounts it. Focus starts on the Cancel button so
 * a stray Enter never confirms a destructive action, Tab cycles inside the
 * box, and Escape, the backdrop and the Cancel button all cancel. Keys are
 * caught on the capture phase so nothing behind the box (such as a drawer
 * that also closes on Escape) sees them.
 */
import { nextTick, onBeforeUnmount, onMounted, ref, useId } from 'vue'

withDefaults(
  defineProps<{
    title: string
    confirmLabel?: string
    cancelLabel?: string
    /** Style the confirm button as destructive. */
    danger?: boolean
  }>(),
  { confirmLabel: 'OK', cancelLabel: 'Cancel', danger: false },
)

const emit = defineEmits<{ confirm: []; cancel: [] }>()

const box = ref<HTMLDivElement | null>(null)
const cancelButton = ref<HTMLButtonElement | null>(null)
const titleId = useId()
const bodyId = useId()

function focusables(): HTMLElement[] {
  if (!box.value) return []
  return Array.from(box.value.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input, select, [tabindex]:not([tabindex="-1"])'))
}

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    // Immediate, so that other window listeners (a drawer that closes on Escape) stay quiet
    // even when the key was pressed with focus on the page body rather than inside the box.
    event.stopImmediatePropagation()
    emit('cancel')
    return
  }
  if (event.key !== 'Tab') return
  const items = focusables()
  if (items.length === 0) return
  const first = items[0]!
  const last = items[items.length - 1]!
  const active = document.activeElement
  const inside = box.value?.contains(active) ?? false
  if (event.shiftKey && (active === first || !inside)) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && (active === last || !inside)) {
    event.preventDefault()
    first.focus()
  }
}

onMounted(async () => {
  window.addEventListener('keydown', onKey, true)
  await nextTick()
  cancelButton.value?.focus()
})

onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <div class="confirm" data-testid="confirm-dialog">
    <div class="backdrop" data-testid="confirm-backdrop" @click="emit('cancel')" />
    <div
      ref="box"
      class="box"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="titleId"
      :aria-describedby="bodyId"
    >
      <h2 :id="titleId" class="title">{{ title }}</h2>
      <div :id="bodyId" class="body">
        <slot />
      </div>
      <div class="actions">
        <button ref="cancelButton" type="button" data-testid="confirm-cancel" @click="emit('cancel')">
          {{ cancelLabel }}
        </button>
        <button
          type="button"
          :class="danger ? 'danger solid' : 'primary'"
          data-testid="confirm-accept"
          @click="emit('confirm')"
        >
          {{ confirmLabel }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.confirm {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.backdrop {
  position: absolute;
  inset: 0;
  background: rgba(3, 6, 10, 0.65);
}

.box {
  position: relative;
  width: min(400px, 100%);
  padding: 18px 20px 16px;
  background: var(--bg-elev);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.55), var(--shadow-glow);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.body {
  font-size: 13px;
  color: var(--text-dim);
}

.body :deep(p) {
  margin: 0 0 8px;
}

.body :deep(p:last-child) {
  margin-bottom: 0;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}

.solid {
  border-color: var(--danger);
  background: rgba(248, 113, 113, 0.12);
}

.solid:hover:not(:disabled) {
  background: rgba(248, 113, 113, 0.22);
}
</style>
