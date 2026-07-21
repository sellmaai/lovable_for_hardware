const { primitives, transforms, booleans, colors } = require('@jscad/modeling')

// Helper: cuboid with its corner at [0,0,0] (JSCAD cuboids are centered by default)
const cCuboid = (size) => transforms.translate(
  [size[0] / 2, size[1] / 2, size[2] / 2],
  primitives.cuboid({ size })
)

// Helper: cylinder sitting on a base z-level
const cCylinder = (height, radius, segments, baseZ) => transforms.translate(
  [0, 0, baseZ + height / 2],
  primitives.cylinder({ height, radius, segments })
)

// Coerce to number and enforce strictly positive
const num = (v, fallback = 0.01) => {
  const n = Number(v)
  return isNaN(n) ? fallback : Math.max(0.01, n)
}

const getParameterDefinitions = () => [
  { name: 'width', type: 'float', initial: 50, caption: 'Enclosure width (mm)' },
  { name: 'depth', type: 'float', initial: 30, caption: 'Enclosure depth (mm)' },
  { name: 'height', type: 'float', initial: 15, caption: 'Enclosure height (mm)' },
  { name: 'wallThickness', type: 'float', initial: 2, caption: 'Wall thickness (mm)' },
  { name: 'lidThickness', type: 'float', initial: 1.5, caption: 'Lid thickness (mm)' },
  { name: 'clearance', type: 'float', initial: 0.3, caption: 'Clearance between PCB and walls (mm)' },
  { name: 'dowelCountX', type: 'int', initial: 2, caption: 'Dowel count along width' },
  { name: 'dowelCountY', type: 'int', initial: 2, caption: 'Dowel count along depth' },
  { name: 'dowelDiameter', type: 'float', initial: 3, caption: 'Dowel diameter (mm)' },
  { name: 'dowelHoleClearance', type: 'float', initial: 0.1, caption: 'Dowel hole clearance (mm)' },
  { name: 'notchWidth', type: 'float', initial: 12, caption: 'Pry notch width (mm)' },
  { name: 'notchHeight', type: 'float', initial: 3, caption: 'Pry notch height (mm)' },
  { name: 'notchCount', type: 'int', initial: 2, caption: 'Pry notch count (1-4)' },
]

