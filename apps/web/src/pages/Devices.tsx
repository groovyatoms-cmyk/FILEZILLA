import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { useDeviceIdentity } from "../hooks/useDeviceIdentity";
import { DeviceCard } from "../components/DeviceCard";
import { EmptyState } from "../components/ui/EmptyState";
import { Laptop2 } from "lucide-react";
import { listPairedDevices, removePairedDevice, type PairedDeviceRecord } from "../storage/device";

export function Devices() {
  const { t } = useTranslation();
  const device = useDeviceIdentity();
  const [paired, setPaired] = useState<PairedDeviceRecord[]>([]);

  useEffect(() => {
    void listPairedDevices().then(setPaired);
  }, []);

  const onRemove = async (id: string) => {
    await removePairedDevice(id);
    setPaired(await listPairedDevices());
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <section>
        <h2 className="mb-3 text-sm font-semibold text-ink">{t("devices.thisDevice")}</h2>
        {device && <DeviceCard label={device.label} deviceId={device.id} online />}
      </section>
      <section>
        <h2 className="mb-3 text-sm font-semibold text-ink">{t("devices.pairedDevices")}</h2>
        {paired.length === 0 ? (
          <EmptyState icon={<Laptop2 size={24} />} title={t("devices.pairedDevices")} hint={t("dashboard.noTransfersHint")} />
        ) : (
          <div className="flex flex-col gap-2">
            {paired.map((d) => (
              <DeviceCard key={d.id} label={d.label} deviceId={d.id} lastConnectedAt={d.lastConnectedAt} onRemove={() => void onRemove(d.id)} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
