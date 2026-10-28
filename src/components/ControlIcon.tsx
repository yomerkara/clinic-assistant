"use client";

import {
  ArrowRight,
  ArrowUpRight,
  CalendarBlank,
  CaretLeft,
  CaretRight,
  Plus,
  X,
} from "@phosphor-icons/react";

const icons = {
  calendar: CalendarBlank,
  next: CaretRight,
  previous: CaretLeft,
  arrow: ArrowRight,
  external: ArrowUpRight,
  plus: Plus,
  close: X,
};

/** Shared action icons: 20px, regular stroke, inherited button color. */
export function ControlIcon({ name }: { name: keyof typeof icons }) {
  const Icon = icons[name];
  return <Icon size={20} weight="regular" aria-hidden="true" className="control-icon" />;
}
