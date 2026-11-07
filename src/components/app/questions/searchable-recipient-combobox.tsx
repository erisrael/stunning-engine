"use client";

import * as React from "react";
import { CheckIcon, ChevronsUpDownIcon, SearchIcon, UserIcon, ShieldIcon, BuildingIcon, WrenchIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type QuestionRecipient = {
  id: string;
  name: string;
  handle: string;
  roles?: string[];
  role?: string;
  primaryRole?: string;
};

const ROLE_DEPARTMENT_MAP: Record<string, { label: string; group: string }> = {
  admin: { label: "System Admin", group: "Administration" },
  owner: { label: "System Owner", group: "Administration" },
  manager: { label: "Operations Manager", group: "Management" },
  publication: { label: "Publication Lead", group: "Publication & Uploading" },
  uploading: { label: "Uploading Lead", group: "Publication & Uploading" },
  recording: { label: "Recording Team", group: "Production" },
  editing: { label: "Editing Team", group: "Production" },
  finance_manager: { label: "Finance Manager", group: "Finance Department" },
  accountant: { label: "Finance / Accountant", group: "Finance Department" },
  developer: { label: "Development Team Lead", group: "Engineering & Dev" },
  staff: { label: "Staff Member", group: "Support & General" },
  customer_support: { label: "Customer Support", group: "Support & General" },
};

export function SearchableRecipientCombobox({
  users,
  value,
  onChange,
  disabled,
  placeholder = "Search staff member, lead, or department...",
}: {
  users: QuestionRecipient[];
  value: string;
  onChange: (userId: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  const selectedUser = users.find((u) => u.id === value);

  // Close on outside click
  React.useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("mousedown", handleOutside);
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  // Filter users by query
  const filteredUsers = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const matchName = u.name.toLowerCase().includes(q);
      const matchHandle = u.handle.toLowerCase().includes(q);
      const roleStr = (u.primaryRole || u.role || (u.roles && u.roles[0]) || "").toLowerCase();
      const deptInfo = ROLE_DEPARTMENT_MAP[roleStr];
      const matchRole = roleStr.includes(q) || (deptInfo && (deptInfo.label.toLowerCase().includes(q) || deptInfo.group.toLowerCase().includes(q)));
      return matchName || matchHandle || matchRole;
    });
  }, [users, query]);

  // Group filtered users by department
  const groupedUsers = React.useMemo(() => {
    const groups: Record<string, QuestionRecipient[]> = {};
    for (const u of filteredUsers) {
      const r = u.primaryRole || u.role || (u.roles && u.roles[0]) || "staff";
      const groupName = ROLE_DEPARTMENT_MAP[r]?.group || "Other Staff";
      if (!groups[groupName]) groups[groupName] = [];
      groups[groupName].push(u);
    }
    return groups;
  }, [filteredUsers]);

  const getRoleBadge = (u: QuestionRecipient) => {
    const r = u.primaryRole || u.role || (u.roles && u.roles[0]) || "staff";
    const info = ROLE_DEPARTMENT_MAP[r] || { label: r, group: "General" };
    return info.label;
  };

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <Button
        type="button"
        variant="outline"
        role="combobox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className="w-full justify-between h-9 px-3 text-xs bg-background font-normal"
      >
        {selectedUser ? (
          <div className="flex items-center gap-2 truncate">
            <div className="size-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold">
              {selectedUser.name[0]?.toUpperCase()}
            </div>
            <span className="font-medium text-foreground truncate">{selectedUser.name}</span>
            <span className="text-[10px] text-muted-foreground truncate font-mono">@{selectedUser.handle}</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-muted text-muted-foreground font-medium hidden sm:inline-block">
              {getRoleBadge(selectedUser)}
            </span>
          </div>
        ) : (
          <span className="text-muted-foreground">{placeholder}</span>
        )}
        <ChevronsUpDownIcon className="ml-2 size-3.5 shrink-0 opacity-50" />
      </Button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-full z-50 rounded-lg border bg-popover text-popover-foreground shadow-lg overflow-hidden animate-in fade-in-0 zoom-in-95 duration-100">
          {/* Search Input Box */}
          <div className="p-2 border-b bg-muted/20">
            <div className="relative flex items-center">
              <SearchIcon className="absolute left-2.5 size-3.5 text-muted-foreground pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Type name, handle, role (e.g. publication, finance, admin)..."
                className="w-full h-8 pl-8 pr-3 rounded-md border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary font-medium"
              />
            </div>
          </div>

          {/* Recipient Results List Grouped by Department */}
          <div className="max-h-60 overflow-y-auto p-1 text-xs">
            {Object.keys(groupedUsers).length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                No matching recipients found.
              </div>
            ) : (
              Object.entries(groupedUsers).map(([group, members]) => (
                <div key={group} className="mb-2">
                  <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted/40 rounded flex items-center gap-1.5 mb-1">
                    {group === "Administration" && <ShieldIcon className="size-3 text-amber-500" />}
                    {group === "Finance Department" && <BuildingIcon className="size-3 text-emerald-500" />}
                    {group === "Engineering & Dev" && <WrenchIcon className="size-3 text-blue-500" />}
                    {group} ({members.length})
                  </div>
                  {members.map((u) => {
                    const isSelected = u.id === value;
                    return (
                      <div
                        key={u.id}
                        onClick={() => {
                          onChange(u.id);
                          setOpen(false);
                        }}
                        className={cn(
                          "flex items-center justify-between px-2.5 py-1.5 rounded-md cursor-pointer transition-colors text-xs select-none",
                          isSelected
                            ? "bg-primary/10 text-primary font-medium"
                            : "hover:bg-accent hover:text-accent-foreground text-foreground"
                        )}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="size-6 rounded-full bg-muted flex items-center justify-center font-bold text-[11px] shrink-0">
                            {u.name[0]?.toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-xs leading-none mb-0.5">{u.name}</p>
                            <p className="text-[10px] text-muted-foreground font-mono truncate">
                              @{u.handle} · {getRoleBadge(u)}
                            </p>
                          </div>
                        </div>
                        {isSelected && <CheckIcon className="size-4 text-primary shrink-0 ml-2" />}
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

