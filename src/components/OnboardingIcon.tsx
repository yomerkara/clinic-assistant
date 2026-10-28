"use client";

import {
  ArrowRight,
  CalendarBlank,
  ChartBar,
  CheckCircle,
  ChatsCircle,
  ClipboardText,
  Database,
  Tray,
  LinkSimple,
  PhoneCall,
  ShieldCheck,
} from "@phosphor-icons/react";

const icons = {
  arrow: ArrowRight,
  calendar: CalendarBlank,
  chart: ChartBar,
  check: CheckCircle,
  chat: ChatsCircle,
  clipboard: ClipboardText,
  database: Database,
  inbox: Tray,
  link: LinkSimple,
  phone: PhoneCall,
  shield: ShieldCheck,
} as const;

export function OnboardingIcon({ name, className }: { name: keyof typeof icons; className?: string }) {
  const Icon = icons[name];
  return <Icon className={className} aria-hidden="true" weight="regular" />;
}
