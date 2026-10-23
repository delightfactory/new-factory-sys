export interface IdentifiedRow {
    id: string | number;
}

export interface DataPage<Row extends IdentifiedRow> {
    rows: Row[] | null;
    count: number | null;
    error: { message: string } | null;
}

export type FetchDataPage<Row extends IdentifiedRow> = (from: number, to: number) => Promise<DataPage<Row>>;
const PAGE_SIZE = 500;

function checkedPage<Row extends IdentifiedRow>(page: DataPage<Row>, expectedCount: number | undefined, exportedCount: number, prefix: string) {
    if (page.error) throw new Error(`${prefix}_PAGE_FAILED`, { cause: page.error });
    const count = page.count;
    if (count === null || !Number.isSafeInteger(count) || count < 0) {
        throw new Error(`${prefix}_COUNT_UNAVAILABLE`);
    }
    if (expectedCount !== undefined && count !== expectedCount) throw new Error(`${prefix}_DATA_CHANGED`);
    if (!Array.isArray(page.rows) || page.rows.length > PAGE_SIZE ||
        exportedCount + page.rows.length > count ||
        (page.rows.length === 0 && exportedCount < count)) {
        throw new Error(`${prefix}_PAGE_INCOMPLETE`);
    }
    return { rows: page.rows, count };
}

function rowIdentity(row: IdentifiedRow, prefix: string): string {
    if ((typeof row.id !== 'string' || row.id.length === 0) &&
        (typeof row.id !== 'number' || !Number.isSafeInteger(row.id))) {
        throw new Error(`${prefix}_ROW_ID_INVALID`);
    }
    return String(row.id);
}

export async function readCompleteRows<Row extends IdentifiedRow>(fetchPage: FetchDataPage<Row>, prefix = 'DATA'): Promise<Row[]> {
    const exportedRows: Row[] = [];
    const seenIds = new Set<string>();
    let expectedCount: number | undefined;

    do {
        const response = await fetchPage(exportedRows.length, exportedRows.length + PAGE_SIZE - 1);
        const page = checkedPage(response, expectedCount, exportedRows.length, prefix);
        expectedCount ??= page.count;
        for (const row of page.rows) {
            const identity = rowIdentity(row, prefix);
            if (seenIds.has(identity)) throw new Error(`${prefix}_DUPLICATE_ROW`);
            seenIds.add(identity);
            exportedRows.push(row);
        }
    } while (exportedRows.length < expectedCount);

    return exportedRows;
}
