import { Building2, Home, Sparkles, Truck, type LucideIcon } from 'lucide-react';

import type { ServiceId } from '@/lib/types';

export const SERVICE_ICONS: Record<ServiceId, LucideIcon> = {
  'home-cleaning': Home,
  'deep-cleaning': Sparkles,
  'end-of-tenancy': Truck,
  'business-cleaning': Building2,
};
