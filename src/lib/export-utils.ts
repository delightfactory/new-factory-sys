/**
 * Enhanced Export Utilities
 * Provides CSV/Excel-compatible export functionality for tables and reports
 */

export interface ExportColumn {
    key: string;
    header: string;
    formatter?: (value: any, row: any) => string;
}

/**
 * Export data to CSV file (Excel-compatible with Arabic support)
 */
export function exportToCSV<T extends Record<string, any>>(
    data: T[],
    columns: ExportColumn[],
    filename: string
): void {
    // Add BOM for proper Arabic display in Excel
    const BOM = '\uFEFF';

    // Build header row
    const headers = columns.map(col => `"${col.header}"`).join(',');

    // Build data rows
    const rows = data.map(item => {
        return columns.map(col => {
            const value = col.formatter
                ? col.formatter(item[col.key], item)
                : item[col.key];

            // Handle null/undefined
            if (value === null || value === undefined) return '""';

            // Escape quotes and wrap in quotes
            const stringValue = String(value).replace(/"/g, '""');
            return `"${stringValue}"`;
        }).join(',');
    });

    // Combine all rows
    const csvContent = BOM + headers + '\n' + rows.join('\n');

    // Create and trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}_${formatDate(new Date())}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/**
 * Export data to HTML table (can be opened in Excel with better formatting)
 */
export function exportToExcelHTML<T extends Record<string, any>>(
    data: T[],
    columns: ExportColumn[],
    filename: string,
    options?: {
        title?: string;
        subtitle?: string;
        summaryRows?: { label: string; value: string | number }[];
    }
): void {
    let html = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
        <head>
            <meta charset="UTF-8">
            <!--[if gte mso 9]>
            <xml>
                <x:ExcelWorkbook>
                    <x:ExcelWorksheets>
                        <x:ExcelWorksheet>
                            <x:Name>Sheet1</x:Name>
                            <x:WorksheetOptions>
                                <x:DisplayRightToLeft/>
                            </x:WorksheetOptions>
                        </x:ExcelWorksheet>
                    </x:ExcelWorksheets>
                </x:ExcelWorkbook>
            </xml>
            <![endif]-->
            <style>
                table { border-collapse: collapse; width: 100%; direction: rtl; }
                th { background-color: #4472C4; color: white; padding: 12px 8px; text-align: right; font-weight: bold; border: 1px solid #ddd; }
                td { padding: 8px; text-align: right; border: 1px solid #ddd; }
                tr:nth-child(even) { background-color: #f2f2f2; }
                .title { font-size: 18px; font-weight: bold; padding: 16px 0; }
                .subtitle { font-size: 14px; color: #666; padding-bottom: 16px; }
                .summary { background-color: #E2EFDA; font-weight: bold; }
                .number { mso-number-format:"\\#\\,\\#\\#0\\.00"; text-align: left; }
            </style>
        </head>
        <body>
    `;

    // Add title if provided
    if (options?.title) {
        html += `<div class="title">${options.title}</div>`;
    }
    if (options?.subtitle) {
        html += `<div class="subtitle">${options.subtitle}</div>`;
    }

    html += '<table>';

    // Header row
    html += '<tr>';
    columns.forEach(col => {
        html += `<th>${col.header}</th>`;
    });
    html += '</tr>';

    // Data rows
    data.forEach(item => {
        html += '<tr>';
        columns.forEach(col => {
            const value = col.formatter
                ? col.formatter(item[col.key], item)
                : item[col.key];

            const displayValue = value ?? '';
            const isNumber = typeof value === 'number';
            html += `<td${isNumber ? ' class="number"' : ''}>${displayValue}</td>`;
        });
        html += '</tr>';
    });

    // Summary rows if provided
    if (options?.summaryRows) {
        options.summaryRows.forEach(row => {
            html += `<tr class="summary">
                <td colspan="${columns.length - 1}">${row.label}</td>
                <td class="number">${row.value}</td>
            </tr>`;
        });
    }

    html += '</table></body></html>';

    // Create and download
    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}_${formatDate(new Date())}.xls`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/**
 * Quick export for inventory reports
 */
export function exportInventoryReport(
    items: { name: string; code: string; quantity: number; unit_cost: number; type?: string }[],
    reportName: string
): void {
    const columns: ExportColumn[] = [
        { key: 'name', header: 'اسم الصنف' },
        { key: 'code', header: 'الكود' },
        { key: 'type', header: 'النوع', formatter: (v) => v || '-' },
        { key: 'quantity', header: 'الكمية', formatter: (v) => v?.toLocaleString('ar-EG') },
        { key: 'unit_cost', header: 'تكلفة الوحدة', formatter: (v) => v?.toLocaleString('ar-EG') },
        { key: 'total_value', header: 'القيمة الإجمالية', formatter: (_, row) => (row.quantity * row.unit_cost)?.toLocaleString('ar-EG') }
    ];

    const totalValue = items.reduce((sum, item) => sum + (item.quantity * item.unit_cost), 0);

    exportToExcelHTML(items, columns, reportName, {
        title: reportName,
        subtitle: `تاريخ التصدير: ${new Date().toLocaleDateString('ar-EG')}`,
        summaryRows: [
            { label: 'إجمالي القيمة', value: totalValue.toLocaleString('ar-EG') + ' ج.م' }
        ]
    });
}

/**
 * Quick export for financial reports
 */
export function exportFinancialReport(
    items: { date: string; description: string; amount: number; type: string }[],
    reportName: string
): void {
    const columns: ExportColumn[] = [
        { key: 'date', header: 'التاريخ' },
        { key: 'description', header: 'الوصف' },
        { key: 'type', header: 'النوع' },
        { key: 'amount', header: 'المبلغ', formatter: (v) => v?.toLocaleString('ar-EG') + ' ج.م' }
    ];

    const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);

    exportToExcelHTML(items, columns, reportName, {
        title: reportName,
        subtitle: `تاريخ التصدير: ${new Date().toLocaleDateString('ar-EG')}`,
        summaryRows: [
            { label: 'الإجمالي', value: totalAmount.toLocaleString('ar-EG') + ' ج.م' }
        ]
    });
}

// Helper function
function formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
}
