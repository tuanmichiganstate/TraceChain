import { createContext, useContext, type ReactNode } from "react";
import type { TraceChainConfiguration } from "../../config/types";
import type { CryptographicRuntime } from "../../crypto/signatures/types";

interface ConfigurationContextValue {
  readonly configuration: TraceChainConfiguration;
  readonly configurationHash: string;
  readonly cryptographicRuntime: CryptographicRuntime | null;
}

const ConfigurationContext = createContext<ConfigurationContextValue | null>(null);

export function ConfigurationProvider({
  configuration,
  configurationHash,
  cryptographicRuntime = null,
  children,
}: Omit<ConfigurationContextValue, "cryptographicRuntime"> & {
  readonly cryptographicRuntime?: CryptographicRuntime | null;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <ConfigurationContext.Provider
      value={{ configuration, configurationHash, cryptographicRuntime }}
    >
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
