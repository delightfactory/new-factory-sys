import {
    type ColumnDef,
    flexRender,
    getCoreRowModel,
    useReactTable,
    getSortedRowModel,
    getFilteredRowModel,
    type SortingState,
} from "@tanstack/react-table"

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { Search, ArrowUp, ArrowDown, ArrowUpDown, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface DataTableProps<TData, TValue> {
    columns: ColumnDef<TData, TValue>[]
    data: TData[]
    searchPlaceholder?: string
    searchable?: boolean
    onRowClick?: (row: TData) => void
    /** Initial sorting state, defaults to sorting by 'code' ascending */
    initialSorting?: SortingState
    /** Number of rows to load per batch for infinite scroll */
    pageSize?: number
}

// Sortable Header Component
function SortableHeader({
    column,
    children,
}: {
    column: any
    children: React.ReactNode
}) {
    const sorted = column.getIsSorted()
    const canSort = column.getCanSort()

    if (!canSort) {
        return <>{children}</>
    }

    return (
        <div
            className={cn(
                "flex items-center gap-1 cursor-pointer select-none",
                "hover:text-foreground transition-colors"
            )}
            onClick={() => column.toggleSorting(sorted === "asc")}
        >
            {children}
            {sorted === "asc" ? (
                <ArrowUp className="h-3.5 w-3.5 text-primary" />
            ) : sorted === "desc" ? (
                <ArrowDown className="h-3.5 w-3.5 text-primary" />
            ) : (
                <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
            )}
        </div>
    )
}

export function DataTable<TData, TValue>({
    columns,
    data,
    searchPlaceholder = "بحث...",
    searchable = true,
    onRowClick,
    initialSorting,
    pageSize = 30,
}: DataTableProps<TData, TValue>) {
    // Determine default sorting - use 'code' if column exists, otherwise empty
    const defaultSorting = useMemo(() => {
        if (initialSorting) return initialSorting
        const hasCodeColumn = columns.some(
            (col) => 'accessorKey' in col && col.accessorKey === 'code'
        )
        return hasCodeColumn ? [{ id: 'code', desc: false }] : []
    }, [columns, initialSorting])

    const [sorting, setSorting] = useState<SortingState>(defaultSorting)
    const [globalFilter, setGlobalFilter] = useState("")

    // Infinite scroll state
    const [displayCount, setDisplayCount] = useState(pageSize)
    const loaderRef = useRef<HTMLDivElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)

    const table = useReactTable({
        data,
        columns,
        getCoreRowModel: getCoreRowModel(),
        onSortingChange: setSorting,
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        onGlobalFilterChange: setGlobalFilter,
        state: {
            sorting,
            globalFilter,
        },
    })

    // Get all filtered rows
    const allRows = table.getRowModel().rows
    const totalRows = allRows.length

    // Get visible rows based on display count
    const visibleRows = useMemo(() => {
        return allRows.slice(0, displayCount)
    }, [allRows, displayCount])

    const hasMore = displayCount < totalRows

    // Reset display count when filter changes
    useEffect(() => {
        setDisplayCount(pageSize)
    }, [globalFilter, pageSize])

    // Intersection Observer for infinite scroll
    const loadMore = useCallback(() => {
        if (hasMore) {
            setDisplayCount((prev) => Math.min(prev + pageSize, totalRows))
        }
    }, [hasMore, pageSize, totalRows])

    useEffect(() => {
        const loader = loaderRef.current
        if (!loader) return

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasMore) {
                    loadMore()
                }
            },
            { threshold: 0.1, rootMargin: '100px' }
        )

        observer.observe(loader)
        return () => observer.disconnect()
    }, [hasMore, loadMore])

    return (
        <div className="space-y-4">
            {searchable && (
                <div className="relative">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder={searchPlaceholder}
                        value={globalFilter ?? ""}
                        onChange={(e) => setGlobalFilter(e.target.value)}
                        className="pr-10 max-w-sm"
                    />
                </div>
            )}

            <div
                ref={containerRef}
                className="rounded-md border bg-card max-h-[70vh] overflow-auto"
            >
                <Table>
                    <TableHeader className="sticky top-0 bg-card z-10 shadow-sm">
                        {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow key={headerGroup.id}>
                                {headerGroup.headers.map((header) => {
                                    const canSort = header.column.getCanSort()
                                    return (
                                        <TableHead
                                            key={header.id}
                                            className={cn(
                                                "text-right",
                                                canSort && "hover:bg-muted/50 transition-colors"
                                            )}
                                        >
                                            {header.isPlaceholder ? null : (
                                                <SortableHeader column={header.column}>
                                                    {flexRender(
                                                        header.column.columnDef.header,
                                                        header.getContext()
                                                    )}
                                                </SortableHeader>
                                            )}
                                        </TableHead>
                                    )
                                })}
                            </TableRow>
                        ))}
                    </TableHeader>
                    <TableBody>
                        {visibleRows.length ? (
                            visibleRows.map((row) => (
                                <TableRow
                                    key={row.id}
                                    data-state={row.getIsSelected() && "selected"}
                                    className={onRowClick ? "cursor-pointer hover:bg-muted/50" : ""}
                                    onClick={() => onRowClick?.(row.original)}
                                >
                                    {row.getVisibleCells().map((cell) => (
                                        <TableCell key={cell.id}>
                                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={columns.length} className="h-24 text-center">
                                    لا توجد نتائج.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>

                {/* Infinite scroll loader */}
                {hasMore && (
                    <div
                        ref={loaderRef}
                        className="flex items-center justify-center py-4 text-muted-foreground"
                    >
                        <Loader2 className="h-5 w-5 animate-spin ml-2" />
                        <span className="text-sm">جاري تحميل المزيد...</span>
                    </div>
                )}
            </div>

            {/* Results count */}
            <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                    عرض {visibleRows.length} من {totalRows} نتيجة
                </span>
                {sorting.length > 0 && (
                    <span className="flex items-center gap-1">
                        مرتب حسب: {sorting[0].id === 'code' ? 'الكود' : sorting[0].id}
                        {sorting[0].desc ? (
                            <ArrowDown className="h-3 w-3" />
                        ) : (
                            <ArrowUp className="h-3 w-3" />
                        )}
                    </span>
                )}
            </div>
        </div>
    )
}
