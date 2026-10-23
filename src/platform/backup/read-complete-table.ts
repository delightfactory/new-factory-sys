import { readCompleteRows } from '../data/read-complete-rows.ts';
import type { DataPage, IdentifiedRow } from '../data/read-complete-rows.ts';

export interface BackupRow extends IdentifiedRow {
    [column: string]: unknown;
}
export type BackupPage = DataPage<BackupRow>;

export function readCompleteBackupTable(fetchPage: (from: number, to: number) => Promise<BackupPage>): Promise<BackupRow[]> {
    return readCompleteRows(fetchPage, 'BACKUP');
}
