export function csvText(value: string): string {
    const safe = /^[\s]*[=+\-@]/.test(value) || /^[\t\r\n]/.test(value) ? "'"+value : value;
    return '"'+safe.replaceAll('"', '""')+'"';
}
