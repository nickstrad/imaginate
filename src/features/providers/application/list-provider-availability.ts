import { getProviderAvailabilityMap } from "@/lib/providers";

export async function listProviderAvailability() {
  return getProviderAvailabilityMap();
}
