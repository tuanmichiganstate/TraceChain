# TraceChain staff portrait asset briefs

## Asset policy

All seven portraits are original AI-generated fictional subjects created for
TraceChain on 26 July 2026. They do not imitate or depict a named real person,
contain no company logo, and are approved for this educational repository under
`TRACECHAIN_PRODUCT_OWNER_IMPLEMENTATION_2026-07-26`.

Runtime derivatives are 480 × 600 WebP files with a consistent documentary
editorial treatment: Vietnamese supply-chain professionals, natural
expressions, restrained work environments, realistic clothing, chest-up
portrait crop, soft available light, and uncluttered backgrounds. Private-key
material, cryptographic symbols, stereotypes, uniforms implying public
authority, and exaggerated industrial grime are excluded.

## Runtime placement

Portraits provide role, organizational, evidentiary, or narrative context.
They are deliberately limited to consequential points where professional
identity matters:

- Stage 2: farm production manager;
- Stage 3: certification officer;
- Stage 4: producer-to-logistics custody handoff;
- Stage 5: receiving manager and the clerk who prepared the manifest;
- Stage 9: retailer context and the regulator after the authored handoff;
- hosted learner runs: the role reconstructed from the exact scenario version;
- instructor replay: the historical professional identity at the replayed
  node.

Orientation, routine knowledge checks, ledger rows, generic report tables,
final causal reports, instructor lists, and administration screens do not use
portraits. The final report is not a staff gallery.

## Model and trust boundary

`ScenarioStaffProfile` links a fictional person to an existing actor, role,
organization, optional location, localized text, and one approved portrait
asset. `ScenarioPortraitAsset` records source type, approval reference,
fictional status, local path, SHA-256, dimensions, format, and placeholder
status. Evidence attribution is a separate scenario relationship.

The visible human profile never supplies trusted command metadata. The
orchestrator derives actor, organization, and role from the scenario's active
trusted context. Signature validity, key identity, authorization, and
endorsement remain in the cryptographic evidence components. A portrait is
not proof of any of them.

## Runtime, packaging, and accessibility

Portraits live under `media/staff/` and are copied into the offline build.
`media-manifest.json` binds a selected scenario to the exact portrait paths and
digests. Packaging and verification enforce safe local paths, approved
fictional sources, exact file presence and SHA-256, WebP encoding, intrinsic
dimensions, staff-to-asset references, evidence-to-staff references, and
bilingual localization keys.

Portraits are scenario runtime content rather than static application assets.
Guided and Challenge packages can therefore carry different versioned media
while sharing identical JavaScript and CSS.

Adjacent text provides each person's name, role, organization, and relevant
responsibility. Images are decorative in that context and use empty alternative
text to avoid duplicate announcements. Intrinsic dimensions reserve layout
space. At narrow widths, cards and handoffs stack without hiding controls. A
missing runtime image falls back to an initials tile while preserving the full
textual identity; package verification treats a missing source asset as a
failure.

| Staff profile | Runtime asset | SHA-256 |
|---|---|---|
| Nguyễn Thị Mai — Farm Production Manager | `media/staff/producer-manager.webp` | `e12d002f111b56d9f8209db549c8fd58bc183e4f68f8478b182cbff3a853f616` |
| Trần Minh Anh — Certification Officer | `media/staff/certification-officer.webp` | `96d744a37b95d82cceb9a6f58399b3a64a3cf7a740621829b7c81bb7bf4c5d11` |
| Phạm Quốc Huy — Logistics Coordinator | `media/staff/logistics-coordinator.webp` | `3863c4f85ced3fee1916ee145ce6f817d30fc9a36ff62f58d18f576d3ad2a95c` |
| Lê Thu Hà — Processing-plant Receiving Manager | `media/staff/processing-manager.webp` | `d83c3d90d5268c9d985428faeb5fac8be610e15f900801e7d800d5d5024b985f` |
| Bùi Gia Linh — Shipping Clerk | `media/staff/shipping-clerk.webp` | `f51510f254decd6ff1fb03844300238b6942e4381f21ae53dd97dc4977af2fc5` |
| Võ Thanh Nam — Retail Operations Manager | `media/staff/retail-manager.webp` | `12aa24499b1b73d608d93f4e527d7f4748e85ab85b02dc634b863daa35f10fae` |
| Đặng Ngọc Lan — Regulatory Recall Officer | `media/staff/regulatory-auditor.webp` | `25a7526bb2258722e7a6febed2a03f2397346ff71a3a5fe260badeda6a1ea4c5` |

## Individual visual briefs

### Nguyễn Thị Mai

- Context: coffee cooperative office beside a highland farm.
- Presence: calm, practical, accountable for accurate lot registration.
- Wardrobe: modest field-office clothing, no branded uniform.
- Background cues: subtle coffee plants and registration workspace.
- Avoid: romanticized farm imagery, ceremonial costume, ledger or blockchain
  symbols.

### Trần Minh Anh

- Context: independent agricultural certification office.
- Presence: attentive evidence reviewer, neutral rather than authoritative.
- Wardrobe: professional office clothing.
- Background cues: restrained document-review setting.
- Avoid: implying government office, visible certificate text, seals, or
  company marks.

### Phạm Quốc Huy

- Context: clean warehouse and dispatch area.
- Presence: alert coordinator responsible for custody acceptance and transport.
- Wardrobe: practical logistics clothing with a plain safety vest.
- Background cues: softly blurred shelving and pallets.
- Avoid: action pose, machinery danger, branded courier styling.

### Lê Thu Hà

- Context: coffee-processing receiving area.
- Presence: analytical receiving manager investigating physical-record
  discrepancies.
- Wardrobe: clean plant-appropriate professional clothing.
- Background cues: scales or processing equipment kept secondary.
- Avoid: laboratory scientist stereotype, distressed factory environment.

### Bùi Gia Linh

- Context: producer dispatch office.
- Presence: focused shipping clerk associated with the authored manifest.
- Wardrobe: practical clerical workwear.
- Background cues: orderly dispatch desk and neutral document folders.
- Avoid: legible fake records, blame-oriented expression, posed clipboard
  stereotype.

### Võ Thanh Nam

- Context: retail stockroom.
- Presence: operations manager who discovers or holds affected product and
  assembles recall evidence.
- Wardrobe: understated retail-professional clothing.
- Background cues: organized cartons without consumer branding.
- Avoid: sales pose, storefront advertising, celebratory expression.

### Đặng Ngọc Lan

- Context: regulatory incident-response office.
- Presence: composed recall officer reviewing scope and authorizing action.
- Wardrobe: formal but non-militarized professional clothing.
- Background cues: neutral incident-response workspace.
- Avoid: police, judge, government seal, punitive pose, or claims of real
  institutional identity.

## Replacement checklist

Before replacing any asset:

1. Confirm fictional subject and approved source.
2. Confirm the person remains consistent with the authored professional role.
3. Produce a local WebP of at least 320 × 400 pixels.
4. Record dimensions, exact SHA-256, and approval reference.
5. Update both the pack portrait registry and runtime scenario asset registry.
6. Update the scenario and pack versions.
7. Run locale, scenario, package, offline, accessibility, and browser checks.
8. Review the benchmark screenshots before release.
