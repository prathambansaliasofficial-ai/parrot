"use client";

/**
 * A form that posts to the acquisition action endpoint and, for destructive
 * actions, asks the administrator to confirm before submitting.
 */
export default function ConfirmForm({
  message,
  children,
  className,
}: {
  message?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <form
      method="post"
      action="/api/admin/acquisition/actions"
      className={className}
      onSubmit={(event) => {
        if (message && !window.confirm(message)) event.preventDefault();
      }}
    >
      {children}
    </form>
  );
}
