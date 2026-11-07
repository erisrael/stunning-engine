"use client";

import React from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  CornerDownLeftIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function getFilamentPaginationRange(current: number, total: number): (number | "...")[] {
  if (total <= 1) return [1];
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  // When near the beginning (Filament standard: shows first 4, ellipsis, last 2)
  if (current <= 3) {
    return [1, 2, 3, 4, "...", total - 1, total];
  }

  // When near the end (Filament standard: shows first 2, ellipsis, last 4)
  if (current >= total - 2) {
    return [1, 2, "...", total - 3, total - 2, total - 1, total];
  }

  // In the middle (Filament standard: first, ellipsis, current-1, current, current+1, ellipsis, last)
  return [1, "...", current - 1, current, current + 1, "...", total];
}

export type FilamentPaginationProps = {
  from: number;
  to: number;
  totalResults: number;
  currentPage: number;
  totalPages: number;
  pageSize?: number;
  pageSizeOptions?: number[];
  allowAll?: boolean;
  disabled?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  className?: string;
  sourceLabel?: string;
};

export function FilamentPagination({
  from,
  to,
  totalResults,
  currentPage,
  totalPages,
  pageSize = 10,
  pageSizeOptions = [10, 25, 50, 100, 250],
  allowAll = false,
  disabled = false,
  onPageChange,
  onPageSizeChange,
  className,
  sourceLabel,
}: FilamentPaginationProps) {
  const [jumpPage, setJumpPage] = React.useState("");
  const safeTotalPages = Math.max(1, totalPages);
  const pages = getFilamentPaginationRange(currentPage, safeTotalPages);

  const handleJump = (e: React.FormEvent) => {
    e.preventDefault();
    const p = parseInt(jumpPage.trim(), 10);
    if (!isNaN(p) && p >= 1 && p <= safeTotalPages) {
      onPageChange(p);
      setJumpPage("");
    }
  };

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 bg-card p-2.5 sm:p-3 rounded-xl border border-border/70 text-xs shadow-sm",
        className
      )}
    >
      {/* LEFT: Showing X to Y of Z results */}
      <div className="text-muted-foreground flex items-center gap-1.5 select-none text-[11px] sm:text-xs">
        <span>
          Showing <strong className="text-foreground font-semibold">{from.toLocaleString()}</strong> to{" "}
          <strong className="text-foreground font-semibold">{to.toLocaleString()}</strong> of{" "}
          <strong className="text-foreground font-semibold">{totalResults.toLocaleString()}</strong> results
        </span>
        {sourceLabel && <span className="text-[10px] text-muted-foreground/70 hidden md:inline">({sourceLabel})</span>}
      </div>

      {/* MIDDLE & RIGHT CONTROLS */}
      <div className="flex flex-wrap items-center gap-2.5 sm:gap-3.5 ml-auto">
        {/* JUMP TO PAGE INPUT (When > 5 pages) */}
        {safeTotalPages > 5 && (
          <form onSubmit={handleJump} className="hidden sm:flex items-center gap-1">
            <span className="text-muted-foreground text-[11px] whitespace-nowrap">Go to:</span>
            <input
              type="number"
              min={1}
              max={safeTotalPages}
              value={jumpPage}
              onChange={(e) => setJumpPage(e.target.value)}
              placeholder={String(currentPage)}
              disabled={disabled}
              className="h-7 w-12 rounded-lg border border-border/70 bg-muted/30 px-1.5 text-center text-xs font-mono font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={disabled || !jumpPage}
              className="size-7 rounded-lg border border-border/70 bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors disabled:opacity-30 disabled:pointer-events-none"
              title="Jump to page"
            >
              <CornerDownLeftIcon className="size-3" />
            </button>
          </form>
        )}

        {/* PER PAGE SELECTOR */}
        {onPageSizeChange && (
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground text-[11px] sm:text-xs whitespace-nowrap">Per page</span>
            <div className="relative">
              <select
                aria-label="Records per page"
                value={pageSize}
                disabled={disabled}
                onChange={(e) => onPageSizeChange(Number(e.target.value))}
                className="h-7 sm:h-8 rounded-lg border border-border/70 bg-muted/40 hover:bg-muted/70 px-2 sm:px-2.5 pr-6 sm:pr-7 text-xs font-medium text-foreground cursor-pointer transition-colors focus:outline-none focus:ring-1 focus:ring-emerald-500 appearance-none disabled:opacity-50"
              >
                {pageSizeOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
                {allowAll && <option value="0">All</option>}
              </select>
              <ChevronDownIcon className="absolute right-1.5 sm:right-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground pointer-events-none" />
            </div>
          </div>
        )}

        {/* NUMBERED PAGINATION BAR (Filament v3 grouped pill container matching screenshot) */}
        <nav
          aria-label="Pagination navigation"
          className="inline-flex items-stretch rounded-lg border border-border/80 bg-muted/20 divide-x divide-border/60 overflow-hidden shadow-xs"
        >
          {/* Previous Page Arrow Button < */}
          {currentPage > 1 && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPageChange(currentPage - 1)}
              aria-label="Previous page"
              title="Previous page"
              className="px-2.5 h-7 sm:h-8 text-muted-foreground hover:text-foreground hover:bg-muted/60 flex items-center justify-center transition-colors disabled:opacity-30 disabled:pointer-events-none"
            >
              <ChevronLeftIcon className="size-3.5 sm:size-4" />
            </button>
          )}

          {/* Numbered Buttons with Ellipsis */}
          {pages.map((item, idx) => {
            if (item === "...") {
              return (
                <span
                  key={`ellipsis-${idx}`}
                  className="px-2.5 h-7 sm:h-8 text-muted-foreground/80 font-mono text-xs flex items-center justify-center select-none bg-muted/10"
                >
                  ...
                </span>
              );
            }

            const isCurrent = item === currentPage;
            return (
              <button
                key={`page-${item}`}
                type="button"
                disabled={disabled}
                onClick={() => onPageChange(item)}
                aria-current={isCurrent ? "page" : undefined}
                className={cn(
                  "min-w-7 sm:min-w-8 h-7 sm:h-8 px-2.5 text-xs transition-all flex items-center justify-center select-none",
                  isCurrent
                    ? "text-emerald-500 dark:text-emerald-400 font-bold bg-emerald-500/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50 font-medium active:scale-95"
                )}
              >
                {item}
              </button>
            );
          })}

          {/* Next Page Arrow Button > */}
          {currentPage < safeTotalPages && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPageChange(currentPage + 1)}
              aria-label="Next page"
              title="Next page"
              className="px-2.5 h-7 sm:h-8 text-muted-foreground hover:text-foreground hover:bg-muted/60 flex items-center justify-center transition-colors disabled:opacity-30 disabled:pointer-events-none"
            >
              <ChevronRightIcon className="size-3.5 sm:size-4" />
            </button>
          )}
        </nav>
      </div>
    </div>
  );
}

