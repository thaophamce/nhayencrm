SELECT 'orders' t, count(*)::text c FROM orders
UNION ALL SELECT 'order_status_histories', count(*)::text FROM order_status_histories
UNION ALL SELECT 'pancake_order_links', count(*)::text FROM pancake_order_links
UNION ALL SELECT 'delivery_orders', count(*)::text FROM delivery_orders
UNION ALL SELECT 'delivery_status_events', count(*)::text FROM delivery_status_events
UNION ALL SELECT 'attendance_records', count(*)::text FROM attendance_records
UNION ALL SELECT 'leave_requests', count(*)::text FROM leave_requests
UNION ALL SELECT 'salary_records', count(*)::text FROM salary_records
UNION ALL SELECT 'users_active', count(*)::text FROM users WHERE is_active
UNION ALL SELECT 'contacts', count(*)::text FROM contacts
UNION ALL SELECT 'conversations', count(*)::text FROM conversations
UNION ALL SELECT 'messages', count(*)::text FROM messages
ORDER BY 1;

SELECT 'orders' t, max(updated_at)::text m FROM orders
UNION ALL SELECT 'delivery_orders', max(updated_at)::text FROM delivery_orders
UNION ALL SELECT 'delivery_status_events', max(created_at)::text FROM delivery_status_events
UNION ALL SELECT 'order_status_histories', max(changed_at)::text FROM order_status_histories
UNION ALL SELECT 'pancake_order_links', max(updated_at)::text FROM pancake_order_links
UNION ALL SELECT 'attendance_records', max(created_at)::text FROM attendance_records
UNION ALL SELECT 'leave_requests', max(created_at)::text FROM leave_requests
UNION ALL SELECT 'salary_records', max(updated_at)::text FROM salary_records
ORDER BY 1;

SELECT md5(string_agg(row_to_json(x)::text, '|' ORDER BY x.user_id, x.period)) AS salary_hash, count(*)::text AS c
FROM (
  SELECT user_id, period, base_salary, work_days, total_salary, net_salary, is_manual_override
  FROM salary_records
) x;

SELECT md5(string_agg(row_to_json(x)::text, '|' ORDER BY x.id)) AS attendance_hash, count(*)::text AS c
FROM (
  SELECT id, user_id, date, shift, status, late_minutes, checkin_time
  FROM attendance_records
) x;

SELECT 'orphan_messages' k, count(*)::text c FROM messages m LEFT JOIN conversations c ON c.id=m.conversation_id WHERE c.id IS NULL
UNION ALL SELECT 'orphan_histories', count(*)::text FROM order_status_histories h LEFT JOIN orders o ON o.id=h.order_id WHERE o.id IS NULL
UNION ALL SELECT 'orphan_delivery_events', count(*)::text FROM delivery_status_events e LEFT JOIN delivery_orders d ON d.id=e.delivery_order_id WHERE d.id IS NULL;
