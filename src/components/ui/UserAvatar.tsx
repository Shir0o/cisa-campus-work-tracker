import { cn, getUserInitials } from "../../lib/utils";

/**
 * A person's avatar — their photo when they have one, otherwise a local
 * initials badge. Replaces the old remote dicebear fallback (which rendered a
 * broken image whenever it couldn't load).
 */
export function UserAvatar({
  name,
  photoURL,
  className,
}: {
  name?: string | null;
  photoURL?: string | null;
  className?: string;
}) {
  if (photoURL) {
    return (
      <img
        src={photoURL}
        alt={name || ""}
        referrerPolicy="no-referrer"
        className={cn("rounded-full object-cover shrink-0", className)}
      />
    );
  }
  return (
    <div
      className={cn(
        "rounded-full bg-primary-container text-on-primary-container font-semibold flex items-center justify-center shrink-0",
        className,
      )}
      title={name || undefined}
    >
      {getUserInitials(name)}
    </div>
  );
}
