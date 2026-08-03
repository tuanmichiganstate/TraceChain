import { createContext, useContext, type ReactNode } from "react";
import {
  isBusinessSimulationConfiguration,
  type BusinessSimulationConfiguration,
  type SimuLedgerConfiguration,
} from "../../config/types";
import type { CryptographicRuntime } from "../../crypto/signatures/types";
import type { ScenarioVariantBank } from "../../domain/scenario/variant-bank";

interface ConfigurationContextValue {
  readonly configuration: SimuLedgerConfiguration;
  readonly configurationHash: string;
  readonly cryptographicRuntime: CryptographicRuntime | null;
  readonly variantBank: ScenarioVariantBank | null;
}

type BusinessConfigurationContextValue =
  ConfigurationContextValue & {
    readonly configuration: BusinessSimulationConfiguration;
  };

const ConfigurationContext = createContext<ConfigurationContextValue | null>(null);

export function ConfigurationProvider({
  configuration,
  configurationHash,
  cryptographicRuntime = null,
  variantBank = null,
  children,
}: Omit<
  ConfigurationContextValue,
  "cryptographicRuntime" | "variantBank"
> & {
  readonly cryptographicRuntime?: CryptographicRuntime | null;
  readonly variantBank?: ScenarioVariantBank | null;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <ConfigurationContext.Provider
      value={{
        configuration,
        configurationHash,
        cryptographicRuntime,
        variantBank,
      }}
    >
      {children}
    </ConfigurationContext.Provider>
  );
}

export function useConfiguration(): BusinessConfigurationContextValue {
  const value = useContext(ConfigurationContext);
  if (value === null) {
    throw new Error("useConfiguration must be used inside ConfigurationProvider");
  }
  if (!isBusinessSimulationConfiguration(value.configuration)) {
    throw new Error(
      "The business simulation cannot consume a technical-laboratory configuration",
    );
  }
  return value as BusinessConfigurationContextValue;
}

/** Development and isolated-component tests may use the documented preset. */
export function useOptionalConfiguration():
  | BusinessConfigurationContextValue
  | null {
  const value = useContext(ConfigurationContext);
  return value !== null &&
    isBusinessSimulationConfiguration(value.configuration)
    ? (value as BusinessConfigurationContextValue)
    : null;
}

/** Top-level runtime dispatch may inspect either configuration variant. */
export function useSimuLedgerConfiguration(): ConfigurationContextValue {
  const value = useContext(ConfigurationContext);
  if (value === null) {
    throw new Error(
      "useSimuLedgerConfiguration must be used inside ConfigurationProvider",
    );
  }
  return value;
}