const main = (params = {}) => {
  // ---- Sanitize all inputs ------------------------------------------------
  const width = num(params.width, 50)
  const depth = num(params.depth, 30)
  const height = num(params.height, 15)
  const wallThickness = num(params.wallThickness, 2)
  const lidThickness = num(params.lidThickness, 1.5)
  const clearance = num(params.clearance, 0.3)
  const dowelCountX = Math.max(1, Math.floor(Number(params.dowelCountX) || 2))
  const dowelCountY = Math.max(1, Math.floor(Number(params.dowelCountY) || 2))
  const dowelDiameter = num(params.dowelDiameter, 3)
  const dowelHoleClearance = num(params.dowelHoleClearance, 0.1)
  const notchWidth = num(params.notchWidth, 12)
  const notchHeight = num(params.notchHeight, 3)
  const notchCount = Math.max(1, Math.min(4, Math.floor(Number(params.notchCount) || 2)))

  // ---- 1. Base enclosure ---------------------------------------------------
  const outerBox = cCuboid([width, depth, height])

  const innerSize = [
    num(width - 2 * wallThickness),
    num(depth - 2 * wallThickness),
    num(height - wallThickness)
  ]
  const innerBox = transforms.translate(
    [wallThickness, wallThickness, wallThickness],
    cCuboid(innerSize)
  )
  const baseShell = booleans.subtract(outerBox, innerBox)

  // ---- 2. Snap-fit dowels on base rim (edge-mounted) ----------------------
  const dowelXPositions = []
  if (dowelCountX === 1) {
    dowelXPositions.push(width / 2)
  } else {
    for (let i = 0; i < dowelCountX; i++) {
      const t = i / (dowelCountX - 1)
      dowelXPositions.push(wallThickness + t * (width - 2 * wallThickness))
    }
  }

  const dowelYPositions = []
  if (dowelCountY === 1) {
    dowelYPositions.push(depth / 2)
  } else {
    for (let i = 0; i < dowelCountY; i++) {
      const t = i / (dowelCountY - 1)
      dowelYPositions.push(wallThickness + t * (depth - 2 * wallThickness))
    }
  }

  const dowelRadius = dowelDiameter / 2
  const dowelZ = height
  const dowelH = lidThickness

  const dowels = []
  for (const x of dowelXPositions) {
    for (const y of dowelYPositions) {
      dowels.push(
        transforms.translate([x, y, 0], cCylinder(dowelH, dowelRadius, 32, dowelZ))
      )
    }
  }
  const baseWithDowels = booleans.union(baseShell, ...dowels)

  // ---- 3. Lid (flat with dowel holes and pry notches) ---------------------
  const lidSolid = transforms.translate(
    [0, 0, height],
    cCuboid([width, depth, lidThickness])
  )

  // Dowel holes: slightly larger diameter, punch through lid
  const holeRadius = (dowelDiameter + dowelHoleClearance) / 2
  const holeDepth = lidThickness + 0.2
  const holeZ = height - 0.1

  const holes = []
  for (const x of dowelXPositions) {
    for (const y of dowelYPositions) {
      holes.push(
        transforms.translate([x, y, 0], cCylinder(holeDepth, holeRadius, 32, holeZ))
      )
    }
  }

  // ---- 4. Display cutout (OLED) on lid ------------------------------------
  const oledW = 26.0   // visible width
  const oledH = 14.0   // visible height
  const oledX = (width - oledW) / 2
  const oledY = (depth - oledH) / 2
  const oledZ = height - 0.1
  const oledDepth = lidThickness + 0.2
  const oledCutout = transforms.translate(
    [oledX, oledY, oledZ],
    cCuboid([oledW, oledH, oledDepth])
  )
  holes.push(oledCutout)

  // ---- 5. USB cutout on lid (for ESP32) ----------------------------------
  const usbW = 13.5
  const usbH = 6.0
  const usbX = (width - usbW) / 2
  const usbY = depth - wallThickness + 0.1   // positioned at rear edge of lid
  const usbZ = height - lidThickness + 0.1
  const usbDepth = lidThickness + 0.2
  const usbCutout = transforms.translate(
    [usbX, usbY, usbZ],
    cCuboid([usbW, wallThickness + 0.2, usbH])
  )
  holes.push(usbCutout)

  // ---- 6. Sensor opening (temperature sensor) on lid --------------------
  const sensorW = 5.0
  const sensorH = 5.0
  const sensorX = width - sensorW - wallThickness - 1 // near right side
  const sensorY = depth / 2 - sensorH / 2
  const sensorZ = height - 0.1
  const sensorDepth = lidThickness + 0.2
  const sensorCutout = transforms.translate(
    [sensorX, sensorY, sensorZ],
    cCuboid([sensorW, sensorH, sensorDepth])
  )
  holes.push(sensorCutout)

  // ---- 7. Pry notches on base outer wall -----------------------------------
  const notches = []
  const notchH = num(params.notchHeight || 3)
  const notchZ = height - notchH
  const notchWallDepth = wallThickness + 0.2

  if (notchCount >= 1) {
    const frontNotch = cCuboid([notchWidth, notchWallDepth, notchH])
    notches.push(
      transforms.translate([(width - notchWidth) / 2, -0.1, notchZ], frontNotch)
    )
  }
  if (notchCount >= 2) {
    const backNotch = cCuboid([notchWidth, notchWallDepth, notchH])
    notches.push(
      transforms.translate([(width - notchWidth) / 2, depth - wallThickness + 0.1, notchZ], backNotch)
    )
  }
  if (notchCount >= 3) {
    const leftNotch = cCuboid([notchWallDepth, notchWidth, notchH])
    notches.push(
      transforms.translate([-0.1, (depth - notchWidth) / 2, notchZ], leftNotch)
    )
  }
  if (notchCount >= 4) {
    const rightNotch = cCuboid([notchWallDepth, notchWidth, notchH])
    notches.push(
      transforms.translate([width - wallThickness + 0.1, (depth - notchWidth) / 2, notchZ], rightNotch)
    )
  }

  // ---- Apply all cutouts --------------------------------------------------
  const baseWithNotches = booleans.subtract(baseWithDowels, ...notches)
  const lid = booleans.subtract(lidSolid, ...holes)

  const coloredBase = colors.colorize([0.8, 0.2, 0.2], baseWithNotches)
  const coloredLid = colors.colorize([0.2, 0.2, 0.8], lid)

  return [coloredBase, coloredLid]
}

module.exports = { main, getParameterDefinitions }
