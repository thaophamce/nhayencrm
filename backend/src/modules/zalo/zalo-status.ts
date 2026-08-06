/**
 * Trạng thái trong pool là nguồn sự thật realtime khi nick đang có instance.
 * Chỉ dùng trạng thái DB khi nick chưa được nạp vào pool.
 */
export function resolveZaloStatus(dbStatus: string, poolStatus?: string): string {
  return poolStatus || dbStatus;
}

/** WebSocket code 1000 là phiên listener đóng bình thường, không phải lỗi xác thực. */
export function isNormalListenerClosure(code?: number, reason?: string): boolean {
  return code === 1000 || String(reason || '').toUpperCase() === 'NORMAL_CLOSURE';
}

/**
 * Chỉ hạ trạng thái API khi listener đóng bất thường. Listener code 1000 được
 * zca-js xoay định kỳ nhưng session HTTP vẫn dùng được cho send/rename.
 */
export function applyListenerClosureStatus(
  instance: { status: string } | undefined,
  code?: number,
  reason?: string,
): boolean {
  if (isNormalListenerClosure(code, reason)) return false;
  if (instance) instance.status = 'disconnected';
  return true;
}
