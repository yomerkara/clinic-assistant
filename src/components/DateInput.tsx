"use client";

import type { InputHTMLAttributes } from "react";
import { ControlIcon } from "./ControlIcon";

/** Keep the native accessible picker, with one consistent visible calendar icon. */
export function DateInput({
  type = "date",
  className = "",
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  type?: "date" | "datetime-local";
}) {
  return (
    <span className={`date-control ${className}`}>
      <input {...props} type={type} />
      <ControlIcon name="calendar" />
    </span>
  );
}
