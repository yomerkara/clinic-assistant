"use client";

import { ControlIcon } from "./ControlIcon";

import {
  ArrowSquareOut,
  MagnifyingGlass,
  FunnelSimple,
  UploadSimple,
  ChartLineUp,
  ChatCircle,
  CheckSquare,
  GearSix,
  Users,
  CalendarBlank,
  Sparkle,
  ArrowLeft,
} from "@phosphor-icons/react";

export function AdminNavIcon({ name }: { name: string }) {
  const props = {
    className: "nav-icon",
    "aria-hidden": true,
    weight: "regular",
  } as const;
  if (name === "users") return <Users {...props} />;
  if (name === "calendar") return <CalendarBlank {...props} />;
  if (name === "check") return <CheckSquare {...props} />;
  if (name === "chat") return <ChatCircle {...props} />;
  if (name === "chart") return <ChartLineUp {...props} />;
  if (name === "spark") return <Sparkle {...props} />;
  return <GearSix {...props} />;
}

export function AdminLogoutIcon() {
  return <ArrowSquareOut aria-hidden="true" />;
}

export function SearchIcon() {
  return <MagnifyingGlass size={20} aria-hidden="true" />;
}
export function UploadIcon() {
  return <UploadSimple size={20} aria-hidden="true" />;
}

export function FilterIcon() {
  return <FunnelSimple size={20} weight="regular" aria-hidden="true" />;
}
export function CalendarViewIcon() {
  return <ControlIcon name="calendar" />;
}

export function ConversationIcon() {
  return <ChatCircle size={20} weight="regular" aria-hidden="true" />;
}

export function BackIcon() {
  return <ArrowLeft size={18} aria-hidden="true" />;
}
export function UsageTraceIcon() {
  return <ChartLineUp size={18} aria-hidden="true" />;
}
