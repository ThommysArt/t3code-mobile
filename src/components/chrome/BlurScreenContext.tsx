import { createContext, useContext } from "react";

export interface BlurScreenContextValue {
  readonly headerHeight: number;
}

const BlurScreenContext = createContext<BlurScreenContextValue | null>(null);

export function useBlurScreen(): BlurScreenContextValue {
  const context = useContext(BlurScreenContext);
  if (!context) {
    throw new Error("useBlurScreen must be used within BlurScreenRoot");
  }
  return context;
}

export function useOptionalBlurScreen(): BlurScreenContextValue | null {
  return useContext(BlurScreenContext);
}

export const BlurScreenProvider = BlurScreenContext.Provider;