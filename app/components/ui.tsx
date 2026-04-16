import type { ComponentPropsWithoutRef, ReactNode } from "react";

/**
 * Small UI primitives. Kept deliberately tiny — no shadcn, no class
 * variants, no runtime theming. Just enough to keep route components
 * readable without reinventing the same input+label pattern every time.
 */

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ComponentPropsWithoutRef<"button"> & {
  variant?: "primary" | "secondary" | "danger";
}) {
  const base =
    "inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50";
  const styles = {
    primary: "bg-neutral-900 text-white hover:bg-neutral-800",
    secondary:
      "border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-50",
    danger: "bg-red-600 text-white hover:bg-red-700",
  }[variant];
  return <button className={`${base} ${styles} ${className}`} {...props} />;
}

export function LinkButton({
  variant = "primary",
  className = "",
  ...props
}: ComponentPropsWithoutRef<"a"> & {
  variant?: "primary" | "secondary" | "danger";
}) {
  const base =
    "inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium transition";
  const styles = {
    primary: "bg-neutral-900 text-white hover:bg-neutral-800",
    secondary:
      "border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-50",
    danger: "bg-red-600 text-white hover:bg-red-700",
  }[variant];
  return <a className={`${base} ${styles} ${className}`} {...props} />;
}

export function Field({
  label,
  hint,
  error,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-sm font-medium text-neutral-800">
        {label}
      </span>
      {children}
      {hint && !error && (
        <span className="mt-1 block text-xs text-neutral-500">{hint}</span>
      )}
      {error && (
        <span className="mt-1 block text-xs text-red-600">{error}</span>
      )}
    </label>
  );
}

const inputClass =
  "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500";

export function Input({
  className = "",
  ...props
}: ComponentPropsWithoutRef<"input">) {
  return <input className={`${inputClass} ${className}`} {...props} />;
}

export function Textarea({
  className = "",
  ...props
}: ComponentPropsWithoutRef<"textarea">) {
  return <textarea className={`${inputClass} ${className}`} {...props} />;
}

export function Select({
  className = "",
  ...props
}: ComponentPropsWithoutRef<"select">) {
  return <select className={`${inputClass} ${className}`} {...props} />;
}

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "green" | "amber" | "red" | "blue";
  children: ReactNode;
}) {
  const styles = {
    neutral: "bg-neutral-100 text-neutral-700",
    green: "bg-green-100 text-green-800",
    amber: "bg-amber-100 text-amber-800",
    red: "bg-red-100 text-red-800",
    blue: "bg-blue-100 text-blue-800",
  }[tone];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles}`}
    >
      {children}
    </span>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && (
          <p className="mt-1 text-sm text-neutral-600">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </div>
  );
}
