import type { ButtonHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

export function Btn({
  tone = "ghost",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "primary" | "ghost" | "danger" }) {
  const toneClass =
    tone === "primary"
      ? "border-transparent bg-accent text-accent-fg"
      : tone === "danger"
        ? "border-line bg-surface text-danger"
        : "border-line bg-surface text-ink";
  return (
    <button
      {...props}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-sm border px-4 text-base font-medium transition-opacity duration-150 enabled:active:opacity-80 disabled:cursor-not-allowed disabled:opacity-45 ${toneClass} ${className}`}
    />
  );
}

export function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-muted">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-sm border border-line bg-bg px-3 text-base text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      />
    </label>
  );
}

export function Area({
  label,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-muted">{label}</span>
      <textarea
        {...props}
        className={`min-h-24 w-full rounded-sm border border-line bg-bg px-3 py-2 text-base leading-normal text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${props.className ?? ""}`}
      />
    </label>
  );
}

export function Check({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex min-h-12 items-start gap-3 py-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 size-5 accent-accent"
      />
      <span className="text-base leading-normal">{label}</span>
    </label>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-lg border border-line bg-surface p-3 ${className}`}>{children}</section>;
}

export function Banner({ tone = "neutral", children }: { tone?: "neutral" | "warn" | "danger"; children: ReactNode }) {
  const toneClass =
    tone === "danger" ? "border-danger text-danger" : tone === "warn" ? "border-warn text-warn" : "border-line text-ink";
  return <p className={`rounded-sm border bg-bg px-3 py-3 text-sm leading-normal ${toneClass}`}>{children}</p>;
}
