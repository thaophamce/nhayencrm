<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<template>
  <aside class="info-panel">
    <!-- ════════ HEADER: Zalo-style "Thông tin hội thoại" ════════ -->
    <header v-if="mainTab === 'profile'" class="ip-header-zalo">
      <div class="ip-header-title">Thông tin hội thoại</div>
      <button class="ip-close" title="Đóng" @click="$emit('close')">×</button>

      <!-- Avatar + Name + Edit Nickname -->
      <div class="ip-profile-hero">
        <Avatar
          :src="props.threadType === 'group' ? (props.groupAvatarUrl ?? props.contact?.avatarUrl) : props.contact?.avatarUrl"
          :name="headerFullName"
          :size="64"
          :is-group="props.threadType === 'group'"
          :gradient-seed="props.contact?.id || headerFullName"
          class="ip-avatar-big-zalo"
        />
        <div class="ip-name-wrapper">
          <div class="ip-name-line-zalo" :title="headerFullName">{{ headerFullName }}</div>
          <button class="ip-edit-btn" title="Đổi tên gợi nhớ" @click="toggleInfoExpand">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          </button>
        </div>
      </div>

      <!-- Quick Action Buttons -->
      <div class="ip-quick-actions">
        <button class="qa-btn" title="Đánh dấu chưa đọc" :disabled="isMarkingUnread" @click="markUnread">
          <div class="qa-icon-wrap">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
            <span class="qa-unread-dot"></span>
          </div>
          <span>Chưa đọc</span>
        </button>
        <button class="qa-btn" :class="{ active: notificationMuted }" :disabled="quickActionLoading === 'mute'" :title="notificationMuted ? 'Bật thông báo' : 'Tắt thông báo'" @click="toggleMute">
          <div class="qa-icon-wrap"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg></div>
          <span>{{ notificationMuted ? 'Bật thông báo' : 'Tắt thông báo' }}</span>
        </button>
        <button class="qa-btn" :class="{ active: pinned }" :disabled="quickActionLoading === 'pin'" :title="pinned ? 'Bỏ ghim hội thoại' : 'Ghim hội thoại'" @click="togglePin">
          <div class="qa-icon-wrap"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-.44-1.24l-2.78-3.55A2 2 0 0 1 15 9.24V5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v4.24c0 .43-.14.85-.4 1.21L5.8 14a2 2 0 0 0-.8 1.58Z"/></svg></div>
          <span>{{ pinned ? 'Bỏ ghim hội thoại' : 'Ghim hội thoại' }}</span>
        </button>
        <button class="qa-btn" title="Tạo nhóm Zalo" :disabled="!canCreateGroup" v-if="props.threadType !== 'group'" @click="showCreateGroup = true">
          <div class="qa-icon-wrap"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>
          <span>Tạo nhóm Zalo</span>
        </button>
        <!-- Nút quản lý nhóm — chỉ hiện khi đang ở hội thoại nhóm -->
        <template v-if="props.threadType === 'group'">
          <button class="qa-btn" title="Thêm thành viên vào nhóm" :disabled="groupActionLoading" @click="showAddMemberDialog = true">
            <div class="qa-icon-wrap"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg></div>
            <span>Thêm thành viên</span>
          </button>
          <button class="qa-btn qa-btn-danger" title="Rời khỏi nhóm này" :disabled="groupActionLoading" @click="confirmLeaveGroup">
            <div class="qa-icon-wrap"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></div>
            <span>Rời nhóm</span>
          </button>
        </template>
      </div>

      <!-- Dialog xác nhận rời nhóm -->
      <div v-if="showLeaveConfirm" class="ip-confirm-overlay" @click.self="showLeaveConfirm = false">
        <div class="ip-confirm-dialog">
          <div class="ip-confirm-title">Rời khỏi nhóm?</div>
          <div class="ip-confirm-body">Bạn sẽ không nhận được tin nhắn mới từ nhóm này nữa. Bạn có thể được mời lại sau.</div>
          <div class="ip-confirm-actions">
            <button class="ip-confirm-cancel" @click="showLeaveConfirm = false">Hủy</button>
            <button class="ip-confirm-ok danger" :disabled="groupActionLoading" @click="doLeaveGroup">
              {{ groupActionLoading ? 'Đang rời...' : 'Rời nhóm' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Dialog thêm thành viên -->
      <AddMemberDialog
        v-if="showAddMemberDialog"
        v-model="showAddMemberDialog"
        :account-id="props.activeZaloAccountId"
        @add="onAddMembers"
      />
    </header>

    <template v-if="mainTab === 'profile'">
      <!-- Zalo-style Accordions List -->
      <div class="ip-tab-content-zalo">

      <!-- Edit Nickname inline (khi bấm vào nút bút chì) -->
      <div v-if="infoExpanded" class="zalo-alias-edit-box">
        <div class="alias-title">Đổi tên gợi nhớ</div>
        <div class="alias-input-row">
          <input
            :value="aliasDraft"
            placeholder="Tên gợi nhớ mới..."
            @input="aliasDraft = ($event.target as HTMLInputElement).value"
            @keydown.enter.prevent="saveAlias"
          />
          <button class="save-alias-btn" @click="saveAlias">Lưu</button>
        </div>

      </div>

      <!-- Chỉ hiển thị khi thực sự có nhóm chung; click để mở hội thoại nhóm. -->
      <div v-if="commonGroups.length" class="zalo-common-groups">
        <button class="zalo-list-item common-group-toggle" @click="commonGroupsExpanded = !commonGroupsExpanded">
          <div class="item-left"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" class="item-icon"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/></svg><span>{{ commonGroups.length }} nhóm chung</span></div>
          <div class="item-right"><svg :class="{ expanded: commonGroupsExpanded }" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></div>
        </button>
        <div v-if="commonGroupsExpanded" class="common-group-list">
          <button v-for="group in commonGroups" :key="group.id" class="common-group-row" @click="openCommonGroup(group)">
            <span class="common-group-avatar">{{ group.name.slice(0, 1).toUpperCase() }}</span>
            <span class="common-group-info"><strong>{{ group.name }}</strong><small>{{ group.totalMember }} thành viên</small></span><span>›</span>
          </button>
        </div>
      </div>

      <!-- Báo giá thiệp cưới (2 Tab: Tiêu chuẩn vs Cao cấp VIP) -->
      <section class="profile-quote-block">
        <div class="profile-quote-tabs">
          <button
            class="quote-tab-btn"
            :class="{ active: quoteSubTab === 'standard' }"
            @click="quoteSubTab = 'standard'"
          >
            Thiệp cưới tiêu chuẩn
          </button>
          <button
            class="quote-tab-btn"
            :class="{ active: quoteSubTab === 'vip' }"
            @click="quoteSubTab = 'vip'"
          >
            Thiệp cao cấp
          </button>
        </div>
        <QuotePanel v-if="quoteSubTab === 'standard'" :key="props.conversationId || 'no-conversation'" compact />
        <QuoteVipPanel v-else :key="'vip-' + (props.conversationId || 'no-conversation')" compact />
      </section>

    </div>

    <div v-show="activeTab === 'crm'" class="tab-pane crm-tab">
    <section class="crm-widget crm-w-heat">
          <div class="crm-w-row">
            <span class="crm-w-icon">📊</span>
            <span class="crm-w-title">Nhiệt KH</span>
          </div>
          <div v-if="cockpit?.priorityScore != null" class="heat-stack">
            <div class="heat-bar-row">
              <div class="heat-bar">
                <div
                  class="heat-bar-fill"
                  :style="{ width: cockpit.priorityScore + '%', background: priorityBarColor }"
                />
              </div>
              <span class="heat-bar-num">{{ cockpit.priorityScore }}/100</span>
            </div>
            <div v-if="cockpit.stuckSinceAggregate" class="heat-stuck">
              ⚠ Stuck {{ daysFrom(cockpit.stuckSinceAggregate) }} ngày qua mọi nick
            </div>
          </div>
          <div v-else class="crm-w-empty">Chưa đủ dữ liệu nhiệt</div>
        </section>

        <!-- Widget 4: Timeline -->
        <section class="crm-widget crm-w-timeline">
          <div class="crm-w-row">
            <span class="crm-w-icon">⏰</span>
            <span class="crm-w-title">Timeline</span>
          </div>
          <div class="timeline-lines">
            <div v-if="cockpit?.firstContactDate || cockpit?.source" class="tl-line">
              <span v-if="cockpit.firstContactDate">📅 Quen {{ daysFrom(cockpit.firstContactDate) }} ngày</span>
              <span v-if="cockpit.source" class="tl-sep">·</span>
              <span v-if="cockpit.source">📞 {{ cockpit.source }}<span v-if="cockpit.sourceDate"> {{ shortDate(cockpit.sourceDate) }}</span></span>
            </div>
            <div v-if="cockpit?.lastInboundAt" class="tl-line">
              🟢 KH chat cuối: {{ relativeTime(cockpit.lastInboundAt) }}
            </div>
            <div v-if="cockpit?.lastOutboundAt" class="tl-line">
              🔵 Bạn chat cuối: {{ relativeTime(cockpit.lastOutboundAt) }}
            </div>
            <div v-if="cockpit?.nextAppointment" class="tl-line tl-appt">
              📍 Lịch hẹn: {{ shortDateTime(cockpit.nextAppointment.at) }}
              <span class="tl-appt-rel"> ({{ relativeFuture(cockpit.nextAppointment.at) }})</span>
            </div>
            <div v-if="!cockpit?.firstContactDate && !cockpit?.lastInboundAt && !cockpit?.lastOutboundAt && !cockpit?.nextAppointment" class="crm-w-empty">
              Chưa có dữ liệu timeline
            </div>
          </div>
        </section>

        <!-- Widget 5: Sản phẩm quan tâm (placeholder) -->
        <section class="crm-widget crm-w-interest">
          <div class="crm-w-row">
            <span class="crm-w-icon">🎯</span>
            <span class="crm-w-title">Sản phẩm quan tâm</span>
          </div>
          <div class="crm-w-placeholder">
            <span class="ph-icon">ⓘ</span>
            <span class="ph-text">Chức năng đang phát triển — sẽ tự gom nhu cầu từ KH cha + các nick chăm cùng KH này</span>
          </div>
        </section>

        <!-- M55 2026-05-30: Widget Cùng chăm theo ContactAccess (cover cả KH có Zalo
             lẫn no-Zalo). Hiện luôn cả khi chỉ 1 sale chăm để minh bạch ai phụ trách. -->
        <section v-if="cungChamList.length > 0" class="crm-widget crm-w-cung-cham">
          <div class="crm-w-row">
            <span class="crm-w-icon">👥</span>
            <span class="crm-w-title">Sale đang/đã chăm KH ({{ cungChamList.length }})</span>
          </div>
          <div class="cung-cham-list">
            <div v-for="acc in cungChamList" :key="acc.user?.id || acc.createdAt" class="cung-cham-row">
              <div class="cc-avatar-circle" :style="{ background: ccAvatarColor(acc.user?.fullName || acc.user?.email || '') }">
                {{ ccInitial(acc.user?.fullName || acc.user?.email || '?') }}
              </div>
              <div class="cc-info">
                <div class="cc-name">
                  {{ acc.user?.fullName || acc.user?.email || 'Sale' }}
                  <span v-if="acc.role === 'primary'" class="cc-role-primary" title="Sale phụ trách chính">⭐ Chính</span>
                  <span v-else class="cc-role-collab" title="Sale cùng chăm">🤝 Cùng chăm</span>
                </div>
                <div class="cc-meta">{{ ccSourceLabel(acc.source) }} · {{ ccDateLabel(acc.createdAt) }}</div>
              </div>
            </div>
          </div>
        </section>

        <!-- Widget 6: Đồng đội chăm KH (chỉ hiện cho KH có Zalo — based on Friend nicks chăm) -->
        <section v-if="teammatesFiltered.length > 0" class="crm-widget crm-w-team">
          <div class="crm-w-row">
            <span class="crm-w-icon">🤝</span>
            <span class="crm-w-title">Nick CRM cùng chăm ({{ teammatesFiltered.length }})</span>
          </div>
          <div v-if="teammatesFiltered.length" class="team-banner">
            💡 {{ teammatesFiltered.length }} sale khác cùng chăm KH này — phối hợp để win-win
          </div>
          <div v-if="teammatesLoading" class="crm-w-loading">
            <div class="crm-spinner" /><span>Đang tải...</span>
          </div>
          <div v-else-if="teammatesFiltered.length" class="team-list">
            <div v-for="t in teammatesFiltered" :key="t.friendId" class="team-card">
              <div class="team-card-head">
                <Avatar :src="t.nick.avatarUrl" :name="t.nick.displayName || 'Nick'" :size="32" :gradient-seed="t.friendId" platform="zalo" />
                <div class="team-card-info">
                  <div class="team-name">{{ t.owner?.fullName || 'Sale chưa rõ' }}</div>
                  <div class="team-sub">{{ t.nick.displayName || 'Nick' }} · <span :class="['team-status', teammateStatusClass(t)]">{{ teammateStatus(t) }}</span></div>
                </div>
              </div>
              <div class="team-counts">
                <span>📥 <strong>{{ t.totalInbound }}</strong></span>
                <span>📤 <strong>{{ t.totalOutbound }}</strong></span>
              </div>
              <button
                class="crm-btn-handoff"
                :disabled="!t.owner"
                :title="!t.owner ? 'Nick chưa gán cho sale nào' : ''"
                @click="onOpenHandoff(t)"
              >
                ✨ AI nhắn {{ shortName(t.owner?.fullName) || 'sale' }} phối hợp
              </button>
            </div>
          </div>
          <div v-else-if="cungChamList.length === 0" class="crm-w-empty">Chỉ mình bạn đang chăm KH này</div>
        </section>

        <!-- Widget 7: Push to Getfly (placeholder) -->
        <section class="crm-widget crm-w-push">
          <button class="crm-btn-push" disabled title="Sẽ phát triển sau">
            📤 Đẩy thông tin KH lên Getfly CRM
          </button>
          <div class="crm-w-hint">Chức năng đang phát triển</div>
        </section>
      </div>

      <!-- Sales handoff modal -->
      <SalesHandoffModal
        v-model="handoffOpen"
        :contact-name="headerFullName"
        :target-name="handoffContext.targetName"
        :target-user-id="handoffContext.targetUserId"
        :target-zalo-account-name="handoffContext.targetZaloAccountName"
        :sender-zalo-account-id="props.activeZaloAccountId ?? null"
        :sender-nick-name="senderNickName"
        :initial-content="handoffContent"
        :source="handoffSource"
        :loading="handoffLoading"
        @regenerate="onRegenerateHandoff"
      />

      <!-- ══════ TAB 3: HOẠT ĐỘNG (AI + Automation + Lịch hẹn) ══════ -->
      <div v-show="activeTab === 'activity'" class="tab-pane">
        <!-- AI Summary -->
        <section v-if="aiSummary || aiSummaryLoading" class="ip-section">
          <div class="ip-section-title">
            <span class="accent" style="background: #9c27b0" />
            ✨ AI Tóm tắt
            <button class="refresh-mini" :disabled="aiSummaryLoading" @click="$emit('refresh-ai-summary')">↻</button>
          </div>
          <AiSummaryCard :summary="aiSummary" :loading="aiSummaryLoading" />
        </section>

        <!-- AI Sentiment -->
        <section v-if="aiSentiment || aiSentimentLoading" class="ip-section">
          <div class="ip-section-title">
            <span class="accent" style="background: #ec407a" />
            💗 Cảm xúc khách hàng
            <button class="refresh-mini" :disabled="aiSentimentLoading" @click="$emit('refresh-ai-sentiment')">↻</button>
          </div>
          <AiSentimentBadge :sentiment="aiSentiment" />
          <div v-if="aiSentiment?.reason" class="sentiment-reason">{{ aiSentiment.reason }}</div>
        </section>

        <!-- Automation cards cũ đã migrate sang Tab FOLLOW-UP (M9 Luồng Mục Tiêu 2026-06-02) -->
        <!-- Xem AutomationCardList ở tab FOLLOW-UP line 469 thay vì render tại tab Profile -->
        <!--<AutomationCardList :cards="automationCards" @action="onAutomationAction" @attach="onAttachAutomation" />-->

        <!-- Lịch hẹn -->
        <ChatAppointments
          v-if="props.contactId"
          :contact-id="props.contactId"
          :contact-name="headerFullName"
          :appointments="contactAppointments"
          @refresh="reloadAppointments"
        />

        <!-- Empty state khi không có gì trong tab -->
        <div v-if="!hasAnyActivity" class="tab-empty">
          <p>Chưa có hoạt động — sau khi có conv tin nhắn, AI sẽ tự tóm tắt + phân tích cảm xúc.</p>
        </div>
      </div>

      <!-- ══════ TAB 4: ĐIỂM (Lead Scoring) ══════ -->
      <div v-show="activeTab === 'score'" class="tab-pane tab-pane-score">
        <ScoreInlinePanel
          v-if="props.friendId"
          :friend-id="props.friendId"
          :stage-label="scoreStageLabel"
          @view-history="openScoreHistory"
        />
        <div v-else class="tab-empty">
          <p>Tab Điểm chỉ áp dụng cho hội thoại 1-1 (có Friend).</p>
        </div>
      </div>

    <!-- Score history modal (overlay full screen, Teleport to body) -->
    <ScoreHistoryModal
      v-model="scoreHistoryOpen"
      :friend-id="props.friendId ?? null"
      :contact-name="headerFullName"
    />
    </template>

    <!-- ════════ TAB QUẢN LÝ ĐƠN — chỉ hội thoại nhóm (thay Media, 2026-07-14) ════════ -->
    <div v-if="mainTab === 'orders'" class="main-tab-body main-tab-body--no-padding">
      <header class="main-panel-head">
        <v-icon size="20">mdi-cart-check</v-icon>
        <div><b>Qu&#7843;n l&#253; &#273;&#417;n</b><small>T&#7841;o v&#224; qu&#7843;n l&#253; &#273;&#417;n h&#224;ng Pancake</small></div>
      </header>
      <OrderTabPanel
        v-if="props.conversationId"
        :conversation-id="props.conversationId"
        :group-name="props.groupName"
        :thread-type="props.threadType"
        :contact="props.contact"
      />
      <div v-else class="main-tab-placeholder">
        <div class="mtp-icon">📋</div>
        <h3>Quản lý đơn</h3>
        <p>Chưa chọn hội thoại nhóm để gắn đơn hàng.</p>
      </div>
    </div>

    <!-- ════════ TAB AI — Trợ lý CSKH Thiệp Cưới (KB gộp) ════════ -->
    <div v-if="mainTab === 'design-orders'" class="main-tab-body main-tab-body--no-padding">
      <DesignOrderTabPanel
        v-if="props.conversationId"
        :conversation-id="props.conversationId"
        :group-name="props.groupName"
      />
      <div v-else class="main-tab-placeholder"><h3>??n thi?t k?</h3><p>Ch?a ch?n h?i tho?i.</p></div>
    </div>

    <div v-if="mainTab === 'ai'" class="main-tab-body main-tab-body--no-padding">
      <header class="main-panel-head">
        <v-icon size="20">mdi-creation-outline</v-icon>
        <div><b>Tr&#7907; l&#253; AI</b><small>H&#7895; tr&#7907; t&#432; v&#7845;n v&#224; so&#7841;n tin ch&#259;m s&#243;c kh&#225;ch h&#224;ng</small></div>
      </header>
      <AiAssistantPanel />
    </div>

    <!-- ════════ TAB FOLLOW-UP — Luồng Mục Tiêu M9 wire 2026-06-02 ════════ -->
    <div v-if="mainTab === 'followup'" class="main-tab-body main-tab-body--no-padding">
      <header class="main-panel-head">
        <v-icon size="20">mdi-bullseye-arrow</v-icon>
        <div><b>Follow-up</b><small>Theo d&#245;i v&#224; qu&#7843;n l&#253; lu&#7891;ng b&#225;m &#273;u&#7893;i kh&#225;ch h&#224;ng</small></div>
      </header>
      <div class="follow-up-subtabs" role="tablist" aria-label="Lo&#7841;i follow-up">
        <button
          type="button"
          role="tab"
          :aria-selected="followUpSubTab === 'automation'"
          :class="{ active: followUpSubTab === 'automation' }"
          @click="followUpSubTab = 'automation'"
        >Lu&#7891;ng t&#7921; &#273;&#7897;ng</button>
        <button
          type="button"
          role="tab"
          :aria-selected="followUpSubTab === 'ai'"
          :class="{ active: followUpSubTab === 'ai' }"
          @click="followUpSubTab = 'ai'"
        >AI &#273;&#7873; xu&#7845;t</button>
      </div>
      <AutomationCardList
        v-if="contact?.id && followUpSubTab === 'automation'"
        ref="automationCardListRef"
        :contact-id="contact.id"
        :nick-id="props.activeZaloAccountId || null"
        :nick-name="props.activeZaloAccountName || null"
        @add-flow="openAddFlowModal"
      />
      <AiFollowUpPanel
        v-else-if="contact?.id && props.conversationId && followUpSubTab === 'ai'"
        :conversation-id="props.conversationId"
        :contact-id="contact.id"
        :contact-name="contact.fullName || contact.crmName"
        :last-inbound-at="contact.lastInboundAt"
        :last-inbound-preview="contact.lastInboundPreview"
        @send="(content, onSuccess, onError) => emit('send-ai-follow-up', content, onSuccess, onError)"
      />
      <div v-else-if="!contact?.id" class="main-tab-placeholder">
        <div class="mtp-icon">🎯</div>
        <h3>Luồng bám đuổi</h3>
        <p>Chưa chọn khách hàng để xem các luồng đang chạy.</p>
      </div>
    </div>

    <!-- Modal "+ Gắn thêm luồng" — mount qua Teleport để overlay full viewport -->
    <AddFlowModal
      v-if="showAddFlowModal && contact"
      :contact-id="contact.id"
      :contact-name="contact.fullName || contact.crmName || ''"
      :nick-id="props.activeZaloAccountId || ''"
      :nick-name="props.activeZaloAccountName || ''"
      @close="closeAddFlowModal"
      @enrolled="onEnrolled"
    />

    <!-- ════════ Bottom 4-tab strip (Profile / Automation / AI / Follow-up) ════════ -->
    <nav class="bottom-tabs" role="tablist" aria-label="Chuyển tab chính">
      <button
        v-if="!props.hideProfile"
        class="bottom-tab"
        :class="{ active: mainTab === 'profile' }"
        role="tab"
        :aria-selected="mainTab === 'profile'"
        title="Profile — Hồ sơ, CRM, Lịch hẹn, Điểm"
        @click="mainTab = 'profile'"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>
        <span class="bt-label">PROFILE</span>
      </button>
      <button
        class="bottom-tab"
        :class="{ active: mainTab === 'orders' }"
        role="tab"
        :aria-selected="mainTab === 'orders'"
        title="Quản lý đơn — Gắn trạng thái đơn hàng cho nhóm"
        @click="mainTab = 'orders'"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
        <span class="bt-label">QUẢN LÝ ĐƠN</span>
      </button>
      <button
        class="bottom-tab"
        :class="{ active: mainTab === 'design-orders' }"
        role="tab"
        :aria-selected="mainTab === 'design-orders'"
        title="Đơn thiết kế — Designer, deadline, trạng thái và KPI"
        @click="mainTab = 'design-orders'"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22a10 10 0 1 0 0-20 7 7 0 0 0 0 14h1.5a1.5 1.5 0 0 1 0 3H12"/><circle cx="7.5" cy="10.5" r="1"/><circle cx="10" cy="6.5" r="1"/><circle cx="15" cy="7.5" r="1"/></svg>
        <span class="bt-label">ĐƠN THIẾT KẾ</span>
      </button>
      <button
        class="bottom-tab"
        :class="{ active: mainTab === 'ai' }"
        role="tab"
        :aria-selected="mainTab === 'ai'"
        title="AI — Trợ lý hỏi đáp sản phẩm BĐS"
        @click="mainTab = 'ai'"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/></svg>
        <span class="bt-label">AI</span>
      </button>
      <button
        class="bottom-tab"
        :class="{ active: mainTab === 'followup' }"
        role="tab"
        :aria-selected="mainTab === 'followup'"
        title="Follow-up — Luồng bám đuổi KH"
        @click="mainTab = 'followup'"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
        <span class="bt-label">FOLLOW-UP</span>
      </button>
    </nav>
    <GroupCreateDialog v-model="showCreateGroup" :account-id="props.activeZaloAccountId" :initial-member-ids="currentMemberUid ? [currentMemberUid] : []" @create="createZaloGroup" @created="onGroupPancakeCreated" />

    <!-- ════════ Lightbox ảnh/video nội bộ ════════ -->
    <Teleport to="body">
      <div v-if="lightboxOpen" class="ip-lightbox-overlay" @click.self="lightboxClose">
        <!-- Header -->
        <div class="ip-lb-header">
          <div class="ip-lb-title">
            {{ lightboxItems[lightboxIndex]?.name || 'Ảnh' }}
          </div>
          <div class="ip-lb-actions">
            <a :href="lightboxItems[lightboxIndex]?.url" target="_blank" rel="noopener noreferrer" class="ip-lb-btn" title="Mở trong tab mới">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            </a>
            <button class="ip-lb-btn" :title="lightboxZoomed ? 'Thu nhỏ' : 'Phóng to x2'" @click="lightboxToggleZoom">
              <svg v-if="lightboxZoomed" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
              <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
            </button>
            <button class="ip-lb-btn ip-lb-close" title="Đóng (Esc)" @click="lightboxClose">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        <!-- Body: ảnh -->
        <div class="ip-lb-body" :class="{ zoomed: lightboxZoomed }">
          <button v-if="lightboxItems.length > 1" class="ip-lb-nav ip-lb-nav-prev" @click="lightboxPrev">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>

          <div class="ip-lb-img-wrap" :class="{ zoomed: lightboxZoomed }">
            <template v-if="lightboxItems[lightboxIndex]?.kind === 'video'">
              <video
                :src="lightboxItems[lightboxIndex]?.url"
                controls
                class="ip-lb-media"
                :class="{ zoomed: lightboxZoomed }"
              />
            </template>
            <template v-else>
              <img
                :src="lightboxItems[lightboxIndex]?.url || lightboxItems[lightboxIndex]?.thumbnailUrl"
                :alt="lightboxItems[lightboxIndex]?.name || 'Ảnh'"
                class="ip-lb-media"
                :class="{ zoomed: lightboxZoomed }"
                @click="lightboxToggleZoom"
              />
            </template>
          </div>

          <button v-if="lightboxItems.length > 1" class="ip-lb-nav ip-lb-nav-next" @click="lightboxNext">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>

        <!-- Footer: thumbnail strip -->
        <div v-if="lightboxItems.length > 1" class="ip-lb-thumbs">
          <button
            v-for="(item, i) in lightboxItems"
            :key="item.id"
            class="ip-lb-thumb"
            :class="{ active: i === lightboxIndex }"
            @click="lightboxIndex = i; lightboxZoomed = false"
          >
            <img v-if="item.thumbnailUrl || item.kind === 'image'" :src="item.thumbnailUrl || item.url" alt="" />
            <span v-else class="ip-lb-thumb-vid">▶</span>
          </button>
        </div>
      </div>
    </Teleport>
  </aside>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onBeforeUnmount, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import type { Contact } from '@/composables/use-contacts';
import type { AiSentiment } from '@/composables/use-chat';
import { useChatContactPanel } from '@/composables/use-chat-contact-panel';
import Avatar from '@/components/ui/Avatar.vue';
import { useToast } from '@/composables/use-toast';
import { api } from '@/api';
import { useContactCockpit, type Teammate } from '@/composables/use-contact-cockpit';
import { useAuthStore } from '@/stores/auth';
import GroupCreateDialog from '@/components/groups/group-create-dialog.vue';
import AddMemberDialog from '@/components/chat/AddMemberDialog.vue';
import { useGroups } from '@/composables/use-groups';
import ChatAppointments from './ChatAppointments.vue';
import AiSummaryCard from '@/components/ai/ai-summary-card.vue';
import AiSentimentBadge from '@/components/ai/ai-sentiment-badge.vue';
import AddFlowModal from './AddFlowModal.vue';
import QuotePanel from './QuotePanel.vue';
import QuoteVipPanel from './QuoteVipPanel.vue';

const quoteSubTab = ref<'standard' | 'vip'>('standard');
import AiAssistantPanel from './AiAssistantPanel.vue';
import OrderTabPanel from './OrderTabPanel.vue';
import DesignOrderTabPanel from './DesignOrderTabPanel.vue';
import ScoreInlinePanel from '@/components/scoring/ScoreInlinePanel.vue';
import ScoreHistoryModal from '@/components/scoring/ScoreHistoryModal.vue';
import SalesHandoffModal from './SalesHandoffModal.vue';
import AiFollowUpPanel from './AiFollowUpPanel.vue';

const props = defineProps<{
  contactId: string | null;
  contact: Contact | null;
  // Nick CRM đang xem KH này — dùng để xác định Friend row "active" cho per-pair tag.
  activeZaloAccountId?: string | null;
  // Tên hiển thị nick CRM đang online — hiển thị trong modal handoff ("Từ nick: ...")
  activeZaloAccountName?: string | null;
  // Conversation hiện tại — dùng cho /ai/suggest (gợi ý next action widget 2 tab CRM)
  conversationId?: string | null;
  // Thông tin nhóm Zalo (chỉ dùng khi threadType=group)
  threadType?: 'user' | 'group' | null;
  groupName?: string | null;
  groupAvatarUrl?: string | null;
  // Friend.id của cặp (contact × activeZaloAccount). Cần để fetch score breakdown per-pair.
  friendId?: string | null;
  // Friendship per-pair (nick × KH) — chứa aliasInNick để sync 2-way với Zalo Real.
  friendship?: { id?: string; aliasInNick?: string | null } | null;
  externalThreadId?: string | null;
  isPinned?: boolean;
  aiSummary: string;
  aiSummaryLoading: boolean;
  aiSentiment: AiSentiment | null;
  aiSentimentLoading: boolean;
  hideProfile?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  saved: [];
  'refresh-ai-summary': [];
  'refresh-ai-sentiment': [];
  'insert-suggestion': [text: string];
  'send-ai-follow-up': [content: string, onSuccess: () => void, onError: () => void];
  'status-changed': [statusId: string | null];
  'group-created': [conversationId: string];
  'mark-unread': [conversationId: string];
  'show-related-conversations': [];
}>();

type CommonGroup = { id: string; name: string; totalMember: number };
type SharedMediaItem = { id: string; kind: 'image' | 'video'; name: string; url: string; thumbnailUrl: string };
type SharedFileItem = { id: string; name: string; url: string; sizeLabel: string; extension: string };
type SharedLinkItem = { url: string; host: string };

const notificationMuted = ref(false);
const pinned = ref(false);
const quickActionLoading = ref<null | 'mute' | 'pin'>(null);
const showCreateGroup = ref(false);
const commonGroups = ref<CommonGroup[]>([]);
const commonGroupsExpanded = ref(false);
const sharedMedia = ref<SharedMediaItem[]>([]);
const sharedFiles = ref<SharedFileItem[]>([]);
const sharedLinks = ref<SharedLinkItem[]>([]);
const currentMemberUid = computed(() => props.externalThreadId || '');
const canCreateGroup = computed(() => !!props.activeZaloAccountId && !!currentMemberUid.value);
const { createGroup, addMembers, leaveGroup } = useGroups();

function apiError(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback;
}

async function toggleMute() {
  if (!props.conversationId || quickActionLoading.value) return;
  quickActionLoading.value = 'mute';
  const next = !notificationMuted.value;
  try {
    await api.post(`/conversations/${props.conversationId}/${next ? 'mute' : 'unmute'}`);
    notificationMuted.value = next;
    toast.success(next ? 'Đã tắt thông báo hội thoại' : 'Đã bật thông báo hội thoại');
  } catch (err) { toast.error(apiError(err, 'Không đổi được cài đặt thông báo')); }
  finally { quickActionLoading.value = null; }
}

async function togglePin() {
  if (!props.conversationId || quickActionLoading.value) return;
  quickActionLoading.value = 'pin';
  const next = !pinned.value;
  try {
    await api.post(`/conversations/${props.conversationId}/${next ? 'pin' : 'unpin'}`);
    pinned.value = next;
    emit('saved');
    toast.success(next ? 'Đã ghim hội thoại lên đầu' : 'Đã bỏ ghim hội thoại');
  } catch (err) { toast.error(apiError(err, 'Không ghim được hội thoại')); }
  finally { quickActionLoading.value = null; }
}

const isMarkingUnread = ref(false);
async function markUnread() {
  if (!props.conversationId || isMarkingUnread.value) return;
  isMarkingUnread.value = true;
  try {
    await api.post(`/conversations/${props.conversationId}/mark-unread`);
    emit('mark-unread', props.conversationId);
    toast.success('Đã đánh dấu cuộc hội thoại là chưa đọc');
  } catch (err) {
    toast.error(apiError(err, 'Không thể đánh dấu chưa đọc'));
  } finally {
    isMarkingUnread.value = false;
  }
}

function onGroupPancakeCreated(payload: { conversationId: string }) {
  if (payload.conversationId) emit('group-created', payload.conversationId);
  void loadCommonGroups();
}
async function createZaloGroup(payload: { name: string; memberIds: string[]; createPancakeOrder?: boolean }) {
  if (!props.activeZaloAccountId) return;
  const memberIds = [...new Set([currentMemberUid.value, ...payload.memberIds].filter(Boolean))];
  const result = await createGroup(props.activeZaloAccountId, { name: payload.name, memberIds });
  if (!result?.conversationId) {
    toast.error('Tạo nhóm Zalo thất bại. Chưa tạo đơn Pancake.');
    return;
  }
  if (payload.createPancakeOrder) {
    try {
      const { data } = await api.post(`/orders/pancake/from-conversation/${result.conversationId}`, {});
      const code = data?.link?.orderCode || data?.link?.pancakeOrderId || '';
      if (data?.renameSucceeded || data?.link?.syncStatus === 'complete') toast.success(`Đã tạo nhóm và đơn Pancake ${code}`.trim());
      else toast.warning(`Đã tạo đơn Pancake ${code}, nhưng chưa đổi được tên nhóm. Mở tab Quản lý đơn để thử lại.`.trim());
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Đã tạo nhóm Zalo nhưng chưa tạo được đơn Pancake');
    }
  } else toast.success('Đã tạo nhóm Zalo');
  void loadCommonGroups();
}
// ════════ Thêm thành viên & Rời nhóm ════════
const showAddMemberDialog = ref(false);
const showLeaveConfirm = ref(false);
const groupActionLoading = ref(false);

async function onAddMembers(memberIds: string[]) {
  if (!props.activeZaloAccountId || !props.externalThreadId) return;
  if (!memberIds.length) { showAddMemberDialog.value = false; return; }
  groupActionLoading.value = true;
  try {
    await addMembers(props.activeZaloAccountId, props.externalThreadId, memberIds);
    toast.success(`Đã thêm ${memberIds.length} thành viên vào nhóm`);
    showAddMemberDialog.value = false;
  } catch (err) {
    toast.error(apiError(err, 'Thêm thành viên thất bại'));
  } finally {
    groupActionLoading.value = false;
  }
}

function confirmLeaveGroup() {
  showLeaveConfirm.value = true;
}

async function doLeaveGroup() {
  if (!props.activeZaloAccountId || !props.externalThreadId) return;
  groupActionLoading.value = true;
  try {
    await leaveGroup(props.activeZaloAccountId, props.externalThreadId);
    showLeaveConfirm.value = false;
    toast.success('Đã rời khỏi nhóm');
    emit('saved');
  } catch (err) {
    toast.error(apiError(err, 'Rời nhóm thất bại'));
  } finally {
    groupActionLoading.value = false;
  }
}

async function openCommonGroup(group: CommonGroup) {
  if (!props.activeZaloAccountId) return;
  try {
    const { data } = await api.post<{ conversationId: string }>(`/zalo-accounts/${props.activeZaloAccountId}/groups/${group.id}/ensure-conversation`, {});
    if (data.conversationId) await router.push({ name: 'Chat', params: { convId: data.conversationId } });
  } catch (err) { toast.error(apiError(err, 'Không mở được hội thoại nhóm')); }
}

function parsePayload(content: string | null): Record<string, any> {
  if (!content) return {};
  if (/^https?:\/\//i.test(content)) return { href: content };
  try { const value = JSON.parse(content); return value && typeof value === 'object' ? value : {}; }
  catch { return {}; }
}
function firstUrl(value: unknown): string {
  if (typeof value === 'string' && /^https?:\/\//i.test(value)) return value;
  if (!value || typeof value !== 'object') return '';
  const obj = value as Record<string, unknown>;
  for (const key of ['hdUrl', 'normalUrl', 'href', 'url', 'src', 'thumbUrl', 'thumb', 'thumbnail']) {
    const found = obj[key]; if (typeof found === 'string' && /^https?:\/\//i.test(found)) return found;
  }
  return '';
}
function humanSize(bytes: unknown): string {
  const n = Number(bytes || 0); if (!n) return '';
  return n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}
function collectUrls(value: unknown, output: Set<string>) {
  if (typeof value === 'string') {
    for (const match of value.match(/https?:\/\/[^\s"'<>]+/gi) || []) output.add(match.replace(/[),.;!?]+$/, ''));
    return;
  }
  if (Array.isArray(value)) { value.forEach(v => collectUrls(v, output)); return; }
  if (value && typeof value === 'object') Object.values(value as Record<string, unknown>).forEach(v => collectUrls(v, output));
}

async function loadSharedContent() {
  if (!props.conversationId) return;
  try {
    const { data } = await api.get(`/conversations/${props.conversationId}/messages`, { params: { limit: 200 } });
    const media: SharedMediaItem[] = [], files: SharedFileItem[] = [];
    const urls = new Set<string>();
    for (const message of data.messages || []) {
      const payload = parsePayload(message.content);
      collectUrls(message.content, urls);
      const url = firstUrl(payload);
      if ((message.contentType === 'image' || message.contentType === 'video') && url) {
        media.push({ id: message.id, kind: message.contentType, name: String(payload.name || payload.title || message.contentType), url, thumbnailUrl: String(payload.thumbUrl || payload.thumb || payload.thumbnail || (message.contentType === 'image' ? url : '')) });
      } else if (message.contentType === 'file' && url) {
        const name = String(payload.name || payload.fileName || 'Tệp đính kèm');
        files.push({ id: message.id, name, url, sizeLabel: humanSize(payload.size), extension: (name.split('.').pop() || 'FILE').slice(0, 4).toUpperCase() });
      }
    }
    sharedMedia.value = media;
    sharedFiles.value = files;
    const mediaUrls = new Set([...media.map(x => x.url), ...media.map(x => x.thumbnailUrl), ...files.map(x => x.url)]);
    sharedLinks.value = [...urls].filter(url => !mediaUrls.has(url)).map(url => {
      try { return { url, host: new URL(url).hostname }; } catch { return { url, host: url }; }
    });
  } catch { sharedMedia.value = []; sharedFiles.value = []; sharedLinks.value = []; }
}

async function loadCommonGroups() {
  if (props.threadType === 'group' || !props.activeZaloAccountId || !currentMemberUid.value) {
    commonGroups.value = [];
    return;
  }
  try {
    const { data } = await api.get(`/zalo-accounts/${props.activeZaloAccountId}/groups/common/${encodeURIComponent(currentMemberUid.value)}`);
    commonGroups.value = data.groups || [];
  } catch { commonGroups.value = []; }
}

async function loadMuteStatus() {
  if (!props.conversationId) return;
  try {
    const { data } = await api.get(`/conversations/${props.conversationId}/mute-status`);
    notificationMuted.value = !!data.muted;
  } catch { notificationMuted.value = false; }
}

// ════════ Lightbox ảnh/video nội bộ ════════
const lightboxOpen = ref(false);
const lightboxIndex = ref(0);
const lightboxZoomed = ref(false);
const lightboxItems = computed(() => sharedMedia.value.filter(m => m.kind === 'image' || m.kind === 'video'));

// function openSharedItem(item: SharedMediaItem) {
//   const idx = lightboxItems.value.findIndex(m => m.id === item.id);
//   lightboxIndex.value = idx >= 0 ? idx : 0;
//   lightboxZoomed.value = false;
//   lightboxOpen.value = true;
// }

function lightboxPrev() {
  if (lightboxItems.value.length <= 1) return;
  lightboxIndex.value = (lightboxIndex.value - 1 + lightboxItems.value.length) % lightboxItems.value.length;
  lightboxZoomed.value = false;
}

function lightboxNext() {
  if (lightboxItems.value.length <= 1) return;
  lightboxIndex.value = (lightboxIndex.value + 1) % lightboxItems.value.length;
  lightboxZoomed.value = false;
}

function lightboxToggleZoom() {
  lightboxZoomed.value = !lightboxZoomed.value;
}

function lightboxClose() {
  lightboxOpen.value = false;
  lightboxZoomed.value = false;
}

function onLightboxKeydown(e: KeyboardEvent) {
  if (!lightboxOpen.value) return;
  if (e.key === 'Escape') lightboxClose();
  else if (e.key === 'ArrowLeft') lightboxPrev();
  else if (e.key === 'ArrowRight') lightboxNext();
}

onMounted(() => document.addEventListener('keydown', onLightboxKeydown));
onUnmounted(() => document.removeEventListener('keydown', onLightboxKeydown));

watch(() => props.isPinned, value => { pinned.value = !!value; }, { immediate: true });
watch(() => props.conversationId, () => { void loadSharedContent(); void loadMuteStatus(); }, { immediate: true });
watch([() => props.activeZaloAccountId, currentMemberUid], () => { commonGroupsExpanded.value = false; void loadCommonGroups(); }, { immediate: true });

// orgId cho ContactDealStageSelector (trạng thái cột 4 cạnh UID — sync với cột 3).
const _authStorePanel = useAuthStore();
const orgId = computed(() => _authStorePanel.user?.orgId ?? null);

// Đổi trạng thái ở cột 4 → cập nhật local contact + emit để cột 3 sync (cùng tab).
// Cross-device đã do BE emit friend:updated lo (ChatView listen).
function onDealStageUpdatedPanel(newStatusId: string | null) {
  if (props.contact) {
    (props.contact as { statusId?: string | null }).statusId = newStatusId;
  }
  emit('status-changed', newStatusId);
}

const {
  form, saveSuccess, saveError,
  contactAppointments,
  saveContact, reloadAppointments,
} = useChatContactPanel(
  () => props.contactId,
  () => props.contact,
  () => emit('saved'),
);



// ════════ Tên gợi nhớ Zalo (per-pair, sync 2-way với Zalo Real) ════════
// Bound to Friend.aliasInNick — PATCH /friends/:id sẽ:
//   1. Update DB
//   2. Fire-and-forget call api.changeFriendAlias / removeFriendAlias → push Zalo Real
const aliasDraft = ref('');
watch(() => props.friendship?.aliasInNick, (v) => {
  aliasDraft.value = v || '';
}, { immediate: true });

const aliasToast = useToast();
async function saveAlias() {
  const friendId = props.friendship?.id;
  if (!friendId) return;
  const trimmed = aliasDraft.value.trim();
  const newAlias = trimmed.length ? trimmed : null;
  if (newAlias === (props.friendship?.aliasInNick || null)) return;  // no-op
  try {
    await api.patch(`/friends/${friendId}`, { aliasInNick: newAlias });
    aliasToast.success(newAlias ? `Đã đổi tên gợi nhớ → "${newAlias}"` : 'Đã xoá tên gợi nhớ');
    emit('saved');  // parent refetch để lấy alias mới + reflect lên cột 2 + header
  } catch (err) {
    aliasToast.error('Lưu tên gợi nhớ thất bại');
  }
}

// ════════ Tab state (persist sang tab khác KH khác) ════════
// 2026-06-01: Refactor cột 4 4-tab — bottom strip Profile/Media/AI/Follow-up.
// 2026-06-12 (anh chốt): tab 'automation' → 'media' (gộp Picker Media + Automation:
//   Ảnh/Video/Tệp/Khối trong MediaTabPanel). `activeTab` (sub-tab) chỉ active scope 'profile'.
const mainTab = ref<'profile' | 'ai' | 'followup' | 'orders' | 'design-orders'>('profile');
const followUpSubTab = ref<'automation' | 'ai'>('ai');
const activeTab = ref<'profile' | 'crm' | 'activity' | 'score'>('profile');

// Đổi hội thoại hoặc loại hội thoại → reset về tab phù hợp
watch([() => props.conversationId, () => props.threadType], () => {
  mainTab.value = props.hideProfile ? 'orders' : 'profile';
  followUpSubTab.value = 'ai';
}, { immediate: true });

// Cho phép cha (ChatView) mở tab Media từ nút "Chèn từ kho" ở composer cột 3.
function setMainTab(t: 'profile' | 'media' | 'ai' | 'followup' | 'orders' | 'design-orders') { mainTab.value = t === 'media' ? 'profile' : t; }
defineExpose({ setMainTab });

// ════════════════════════════════════════════════════════════════════════
// Info section state machine — 3 modes, in-memory only (KHÔNG persist):
//   'auto'   → expand + countdown 5s → auto-hide
//   'sticky' → user click 2nd time để ghim → KHÔNG auto-hide
//   'hidden' → ẩn (mặc định, hoặc sau countdown, hoặc user thu gọn)
//
// Flow toggle button (1 nút, 3-state cycle):
//   hidden → click → 'auto' (5s countdown)
//   'auto' (đang countdown) → click → 'sticky' (cancel countdown, ghim 📌)
//   'sticky' → click → 'hidden'
//
// Reload page / switch conv / switch tab → RESET về hidden (KHÔNG persist).
// Sticky chỉ giữ trong cùng conv + cùng tab Hồ Sơ.
// ════════════════════════════════════════════════════════════════════════
type ExpandMode = 'auto' | 'sticky' | 'hidden';
const expandMode = ref<ExpandMode>('hidden');
const infoExpanded = computed(() => expandMode.value !== 'hidden');
const isSticky = computed(() => expandMode.value === 'sticky');
const collapseRemain = ref(5);
let collapseTimer: ReturnType<typeof setInterval> | null = null;

function clearCollapseTimer() {
  if (collapseTimer) { clearInterval(collapseTimer); collapseTimer = null; }
}
function startAutoCollapse() {
  clearCollapseTimer();
  collapseRemain.value = 5;
  collapseTimer = setInterval(() => {
    collapseRemain.value--;
    if (collapseRemain.value <= 0) {
      // Chỉ tự hide khi đang ở mode 'auto'. Sticky thì never timeout.
      if (expandMode.value === 'auto') expandMode.value = 'hidden';
      clearCollapseTimer();
    }
  }, 1000);
}

// 3-state cycle trên 1 nút toggle (theo user spec):
//   hidden → 'auto' (countdown 5s)
//   'auto' → 'sticky' (ghim, cancel countdown)
//   'sticky' → 'hidden'
function toggleInfoExpand() {
  if (expandMode.value === 'hidden') {
    // Open lần đầu → auto countdown 5s
    expandMode.value = 'auto';
    startAutoCollapse();
  } else if (expandMode.value === 'auto') {
    // Click lần nữa khi đang auto → ghim sticky (cancel countdown)
    expandMode.value = 'sticky';
    clearCollapseTimer();
  } else {
    // sticky → hidden
    expandMode.value = 'hidden';
    clearCollapseTimer();
  }
}

// Khi click tab Hồ Sơ: auto-expand + countdown (KHÔNG sticky default).
// Khi switch tab khác: hidden.
watch(activeTab, (tab) => {
  if (tab === 'profile') {
    expandMode.value = 'auto';
    startAutoCollapse();
  } else {
    clearCollapseTimer();
    expandMode.value = 'hidden';
  }
});

// Animation: khi NotesSection emit 'appointment-created' (fly anim đã xong) → +1 badge với bump effect.
// pendingAptBump giữ count cho tới khi reloadAppointments() refresh data thực từ backend.
const pendingAptBump = ref(0);
const badgeBump = ref(false);
function onAppointmentCreated() {
  pendingAptBump.value++;
  badgeBump.value = true;
  setTimeout(() => { badgeBump.value = false; }, 600);
  // Reset bump NGAY trong .then() (không setTimeout 300ms) để Vue batch cùng frame
  //   activityBadgeCount: 0 → 1  (do reload)
  //   pendingAptBump:     1 → 0  (do reset)
  // Cả 2 update cùng microtask → 1 re-render duy nhất, badge từ 1 (bump) → 1 (real),
  // không flash số 2. Bug cũ: setTimeout 300ms giữ bump=1 sau khi data đã = 1 → badge = 2.
  reloadAppointments().then(() => {
    pendingAptBump.value = 0;
  });
}

// Listen global 'appointment-created' event — fire khi MessageThread (cột 3) tạo
// nhắc hẹn qua icon 📅 trong toolbar. Cùng pattern với zalo-labels-synced.
function onGlobalAppointmentCreated() { onAppointmentCreated(); }
onMounted(() => window.addEventListener('appointment-created', onGlobalAppointmentCreated));
onBeforeUnmount(() => {
  clearCollapseTimer();
  window.removeEventListener('appointment-created', onGlobalAppointmentCreated);
});

// ════════ Score history modal (mở từ tab Điểm "Xem toàn bộ →") ════════
const scoreHistoryOpen = ref(false);
function openScoreHistory() {
  scoreHistoryOpen.value = true;
}

// Stage label hiển thị cạnh điểm tổng (vd "warm-lead" lấy từ friendship.statusRef.name)
const scoreStageLabel = computed<string | null>(() => {
  const c = props.contact as Contact & { friendship?: { statusRef?: { name?: string } | null } } | null;
  return c?.friendship?.statusRef?.name || null;
});

// ════════ Relations data (friends per nick = KH Con) — fetch khi đổi contact ═══
interface FriendItem {
  id: string;
  zaloUidInNick: string;
  relationshipKind: string;
  hasConversation: boolean;
  totalInbound: number;
  totalOutbound: number;
  becameFriendAt: string | null;
  lastInboundAt: string | null;
  leadScore: number;
  zaloDisplayName: string | null;
  zaloAvatarUrl: string | null;
  crmTagsPerNick: string[];
  statusRef: { id: string; name: string; order: number; color: string | null } | null;
  zaloAccount: { id: string; displayName: string | null; avatarUrl?: string | null; owner: { id: string; fullName: string } | null };
}
interface RelationsState {
  friends: FriendItem[];
}
const relations = ref<RelationsState>({ friends: [] });

async function fetchRelations(contactId: string) {
  try {
    const res = await api.get<{ friends?: FriendItem[] }>(`/contacts/${contactId}`);
    // Sort: "đang chat" lên đầu — sale chỉ care nick đã thực sự nhắn 1-1.
    const all = res.data.friends || [];
    all.sort((a, b) => {
      if (a.hasConversation !== b.hasConversation) return a.hasConversation ? -1 : 1;
      const at = a.lastInboundAt || '';
      const bt = b.lastInboundAt || '';
      return bt.localeCompare(at);
    });
    relations.value = { friends: all };
  } catch (err) {
    console.error('[ChatContactPanel] fetchRelations error:', err);
    relations.value = { friends: [] };
  }
}

// Care status legacy (CareStatusBadge) GỠ 2026-06-06 — cột 4 dùng ContactDealStageSelector
// (statusId dynamic) cạnh UID để sync với cột 3. onChangeCareStatus + import bỏ.

// ════════ Header name (Avatar component handle initials + gender + gradient) ════════
// B7 fix — Contact stub có thể fullName='Unknown'; fallback qua aliasInNick (props.friendship)
// rồi activeFriend.zaloDisplayName (nick đang chăm) trước khi hiện 'Khách hàng'.
const headerFullName = computed(() => {
  const isUsable = (s: string | null | undefined): s is string =>
    !!s && s.trim().length > 0 && s.trim().toLowerCase() !== 'unknown';
  // Hội thoại nhóm → ưu tiên groupName
  if (props.threadType === 'group') {
    if (isUsable(props.groupName)) return props.groupName!;
    if (isUsable(props.contact?.fullName)) return props.contact!.fullName!;
    return 'Nhóm Zalo';
  }
  if (isUsable(props.contact?.crmName)) return props.contact!.crmName!;
  if (isUsable(props.contact?.fullName)) return props.contact!.fullName!;
  if (isUsable(props.friendship?.aliasInNick)) return props.friendship!.aliasInNick!;
  const af = activeFriend.value as { zaloDisplayName?: string | null } | null;
  if (isUsable(af?.zaloDisplayName)) return af!.zaloDisplayName!;
  return 'Khách hàng';
});

// Lead score tier để màu badge overlay trên avatar (thấp/TB/cao)
const scoreData = computed(() => ({
  lead: props.contact?.leadScore ?? null,
  priority: props.contact?.priorityScore ?? null,
}));

// ════════ Phones extras ════════
const showExtraPhones = ref(false);
// SĐT chính: hiển thị format đẹp '0359 944 488' khi KHÔNG focus; khi focus thì show raw để
// sale gõ/sửa tự nhiên. Tooltip = '+84...' (Anh chốt 2026-06-06). Giá trị lưu vẫn raw.
const phoneFocused = ref(false);

// SĐT phụ — list động (form.phonesExtra). Thêm/xoá dòng, lưu khi blur.
function addExtraPhone() {
  form.phonesExtra.push({ label: '', phone: '' });
  showExtraPhones.value = true;
}
function removeExtraPhone(idx: number) {
  form.phonesExtra.splice(idx, 1);
  saveContact();
}

// Tag CRM hệ thống đã chuyển sang TagCrmBar trên chat input (Cột 3).
// Zalo Real labels chuyển sang dropdown trong header Cột 3 (MessageThread).

// ════════ Tab FOLLOW-UP — Luồng Mục Tiêu M9 (2026-06-02) ════════
// AutomationCardList tự fetch /api/v1/contacts/:cid/automation-status
// + tự poll 30s với Page Visibility API. Modal "+ Gắn thêm luồng" qua AddFlowModal.
const automationCardListRef = ref<InstanceType<typeof AutomationCardList> | null>(null);
const showAddFlowModal = ref(false);

function openAddFlowModal(): void {
  showAddFlowModal.value = true;
}

function closeAddFlowModal(): void {
  showAddFlowModal.value = false;
}

function onEnrolled(): void {
  showAddFlowModal.value = false;
  // Refresh card list để hiện luồng mới enroll
  if (automationCardListRef.value?.refetch) {
    void automationCardListRef.value.refetch();
  }
}

// ════════ Hồ sơ KH tổng hợp (phase sau) ════════
// Tạm thời chỉ navigate sang route /contacts/:id/profile (skeleton view).
// Sau khi backend GET /api/v1/contacts/:id/profile sẵn sàng + ContactProfileView
// implement đầy đủ → tab này hiển thị 3 field Email/Address/Occupation đã ẩn ở cột 4.
function openFullProfile() {
  if (!props.contact?.id) return;
  router.push(`/contacts/${props.contact.id}/profile`);
}

// activeFriend dùng cho headerFullName fallback (zaloDisplayName cho KH stub).
const activeFriend = computed<FriendItem | null>(() => {
  if (!props.activeZaloAccountId) return null;
  return relations.value.friends.find(f => f.zaloAccount.id === props.activeZaloAccountId) || null;
});

// Tên nick CRM đang online (hiển thị trong modal handoff: "Từ nick: ...")
// Ưu tiên prop activeZaloAccountName (từ ChatView pass xuống) → fallback activeFriend.
const senderNickName = computed<string | null>(() =>
  props.activeZaloAccountName || activeFriend.value?.zaloAccount?.displayName || null,
);

// ════════ Tab badges ════════
const crmBadgeCount = computed(() => teammatesFiltered.value.length || 0);
const activityBadgeCount = computed(() => {
  // Migrate sang Tab FOLLOW-UP (2026-06-02) — không còn track automation count ở tab Activity legacy
  return contactAppointments.value.length || null;
});

const hasAnyActivity = computed(() =>
  !!(props.aiSummary || props.aiSentiment || contactAppointments.value.length),
);

const toast = useToast();
const router = useRouter();
// Khai báo cockpit trước watcher contactId chạy immediate. Hội thoại nhóm có contactId=null,
// watcher phải reset cockpit/teammates ngay trong setup; khai báo sau watcher sẽ gây TDZ và làm trắng toàn bộ panel.
const { cockpit, teammates, loading: cockpitLoading, fetchCockpit, fetchTeammates, generateHandoffMessage } = useContactCockpit();

// AI suggest state — PHẢI khai báo TRƯỚC watcher(props.contactId, {immediate:true}) bên dưới
// vì watcher đó reset suggestText.value lúc setup. Khai báo sau watcher → TDZ
// "Cannot access 'suggestText' before initialization" làm crash setup panel (fix 2026-06-06).
const suggestText = ref('');
const suggestLoading = ref(false);

// Khi đổi sang contact mới, reset về tab Hồ sơ + refetch relations
// (NotesSection tự fetch khi prop contactId đổi).
// Cũng force reset infoExpanded + start countdown — nếu activeTab đã = 'profile',
// watch(activeTab) sẽ KHÔNG fire khi cùng giá trị → form section stuck ở state cũ.
watch(() => props.contactId, (id) => {
  activeTab.value = 'profile';
  // Switch conv hoặc reload page → reset về 'auto' (countdown 5s).
  // KHÔNG persist sticky giữa các conv (theo spec: sticky chỉ trong cùng conv).
  expandMode.value = 'auto';
  startAutoCollapse();
  if (id) {
    void fetchRelations(id);
  }
  else relations.value = { friends: [] };
  // Tab CRM cockpit data — fetch chỉ khi tab CRM được mở (xem watch(activeTab) bên dưới)
  if (!id) {
    cockpit.value = null;
    teammates.value = [];
  }
  // Reset suggest text
  suggestText.value = '';
}, { immediate: true });

function relativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'hôm nay';
  if (days === 1) return 'hôm qua';
  return `${days} ngày trước`;
}

// ════════════════════════════════════════════════════════════════════════
// Tab CRM (Mini CRM cockpit) — 7 widget, anh chốt design 2026-05-22
// docs/designs/CHAT-COL4-CRM-TAB.md
// ════════════════════════════════════════════════════════════════════════


// Fetch cockpit + teammates khi tab CRM được mở lần đầu (lazy load tiết kiệm request)
const crmTabLoaded = ref(false);
watch([activeTab, () => props.contactId], async ([tab, id]) => {
  if (tab === 'crm' && id) {
    crmTabLoaded.value = true;
    await Promise.all([
      fetchCockpit(id),
      fetchTeammates(id, props.activeZaloAccountId || undefined),
    ]);
    // Auto-fetch AI suggestion nếu chưa có
    if (!suggestText.value && props.conversationId) {
      void runAiSuggest();
    }
  }
}, { immediate: false });

// Reload teammates khi đổi nick active
watch(() => props.activeZaloAccountId, (zaloId) => {
  if (activeTab.value === 'crm' && props.contactId) {
    void fetchTeammates(props.contactId, zaloId || undefined);
  }
});

// ─── Computed cho widgets ────────────────────────────────────────────────
const teammatesFiltered = computed<Teammate[]>(() => {
  const arr = teammates.value || [];
  // Backend đã filter excludeZaloAccountId; thêm dedup theo owner user (1 sale có thể có nhiều nick)
  const seen = new Set<string>();
  const out: Teammate[] = [];
  for (const t of arr) {
    const key = t.owner?.id || `nick:${t.zaloAccountId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
});

const teammatesLoading = computed(() => cockpitLoading.teammates);

// M55 2026-05-30 — Cùng chăm theo ContactAccess (primary + collaborator).
// Cover cả KH có Zalo (đã có teammatesFiltered từ Friend) + KH no-Zalo (Friend=[]).
interface CungChamRow {
  role: 'primary' | 'collaborator';
  source: string;
  createdAt: string;
  user: { id?: string; fullName: string | null; email: string | null } | null;
}
const cungChamList = computed<CungChamRow[]>(() => {
  const list = (props.contact as { contactAccess?: CungChamRow[] } | null | undefined)?.contactAccess;
  return Array.isArray(list) ? list : [];
});
function ccInitial(name: string): string {
  const t = (name || '').trim();
  if (!t) return '?';
  const parts = t.split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}
const CC_AVATAR_COLORS = ['#0ea5e9', '#f97316', '#10b981', '#a855f7', '#ec4899', '#eab308', '#06b6d4', '#ef4444'];
function ccAvatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < (seed || '').length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return CC_AVATAR_COLORS[Math.abs(h) % CC_AVATAR_COLORS.length];
}
const CC_SOURCE_LABELS: Record<string, string> = {
  quick_add: 'Tạo KH nhanh',
  quick_add_duplicate: 'Thêm KH trùng SĐT',
  virtual_chat_open: 'Mở chat nội bộ',
  virtual_chat_message: 'Gửi tin chat nội bộ',
  auto_from_friend: 'Tự động qua Zalo Friend',
  manual: 'Thủ công',
};
function ccSourceLabel(source: string): string {
  return CC_SOURCE_LABELS[source] || source || 'Khác';
}
function ccDateLabel(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' });
  } catch { return ''; }
}

const priorityBarColor = computed(() => {
  const s = cockpit.value?.priorityScore;
  if (s == null) return '#cbd5e1';
  if (s < 30) return '#3b82f6'; // xanh dương
  if (s < 60) return '#10b981'; // xanh lá
  if (s < 80) return '#f59e0b'; // cam
  return '#ef4444'; // đỏ
});

function daysFrom(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function shortDateTime(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm} ${hh}:${mi}`;
}

function relativeFuture(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  const days = Math.round(diff / 86400000);
  if (days === 0) return 'hôm nay';
  if (days === 1) return 'ngày mai';
  if (days < 0) return `${-days} ngày trước`;
  return `${days} ngày nữa`;
}

function teammateStatus(t: Teammate): string {
  if (!t.lastInboundAt) return 'Chưa chat';
  const diff = Date.now() - new Date(t.lastInboundAt).getTime();
  const hours = diff / 3600000;
  if (hours < 24) return `🟢 Active ${Math.max(1, Math.floor(hours))}h`;
  const days = Math.floor(hours / 24);
  if (days <= 7) return `🟡 Đang chăm ${days}d`;
  return `🔵 Lạnh ${days}d`;
}

function teammateStatusClass(t: Teammate): string {
  if (!t.lastInboundAt) return 'grey';
  const hours = (Date.now() - new Date(t.lastInboundAt).getTime()) / 3600000;
  if (hours < 24) return 'active';
  if (hours / 24 <= 7) return 'warm';
  return 'cold';
}

function shortName(full: string | null | undefined): string | null {
  if (!full) return null;
  const parts = full.trim().split(/\s+/);
  return parts[parts.length - 1];
}

// ─── Widget 2: AI suggest ────────────────────────────────────────────────
// suggestText + suggestLoading đã khai báo ở trên (trước watcher contactId) để tránh TDZ.

async function runAiSuggest() {
  if (!props.conversationId) {
    toast.warning('Chưa có hội thoại để AI gợi ý');
    return;
  }
  suggestLoading.value = true;
  try {
    const { data } = await api.post<{ content: string }>('/ai/suggest', { conversationId: props.conversationId });
    suggestText.value = (data?.content || '').trim();
  } catch (err) {
    const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error || 'AI suggest thất bại';
    toast.error(msg);
  } finally {
    suggestLoading.value = false;
  }
}

function onRefreshSuggest() {
  void runAiSuggest();
}

function onInsertSuggest() {
  if (!suggestText.value) return;
  emit('insert-suggestion', suggestText.value);
  // Phát event toàn cục cho ChatComposer nghe (giảm prop drill)
  window.dispatchEvent(new CustomEvent('chat:insert-suggestion', { detail: { text: suggestText.value } }));
  toast.success('Đã chèn vào ô soạn tin');
}

// ─── Widget 6: Sales handoff modal ───────────────────────────────────────
const handoffOpen = ref(false);
const handoffLoading = ref(false);
const handoffContent = ref('');
const handoffSource = ref<'template' | 'ai' | 'fallback'>('template');
const handoffContext = reactive<{
  contactId: string | null;
  targetUserId: string | null;
  targetZaloAccountId: string | null;
  targetName: string | null;
  targetZaloUid: string | null;
  targetZaloAccountName: string | null;
}>({
  contactId: null,
  targetUserId: null,
  targetZaloAccountId: null,
  targetName: null,
  targetZaloUid: null,
  targetZaloAccountName: null,
});

async function onOpenHandoff(t: Teammate) {
  // Guard: không re-fire khi đang loading hoặc modal đang mở
  if (handoffLoading.value || handoffOpen.value) return;
  if (!t.owner) {
    toast.warning('Nick này chưa gán cho sale nào');
    return;
  }
  if (!props.contactId) return;
  handoffContext.contactId = props.contactId;
  handoffContext.targetUserId = t.owner.id;
  handoffContext.targetZaloAccountId = t.zaloAccountId;
  handoffContext.targetName = t.owner.fullName;
  handoffContext.targetZaloUid = null;            // sẽ set từ BE response
  handoffContext.targetZaloAccountName = null;
  handoffContent.value = '';
  handoffSource.value = 'template';
  handoffLoading.value = true;
  handoffOpen.value = true;

  try {
    const res = await generateHandoffMessage({
      contactId: handoffContext.contactId,
      targetUserId: handoffContext.targetUserId,
      targetZaloAccountId: handoffContext.targetZaloAccountId || undefined,
    });
    if (res) {
      handoffContent.value = res.content;
      handoffSource.value = res.source;
      handoffContext.targetZaloUid = res.targetZaloUid;
      handoffContext.targetZaloAccountName = res.targetZaloAccountName;
    } else {
      // BE fail → đóng modal + report rõ lỗi
      handoffOpen.value = false;
      toast.error('Không soạn được tin phối hợp — vui lòng thử lại');
    }
  } catch (e) {
    handoffOpen.value = false;
    console.error('[handoff] open failed:', e);
    toast.error('Lỗi mạng khi soạn tin phối hợp');
  } finally {
    handoffLoading.value = false;
  }
}

async function onRegenerateHandoff() {
  if (!handoffContext.contactId || !handoffContext.targetUserId || handoffLoading.value) return;
  handoffLoading.value = true;
  try {
    const res = await generateHandoffMessage({
      contactId: handoffContext.contactId,
      targetUserId: handoffContext.targetUserId,
      targetZaloAccountId: handoffContext.targetZaloAccountId || undefined,
    });
    if (res) {
      handoffContent.value = res.content;
      handoffSource.value = res.source;
      handoffContext.targetZaloUid = res.targetZaloUid;
      handoffContext.targetZaloAccountName = res.targetZaloAccountName;
    }
  } finally {
    handoffLoading.value = false;
  }
}

import AutomationCardList from './AutomationCardList.vue';

console.log({
  orgId: orgId.value,
  onDealStageUpdatedPanel,
  saveSuccess: saveSuccess.value,
  saveError: saveError.value,
  isSticky: isSticky.value,
  scoreData: scoreData.value,
  phoneFocused: phoneFocused.value,
  addExtraPhone,
  removeExtraPhone,
  openAddFlowModal,
  closeAddFlowModal,
  onEnrolled,
  openFullProfile,
  crmBadgeCount: crmBadgeCount.value,
  activityBadgeCount: activityBadgeCount.value,
  onRefreshSuggest,
  onInsertSuggest
});
</script>

<style scoped>
.info-panel {
  background: var(--smax-bg);
  border-left: 1px solid var(--smax-grey-200);
  display: flex; flex-direction: column;
  height: 100%; overflow: hidden;
  flex-shrink: 0;
}

/* ════════ Header (pinned) ════════ */
.ip-header {
  padding: 0;
  text-align: left;
  border-bottom: 1px solid var(--smax-grey-200);
  position: relative;
  flex-shrink: 0;
}
/* Avatar + name layout inside ScoreBanner slot */
.ip-header .ip-name-line {
  font-size: 15px;
  font-weight: 700;
  line-height: 1.2;
  margin-top: 0;
  padding: 0;
  text-align: left;
}
.ip-header .ip-id {
  font-size: 10.5px;
  margin-top: 2px;
  padding: 0;
  text-align: left;
}
.ip-care-row-inline {
  margin-top: 5px;
  display: flex;
}
/* Tab 4 "Điểm" — score panel content full-width 280px, vertical stack */
.tab-pane-score {
  padding: 12px 14px 18px;
}
/* Tab badge cho score (khác badge số tin chưa đọc) */
.tab-badge-score {
  background: #fef3c7 !important;
  color: #b45309 !important;
  font-weight: 700 !important;
  min-width: 24px;
}

.ip-close {
  position: absolute; top: 7px; right: 9px;
  width: 26px; height: 26px;
  background: transparent; border: none;
  font-size: 20px; cursor: pointer;
  color: var(--smax-grey-700);
  border-radius: 50%;
  z-index: 5;
}
.ip-close:hover { background: var(--smax-grey-100); }


.ip-avatar-wrap {
  position: relative;
  display: inline-block;
}
.ip-avatar-big {
  display: block;
  margin: 0 auto;
}

/* Lead score badge — overlay trên avatar (góc dưới-phải), Smax-style "điểm KH" */
.lead-score-badge {
  position: absolute;
  bottom: -3px;
  right: -8px;
  background: var(--smax-bg, #fff);
  border: 2px solid #fff;
  border-radius: 11px;
  padding: 1px 7px 1px 6px;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.4;
  white-space: nowrap;
  box-shadow: 0 1px 4px rgba(0,0,0,0.12);
  cursor: help;
}
.lead-score-badge.tier-hot   { background: #ffebee; color: #c62828; border-color: #ffcdd2; }
.lead-score-badge.tier-warm  { background: #fff3e0; color: #ef6c00; border-color: #ffe0b2; }
.lead-score-badge.tier-cool  { background: #e3f2fd; color: #1565c0; border-color: #bbdefb; }
.lead-score-badge.tier-cold  { background: #f5f6fa; color: var(--smax-grey-600); border-color: #e0e0e0; }

.ip-name-line {
  margin-top: 7px;
  font-size: 14px; font-weight: 600;
  color: var(--smax-text);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  padding: 0 17px;
}
.ip-id {
  font-size: 10.5px;
  color: var(--smax-grey-700);
  margin-top: 3px;
  font-family: ui-monospace, "Cascadia Code", Menlo, monospace;
  word-break: break-all;
  padding: 0 17px;
}
.ip-care-row { margin-top: 7px; }
.care-status-select {
  background: rgba(255,145,0,0.15);
  color: #ef6c00;
  border: 1px solid rgba(255,145,0,0.3);
  padding: 4px 11px;
  border-radius: 13px;
  font-size: 11.5px; font-weight: 500;
  cursor: pointer;
  font-family: inherit;
}
.care-status-select:hover { background: rgba(255,145,0,0.22); }

.ip-tabs {
  display: flex;
  background: #F3F4F6;
  padding: 4px;
  border-radius: 12px;
  gap: 2px;
  border-bottom: none;
  margin: 10px 12px;
  height: 44px;
  align-items: center;
  flex-shrink: 0;
}
.ip-tab {
  flex: 1;
  height: 36px;
  background: transparent;
  border: none;
  padding: 0 4px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  color: #6B7280;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border-radius: 10px;
  font-family: inherit;
  position: relative;
  transition: background-color 150ms cubic-bezier(0.4, 0, 0.2, 1), color 150ms cubic-bezier(0.4, 0, 0.2, 1);
}
.ip-tab .ic { font-size: 13px; line-height: 1; display: inline-flex; align-items: center; }
.ip-tab .ic > svg { display: block; }
.ip-tab:hover {
  background: #E5E7EB;
  color: #374151;
}
.ip-tab.active {
  color: #2F80ED !important;
  background: #EBF3FF !important;
  font-weight: 600;
}
.tab-badge {
  background: var(--smax-primary);
  color: white;
  font-size: 10px; font-weight: 700;
  padding: 0 5px;
  border-radius: 8px;
  min-width: 16px;
  line-height: 14px;
  text-align: center;
  margin-left: 2px;
  flex-shrink: 0;
  transition: transform 0.18s ease;
}
/* Bump effect — khi NotesSection báo created → scale + glow để feedback +1 */
.ip-tab.badge-bump .tab-badge {
  animation: badgeBump 0.6s ease;
}
@keyframes badgeBump {
  0%   { transform: scale(1); background: var(--smax-primary); }
  30%  { transform: scale(1.5); background: #f57c00; box-shadow: 0 0 0 6px rgba(245, 124, 0, 0.25); }
  60%  { transform: scale(1.1); background: #f57c00; }
  100% { transform: scale(1); background: var(--smax-primary); box-shadow: none; }
}

/* ════════ Tab content (scroll) ════════ */
.ip-tab-content {
  flex: 1; min-height: 0;
  overflow-y: auto;
}
.tab-pane {
  display: flex; flex-direction: column;
}
.tab-empty {
  padding: 26px 17px;
  font-size: 12px;
  color: var(--smax-grey-700);
  text-align: center;
  font-style: italic;
}
.tab-empty ul {
  text-align: left;
  padding: 0 0 0 18px;
  margin: 6px auto 0;
  max-width: 250px;
}
.tab-empty li { margin: 4px 0; }
.parent-card { display: flex; align-items: center; gap: 10px; padding: 10px; border: 1px solid var(--smax-grey-200); border-radius: 8px; background: rgba(0,242,255,0.04); }
.parent-info { flex: 1; min-width: 0; }
.parent-name { font-weight: 600; font-size: 13px; }
.parent-meta { display: flex; gap: 8px; align-items: center; font-size: 11px; flex-wrap: wrap; margin-top: 4px; }
.friends-list { display: flex; flex-direction: column; gap: 10px; }
.friend-card { border: 1px solid var(--smax-grey-200); border-radius: 8px; padding: 10px 12px; background: var(--smax-bg); }
.friend-card-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.friend-card-title { flex: 1; min-width: 0; }
.friend-name { font-weight: 600; font-size: 13px; }
.friend-sub { font-size: 11px; color: var(--smax-grey-600); margin-top: 2px; }
.sale-name { font-weight: 500; }
.friend-card-row { display: flex; align-items: center; gap: 6px; font-size: 11.5px; padding: 3px 0; flex-wrap: wrap; }
.friend-card-row .lbl { color: var(--smax-grey-600); }
.friend-card-row .ml-auto { margin-left: auto; }
.friend-card-row.meta-line { padding-top: 6px; border-top: 1px dashed var(--smax-grey-200); margin-top: 4px; color: var(--smax-grey-700); }
.friend-card-row.meta-line strong { color: var(--smax-text); }
.conv-badge {
  font-size: 11px; font-weight: 700;
  padding: 1px 6px; border-radius: 4px;
  margin-left: 4px;
}
.conv-badge--on  { background: rgba(0,200,83,0.15); color: #00897b; }
.conv-badge--off { background: rgba(0,0,0,0.06);    color: #999;    }
.friend-customer-row {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 8px; margin: 4px 0 6px;
  background: var(--smax-grey-50);
  border-radius: 6px;
  border-left: 3px solid var(--smax-primary);
}
.friend-customer-info { flex: 1; min-width: 0; }
.friend-customer-name {
  font-size: 12.5px; font-weight: 600;
  color: var(--smax-text);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.friend-customer-row .uid {
  display: inline-block;
  margin-top: 2px;
}
.friend-card-actions { display: flex; justify-content: flex-end; gap: 6px; padding-top: 8px; border-top: 1px dashed var(--smax-grey-200); margin-top: 6px; }
.btn-sm-danger { padding: 4px 10px; font-size: 11px; border: 1px solid #ffcdd2; color: #c62828; border-radius: 4px; background: rgba(255,82,82,0.05); cursor: pointer; }
.btn-sm-danger:hover { background: rgba(255,82,82,0.15); }
.status-edit { cursor: pointer; padding: 2px 8px; border-radius: 10px; font-size: 11px; }
.status-edit:hover { filter: brightness(1.1); }
.uid { font-family: monospace; font-size: 10.5px; color: var(--smax-grey-700); background: rgba(0,0,0,0.04); padding: 1px 4px; border-radius: 3px; }
.chip-grey { background: rgba(90,100,120,0.10); color: var(--smax-grey-700); padding: 1px 7px; border-radius: 9px; font-size: 10.5px; }
.tab-empty code {
  background: var(--smax-grey-100);
  padding: 0 4px; border-radius: 3px;
  font-size: 10.5px;
}

/* ════════ Inline form ════════ */
.ip-form { padding: 4px 0; border-bottom: 1px solid var(--smax-grey-200); }
.info-expand-toggle {
  width: 100%;
  background: transparent;
  border: none;
  cursor: pointer;
  font-family: inherit;
  font-size: 11px;
  color: var(--smax-primary, #2962ff);
  font-weight: 500;
  padding: 6px 13px;
  text-align: left;
  transition: background 0.12s;
}
.info-expand-toggle:hover { background: var(--smax-primary-soft, #e3f2fd); }
.info-expand-toggle.is-sticky {
  background: linear-gradient(135deg, #FEF3C7, #FDE68A);
  color: #92400E;
  border-color: #FCD34D;
}
.info-expand-toggle .sticky-badge {
  font-size: 11px;
  margin-left: 3px;
}

/* Link Hồ sơ KH tổng hợp — thay thế 3 field email/address/occupation ẩn ở cột 4 */
.info-fullprofile-link {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: calc(100% - 24px);
  margin: 6px 12px 4px;
  padding: 8px 10px;
  font-size: 12px;
  font-weight: 600;
  color: #6366F1;
  background: #EEF2FF;
  border: 1px dashed #C7D2FE;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  font-family: inherit;
}
.info-fullprofile-link:hover {
  background: #E0E7FF;
  border-color: #818CF8;
  border-style: solid;
}
.ip-form-row {
  display: grid;
  grid-template-columns: 22px 80px 1fr;
  align-items: center;
  gap: 7px;
  padding: 7px 13px;
  border-bottom: 1px solid var(--smax-grey-100);
}
.ip-form-row.sub {
  grid-template-columns: 22px 80px 1fr;
  padding-left: 32px;
}
.ip-form-row:last-child { border-bottom: none; }
.ip-icon { font-size: 14px; opacity: 0.85; text-align: center; }
.ip-label { font-size: 12px; color: var(--smax-grey-700); }
.ip-form-row input,
.ip-form-row select {
  border: none; outline: none;
  font-size: 13px;
  background: transparent;
  width: 100%; min-width: 0;
  padding: 3px 4px;
  border-radius: 4px;
  font-family: inherit;
  color: var(--smax-text);
}
.ip-form-row input:hover,
.ip-form-row select:hover { background: var(--smax-grey-50); }
.ip-form-row input:focus,
.ip-form-row select:focus { background: var(--smax-primary-soft); }
.phone-cell {
  display: flex; align-items: center; gap: 5px;
  width: 100%;
}
.phone-cell input { flex: 1; }
.show-extra-phones {
  background: var(--smax-grey-100);
  border: 1px solid var(--smax-grey-300);
  border-radius: 9px;
  padding: 1px 7px;
  font-size: 11px;
  color: var(--smax-grey-700);
  cursor: pointer;
  flex-shrink: 0;
}
.show-extra-phones:hover { background: var(--smax-primary-soft); color: var(--smax-primary); }

/* ════════ SĐT phụ — list động nhãn tự nhập (2026-06-06) ════════
   Override grid của .ip-form-row.sub: dùng flex để nhãn + số + nút xoá nằm 1 hàng,
   không vỡ như 2 ô cố định cũ (label 80px wrap). */
.phone-extra-row {
  display: flex !important;
  align-items: center;
  gap: 6px;
  padding-left: 32px;
}
.phone-extra-row .pex-label {
  flex: 0 0 96px;
  min-width: 0;
  font-size: 12px;
  color: var(--smax-grey-700);
}
.phone-extra-row .pex-phone {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 13px;
}
.phone-extra-row .pex-remove {
  flex: 0 0 auto;
  background: none;
  border: none;
  color: var(--smax-grey-500);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  padding: 0 4px;
}
.phone-extra-row .pex-remove:hover { color: var(--smax-danger, #e53935); }
.pex-add {
  margin: 4px 0 4px 32px;
  background: none;
  border: 1px dashed var(--smax-grey-300);
  border-radius: 8px;
  padding: 3px 10px;
  font-size: 12px;
  color: var(--smax-primary, #1786be);
  cursor: pointer;
}
.pex-add:hover { background: var(--smax-primary-soft); }

/* ════════ Section ════════ */
.ip-section {
  padding: 11px 17px;
  border-bottom: 1px solid var(--smax-grey-200);
}
.ip-section:last-child { border-bottom: none; }
.ip-section-title {
  display: flex; align-items: center; gap: 7px;
  font-size: 13px; font-weight: 600;
  color: var(--smax-text);
  margin-bottom: 7px;
}
.ip-section-title .accent {
  width: 3px; height: 14px;
  border-radius: 2px;
  background: var(--smax-grey-300);
}
.scope-tag {
  font-size: 10px; padding: 1px 6px;
  border-radius: 4px;
  font-weight: 500; letter-spacing: 0.3px;
}
.scope-tag.global {
  background: rgba(33,150,243,0.12);
  color: #1565c0;
}
.scope-tag.pernick {
  background: rgba(255,145,0,0.18);
  color: #ef6c00;
}
.refresh-mini {
  margin-left: auto;
  width: 22px; height: 22px;
  border-radius: 50%;
  border: 1px solid var(--smax-grey-300);
  background: var(--smax-bg);
  cursor: pointer;
  font-size: 12px; color: var(--smax-grey-700);
}
.refresh-mini:hover:not(:disabled) { background: var(--smax-grey-50); color: var(--smax-primary); }
.refresh-mini:disabled { opacity: 0.5; cursor: not-allowed; }
.sentiment-reason {
  font-size: 12px;
  color: var(--smax-grey-700);
  margin-top: 7px;
  padding: 7px 9px;
  background: var(--smax-grey-50);
  border-radius: 5px;
  font-style: italic;
}

.tag-list {
  display: flex; flex-wrap: wrap; gap: 4px;
}
.tag-chip {
  background: var(--smax-grey-100);
  color: var(--smax-grey-700);
  padding: 3px 7px;
  border-radius: 7px;
  font-size: 11px;
  display: inline-flex; align-items: center; gap: 4px;
  cursor: default;
}
.tag-chip .x {
  cursor: pointer;
  opacity: 0.55;
  font-weight: 700;
}
.tag-chip .x:hover { opacity: 1; color: var(--smax-error); }
.tag-chip.add {
  background: transparent;
  border: 1px dashed var(--smax-grey-300);
  cursor: pointer;
  color: var(--smax-grey-700);
}
.tag-chip.add:hover { background: var(--smax-grey-50); border-color: var(--smax-primary); color: var(--smax-primary); }
.tag-input {
  border: 1px solid var(--smax-primary);
  outline: none;
  padding: 2px 7px;
  border-radius: 7px;
  font-size: 11px;
  width: 110px;
  font-family: inherit;
}
.tag-suggestions {
  display: flex; flex-wrap: wrap; gap: 4px;
  align-items: center;
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px dashed var(--smax-grey-200);
}
.suggestion-label {
  font-size: 10.5px;
  color: var(--smax-grey-700);
  text-transform: uppercase;
  letter-spacing: 0.3px;
  font-weight: 600;
}
.tag-chip.suggestion {
  background: transparent;
  border: 1px dashed var(--smax-primary);
  color: var(--smax-primary);
  font-size: 10.5px;
  padding: 2px 7px;
  cursor: pointer;
  border-radius: 7px;
  font-family: inherit;
}
.tag-chip.suggestion:hover {
  background: var(--smax-primary-soft);
}

.metrics-row {
  display: flex; align-items: baseline; gap: 5px;
  font-size: 13px;
}
.metric-num { font-size: 24px; font-weight: 700; color: var(--smax-success); }
.metric-label { color: var(--smax-grey-700); }
.metric-aux  { color: var(--smax-grey-700); font-size: 12px; }

/* ════════ Per-nick state section ════════ */
.kv-list { display: flex; flex-direction: column; gap: 4px; font-size: 12px; line-height: 1.55; }
.kv-row { display: flex; align-items: baseline; gap: 5px; flex-wrap: wrap; }
.kv-row .k { color: var(--smax-grey-700); min-width: 100px; }
.kv-row .v { color: var(--smax-text); font-weight: 500; }
.kv-row .muted { color: var(--smax-grey-300); font-size: 10.5px; font-style: italic; }
.kv-row code {
  font-family: ui-monospace, "Cascadia Code", Menlo, monospace;
  background: var(--smax-grey-100);
  padding: 0 4px; border-radius: 3px;
  font-size: 10px;
}
.status-pill {
  display: inline-flex; align-items: center; gap: 3px;
  padding: 2px 7px; border-radius: 9px;
  font-size: 10px; font-weight: 500;
}
.pill-success { background: rgba(0,200,83,0.12); color: #00897b; }
.pill-warning { background: rgba(255,145,0,0.12); color: #ef6c00; }
.pill-info    { background: rgba(33,150,243,0.12); color: #1565c0; }

.empty-section {
  font-size: 11px; color: var(--smax-grey-700);
  font-style: italic;
  padding: 4px 0;
}

/* ════════ Other nicks list ════════ */
.nick-rows { display: flex; flex-direction: column; gap: 5px; }
.nick-row {
  display: flex; align-items: center; gap: 7px;
  padding: 5px 0;
}
.ni-name { flex: 1; font-size: 12px; color: var(--smax-text); }

/* ════════ Notes section in Tab Hồ Sơ ════════ */
.ip-notes-section {
  margin-top: 10px;
}

/* ════════════════════════════════════════════════════════════════════════
   Tab CRM (Mini cockpit, 7 widgets) — 2026-05-22
   ════════════════════════════════════════════════════════════════════════ */
.crm-tab {
  padding: 10px 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.crm-widget {
  background: #fff;
  border: 1px solid var(--smax-grey-200);
  border-radius: 10px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.crm-w-row {
  display: flex;
  align-items: center;
  gap: 7px;
}
.crm-w-row-status { justify-content: space-between; }
.crm-w-icon { font-size: 15px; flex-shrink: 0; }
.crm-w-title {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--smax-grey-800);
  flex: 1;
}
.crm-w-refresh {
  background: transparent;
  border: 1px solid var(--smax-grey-300);
  border-radius: 6px;
  width: 24px; height: 22px;
  font-size: 11.5px;
  cursor: pointer;
  color: var(--smax-grey-600);
}
.crm-w-refresh:hover:not(:disabled) { background: var(--smax-grey-100); }
.crm-w-refresh:disabled { opacity: 0.5; cursor: wait; }

.crm-w-loading {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 0;
  color: var(--smax-grey-600);
  font-size: 12px;
}
.crm-spinner {
  width: 14px; height: 14px;
  border: 2px solid var(--smax-grey-200);
  border-top-color: #4f46e5;
  border-radius: 50%;
  animation: crm-spin 700ms linear infinite;
}
@keyframes crm-spin {
  to { transform: rotate(360deg); }
}

.crm-w-empty {
  color: var(--smax-grey-500);
  font-size: 11.5px;
  padding: 4px 0;
}

/* ── Widget 1: Getfly link ── */
.getfly-pill {
  font-size: 11.5px;
  padding: 3px 9px;
  border-radius: 999px;
  font-weight: 600;
}
.getfly-pill.ok { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
.getfly-pill.off { background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; }
.crm-btn-ghost {
  background: #fff;
  border: 1px solid var(--smax-grey-300);
  border-radius: 7px;
  padding: 4px 10px;
  font-size: 11.5px;
  cursor: pointer;
  color: var(--smax-grey-700);
}
.crm-btn-ghost:hover:not(:disabled) { background: var(--smax-grey-100); }
.crm-btn-ghost:disabled { opacity: 0.4; cursor: not-allowed; }

/* ── Widget 2: AI suggest ── */
.crm-suggest-box {
  background: linear-gradient(180deg, #faf5ff, #f5f3ff);
  border: 1px solid #ddd6fe;
  border-radius: 8px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.crm-suggest-text {
  font-size: 12px;
  line-height: 1.45;
  color: #312e81;
  white-space: pre-wrap;
  word-break: break-word;
}
.crm-btn-primary {
  background: #4f46e5;
  color: #fff;
  border: none;
  border-radius: 7px;
  padding: 5px 10px;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  align-self: flex-start;
}
.crm-btn-primary:hover { background: #4338ca; }

/* ── Widget 3: Nhiệt KH ── */
.heat-stack {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.heat-bar-row {
  display: flex; align-items: center; gap: 8px;
}
.heat-bar {
  flex: 1;
  height: 10px;
  background: var(--smax-grey-200);
  border-radius: 999px;
  overflow: hidden;
}
.heat-bar-fill {
  height: 100%;
  border-radius: 999px;
  transition: width 300ms ease, background-color 300ms ease;
}
.heat-bar-num {
  font-size: 11.5px;
  font-weight: 700;
  color: var(--smax-grey-700);
  min-width: 54px;
  text-align: right;
}
.heat-meta {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  font-size: 11.5px;
}
.heat-pattern { font-weight: 600; color: var(--smax-grey-800); }
.heat-trend { font-weight: 600; color: var(--smax-grey-600); }
.heat-trend.up { color: #15803d; }
.heat-trend.down { color: #b91c1c; }
.heat-stuck {
  font-size: 11px;
  background: #fef3c7;
  border: 1px solid #fde68a;
  color: #92400e;
  border-radius: 6px;
  padding: 3px 7px;
}

/* ── Widget 4: Timeline ── */
.timeline-lines {
  display: flex; flex-direction: column;
  gap: 4px;
  font-size: 11.5px;
  color: var(--smax-grey-700);
}
.tl-line { line-height: 1.4; }
.tl-sep { margin: 0 5px; color: var(--smax-grey-400); }
.tl-appt { color: #065f46; font-weight: 600; }
.tl-appt-rel { font-weight: 500; color: var(--smax-grey-600); }

/* ── Widget 5: Placeholder interest ── */
.crm-w-placeholder {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  font-size: 11.5px;
  color: var(--smax-grey-600);
  background: var(--smax-grey-100);
  border-radius: 7px;
  padding: 7px 9px;
  line-height: 1.45;
}
.ph-icon { font-style: italic; color: var(--smax-grey-500); flex-shrink: 0; }

/* ── Widget 6: Đồng đội ── */
.team-banner {
  background: #ecfeff;
  border: 1px solid #a5f3fc;
  color: #155e75;
  font-size: 11px;
  padding: 5px 8px;
  border-radius: 7px;
}
.team-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* M55 2026-05-30 — Cùng chăm theo ContactAccess */
.cung-cham-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.cung-cham-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: #fafbfc;
  border: 1px solid var(--smax-grey-200);
  border-radius: 6px;
}
.cc-avatar-circle {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  text-transform: uppercase;
}
.cc-info { flex: 1; min-width: 0; }
.cc-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--smax-text);
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.cc-role-primary {
  background: #fef3c7;
  color: #92400e;
  font-size: 9px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 8px;
  border: 1px solid #fcd34d;
}
.cc-role-collab {
  background: #dbeafe;
  color: #1e40af;
  font-size: 9px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 8px;
  border: 1px solid #93c5fd;
}
.cc-meta {
  font-size: 10px;
  color: var(--smax-grey-700);
  margin-top: 1px;
}
.team-card {
  border: 1px solid var(--smax-grey-200);
  border-radius: 8px;
  padding: 8px 9px;
  display: flex;
  flex-direction: column;
  gap: 7px;
  background: #fafafa;
}
.team-card-head {
  display: flex; align-items: center; gap: 8px;
}
.team-card-info {
  flex: 1;
  min-width: 0;
}
.team-name {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--smax-grey-900);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.team-sub {
  font-size: 11px;
  color: var(--smax-grey-600);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.team-status.active { color: #15803d; }
.team-status.warm { color: #b45309; }
.team-status.cold { color: #1d4ed8; }
.team-status.grey { color: var(--smax-grey-500); }
.team-counts {
  display: flex; gap: 12px;
  font-size: 11.5px;
  color: var(--smax-grey-700);
}
.crm-btn-handoff {
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: #fff;
  border: none;
  border-radius: 7px;
  padding: 6px 10px;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  width: 100%;
}
.crm-btn-handoff:hover:not(:disabled) { filter: brightness(1.05); }
.crm-btn-handoff:disabled { opacity: 0.45; cursor: not-allowed; }

/* ── Widget 7: Push Getfly ── */
.crm-btn-push {
  background: #f8fafc;
  border: 1px dashed #94a3b8;
  border-radius: 8px;
  padding: 10px;
  font-size: 12px;
  color: var(--smax-grey-600);
  cursor: not-allowed;
  width: 100%;
}
.crm-w-hint {
  font-size: 10.5px;
  color: var(--smax-grey-500);
  text-align: center;
  font-style: italic;
}

/* ═════════ 2026-06-01: Bottom 4-tab strip + placeholder panels ═════════ */
.bottom-tabs {
  display: flex;
  border-top: 1px solid #dddddd;
  background: white;
  flex-shrink: 0;
  margin-top: auto;
}
.bottom-tab {
  flex: 1;
  padding: 10px 4px 8px;
  background: transparent;
  border: none;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  color: #6b7280;
  transition: all 0.15s;
  border-top: 3px solid transparent;
  margin-top: -1px;
  font-family: inherit;
}
.bottom-tab:hover { background: #fafbfc; }
.bottom-tab.active {
  color: #0068FF;
  border-top-color: #0068FF;
}
.bottom-tab svg {
  width: 20px;
  height: 20px;
  stroke-width: 1.75;
}
.bottom-tab.active svg { stroke-width: 2; }
.bt-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.05em;
}

.main-tab-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
/* FOLLOW-UP tab — AutomationCardList tự handle padding (16px nội bộ) + align-start */
.main-tab-body.main-tab-body--no-padding {
  padding: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  align-items: stretch;
  justify-content: stretch;
}
.main-panel-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  background: #fff;
  border-bottom: 1px solid #e2e7ef;
  color: #2f80ed;
  flex-shrink: 0;
}
.main-panel-head > div {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.main-panel-head b { font-size: 15px; line-height: 1.35; }
.main-panel-head small { font-size: 11px; line-height: 1.35; color: #7d8798; }
.main-tab-placeholder {
  text-align: center;
  max-width: 280px;
}
.mtp-icon {
  font-size: 48px;
  margin-bottom: 12px;
  opacity: 0.6;
}
.main-tab-placeholder h3 {
  font-size: 16px;
  font-weight: 700;
  color: #181d26;
  margin: 0 0 6px;
}
.main-tab-placeholder p {
  font-size: 13px;
  color: #41454d;
  line-height: 1.5;
  margin: 0 0 16px;
}
.mtp-coming {
  display: inline-block;
  padding: 6px 12px;
  background: #FFF4E6;
  border: 1px solid #FFA726;
  color: #E65100;
  font-size: 11px;
  border-radius: 6px;
  font-weight: 500;
  margin-bottom: 12px;
}
.mtp-link {
  display: inline-block;
  margin-top: 8px;
  padding: 8px 16px;
  background: #0068FF;
  color: white;
  text-decoration: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
}
.mtp-link:hover { background: #0050cc; }

/* ════════ ZALO STYLE SIDEBAR (COL 3) ACCORDIONS & STYLING ════════ */
.ip-header-zalo {
  border-bottom: 1px solid #E5E7EB;
  padding: 16px 12px;
  background: #fff;
  position: relative;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.ip-header-title {
  font-size: 16px;
  font-weight: 700;
  color: #1E202C;
  margin-bottom: 16px;
  width: 100%;
  text-align: center;
}
.ip-profile-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: 100%;
}
.ip-avatar-big-zalo {
  border: 2px solid #E5E7EB;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
}
.ip-name-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
}
.ip-name-line-zalo {
  font-size: 17px;
  font-weight: 700;
  color: #1E202C;
  max-width: 80%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ip-edit-btn {
  background: #F3F4F6;
  border: none;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6B7280;
  cursor: pointer;
  transition: all 150ms;
}
.ip-edit-btn:hover {
  background: #E5E7EB;
  color: #1E202C;
}

.ip-quick-actions {
  display: flex;
  justify-content: center;
  gap: 20px;
  margin-top: 18px;
  width: 100%;
}
.qa-btn {
  background: transparent;
  border: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  color: #4B5563;
  width: 72px;
}
.qa-icon-wrap {
  width: 38px;
  height: 38px;
  background: #F3F4F6;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #374151;
  transition: all 150ms;
  position: relative;
}
.qa-unread-dot {
  position: absolute;
  top: 1px;
  right: 1px;
  width: 8px;
  height: 8px;
  background-color: #ef4444;
  border-radius: 50%;
  border: 1.5px solid #ffffff;
}
.qa-btn:hover .qa-icon-wrap {
  background: #E5E7EB;
  color: #1E202C;
}
.qa-btn span {
  font-size: 11px;
  font-weight: 500;
  text-align: center;
  line-height: 1.2;
}

.profile-quote-block { margin-top: 8px; border-top: 1px solid #e8edf3; background: #f7f9fc; }
.profile-quote-title { padding: 10px 14px 4px; color: #475467; font-size: 11px; font-weight: 800; letter-spacing: .045em; }

.ip-tab-content-zalo {
  flex: 1;
  overflow-y: auto;
  background: #F3F4F6;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Mobile: thu gọn header để 4 nút chức năng lọt ngay màn hình đầu, không phải kéo.
   Tiêu đề "Thông tin hội thoại" đã có ở thanh popup mobile nên ẩn bản lặp trong panel. */
@media (max-width: 768px) {
  .ip-header-zalo { padding: 10px 12px; }
  .ip-header-title { display: none; }
  .ip-profile-hero { gap: 4px; }
  .ip-avatar-big-zalo { width: 48px !important; height: 48px !important; }
  .ip-name-line-zalo { font-size: 15px; }
  .ip-quick-actions { margin-top: 12px; gap: 12px; }
}

/* Zalo list items & Accordions */
.zalo-list-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
  padding: 14px 16px;
  cursor: pointer;
  transition: background-color 150ms;
}
.zalo-list-item:hover {
  background: #FAFAFA;
}
.item-left {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
  font-weight: 500;
  color: #374151;
}
.item-icon {
  color: #4B5563;
}
.item-right {
  color: #9CA3AF;
}

.zalo-accordion {
  background: #fff;
  display: flex;
  flex-direction: column;
}
.zalo-accordion summary {
  list-style: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  font-size: 14px;
  font-weight: 600;
  color: #1E202C;
  cursor: pointer;
  border-bottom: 1px solid #F3F4F6;
}
.zalo-accordion summary::-webkit-details-marker {
  display: none;
}
.zalo-accordion summary .chevron {
  color: #9CA3AF;
  transition: transform 150ms;
}
.zalo-accordion[open] summary .chevron {
  transform: rotate(180deg);
}

.zalo-media-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
  padding: 12px 16px 4px;
}
.media-thumb, .media-thumb-more {
  aspect-ratio: 1;
  border-radius: 4px;
  overflow: hidden;
  background: #F3F4F6;
  cursor: pointer;
  position: relative;
}
.media-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.media-thumb-more {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6B7280;
  background: #F3F4F6;
  border: 1px dashed #D1D5DB;
}
.media-thumb-more:hover {
  background: #E5E7EB;
  color: #1E202C;
}

.zalo-view-all-btn {
  background: #F3F4F6;
  border: none;
  width: calc(100% - 32px);
  margin: 12px 16px;
  height: 36px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #4B5563;
  cursor: pointer;
  transition: all 150ms;
}
.zalo-view-all-btn:hover {
  background: #E5E7EB;
  color: #1E202C;
}

.zalo-empty-info {
  padding: 24px 16px;
  font-size: 13px;
  color: #9CA3AF;
  text-align: center;
}

.zalo-link-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 16px 4px;
}
.zalo-link-item {
  display: flex;
  align-items: center;
  gap: 12px;
  text-decoration: none;
  padding: 8px;
  border-radius: 8px;
  transition: background-color 150ms;
}
.zalo-link-item:hover {
  background: #F9FAFB;
}
.link-icon-wrap {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background: #F3F4F6;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #4B5563;
  flex-shrink: 0;
}
.link-details {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.link-url {
  font-size: 13px;
  font-weight: 500;
  color: #2563EB;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.link-host {
  font-size: 11px;
  color: #9CA3AF;
  margin-top: 2px;
}

/* Security Settings */
.zalo-security-settings {
  display: flex;
  flex-direction: column;
}
.security-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #F3F4F6;
}
.sec-left {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13.5px;
  color: #374151;
}
.sec-icon {
  color: #4B5563;
}
.sec-label {
  font-weight: 500;
}
.sec-desc {
  font-size: 11.5px;
  color: #9CA3AF;
  margin-top: 1px;
}
.sec-switch {
  width: 40px;
  height: 20px;
  cursor: pointer;
}
.security-action-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  font-size: 13.5px;
  cursor: pointer;
  transition: background-color 150ms;
}
.security-action-row:hover {
  background: #F9FAFB;
}
.security-action-row.danger {
  color: #EF4444;
}

/* Alias edit box */
.zalo-alias-edit-box {
  background: #fff;
  padding: 12px 16px;
  border-bottom: 1px solid #E5E7EB;
}
.alias-title {
  font-size: 12px;
  font-weight: 600;
  color: #4B5563;
  margin-bottom: 6px;
}
.alias-input-row {
  display: flex;
  gap: 8px;
}
.alias-input-row input {
  flex: 1;
  height: 32px;
  border: 1px solid #D1D5DB;
  border-radius: 6px;
  padding: 0 10px;
  font-size: 13px;
}
.alias-input-row input:focus {
  border-color: #2F80ED;
  outline: none;
}
.save-alias-btn {
  height: 32px;
  padding: 0 12px;
  background: #2F80ED;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.save-alias-btn:hover {
  background: #5b3ecf;
}


.qa-btn:disabled { opacity: .5; cursor: not-allowed; }
.qa-btn.active .qa-icon-wrap { background: #e8f0ff; color: #0068ff; box-shadow: inset 0 0 0 1px #b7d0ff; }
.qa-btn-danger .qa-icon-wrap { color: #dc2626 !important; }
.qa-btn-danger:hover .qa-icon-wrap { background: #fee2e2 !important; }
.qa-btn-danger span { color: #dc2626 !important; }

/* Dialog xác nhận rời nhóm */
.ip-confirm-overlay {
  position: fixed; inset: 0; z-index: 9800;
  background: rgba(0,0,0,0.45);
  display: flex; align-items: center; justify-content: center;
}
.ip-confirm-dialog {
  background: #fff; border-radius: 12px;
  padding: 24px; max-width: 360px; width: 90%;
  box-shadow: 0 8px 32px rgba(0,0,0,0.18);
}
.ip-confirm-title { font-size: 16px; font-weight: 700; color: #1f2937; margin-bottom: 10px; }
.ip-confirm-body { font-size: 13px; color: #6b7280; line-height: 1.6; margin-bottom: 20px; }
.ip-confirm-actions { display: flex; gap: 10px; justify-content: flex-end; }
.ip-confirm-cancel {
  padding: 8px 18px; border-radius: 8px;
  background: #f3f4f6; color: #374151;
  border: none; font-weight: 600; cursor: pointer; font-family: inherit;
}
.ip-confirm-cancel:hover { background: #e5e7eb; }
.ip-confirm-ok {
  padding: 8px 18px; border-radius: 8px;
  border: none; font-weight: 600; cursor: pointer; font-family: inherit;
  background: #2F80ED; color: #fff;
}
.ip-confirm-ok.danger { background: #dc2626; }
.ip-confirm-ok.danger:hover { background: #b91c1c; }
.ip-confirm-ok:disabled { opacity: .6; cursor: not-allowed; }

.common-group-toggle { width: 100%; border: 0; font-family: inherit; text-align: left; }
.common-group-toggle .item-right svg { transition: transform .15s; }
.common-group-toggle .item-right svg.expanded { transform: rotate(90deg); }
.common-group-list { background: #fff; border-top: 1px solid #f1f3f5; padding: 4px 10px 8px; }
.common-group-row { width: 100%; border: 0; background: transparent; display: flex; align-items: center; gap: 10px; padding: 8px 6px; border-radius: 8px; cursor: pointer; text-align: left; font-family: inherit; }
.common-group-row:hover { background: #f7f8fa; }
.common-group-avatar { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; background: #e8f0ff; color: #0068ff; font-weight: 700; }
.common-group-info { min-width: 0; flex: 1; display: flex; flex-direction: column; }
.common-group-info strong { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.common-group-info small { font-size: 11px; color: #8b93a7; margin-top: 2px; }
.media-thumb { border: 0; padding: 0; }
.media-fallback { width: 100%; height: 100%; display: grid; place-items: center; color: #737b8c; font-size: 11px; }
.shared-video-play { position: absolute; inset: 0; margin: auto; width: 25px; height: 25px; border-radius: 50%; background: rgba(0,0,0,.55); color: white; display: grid; place-items: center; font-size: 10px; padding-left: 2px; }
.shared-file-list { padding: 4px 12px 10px; }
.shared-file-row { display: flex; align-items: center; gap: 10px; padding: 9px 4px; color: inherit; text-decoration: none; border-bottom: 1px solid #f1f3f5; }
.shared-file-row:last-child { border-bottom: 0; }
.shared-file-row:hover { background: #f9fafb; }
.shared-file-icon { width: 36px; height: 36px; border-radius: 7px; display: grid; place-items: center; background: #eef2f7; color: #475066; font-size: 9px; font-weight: 800; }
.shared-file-info { min-width: 0; display: flex; flex-direction: column; }
.shared-file-info strong { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.shared-file-info small { font-size: 10px; color: #8b93a7; margin-top: 2px; }

/* ════════ Lightbox nội bộ ════════ */
.ip-lightbox-overlay {
  position: fixed;
  inset: 0;
  z-index: 9900;
  background: rgba(0,0,0,0.92);
  display: flex;
  flex-direction: column;
  align-items: stretch;
}
.ip-lb-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background: rgba(0,0,0,0.6);
  flex-shrink: 0;
}
.ip-lb-title {
  color: #e5e7eb;
  font-size: 13px;
  font-weight: 500;
  max-width: 60%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ip-lb-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ip-lb-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background: rgba(255,255,255,0.08);
  color: #d1d5db;
  border: none;
  cursor: pointer;
  transition: background 0.15s;
  text-decoration: none;
}
.ip-lb-btn:hover { background: rgba(255,255,255,0.18); color: #fff; }
.ip-lb-close:hover { background: rgba(220,38,38,0.5); }
.ip-lb-body {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  min-height: 0;
}
.ip-lb-body.zoomed { overflow: auto; align-items: flex-start; justify-content: flex-start; }
.ip-lb-img-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  max-width: 100%;
  max-height: 100%;
}
.ip-lb-img-wrap.zoomed { min-width: 100%; min-height: 100%; }
.ip-lb-media {
  max-width: 100%;
  max-height: calc(100vh - 130px);
  object-fit: contain;
  border-radius: 4px;
  display: block;
  cursor: zoom-in;
  transition: transform 0.2s ease;
}
.ip-lb-media.zoomed {
  max-width: none;
  max-height: none;
  transform: scale(2);
  transform-origin: top left;
  cursor: zoom-out;
}
.ip-lb-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: rgba(255,255,255,0.1);
  color: #fff;
  border: none;
  cursor: pointer;
  z-index: 2;
  transition: background 0.15s;
}
.ip-lb-nav:hover { background: rgba(255,255,255,0.25); }
.ip-lb-nav-prev { left: 12px; }
.ip-lb-nav-next { right: 12px; }
.ip-lb-thumbs {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 16px;
  background: rgba(0,0,0,0.5);
  flex-shrink: 0;
  overflow-x: auto;
}
.ip-lb-thumbs::-webkit-scrollbar { height: 3px; }
.ip-lb-thumb {
  width: 48px;
  height: 48px;
  border-radius: 5px;
  overflow: hidden;
  border: 2px solid transparent;
  cursor: pointer;
  flex-shrink: 0;
  background: #1f2937;
  transition: border-color 0.15s;
}
.ip-lb-thumb.active { border-color: #2F80ED; }
.ip-lb-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.ip-lb-thumb-vid {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: #9ca3af;
  font-size: 18px;
}
.zalo-notes-panel {
  padding: 10px 14px 14px;
}
.zalo-notes-textarea {
  width: 100%;
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  padding: 10px;
  font-size: 13px;
  color: #303133;
  background-color: #fff;
  resize: vertical;
  outline: none;
  transition: border-color 0.2s;
}
.zalo-notes-textarea:focus {
  border-color: #2F80ED;
}
.follow-up-subtabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--smax-grey-200);
  background: #fff;
}
.follow-up-subtabs button {
  min-width: 0;
  min-height: 32px;
  padding: 6px 8px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: var(--smax-grey-100, #f1f5f9);
  color: var(--smax-grey-700, #475569);
  cursor: pointer;
  font-size: 12px;
  font-weight: 650;
}
.follow-up-subtabs button.active {
  border-color: #a9d3f6;
  background: #eaf4ff;
  color: #0866c6;
}

.profile-quote-block {
  margin-top: 10px !important;
  border-top: 1px solid #eaedf2 !important;
  background: #f8fafc !important;
}
.profile-quote-tabs {
  display: flex !important;
  background: #e2e8f0 !important;
  padding: 3px !important;
  border-radius: 9px !important;
  margin: 10px 12px 6px !important;
  gap: 3px !important;
  border-bottom: none !important;
}
.quote-tab-btn {
  flex: 1 !important;
  padding: 7px 10px !important;
  border: none !important;
  background: transparent !important;
  font-size: 11.5px !important;
  font-weight: 600 !important;
  color: #64748b !important;
  cursor: pointer !important;
  border-radius: 7px !important;
  transition: all 0.2s ease !important;
  white-space: nowrap !important;
  text-align: center !important;
}
.quote-tab-btn.active {
  background: #ffffff !important;
  color: #2f80ed !important;
  font-weight: 700 !important;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1) !important;
  border-bottom: none !important;
}
.quote-tab-btn:hover:not(.active) {
  color: #1e293b !important;
}

</style>
