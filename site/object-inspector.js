import { computed, ref } from "./assets/vue.js";

export default {
  name: "ObjectInspector",
  props: {
    value: {},
    name: { default: null },
    depth: { default: 0 },
    revision: { default: 0 },
  },
  setup(props) {
    const expanded = ref(props.depth < 3);
    const isContainer = computed(() => props.value !== null && typeof props.value === "object");
    const isArray = computed(() => Array.isArray(props.value));
    const entries = computed(() => {
      // 普通宿主没有响应式通知；每个输入块消费后，revision 触发读取实际属性。
      props.revision;
      return isContainer.value ? Object.keys(props.value).map(key => ({ key, value: props.value[key] })) : [];
    });
    const kind = computed(() => {
      props.revision;
      return isArray.value ? `Array(${props.value.length})` : "Object";
    });
    const valueType = computed(() => props.value === null ? "null" : typeof props.value);
    const primitive = computed(() => typeof props.value === "string"
      ? JSON.stringify(props.value)
      : Object.is(props.value, -0) ? "-0" : String(props.value));
    return { expanded, isContainer, isArray, entries, kind, valueType, primitive };
  },
  template: `
    <div class="object-node" v-if="value !== undefined">
      <template v-if="isContainer">
        <button class="object-row object-branch" type="button" :aria-expanded="expanded" :aria-label="(expanded ? '收起 ' : '展开 ') + (name ?? '根对象')" @click="expanded = !expanded">
          <span class="object-arrow" aria-hidden="true">{{ expanded ? '▾' : '▸' }}</span>
          <span class="object-key" v-if="name !== null">{{ name }}:</span>
          <span class="object-kind">{{ kind }}</span>
          <span class="object-count" v-if="!isArray">{{ entries.length ? '(' + entries.length + ')' : '{}' }}</span>
        </button>
        <div class="object-children" v-if="expanded">
          <object-inspector v-for="entry in entries" :key="entry.key" :value="entry.value" :name="entry.key" :depth="depth + 1" :revision="revision"></object-inspector>
          <div class="object-row" v-if="isArray"><span class="object-spacer"></span><span class="object-key">length:</span><span class="object-value number">{{ value.length }}</span></div>
        </div>
      </template>
      <div class="object-row" v-else><span class="object-spacer"></span><span class="object-key" v-if="name !== null">{{ name }}:</span><span class="object-value" :class="valueType">{{ primitive }}</span></div>
    </div>`,
};
