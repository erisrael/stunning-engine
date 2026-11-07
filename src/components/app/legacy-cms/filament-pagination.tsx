"use client";

import React from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDownIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function getFilamentPaginationRange(current: number, total: number): (number | "...")[] {
  if (total <= 1) return [1];
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  // Near the beginning: shows first 4, ellipsis, last 2
  if (current <= 3) {
    return [1, 2, 3, 4, "...", total - 1, total];
  }

  // Near the end: shows first 2, ellipsis, last 4
  if (current >= total - 2) {
    return [1, 2, "...", total - 3, total - 2, total - 1, total];
  }

  // In the middle: first, ellipsis, current-1, current, current+1, ellipsis, last
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
  const safeTotalPages = Math.max(1, totalPages);
  const pages = getFilamentPaginationRange(currentPage, safeTotalPages);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 text-xs",
        className
      )}
    >
      {/* LEFT: Showing 1 to 10 of 5,022 results */}
      <div className="text-muted-foreground flex items-center gap-1.5 select-none text-xs sm:text-sm">
        <span>
          Showing <span className="text-foreground font-medium">{from.toLocaleString()}</span> to{" "}
          <span className="text-foreground font-medium">{to.toLocaleString()}</span> of{" "}
          <span className="text-foreground font-medium">{totalResults.toLocaleString()}</span> results
        </span>
        {sourceLabel && (
          <span className="text-[10px] text-muted-foreground/60 hidden md:inline">
            ({sourceLabel})
          </span>
        )}
      </div>

      {/* RIGHT CONTROLS: [Per page 10 v] and [ 1 | 2 | 3 | 4 | ... | 502 | 503 | > ] */}
      <div className="flex flex-wrap items-center gap-3 ml-auto">
        {/* PER PAGE PILL */}
        {onPageSizeChange && (
          <div className="relative inline-flex items-center rounded-lg border border-border/80 bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground shadow-xs">
            <span className="mr-2 font-normal text-muted-foreground">Per page</span>
            <select
              aria-label="Records per page"
              value={pageSize}
              disabled={disabled}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="bg-transparent font-semibold text-foreground focus:outline-none cursor-pointer pr-4 appearance-none"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt} className="bg-popover text-popover-foreground">
                  {opt}
                </option>
              ))}
              {allowAll && (
                <option value="0" className="bg-popover text-popover-foreground">
                  All
                </option>
              )}
            </select>
            <ChevronDownIcon className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
          </div>
        )}

        {/* NUMBERED PAGINATION PILL CONTAINER */}
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
              className="px-3 h-8 text-muted-foreground hover:text-foreground hover:bg-muted/40 flex items-center justify-center transition-colors disabled:opacity-30 disabled:pointer-events-none"
            >
              <ChevronLeftIcon className="size-3.5" />
            </button>
          )}

          {/* Numbered Buttons with Ellipsis */}
          {pages.map((item, idx) => {
            if (item === "...") {
              return (
                <span
                  key={`ellipsis-${idx}`}
                  className="px-3 h-8 text-muted-foreground font-medium text-xs flex items-center justify-center select-none"
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
                  "min-w-8 h-8 px-3 text-xs transition-colors flex items-center justify-center select-none",
                  isCurrent
                    ? "text-emerald-500 font-semibold bg-emerald-500/10"
                    : "text-foreground/90 hover:text-foreground hover:bg-muted/40 font-medium"
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
              className="px-3 h-8 text-muted-foreground hover:text-foreground hover:bg-muted/40 flex items-center justify-center transition-colors disabled:opacity-30 disabled:pointer-events-none"
            >
              <ChevronRightIcon className="size-3.5" />
            </button>
          )}
        </nav>
      </div>
    </div>
  );
}

