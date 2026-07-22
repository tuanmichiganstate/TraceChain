/**
 * Typed metadata committed by an anchored document.
 *
 * This is deliberately a closed discriminated union. A shipping manifest can
 * declare a quantity; another document type cannot accidentally acquire that
 * field through an untyped property bag.
 */

import { DocumentType, type QuantityUnit } from "./enums";

export interface QuantityValue {
  readonly kind: "QUANTITY";
  readonly amount: number;
  readonly unit: QuantityUnit;
}

export interface ShippingManifestMetadata {
  readonly kind: DocumentType.SHIPPING_MANIFEST;
  readonly declaredQuantity: QuantityValue;
}

export interface QualityCertificateMetadata {
  readonly kind: DocumentType.QUALITY_CERTIFICATE;
}

export interface SensorDatasetMetadata {
  readonly kind: DocumentType.SENSOR_DATASET;
}

export interface LaboratoryReportMetadata {
  readonly kind: DocumentType.LABORATORY_REPORT;
}

export type DocumentMetadata =
  | ShippingManifestMetadata
  | QualityCertificateMetadata
  | SensorDatasetMetadata
  | LaboratoryReportMetadata;

