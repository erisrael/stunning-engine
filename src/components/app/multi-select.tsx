"use client";

import * as React from "react";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type Option = { value: string; label: string; hint?: string; group?: string };

export function MultiSelect({
  label,
  options,
  value,
  onChange,
  className,
  searchable = true,
  single = false,
  align = "start",
  placeholder,
}: {
  label: string;
  options: Option[];
  value: string[];
  onChange: (v: string[]) => void;
  className?: string;
  searchable?: boolean;
  single?: boolean;
  align?: "start" | "end";
  placeholder?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = options.filter((o) => value.includes(o.value));
  const groups = [...new Set(options.map((o) => o.group ?? ""))];
  const toggle = (v: string) => {
    if (single) {
      onChange(value.includes(v) ? [] : [v]);
      setOpen(false);
      return;
    }
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("h-8 max-w-[220px] justify-between gap-1.5 border-dashed font-normal", selected.length && "border-solid border-primary/40 bg-accent/40", className)}
          aria-label={`${label} filter`}
        >
          <span className="truncate">
            {selected.length === 0 ? (placeholder ?? label) : selected.length === 1 ? `${label}: ${selected[0].label}` : `${label}: ${selected.length}`}
          </span>
          <ChevronDownIcon className="size-3.5 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align={align}>
        <Command>
          {searchable && options.length > 7 && <CommandInput placeholder={`Search ${label.toLowerCase()}`} />}
          <CommandList className="max-h-72">
            <CommandEmpty>No matches.</CommandEmpty>
            {groups.map((g) => (
              <CommandGroup key={g || "default"} heading={g || undefined}>
                {options
                  .filter((o) => (o.group ?? "") === g)
                  .map((o) => {
                    const on = value.includes(o.value);
                    return (
                      <CommandItem key={o.value} value={`${o.label} ${o.value}`} onSelect={() => toggle(o.value)}>
                        <span className={cn("flex size-4 shrink-0 items-center justify-center rounded border", on ? "border-primary bg-primary text-primary-foreground" : "border-input")}>
                          {on && <CheckIcon className="size-3" />}
                        </span>
                        <span className="truncate">{o.label}</span>
                        {o.hint && <span className="ml-auto text-xs text-muted-foreground">{o.hint}</span>}
                      </CommandItem>
                    );
                  })}
              </CommandGroup>
            ))}
            {value.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem onSelect={() => onChange([])} className="justify-center text-xs">
                    Clear {label.toLowerCase()}
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Select",
  className,
  allowClear = true,
  disabled,
  size = "default",
}: {
  options: Option[];
  value: string | null;
  onChange: (v: string | null) => void;
  placeholder?: string;
  className?: string;
  allowClear?: boolean;
  disabled?: boolean;
  size?: "sm" | "default";
}) {
  const [open, setOpen] = React.useState(false);
  const current = options.find((o) => o.value === value);
  const groups = [...new Set(options.map((o) => o.group ?? ""))];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size={size}
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", !current && "text-muted-foreground", className)}
        >
          <span className="truncate">{current?.label ?? placeholder}</span>
          <ChevronDownIcon className="size-3.5 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-56 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search" />
          <CommandList className="max-h-72">
            <CommandEmpty>No matches.</CommandEmpty>
            {groups.map((g) => (
              <CommandGroup key={g || "default"} heading={g || undefined}>
                {options
                  .filter((o) => (o.group ?? "") === g)
                  .map((o) => (
                    <CommandItem
                      key={o.value}
                      value={`${o.label} ${o.value}`}
                      onSelect={() => {
                        onChange(o.value);
                        setOpen(false);
                      }}
                    >
                      <CheckIcon className={cn("size-3.5", o.value === value ? "opacity-100" : "opacity-0")} />
                      <span className="truncate">{o.label}</span>
                      {o.hint && <span className="ml-auto text-xs text-muted-foreground">{o.hint}</span>}
                    </CommandItem>
                  ))}
              </CommandGroup>
            ))}
            {allowClear && value && (
              <CommandGroup>
                <CommandItem
                  onSelect={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                  className="justify-center text-xs"
                >
                  Clear selection
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
