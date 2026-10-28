"use client";

import {
  ArrowLeft,
  ArrowRight,
  CalendarBlank,
  CheckCircle,
  Circle,
  Clock,
  RadioButton,
  User,
} from "@phosphor-icons/react";

const icons = {
  back: ArrowLeft,
  arrow: ArrowRight,
  calendar: CalendarBlank,
  check: CheckCircle,
  circle: Circle,
  clock: Clock,
  radio: RadioButton,
  user: User,
} as const;

export function DetailIcon({ name, className }: { name: keyof typeof icons; className?: string }) {
  const Icon = icons[name];
  return <Icon className={className} aria-hidden="true" weight="regular" />;
}
