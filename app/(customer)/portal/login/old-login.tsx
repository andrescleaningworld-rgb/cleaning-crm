"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { BigButton, ErrorBox, Field, Screen } from "@/app/ui";

export default function PortalLoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [portalCode, setPortalCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/portal/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), portalCode: portalCode.trim() }),
      });

      const data = (await res.json()) as { success?: boolean; accountName?: string; error?: string };

      if (!res.ok || !data.success) {
        setError(data.error ?? "Invalid portal code");
        return;
      }

      router.push("/portal/dashboard");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen title="Customer Portal" subtitle="Sign in with your phone number and portal code">
      <div className="ui-portal-brand">
        <Image
          src="/logo-CW-single-phone-optimized.png"
          alt="Cleaning World"
          width={64}
          height={64}
          priority
        />
        <p className="ui-strong">Cleaning World</p>
      </div>

      <form onSubmit={handleSubmit} className="ui-stack" noValidate>
        <Field
          id="phone"
          label="Phone Number"
          type="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="e.g. (201) 555-1234"
        />
        <Field
          id="portalCode"
          label="Portal Code"
          hint="Your portal code was provided by Cleaning World."
          type="text"
          autoComplete="off"
          autoCapitalize="characters"
          value={portalCode}
          onChange={(e) => setPortalCode(e.target.value)}
          placeholder="e.g. CW-AB123"
        />

        {error ? <ErrorBox title={error} /> : null}

        <div className="ui-actionbar">
          <BigButton type="submit" busy={loading} busyLabel="Signing in…">
            Sign In
          </BigButton>
        </div>
      </form>

      <p className="ui-muted">Need help? Contact your Cleaning World service representative.</p>
    </Screen>
  );
}
