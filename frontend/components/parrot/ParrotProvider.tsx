"use client";

import { useCallback, useMemo, useState } from "react";
import { ParrotContext, type ParrotResourceContext } from "./ParrotContext";

export default function ParrotProvider({ children }: { children: React.ReactNode }) {
  const [resource, setResource] = useState<ParrotResourceContext | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const openWith = useCallback((next: ParrotResourceContext | null) => {
    setResource(next);
    setIsOpen(true);
  }, []);
  const close = useCallback(() => setIsOpen(false), []);

  const value = useMemo(() => ({ resource, isOpen, openWith, close }), [resource, isOpen, openWith, close]);

  return <ParrotContext.Provider value={value}>{children}</ParrotContext.Provider>;
}
