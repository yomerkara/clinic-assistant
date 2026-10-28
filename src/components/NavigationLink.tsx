"use client";
import Link, { useLinkStatus } from "next/link";
import { createPortal } from "react-dom";
import type { ComponentProps } from "react";
import { PageLoading } from "./PageLoading";
function PendingOverlay() {
  const { pending } = useLinkStatus();
  return pending
    ? createPortal(<PageLoading title="Sayfa yükleniyor" />, document.body)
    : null;
}
export default function NavigationLink({
  children,
  ...props
}: ComponentProps<typeof Link>) {
  const pathname =
    typeof props.href === "string" ? props.href : (props.href.pathname ?? "");
  const overlay = /^\/(queue|settings)([/?#]|$)/.test(pathname);
  return (
    <Link {...props}>
      {children}
      {overlay && <PendingOverlay />}
    </Link>
  );
}
