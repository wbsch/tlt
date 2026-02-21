<script setup lang="ts">
withDefaults(
  defineProps<{
    label?: string;
    subtitle?: string;
    size?: 'sm' | 'md' | 'lg';
  }>(),
  {
    label: '',
    subtitle: '',
    size: 'md',
  },
);
</script>

<template>
  <div class="tlt-fairy-loader" :class="`tlt-fairy-loader--${size}`">
    <div class="tlt-fairy-loader__icon" aria-hidden="true">
      <span class="tlt-fairy-loader__triforce">
        <span class="tri tri-a"></span>
        <span class="tri tri-b"></span>
        <span class="tri tri-c"></span>
      </span>
      <span class="tlt-fairy-loader__fairy">
        <span class="fairy-glow"></span>
        <span class="fairy-sprite"></span>
        <span class="fairy-spark fairy-spark-a"></span>
        <span class="fairy-spark fairy-spark-b"></span>
      </span>
    </div>
    <div v-if="label || subtitle" class="tlt-fairy-loader__copy">
      <span v-if="label" class="tlt-fairy-loader__label">{{ label }}</span>
      <span v-if="subtitle" class="tlt-fairy-loader__subtitle">{{ subtitle }}</span>
    </div>
  </div>
</template>

<style scoped>
.tlt-fairy-loader {
  --loader-size: 5.5rem;
  --label-size: 1rem;
  --tri-size: calc(var(--loader-size) * 0.4);
  --tri-height: calc(var(--tri-size) * 0.8660254);
  color: #d1d5db;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 0.45rem;
}

.tlt-fairy-loader--sm {
  --loader-size: 4.6rem;
  --label-size: 0.92rem;
}

.tlt-fairy-loader--lg {
  --loader-size: 6.2rem;
  --label-size: 1.05rem;
}

.tlt-fairy-loader__icon {
  position: relative;
  width: var(--loader-size);
  height: var(--loader-size);
  display: inline-block;
  filter: drop-shadow(0 6px 10px rgba(0, 0, 0, 0.25));
}

.tlt-fairy-loader__triforce {
  position: absolute;
  left: 50%;
  top: 50%;
  width: calc(var(--tri-size) * 2);
  height: calc(var(--tri-height) * 2);
  transform: translate(-50%, -50%);
}

