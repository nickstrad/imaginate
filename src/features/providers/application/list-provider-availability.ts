import { getProviderAvailabilityMap } from "@/platform/providers";

export async function listProviderAvailability() {
  return getProviderAvailabilityMap();
}
