import { createContext, useContext, type ReactNode } from "react";
import type { TraceChainConfiguration } from "../../config/types";

interface ConfigurationContextValue {
  readonly configuration: TraceChainConfiguration;
  readonly configurationHash: string;
}

const ConfigurationContext = createContext<ConfigurationContextValue | null>(null);

export function ConfigurationProvider({
  configuration,
  configurationHash,
  children,
}: ConfigurationContextValue & { readonly children: ReactNode }): ReactNode {
  return (
    <ConfigurationContext.Provider value={{ configuration, configurationHash }}>
      {children}
    </ConfigurationContext.Provider>
  );
}

export function useConfiguration(): ConfigurationContextValue {
  const value = useContext(ConfigurationContext);
  if (value === null) {
    throw new Error("useConfiguration must be used inside ConfigurationProvider");
  }
  return value;
}

/** Development and isolated-component tests may use the documented preset. */
export function useOptionalConfiguration(): ConfigurationContextValue | null {
  return useContext(ConfigurationContext);
}
