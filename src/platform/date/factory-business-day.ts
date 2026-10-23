const factoryCalendar = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit"
});

export function factoryBusinessDay(at: Date = new Date()): string {
    const parts = factoryCalendar.formatToParts(at);
    const part = (type: string) => parts.find(value => value.type === type)!.value;
    return `${part("year")}-${part("month")}-${part("day")}`;
}

export function factoryMonthPeriod(at: Date = new Date()) {
    const day = factoryBusinessDay(at);
    const [year, month] = day.split('-').map(Number);
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return {startDate: `${day.slice(0, 7)}-01`, endDate: `${day.slice(0, 7)}-${lastDay}`};
}
