// Only explicit database rejections prove rollback. Transport failures and
// connection/timeout codes leave the write outcome uncertain.
export function isDefinitiveCommandFailure(error: unknown, recoveringUnknown = false): boolean {
    if (!(error instanceof Error)) return false;
    const failure = error as Error & { code?: unknown; databaseCode?: unknown };
    if (failure.code === 'MCP_REQUEST_CONFLICT') return false;
    // Identity/role checks run before receipt lookup. A denial on replay
    // cannot establish whether the earlier request committed.
    if (recoveringUnknown && ((typeof failure.code === 'string' && /FORBIDDEN|SESSION_REQUIRED|^MCP_TOOL_UNKNOWN$/.test(failure.code)) ||
        failure.databaseCode === '42501')) return false;
    return (typeof failure.code === 'string' && /^MCP_[A-Z_]+$/.test(failure.code)) ||
        (typeof failure.databaseCode === 'string' && /^(?:2[23][0-9A-Z]{3}|42501|P0001)$/.test(failure.databaseCode));
}
