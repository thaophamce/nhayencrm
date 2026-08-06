import { describe, expect, it } from 'vitest';
import { nextTick, ref, watch } from 'vue';

describe('trạng thái cột thông tin hội thoại', () => {
  it('hiện lại cột phải khi chuyển sang hội thoại khác', async () => {
    const selectedConvId = ref<string | null>('conv-1');
    const showContactPanel = ref(true);
    watch(selectedConvId, (id, previousId) => {
      if (id && id !== previousId) showContactPanel.value = true;
    });
    showContactPanel.value = false;
    selectedConvId.value = 'conv-2';
    await nextTick();
    expect(showContactPanel.value).toBe(true);
  });

  it('không tự mở lại khi ID hội thoại không đổi', async () => {
    const selectedConvId = ref<string | null>('conv-1');
    const showContactPanel = ref(false);
    watch(selectedConvId, (id, previousId) => {
      if (id && id !== previousId) showContactPanel.value = true;
    });
    selectedConvId.value = 'conv-1';
    await nextTick();
    expect(showContactPanel.value).toBe(false);
  });
});