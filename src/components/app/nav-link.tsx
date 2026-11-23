"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// A menu link that gets its page ready only when the pointer or keyboard reaches it. Long menus (the sidebar, the
// mobile tools sheet) would otherwise ask the server for every page they show, on every page load.
export function NavLink({ href, onMouseEnter, onFocus, onTouchStart, ...props }: React.ComponentProps<typeof Link> & { href: string }) {
  const router = useRouter();
  const ready = React.useRef(false);
  const warm = () => {
    if (ready.current) return;
    ready.current = true;
    router.prefetch(href);
  };
  return (
    <Link
      href={href}
      prefetch={false}
      onMouseEnter={(e) => (warm(), onMouseEnter?.(e))}
      onFocus={(e) => (warm(), onFocus?.(e))}
      onTouchStart={(e) => (warm(), onTouchStart?.(e))}
      {...props}
    />
  );
}
