// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * Shared composable for picking which Zalo account to operate on.
 * Used by Groups, Friends, and other account-scoped views.
 */
import { ref, onMounted, watch } from 'vue';
import { useZaloAccounts } from './use-zalo-accounts';
import { useWorkScope } from './use-work-scope';

export function useSelectedAccount() {
  const { accounts, fetchAccounts, loading } = useZaloAccounts();
  const workScope = useWorkScope();
  const selectedAccountId = ref(workScope.scopeAccountId() || localStorage.getItem('selected-zalo-account') || '');

  function selectAccount(id: string) {
    selectedAccountId.value = id;
    localStorage.setItem('selected-zalo-account', id);
  }

  // Đồng bộ theo "Tài khoản Zalo đang làm việc" ở top-nav: khi khoá vào 1 nick cụ thể,
  // dropdown chọn nick ở trang con phải tự đổi theo, không giữ lựa chọn cũ độc lập.
  watch(workScope.accountIds, (ids) => {
    const scoped = ids[0];
    if (scoped && scoped !== selectedAccountId.value) {
      selectAccount(scoped);
    }
  });

  onMounted(async () => {
    await fetchAccounts();
    const scoped = workScope.scopeAccountId();
    if (scoped) {
      if (scoped !== selectedAccountId.value) selectAccount(scoped);
    } else if (!selectedAccountId.value && accounts.value.length > 0) {
      selectAccount(accounts.value[0].id);
    }
  });

  return { accounts, selectedAccountId, selectAccount, loading };
}
