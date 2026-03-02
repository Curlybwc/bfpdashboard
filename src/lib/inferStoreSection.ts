const SECTION_KEYWORDS: Record<string, string[]> = {
  Paint: ['paint', 'primer', 'stain', 'brush', 'roller', 'tray', 'caulk', 'spackle', 'putty', 'tape blue', 'painters tape', 'drop cloth', 'sandpaper', 'sanding'],
  Electrical: ['wire', 'outlet', 'switch', 'breaker', 'conduit', 'junction', 'romex', 'electric', 'volt', 'amp', 'receptacle', 'dimmer', 'gfci', 'led', 'light fixture', 'bulb', 'lamp', 'chandelier', 'fan', 'ceiling fan'],
  Plumbing: ['pipe', 'plumb', 'faucet', 'valve', 'drain', 'toilet', 'sink', 'shower', 'bath', 'pvc', 'copper', 'fitting', 'elbow', 'tee', 'coupling', 'water heater', 'hose bib', 'shutoff', 'p-trap', 'wax ring'],
  HVAC: ['hvac', 'duct', 'furnace', 'air filter', 'thermostat', 'vent', 'register', 'refrigerant', 'a/c', 'air condition', 'heat pump', 'mini split'],
  Drywall: ['drywall', 'sheetrock', 'joint compound', 'mud', 'corner bead', 'drywall screw', 'drywall tape'],
  Lumber: ['lumber', 'plywood', 'osb', '2x4', '2x6', '2x8', '2x10', '2x12', '4x4', 'stud', 'joist', 'beam', 'board', 'cedar', 'pine', 'oak', 'maple', 'mdf', 'trim', 'molding', 'baseboard', 'crown', 'casing', 'shim'],
  Hardware: ['screw', 'nail', 'bolt', 'nut', 'washer', 'anchor', 'hinge', 'knob', 'handle', 'pull', 'latch', 'lock', 'deadbolt', 'bracket', 'clamp', 'hook', 'chain', 'rope', 'zip tie', 'adhesive', 'glue', 'epoxy', 'silicone'],
  Flooring: ['floor', 'tile', 'grout', 'mortar', 'thinset', 'underlayment', 'vinyl', 'laminate', 'hardwood', 'carpet', 'rug', 'transition strip', 'spacer'],
  Appliances: ['appliance', 'refrigerator', 'fridge', 'dishwasher', 'oven', 'range', 'stove', 'microwave', 'washer', 'dryer', 'garbage disposal', 'hood'],
  Cleaning: ['clean', 'broom', 'mop', 'bucket', 'trash bag', 'dumpster', 'shop vac', 'vacuum', 'bleach', 'degreaser'],
  Garden: ['garden', 'landscape', 'mulch', 'soil', 'gravel', 'stone', 'paver', 'concrete', 'cement', 'rebar', 'fence', 'post', 'gate', 'deck', 'stair', 'railing', 'sod', 'seed', 'irrigation', 'sprinkler'],
};

export const STORE_SECTIONS = [
  'Paint', 'Electrical', 'Plumbing', 'HVAC', 'Drywall', 'Lumber',
  'Hardware', 'Flooring', 'Appliances', 'Cleaning', 'Garden', 'Misc',
] as const;

export function inferStoreSection(name: string): string {
  const lower = name.toLowerCase();
  for (const [section, keywords] of Object.entries(SECTION_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) return section;
  }
  return 'Misc';
}
