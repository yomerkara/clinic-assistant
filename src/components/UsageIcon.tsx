"use client";

import {
  CalendarBlank,
  Coins,
  GearSix,
  Info,
  PhoneCall,
  Tag,
} from "@phosphor-icons/react";

type UsageIconName = "calendar" | "calls" | "cost" | "info" | "settings" | "tokens";

export function UsageIcon({ name }: { name: UsageIconName }) {
  const props = { "aria-hidden": true, weight: "regular", size: 24 } as const;

  if (name === "calendar") return <CalendarBlank {...props} />;
  if (name === "calls") return <PhoneCall {...props} />;
  if (name === "cost") return <Tag {...props} />;
  if (name === "info") return <Info {...props} />;
  if (name === "settings") return <GearSix {...props} />;
  return <Coins {...props} />;
}
