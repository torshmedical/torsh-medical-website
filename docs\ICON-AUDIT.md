# Icon audit — TORSH v3.0

## Library-level changes

The full library was reviewed for meaning, consistency, small-size recognition and canvas boundaries. There are now **23 brand icons and 10 interface icons**. Thirteen existing geometries were redrawn or refined; three new brand icons support the rewritten research narrative. Remaining brand icons received the shared 2.2-unit primary stroke while keeping their geometry.

| Icon | Finding | Revision |
|---|---|---|
| Endoscopy | Equal blue dots did not distinguish the optical face; shaft detail was awkward. | Differentiated face details and a simpler continuous shaft silhouette. |
| Access & suction | Flow lines made the original resemble an open tube; suction connection was unclear. | Defined sheath/hub, a separate side connection and a restrained directional accent. |
| Stone retrieval | The basket had an unnecessary protruding extension beyond the distal tip. | Removed the distal extension; simplified the basket wires and retained one proximal shaft. |
| Guidewires | The loop looked doubled and joined rather than like one continuous open wire. | One continuous curve with a distinct blue tip and an open inner end. |
| Ureteral stents | Original curves extended close to/outside the nominal canvas; the two curls were optically unbalanced. | Rebuilt a two-curl, continuous tubular silhouette wholly inside the viewBox, with restrained marker accents. |
| Biomaterial innovation | Three chemical-ring shapes suggested a specific molecular structure without establishing one. | Replaced by a schematic connected material network with a blue central node. Solid outer nodes eliminate clutter at crossings. |
| Research & development | Ray detail approached the top edge and duplicated strokes. | Simplified bulb and rays; retained one blue filament. |
| Quality review | Heavy checkmark and broad label could read as a certification assertion. | Rebalanced the shape, renamed the internal asset and removed it from evidence claims. |
| Packaging | Thick tape overlapped box edges. | Reduced accent weight and aligned the tape to the box geometry. |
| Partnerships | Finger detail was crowded at small size. | Simplified handshake outline, joins and contrasting cuffs. |
| Distribution partnerships | The pin's white hole was hard-coded for a light surface; usage could imply worldwide operations. | Transparent cutout and revised label; used only for prospective distribution enquiries. |
| Device engineering | Gear teeth and centre were asymmetric. | Rebuilt a regular eight-tooth gear with a centred opening. |
| Progress | Original chart could be interpreted as a measured clinical-outcome claim. | Simplified geometry and retained only as an internal illustrative asset. Removed from the public value strip. |
| Evidence & testing — new | No distinct asset represented evaluation/testing. | Added document-and-magnifier icon for the evidence theme. |
| Controlled delivery — new | Research workflow needed its own delivery symbol. | Added catheter-like delivery pathway and a restrained droplet. |
| Gel formation & capture — new | Molecular/network icon did not explain fragment capture. | Added a soft gel boundary containing schematic fragments. |

## Implementation

All public instances, standalone SVG exports, the optional sprite and the internal gallery are generated from `assets/icons/manifest.json`. The master stylesheet supplies colours, sizes and dark-surface variants; icons are not independent raster crops.

Inline icons are hidden from assistive technology where visible labels already explain them. Navigation and search controls have explicit accessible names. No icon supplies evidence of approval, safety, clinical benefit or exact device dimensions.

## Checks

The browser QA records geometric viewBox bounds for all 33 definitions. The internal guide renders key product/research icons at 24, 32, 48 and 64 px and on a dark surface. Those renders, the main product cards and large page-level icons were reviewed visually. These are schematic design checks, not verification against production device drawings.
