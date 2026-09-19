const PALETTE = [
  "#16a34a",
  "#2563eb",
  "#4f46e5",
  "#7c3aed",
  "#dc2626",
  "#ea580c",
  "#ca8a04",
];

type Avatar =
  | { kind: "default"; colorIndex: number }
  | { kind: "upload"; url: string | null };

export function BotAvatar({
  avatar,
  name,
  size = "medium",
}: {
  avatar: Avatar;
  name: string;
  size?: "small" | "medium" | "large";
}) {
  if (avatar.kind === "upload" && avatar.url) {
    return (
      <Image
        alt={`${name} avatar`}
        className={`bot-avatar bot-avatar-${size}`}
        height={66}
        src={avatar.url}
        unoptimized
        width={66}
      />
    );
  }

  const colorIndex = avatar.kind === "default" ? avatar.colorIndex : 0;
  const background = PALETTE[colorIndex % PALETTE.length];
  return (
    <span
      aria-label={`${name} avatar`}
      className={`bot-avatar bot-avatar-${size}`}
      role="img"
      style={{ background }}
    >
      <svg aria-hidden="true" viewBox="0 0 48 48">
        <path
          d="M24 8v5m-11 5h22a5 5 0 0 1 5 5v13a5 5 0 0 1-5 5H13a5 5 0 0 1-5-5V23a5 5 0 0 1 5-5Zm-5 8H4m40 0h-4"
          fill="none"
          stroke="white"
          strokeLinecap="round"
          strokeWidth="4"
        />
        <circle cx="17" cy="29" fill={background} r="3" />
        <circle cx="31" cy="29" fill={background} r="3" />
        <path d="M18 36h12" stroke="white" strokeLinecap="round" strokeWidth="3" />
      </svg>
    </span>
  );
}
import Image from "next/image";
