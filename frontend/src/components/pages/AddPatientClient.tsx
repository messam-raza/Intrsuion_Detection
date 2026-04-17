"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type FormState = {
  patientId: string;
  fullName: string;
  dateOfBirth: string;
  sex: string;
  bloodType: string;
  weightKg: string;
  heightCm: string;
  primaryDiagnosis: string;
  medicalHistory: string;
  deviceId: string;
  hardwareId: string;
  deviceType: string;
  connectivity: string;
};

const INITIAL: FormState = {
  patientId: "",
  fullName: "",
  dateOfBirth: "",
  sex: "",
  bloodType: "",
  weightKg: "",
  heightCm: "",
  primaryDiagnosis: "",
  medicalHistory: "",
  deviceId: "",
  hardwareId: "",
  deviceType: "pulse_ox",
  connectivity: "wifi",
};

export default function AddPatientClient() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pairDevice, setPairDevice] = useState(true);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.patientId.trim() || !form.fullName.trim()) {
      setError("Patient ID and Full Name are required.");
      return;
    }
    if (pairDevice && (!form.deviceId.trim() || !form.hardwareId.trim())) {
      setError("Device ID and Hardware ID are required when pairing a device.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        patientId: form.patientId.trim(),
        fullName: form.fullName.trim(),
        dateOfBirth: form.dateOfBirth || undefined,
        sex: form.sex || undefined,
        bloodType: form.bloodType || undefined,
        weightKg: form.weightKg ? Number(form.weightKg) : undefined,
        heightCm: form.heightCm ? Number(form.heightCm) : undefined,
        primaryDiagnosis: form.primaryDiagnosis || undefined,
        medicalHistory: form.medicalHistory || undefined,
        ...(pairDevice && {
          device: {
            deviceId: form.deviceId.trim(),
            hardwareId: form.hardwareId.trim(),
            deviceType: form.deviceType,
            connectivity: form.connectivity,
          },
        }),
      };

      const res = await fetch("/api/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed: ${res.status}`);
      }

      router.push(`/patients/${encodeURIComponent(form.patientId.trim())}`);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="pt-8 px-8 pb-16 max-w-5xl mx-auto">
      <div className="mb-8">
        <h2 className="text-[2rem] font-bold text-on-surface tracking-tight leading-tight">
          Register New Patient
        </h2>
        <p className="text-sm font-medium text-secondary mt-1">
          Provision medical record and optionally pair a sentinel device.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="p-4 rounded-lg bg-error-container/30 border border-error/20 text-error text-sm">
            {error}
          </div>
        )}

        <section className="bg-surface-container-lowest rounded-xl p-6 ghost-border ambient-shadow">
          <h3 className="text-xs font-bold uppercase tracking-wider text-secondary mb-5 flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px]">
              contact_page
            </span>
            Patient Demographics
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field label="Patient ID" required>
              <input
                type="text"
                value={form.patientId}
                onChange={(e) => update("patientId", e.target.value)}
                placeholder="e.g. #PT-00815"
                className="form-input"
              />
            </Field>
            <Field label="Full Name" required>
              <input
                type="text"
                value={form.fullName}
                onChange={(e) => update("fullName", e.target.value)}
                placeholder="e.g. Jane Doe"
                className="form-input"
              />
            </Field>
            <Field label="Date of Birth">
              <input
                type="date"
                value={form.dateOfBirth}
                onChange={(e) => update("dateOfBirth", e.target.value)}
                className="form-input"
              />
            </Field>
            <Field label="Sex">
              <select
                value={form.sex}
                onChange={(e) => update("sex", e.target.value)}
                className="form-input"
              >
                <option value="">—</option>
                <option value="Female">Female</option>
                <option value="Male">Male</option>
                <option value="Other">Other</option>
              </select>
            </Field>
            <Field label="Blood Type">
              <select
                value={form.bloodType}
                onChange={(e) => update("bloodType", e.target.value)}
                className="form-input"
              >
                <option value="">—</option>
                {["A+", "O+", "B+", "AB+", "A-", "O-", "B-", "AB-"].map(
                  (b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ),
                )}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Weight (kg)">
                <input
                  type="number"
                  step="0.1"
                  value={form.weightKg}
                  onChange={(e) => update("weightKg", e.target.value)}
                  placeholder="e.g. 72"
                  className="form-input"
                />
              </Field>
              <Field label="Height (cm)">
                <input
                  type="number"
                  value={form.heightCm}
                  onChange={(e) => update("heightCm", e.target.value)}
                  placeholder="e.g. 168"
                  className="form-input"
                />
              </Field>
            </div>
          </div>
        </section>

        <section className="bg-surface-container-lowest rounded-xl p-6 ghost-border ambient-shadow">
          <h3 className="text-xs font-bold uppercase tracking-wider text-secondary mb-5 flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px]">
              stethoscope
            </span>
            Clinical Context
          </h3>
          <div className="space-y-5">
            <Field label="Primary Diagnosis">
              <input
                type="text"
                value={form.primaryDiagnosis}
                onChange={(e) => update("primaryDiagnosis", e.target.value)}
                placeholder="e.g. Hypertensive Cardiomyopathy"
                className="form-input"
              />
            </Field>
            <Field label="Medical History / Notes">
              <textarea
                value={form.medicalHistory}
                onChange={(e) => update("medicalHistory", e.target.value)}
                rows={4}
                placeholder="Surgical history, allergies, chronic conditions, prior incidents…"
                className="form-input resize-y"
              />
            </Field>
          </div>
        </section>

        <section className="bg-surface-container-lowest rounded-xl p-6 ghost-border ambient-shadow">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-secondary flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]">
                sensors
              </span>
              Pair Sentinel Device
            </h3>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={pairDevice}
                onChange={(e) => setPairDevice(e.target.checked)}
                className="accent-primary w-4 h-4"
              />
              <span className="text-sm text-on-surface">
                Register a device for this patient
              </span>
            </label>
          </div>

          <fieldset
            disabled={!pairDevice}
            className={
              pairDevice ? "" : "opacity-40 pointer-events-none select-none"
            }
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Field label="Device ID" required={pairDevice}>
                <input
                  type="text"
                  value={form.deviceId}
                  onChange={(e) => update("deviceId", e.target.value)}
                  placeholder="e.g. sim-001"
                  className="form-input"
                />
              </Field>
              <Field label="Hardware / MAC ID" required={pairDevice}>
                <input
                  type="text"
                  value={form.hardwareId}
                  onChange={(e) => update("hardwareId", e.target.value)}
                  placeholder="e.g. AA:BB:CC:DD:EE:FF"
                  className="form-input"
                />
              </Field>
              <Field label="Device Type">
                <select
                  value={form.deviceType}
                  onChange={(e) => update("deviceType", e.target.value)}
                  className="form-input"
                >
                  <option value="pulse_ox">Pulse Oximeter</option>
                  <option value="ecg">ECG Monitor</option>
                  <option value="bp">Blood Pressure Cuff</option>
                  <option value="glucose">CGM Sensor</option>
                  <option value="other">Other</option>
                </select>
              </Field>
              <Field label="Connectivity">
                <select
                  value={form.connectivity}
                  onChange={(e) => update("connectivity", e.target.value)}
                  className="form-input"
                >
                  <option value="wifi">Wi-Fi</option>
                  <option value="ble">Bluetooth LE</option>
                </select>
              </Field>
            </div>
          </fieldset>
        </section>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => setForm(INITIAL)}
            className="px-4 py-2 rounded-md bg-surface-container-lowest ghost-border text-on-surface font-medium text-sm hover:bg-surface-container-low transition-colors"
          >
            Reset
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2 rounded-md primary-gradient text-on-primary font-medium text-sm flex items-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <span className="material-symbols-outlined text-[18px] animate-spin">
                  progress_activity
                </span>
                Saving…
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[18px]">
                  save
                </span>
                Commit Record
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider text-secondary font-semibold mb-1.5">
        {label}
        {required && <span className="text-error ml-1">*</span>}
      </span>
      {children}
    </label>
  );
}
