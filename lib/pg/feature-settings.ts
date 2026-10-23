// The feature_settings table (migration 056): Settings -> Reminders &
// check-ins. Server only. Before the migration runs every setting is its
// default (lib/featureSettings.ts) and nothing can be saved.

import { getSql } from "@/lib/db";
import { DEFAULT_FEATURE_SETTINGS, FEATURE_SETTING_KEYS, readFeatureSetting, type FeatureSettingKey, type FeatureSettings } from "@/lib/featureSettings";

let readyCache = false;

export async function featureSettingsReady(): Promise<boolean> {
  if (readyCache) return true;
  try {
    const rows = (await getSql()`SELECT to_regclass('public.feature_settings') IS NOT NULL AS ok`) as { ok: boolean }[];
    readyCache = rows[0]?.ok === true;
  } catch {
    readyCache = false;
  }
  return readyCache;
}

export async function getFeatureSettings(): Promise<FeatureSettings> {
  const out = { ...DEFAULT_FEATURE_SETTINGS };
  if (!(await featureSettingsReady())) return out;
  const rows = (await getSql()`SELECT key, value FROM feature_settings`) as { key: string; value: unknown }[];
  for (const key of FEATURE_SETTING_KEYS) {
    const row = rows.find((entry) => entry.key === key);
    (out as Record<string, unknown>)[key] = readFeatureSetting(key, row?.value);
  }
  return out;
}

export async function getFeatureSetting<K extends FeatureSettingKey>(key: K): Promise<FeatureSettings[K]> {
  return (await getFeatureSettings())[key];
}

export async function saveFeatureSetting<K extends FeatureSettingKey>(key: K, value: unknown, by: string): Promise<FeatureSettings[K]> {
  if (!(await featureSettingsReady())) throw new Error("Settings can be saved once migration 056 is applied.");
  const clean = readFeatureSetting(key, value);
  await getSql()`
    INSERT INTO feature_settings (key, value, updated_by, updated_at) VALUES (${key}, ${JSON.stringify(clean)}::jsonb, ${by}, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()
  `;
  return clean;
}
