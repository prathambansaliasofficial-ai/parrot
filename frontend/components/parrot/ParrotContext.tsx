"use client";

import { createContext, useContext } from "react";

export interface ParrotResourceContext {
  resourceId: string;
  title: string;
  subject?: string;
  category?: string;
  focusTopic?: string;
}

export interface ParrotState {
  /** Resource the student has open, or null on pages without a resource. */
  resource: ParrotResourceContext | null;
  /** Whether the floating panel is currently open. */
  isOpen: boolean;
  /** Open the panel, optionally binding a resource as study context. */
  openWith: (resource: ParrotResourceContext | null) => void;
  close: () => void;
}

export const ParrotContext = createContext<ParrotState>({
  resource: null,
  isOpen: false,
  openWith: () => {},
  close: () => {},
});

export function useParrot(): ParrotState {
  return useContext(ParrotContext);
}
