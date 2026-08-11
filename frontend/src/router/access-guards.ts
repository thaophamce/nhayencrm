export function shouldRedirectDesignerToOrders(
  permissionGroupName: string | null | undefined,
  targetPath: string,
  allowUnchangedPassword: boolean,
): boolean {
  return (
    permissionGroupName === 'Designer' &&
    targetPath !== '/orders' &&
    !allowUnchangedPassword
  );
}