.tlt-fairy-loader__triforce .tri {
  position: absolute;
  width: var(--tri-size);
  height: var(--tri-height);
  background: linear-gradient(180deg, #f9e27f 0%, #d5b22b 100%);
  clip-path: polygon(50% 0%, 100% 100%, 0% 100%);
  opacity: 0.12;
  transform-origin: center;
  animation: tlt-loader-tri 1.2s ease-in-out infinite;
}

.tlt-fairy-loader__triforce .tri-a {
  left: 50%;
  top: 0;
  transform: translateX(-50%);
  animation-delay: 0s;
}

.tlt-fairy-loader__triforce .tri-b {
  left: 0;
  top: var(--tri-height);
  animation-delay: 0.12s;
}

.tlt-fairy-loader__triforce .tri-c {
  right: 0;
  top: var(--tri-height);
  animation-delay: 0.24s;
}

.tlt-fairy-loader__fairy {
  position: absolute;
  left: 50%;
  top: 50%;
  width: calc(var(--loader-size) * 0.582);
  height: calc(var(--loader-size) * 0.582);
  transform: translate(-50%, -50%);
  animation: tlt-loader-fairy-path 1.95s linear infinite;
  pointer-events: none;
}

.tlt-fairy-loader__fairy .fairy-glow {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: calc(var(--loader-size) * 0.355);
  height: calc(var(--loader-size) * 0.355);
  border-radius: 999px;
  background: radial-gradient(
    circle,
    rgba(255, 255, 255, 0.98) 0%,
    rgba(201, 242, 255, 0.56) 32%,
    rgba(119, 202, 255, 0.32) 55%,
    rgba(38, 146, 255, 0.04) 100%
  );
  box-shadow:
    0 0 14px rgba(151, 224, 255, 0.95),
    0 0 26px rgba(63, 176, 255, 0.72);
  filter: blur(0.03rem);
  animation: tlt-loader-fairy-glow 0.34s ease-in-out infinite;
}

.tlt-fairy-loader__fairy .fairy-sprite {
  position: absolute;
  left: 50%;
  top: 50%;
  width: calc(var(--loader-size) * 0.318);
  height: calc(var(--loader-size) * 0.272);
  transform: translate(-50%, -50%);
  background: center / contain no-repeat url('/images/Fairy.png');
  filter:
    hue-rotate(155deg)
    saturate(1.6)
    brightness(1.14)
    drop-shadow(0 0 4px rgba(186, 237, 255, 0.95))
    drop-shadow(0 0 10px rgba(84, 191, 255, 0.9));
  animation: tlt-loader-fairy-hover 0.2s ease-in-out infinite alternate;
}

.tlt-fairy-loader__fairy .fairy-spark {
  position: absolute;
  width: calc(var(--loader-size) * 0.0255);
  height: calc(var(--loader-size) * 0.0255);
  border-radius: 999px;
  background: #e8f9ff;
  box-shadow:
    0 0 4px rgba(212, 243, 255, 1),
    0 0 10px rgba(120, 206, 255, 0.72);
}

.tlt-fairy-loader__fairy .fairy-spark-a {
  top: calc(var(--loader-size) * 0.033);
  right: calc(var(--loader-size) * 0.113);
  animation: tlt-loader-fairy-spark-a 0.92s linear infinite;
}

.tlt-fairy-loader__fairy .fairy-spark-b {
  bottom: calc(var(--loader-size) * 0.044);
  left: calc(var(--loader-size) * 0.08);
  animation: tlt-loader-fairy-spark-b 1.08s linear infinite;
}

.tlt-fairy-loader__copy {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.22rem;
}

.tlt-fairy-loader__label {
  font-size: var(--label-size);
  letter-spacing: 0.02em;
}

.tlt-fairy-loader__subtitle {
  font-size: calc(var(--label-size) * 0.78);
  color: #d1d5db;
  letter-spacing: 0.02em;
}

@keyframes tlt-loader-tri {
  0%,
  20% {
    opacity: 0.12;
  }

  35% {
    opacity: 1;
  }

  60% {
    opacity: 0.65;
  }

  100% {
    opacity: 0.12;
  }
}

@keyframes tlt-loader-fairy-path {
  0% {
    transform: translate(-50%, -50%)
      translate(
        calc(var(--loader-size) * -0.36),
        calc(var(--loader-size) * -0.064)
      )
      scale(0.96);
  }

  10% {
    transform: translate(-50%, -50%)
      translate(
        calc(var(--loader-size) * -0.211),
        calc(var(--loader-size) * -0.313)
      )
      scale(0.94);
  }

  19% {
    transform: translate(-50%, -50%)
      translate(
        calc(var(--loader-size) * 0.08),
        calc(var(--loader-size) * -0.382)
      )
      scale(0.99);
  }

  30% {
    transform: translate(-50%, -50%)
      translate(
        calc(var(--loader-size) * 0.305),
        calc(var(--loader-size) * -0.222)
      )
      scale(0.95);
  }

  41% {
    transform: translate(-50%, -50%)
      translate(
        calc(var(--loader-size) * 0.378),
        calc(var(--loader-size) * 0.058)
      )
      scale(0.98);
  }

  52% {
    transform: translate(-50%, -50%)
      translate(
        calc(var(--loader-size) * 0.215),
        calc(var(--loader-size) * 0.331)
      )
      scale(0.97);
  }

  64% {
    transform: translate(-50%, -50%)
      translate(
        calc(var(--loader-size) * -0.047),
        calc(var(--loader-size) * 0.378)
      )
      scale(0.99);
  }

  76% {
    transform: translate(-50%, -50%)
      translate(
        calc(var(--loader-size) * -0.291),
        calc(var(--loader-size) * 0.258)
      )
      scale(0.93);
  }

  88% {
    transform: translate(-50%, -50%)
      translate(
        calc(var(--loader-size) * -0.396),
        calc(var(--loader-size) * 0.062)
      )
      scale(0.96);
  }

  100% {
    transform: translate(-50%, -50%)
      translate(
        calc(var(--loader-size) * -0.36),
        calc(var(--loader-size) * -0.064)
      )
      scale(0.96);
  }
}

@keyframes tlt-loader-fairy-glow {
  0%,
  100% {
    transform: translate(-50%, -50%) scale(0.88);
    opacity: 0.68;
  }

  50% {
    transform: translate(-50%, -50%) scale(1.1);
    opacity: 0.97;
  }
}

@keyframes tlt-loader-fairy-hover {
  0%,
  100% {
    transform: translate(-50%, -50%) rotate(-7deg) translateY(0.05rem)
      scale(0.98);
  }

  50% {
    transform: translate(-50%, -50%) rotate(6deg) translateY(-0.06rem)
      scale(1.03);
  }
}

@keyframes tlt-loader-fairy-spark-a {
  0% {
    transform: translate(0, 0) scale(0.5);
    opacity: 0;
  }

  35% {
    transform: translate(-0.44rem, -0.26rem) scale(1);
    opacity: 0.95;
  }

  100% {
    transform: translate(-0.94rem, -0.62rem) scale(0.35);
    opacity: 0;
  }
}

@keyframes tlt-loader-fairy-spark-b {
  0% {
    transform: translate(0, 0) scale(0.45);
    opacity: 0;
  }

  45% {
    transform: translate(0.34rem, 0.28rem) scale(0.9);
    opacity: 0.84;
  }

  100% {
    transform: translate(0.88rem, 0.64rem) scale(0.3);
    opacity: 0;
  }
}
</style>
