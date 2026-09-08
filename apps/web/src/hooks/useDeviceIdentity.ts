import { useEffect, useState } from "react";
import type { DeviceIdentity } from "@securetransfer/shared";
import { getOrCreateDeviceIdentity } from "../storage/device";

export function useDeviceIdentity(): DeviceIdentity | null {
  const [identity, setIdentity] = useState<DeviceIdentity | null>(null);
  useEffect(() => {
    void getOrCreateDeviceIdentity().then(setIdentity);
  }, []);
  return identity;
}
