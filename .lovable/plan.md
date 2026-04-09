
## 🔴 Phase 1: Floating Chat Assistant (HIGH PRIORITY)
1. Create `AiChatAssistant` component — floating button + drawer/modal
2. Create `assistantQueryRouter` — maps natural language to existing data hooks
3. Wire into `AppLayout` so it's available on all routes

## 🔴 Phase 2: RPC Consolidation  
4. Create `useAssistantDataBundle` hook — single consolidated data fetch
5. Refactor `LiveTrendingTab` to use consolidated hook (remove duplicate logic)

## 🟡 Phase 3: Alert System Hardening
6. Add toast queue control (max 3, auto-expire 6s)
7. Deduplicate alerts in `useRiskAlerts`

## 🟡 Phase 4: KPI & Trend Enhancement
8. Add 30-day comparison with growth % in KPI cards

## 🟡 Phase 5: Timezone Hardening
9. Normalize all date queries to Asia/Dhaka

## 🟡 Phase 6: Data Edge Cases
10. Null-safe client names + phone validation

## 🟡 Phase 7: UI/UX Polish
11. Skeleton loading states, empty states, chart improvements

## 🔴 Phase 8: Pipeline Safety
12. Validate run_id uniqueness, prevent concurrent overlap

**Approach**: Surgical — each phase isolated, no breaking changes. Bengali summary after each phase.
