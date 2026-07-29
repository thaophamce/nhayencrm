// Shared state between MobileChatView and MobileLayout.
// Module-level ref prevents mount-order races caused by window CustomEvent.
import { ref } from 'vue';

const threadOpen = ref(false);

export function useMobileChatLayout() {
  return { threadOpen };
}
