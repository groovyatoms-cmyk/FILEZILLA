import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CHUNK_SIZE_PRESETS } from "@securetransfer/shared";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Toggle } from "../components/ui/Toggle";
import { Button } from "../components/ui/Button";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { useSettings } from "../hooks/useSettings";
import { useTransferHistory } from "../hooks/useTransferHistory";
import { useTheme } from "../hooks/useTheme";
import { SUPPORTED_LANGUAGES, setLanguage, type LanguageCode } from "../i18n";
import { formatBytes, formatDuration } from "../utils/format";
import { useState } from "react";
import i18n from "../i18n";

function Row({ label, description, children }: { label: string; description?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div>
        <p className="text-sm font-medium text-ink">{label}</p>
        {description && <p className="text-xs text-ink-muted">{description}</p>}
      </div>
      {children}
    </div>
  );
}

function Select<T extends string | number>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <select
      value={String(value)}
      onChange={(e) => {
        const raw = e.target.value;
        const match = options.find((o) => String(o.value) === raw);
        if (match) onChange(match.value);
      }}
      className="focus-ring rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-ink"
    >
      {options.map((o) => (
        <option key={String(o.value)} value={String(o.value)}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Settings() {
  const { t } = useTranslation();
  const { settings, updateSettings } = useSettings();
  const { clear } = useTransferHistory();
  const { theme, setTheme } = useTheme();
  const [confirmClear, setConfirmClear] = useState(false);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-lg font-semibold text-ink">{t("settings.title")}</h1>

      <Card>
        <CardHeader className="text-sm font-semibold text-ink">{t("settings.transfer")}</CardHeader>
        <CardBody className="divide-y divide-border">
          <Row label={t("settings.autoStartTransfers")}>
            <Toggle checked={settings.autoStartTransfers} onChange={(v) => updateSettings({ autoStartTransfers: v })} label={t("settings.autoStartTransfers")} />
          </Row>
          <Row label={t("settings.chunkSize")}>
            <Select
              value={settings.chunkSize}
              onChange={(v) => updateSettings({ chunkSize: v })}
              options={CHUNK_SIZE_PRESETS.map((s) => ({ value: s, label: formatBytes(s) }))}
            />
          </Row>
          <Row label={t("settings.parallelChunks")}>
            <Select
              value={settings.parallelChunks}
              onChange={(v) => updateSettings({ parallelChunks: v })}
              options={[1, 2, 4, 8].map((n) => ({ value: n, label: String(n) }))}
            />
          </Row>
          <Row label={t("settings.bandwidthLimit")}>
            <Select
              value={settings.bandwidthLimitBytesPerSec ?? 0}
              onChange={(v) => updateSettings({ bandwidthLimitBytesPerSec: v === 0 ? null : v })}
              options={[
                { value: 0, label: "Unlimited" },
                { value: 5 * 1024 * 1024, label: `${formatBytes(5 * 1024 * 1024)}/s` },
                { value: 20 * 1024 * 1024, label: `${formatBytes(20 * 1024 * 1024)}/s` },
              ]}
            />
          </Row>
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="text-sm font-semibold text-ink">{t("settings.security")}</CardHeader>
        <CardBody className="divide-y divide-border">
          <Row label={t("settings.askBeforeReceiving")}>
            <Toggle checked={settings.askBeforeReceiving} onChange={(v) => updateSettings({ askBeforeReceiving: v })} label={t("settings.askBeforeReceiving")} />
          </Row>
          <Row label={t("settings.sessionExpiration")}>
            <Select
              value={settings.sessionTtlMs}
              onChange={(v) => updateSettings({ sessionTtlMs: v })}
              options={[5, 10, 15, 30].map((m) => ({ value: m * 60_000, label: formatDuration(m * 60) }))}
            />
          </Row>
          <Row label={t("settings.autoDeleteExpiredSessions")}>
            <Toggle
              checked={settings.autoDeleteExpiredSessions}
              onChange={(v) => updateSettings({ autoDeleteExpiredSessions: v })}
              label={t("settings.autoDeleteExpiredSessions")}
            />
          </Row>
          <Row label={t("settings.clearHistory")}>
            <Button variant="secondary" size="sm" onClick={() => setConfirmClear(true)}>
              {t("settings.clearHistory")}
            </Button>
          </Row>
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="text-sm font-semibold text-ink">{t("settings.network")}</CardHeader>
        <CardBody className="divide-y divide-border">
          <Row label={t("settings.preferDirectP2P")}>
            <Toggle checked={settings.preferDirectP2P} onChange={(v) => updateSettings({ preferDirectP2P: v })} label={t("settings.preferDirectP2P")} />
          </Row>
          <Row label={t("settings.allowTurnFallback")}>
            <Toggle checked={settings.allowTurnFallback} onChange={(v) => updateSettings({ allowTurnFallback: v })} label={t("settings.allowTurnFallback")} />
          </Row>
          <Row label={t("settings.connectionTimeout")}>
            <Select
              value={settings.connectionTimeoutMs}
              onChange={(v) => updateSettings({ connectionTimeoutMs: v })}
              options={[10, 20, 30, 60].map((s) => ({ value: s * 1000, label: formatDuration(s) }))}
            />
          </Row>
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="text-sm font-semibold text-ink">{t("settings.appearance")}</CardHeader>
        <CardBody className="divide-y divide-border">
          <Row label={t("settings.theme")}>
            <Select
              value={theme}
              onChange={setTheme}
              options={[
                { value: "light" as const, label: t("settings.themeLight") },
                { value: "dark" as const, label: t("settings.themeDark") },
                { value: "system" as const, label: t("settings.themeSystem") },
              ]}
            />
          </Row>
          <Row label={t("settings.language")}>
            <Select
              value={(i18n.language as LanguageCode) ?? "en"}
              onChange={(v: LanguageCode) => setLanguage(v)}
              options={SUPPORTED_LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
            />
          </Row>
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="text-sm font-semibold text-ink">{t("settings.privacy")}</CardHeader>
        <CardBody>
          <ul className="space-y-1.5 text-sm text-ink-muted">
            <li>✓ Files are encrypted on your device before they leave it.</li>
            <li>✓ Encryption keys stay on the two participating devices.</li>
            <li>✓ The signaling server only ever sees connection metadata — never file contents, names, or keys.</li>
            <li>✓ File transfer uses authenticated encryption (AES-256-GCM).</li>
            <li>✓ The connection is peer-to-peer where network conditions allow.</li>
            <li>✓ Integrity is verified after every transfer.</li>
            <li>✓ Pairing sessions expire automatically.</li>
          </ul>
        </CardBody>
      </Card>

      <ConfirmDialog
        open={confirmClear}
        title={t("settings.clearHistory")}
        message="This removes your local transfer history. It does not affect files already saved to disk."
        destructive
        onConfirm={() => {
          void clear();
          setConfirmClear(false);
        }}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  );
}
