// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import AiFollowUpComposerCard from './AiFollowUpComposerCard.vue';
import { resetAiFollowUpStateForTests, useAiFollowUp } from '@/composables/use-ai-follow-up';
import type { AiFollowUpProvider } from '@/services/ai-follow-up-provider';

const provider: AiFollowUpProvider = {
  async generate() {
    return {
      silenceDays: 30,
      timeLabel: '30 ngày+',
      needSummary: 'Nhu cầu',
      reason: 'Lý do',
      content: 'Nội dung đã duyệt',
    };
  },
};

describe('AiFollowUpComposerCard', () => {
  beforeEach(() => resetAiFollowUpStateForTests());

  it('Dùng tin này chỉ emit nội dung, không emit send', async () => {
    const store = useAiFollowUp(provider);
    await store.generate({ conversationId: 'c1', contactId: 'k1' });
    store.approve('c1');
    const wrapper = mount(AiFollowUpComposerCard, {
      props: { conversationId: 'c1' },
      global: { stubs: { VIcon: true } },
    });

    await wrapper.get('.use-button').trigger('click');

    expect(wrapper.emitted('use')).toEqual([['Nội dung đã duyệt']]);
    expect(wrapper.emitted('send')).toBeUndefined();
  });
});
