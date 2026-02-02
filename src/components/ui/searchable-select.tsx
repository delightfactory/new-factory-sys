import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "./command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "./popover";

export interface SearchableSelectOption {
    value: string;
    label: string;
    description?: string;
    disabled?: boolean;
}

export interface SearchableSelectGroup {
    label: string;
    options: SearchableSelectOption[];
}

interface SearchableSelectProps {
    options: SearchableSelectOption[] | SearchableSelectGroup[];
    value?: string;
    onValueChange: (value: string) => void;
    placeholder?: string;
    searchPlaceholder?: string;
    emptyMessage?: string;
    disabled?: boolean;
    className?: string;
    grouped?: boolean;
}

export function SearchableSelect({
    options,
    value,
    onValueChange,
    placeholder = "اختر...",
    searchPlaceholder = "بحث...",
    emptyMessage = "لا توجد نتائج",
    disabled = false,
    className,
    grouped = false,
}: SearchableSelectProps) {
    const [open, setOpen] = React.useState(false);

    // Find selected label
    const getSelectedLabel = () => {
        if (!value) return null;

        if (grouped) {
            for (const group of options as SearchableSelectGroup[]) {
                const found = group.options.find((opt) => opt.value === value);
                if (found) return found.label;
            }
        } else {
            const found = (options as SearchableSelectOption[]).find((opt) => opt.value === value);
            if (found) return found.label;
        }
        return null;
    };

    const selectedLabel = getSelectedLabel();

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    disabled={disabled}
                    className={cn(
                        "w-full justify-between font-normal",
                        !value && "text-muted-foreground",
                        className
                    )}
                >
                    {selectedLabel || placeholder}
                    <ChevronsUpDown className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-full min-w-[200px] p-0" align="start">
                <Command>
                    <CommandInput placeholder={searchPlaceholder} className="h-9" />
                    <CommandList>
                        <CommandEmpty>{emptyMessage}</CommandEmpty>
                        {grouped ? (
                            (options as SearchableSelectGroup[]).map((group) => (
                                <CommandGroup key={group.label} heading={group.label}>
                                    {group.options.map((option) => (
                                        <CommandItem
                                            key={option.value}
                                            value={option.label}
                                            disabled={option.disabled}
                                            onSelect={() => {
                                                onValueChange(option.value);
                                                setOpen(false);
                                            }}
                                        >
                                            {option.label}
                                            {option.description && (
                                                <span className="mr-2 text-xs text-muted-foreground">
                                                    {option.description}
                                                </span>
                                            )}
                                            <Check
                                                className={cn(
                                                    "mr-auto h-4 w-4",
                                                    value === option.value ? "opacity-100" : "opacity-0"
                                                )}
                                            />
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            ))
                        ) : (
                            <CommandGroup>
                                {(options as SearchableSelectOption[]).map((option) => (
                                    <CommandItem
                                        key={option.value}
                                        value={option.label}
                                        disabled={option.disabled}
                                        onSelect={() => {
                                            onValueChange(option.value);
                                            setOpen(false);
                                        }}
                                    >
                                        {option.label}
                                        {option.description && (
                                            <span className="mr-2 text-xs text-muted-foreground">
                                                {option.description}
                                            </span>
                                        )}
                                        <Check
                                            className={cn(
                                                "mr-auto h-4 w-4",
                                                value === option.value ? "opacity-100" : "opacity-0"
                                            )}
                                        />
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        )}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
