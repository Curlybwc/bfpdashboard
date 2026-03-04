const SECTION_KEYWORDS: Record<string, string[]> = {
  Paint: ['paint', 'primer', 'stain', 'brush', 'roller', 'tray', 'caulk', 'spackle', 'putty', 'tape blue', 'painters tape', 'drop cloth', 'sandpaper', 'sanding'],
  Electrical: ['wire', 'outlet', 'switch', 'breaker', 'conduit', 'junction', 'romex', 'electric', 'volt', 'amp', 'receptacle', 'dimmer', 'gfci', 'led', 'light fixture', 'bulb', 'lamp', 'chandelier', 'fan', 'ceiling fan'],
  Plumbing: ['pipe', 'plumb', 'faucet', 'valve', 'drain', 'toilet', 'sink', 'shower', 'bath', 'pvc', 'copper', 'fitting', 'elbow', 'tee', 'coupling', 'water heater', 'hose bib', 'shutoff', 'p-trap', 'wax ring'],
  HVAC: ['hvac', 'duct', 'furnace', 'air filter', 'thermostat', 'vent', 'register', 'refrigerant', 'a/c', 'air condition', 'heat pump', 'mini split'],
  Insulation: ['insulation', 'batt', 'foam board', 'spray foam', 'r-value', 'vapor barrier', 'house wrap', 'weather strip'],
  Drywall: ['drywall', 'sheetrock', 'joint compound', 'mud', 'corner bead', 'drywall screw', 'drywall tape'],
  Lumber: ['lumber', 'plywood', 'osb', '2x4', '2x6', '2x8', '2x10', '2x12', '4x4', 'stud', 'joist', 'beam', 'board', 'cedar', 'pine', 'oak', 'maple', 'mdf', 'shim'],
  'Trim & Millwork': ['trim', 'molding', 'baseboard', 'crown', 'casing', 'wainscot', 'chair rail', 'millwork', 'quarter round', 'shoe molding'],
  'Doors & Windows': ['door', 'window', 'jamb', 'threshold', 'weatherstrip', 'screen', 'sash', 'prehung', 'bifold', 'sliding door', 'storm door', 'window film'],
  Tile: ['tile', 'grout', 'thinset', 'mortar', 'spacer', 'bullnose', 'backsplash', 'mosaic'],
  'Cabinets & Counters': ['cabinet', 'counter', 'countertop', 'vanity', 'drawer slide', 'lazy susan', 'shelf'],
  Fasteners: ['screw', 'nail', 'bolt', 'nut', 'washer', 'anchor', 'staple', 'brad', 'lag bolt', 'toggle bolt', 'rivet'],
  Hardware: ['hinge', 'knob', 'handle', 'pull', 'latch', 'lock', 'deadbolt', 'bracket', 'clamp', 'hook', 'chain', 'rope', 'zip tie', 'adhesive', 'glue', 'epoxy', 'silicone'],
  Flooring: ['floor', 'underlayment', 'vinyl', 'laminate', 'hardwood', 'carpet', 'rug', 'transition strip'],
  Appliances: ['appliance', 'refrigerator', 'fridge', 'dishwasher', 'oven', 'range', 'stove', 'microwave', 'washer', 'dryer', 'garbage disposal', 'hood'],
  'Safety/PPE': ['safety', 'ppe', 'glove', 'goggle', 'respirator', 'ear plug', 'hard hat', 'dust mask', 'face shield', 'knee pad', 'first aid'],
  Cleaning: ['clean', 'broom', 'mop', 'bucket', 'trash bag', 'dumpster', 'shop vac', 'vacuum', 'bleach', 'degreaser'],
  'Concrete/Masonry': ['concrete', 'cement', 'rebar', 'masonry', 'mortar mix', 'cinder block', 'brick', 'stucco', 'paver'],
  'Siding & Exterior': ['siding', 'soffit', 'fascia', 'gutter', 'downspout', 'flashing', 'drip edge', 'shingle', 'roofing', 'exterior trim'],
  Garden: ['garden', 'landscape', 'mulch', 'soil', 'gravel', 'stone', 'fence', 'post', 'gate', 'deck', 'stair', 'railing', 'sod', 'seed', 'irrigation', 'sprinkler'],
};

export function inferStoreSection(name: string, activeSections?: string[]): string {
  const lower = name.toLowerCase();
  for (const [section, keywords] of Object.entries(SECTION_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) {
      // If activeSections provided, verify this section is active
      if (activeSections && !activeSections.includes(section)) return 'Misc';
      return section;
    }
  }
  return 'Misc';
}
