import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { Laptop2 } from "lucide-react";
import { useDeviceIdentity } from "../hooks/useDeviceIdentity";
import { DeviceCard } from "../components/DeviceCard";
import { EmptyState } from "../components/ui/EmptyState";
import { Modal } from "../components/ui/Modal";
import { Button } from "../components/ui/Button";
import { listPairedDevices, removePairedDevice, renameDevice, type PairedDeviceRecord } from "../storage/device";
import type { DeviceIdentity } from "@securetransfer/shared";

export function Devices() {
  const { t } = useTranslation();
  const device = useDeviceIdentity();
  const [thisDevice, setThisDevice] = useState<DeviceIdentity | null>(null);
  const [paired, setPaired] = useState<PairedDeviceRecord[]>([]);
  const [renaming, setRenaming] = useState(false);
  const [draftLabel, setDraftLabel] = useState("");

  useEffect(() => setThisDevice(device), [device]);
  useEffect(() => {
    void listPairedDevices().then(setPaired);
  }, []);

  const onRemove = async (id: string) => {
    await removePairedDevice(id);
    setPaired(await listPairedDevices());
  };

  const openRename = () => {
    setDraftLabel(thisDevice?.label ?? "");
    setRenaming(true);
  };

  const saveRename = async () => {
    const trimmed = draftLabel.trim();
    if (trimmed) setThisDevice(await renameDevice(trimmed));
    setRenaming(false);
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <div>
        <h1 className="text-xl font-bold text-ink">{t("devices.title")}</h1>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-ink">{t("devices.thisDevice")}</h2>
        {thisDevice && <DeviceCard label={thisDevice.label} deviceId={thisDevice.id} online onRename={openRename} />}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-ink">{t("devices.pairedDevices")}</h2>
        {paired.length === 0 ? (
          <EmptyState
            icon={<Laptop2 size={24} />}
            title={t("devices.noPairedDevices")}
            hint={t("devices.noPairedDevicesHint")}
          />
        ) : (
          <div className="flex flex-col gap-2">
            {paired.map((d) => (
              <DeviceCard key={d.id} label={d.label} deviceId={d.id} lastConnectedAt={d.lastConnectedAt} onRemove={() => void onRemove(d.id)} />
            ))}
          </div>
        )}
      </section>

      <Modal
        open={renaming}
        onClose={() => setRenaming(false)}
        title={t("devices.rename")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRenaming(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => void saveRename()}>{t("common.save")}</Button>
          </>
        }
      >
        <label htmlFor="device-label-input" className="mb-1.5 block text-xs font-medium text-ink-muted">
          {t("devices.thisDevice")}
        </label>
        <input
          id="device-label-input"
          type="text"
          value={draftLabel}
          onChange={(e) => setDraftLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void saveRename();
          }}
          maxLength={40}
          autoFocus
          className="focus-ring w-full rounded-md border-2 border-ink bg-surface px-3 py-2 text-sm font-medium text-ink"
        />
      </Modal>
    </div>
  );
}
