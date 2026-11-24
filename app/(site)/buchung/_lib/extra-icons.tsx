// Maps the catalogue's Lucide icon names (kebab-case) to components.
// Explicit map (no dynamic import of all icons) keeps the bundle small.
import {
  AppWindow,
  Archive,
  Blinds,
  Brush,
  Coffee,
  CookingPot,
  DoorOpen,
  Layers,
  Microwave,
  PanelsTopLeft,
  Refrigerator,
  Shirt,
  Sparkles,
  Sun,
  Utensils,
  WashingMachine,
  type LucideIcon,
} from 'lucide-react';

const EXTRA_ICONS: Record<string, LucideIcon> = {
  refrigerator: Refrigerator,
  'cooking-pot': CookingPot,
  'app-window': AppWindow,
  'door-open': DoorOpen,
  archive: Archive,
  brush: Brush,
  blinds: Blinds,
  sun: Sun,
  'washing-machine': WashingMachine,
  shirt: Shirt,
  utensils: Utensils,
  'panels-top-left': PanelsTopLeft,
  microwave: Microwave,
  coffee: Coffee,
  layers: Layers,
};

export const extraIcon = (name: string | undefined): LucideIcon => (name && EXTRA_ICONS[name]) || Sparkles;
