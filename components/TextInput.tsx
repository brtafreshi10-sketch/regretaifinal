"use client";

export default function TextInput({
  value,
  setValue,
  placeholder,
  rows = 6,
  className = "",
  maxLength,
  onKeyDown,
}: {
  value: string;
  setValue: (v: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  maxLength?: number;
  onKeyDown?: React.KeyboardEventHandler<HTMLTextAreaElement>;
}) {
  return (
    <textarea
      className={className}
      placeholder={placeholder}
      value={value}
      rows={rows}
      maxLength={maxLength}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={onKeyDown}
    />
  );
}
