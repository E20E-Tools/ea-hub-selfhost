import { useCallback, useRef, useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";

type Request = {
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel: string;
  dir?: "rtl" | "ltr";
};

/** Promise-based replacement for window.confirm, rendered as an accessible dialog. */
export function useConfirm(): [(request: Request) => Promise<boolean>, ReactNode] {
  const [request, setRequest] = useState<Request | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback(
    (next: Request) =>
      new Promise<boolean>((resolve) => {
        resolver.current = resolve;
        setRequest(next);
      }),
    [],
  );

  const settle = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setRequest(null);
  };

  const dialog = (
    <AlertDialog
      open={request !== null}
      onOpenChange={(open) => {
        if (!open) settle(false);
      }}
    >
      <AlertDialogContent dir={request?.dir}>
        <AlertDialogHeader>
          <AlertDialogTitle>{request?.title}</AlertDialogTitle>
          {request?.body ? (
            <AlertDialogDescription>{request.body}</AlertDialogDescription>
          ) : (
            <AlertDialogDescription className="sr-only">{request?.title}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel autoFocus onClick={() => settle(false)}>
            {request?.cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ variant: "destructive" })}
            onClick={() => settle(true)}
          >
            {request?.confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return [confirm, dialog];
}
