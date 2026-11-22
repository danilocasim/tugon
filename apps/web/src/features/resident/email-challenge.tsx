"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { useT } from "./lang";

declare global {
  interface Window {
    turnstile?: {
      render: (target: HTMLElement, options: {
        sitekey: string;
        action: string;
        size: "compact";
        appearance: "interaction-only";
        "response-field": false;
        callback: (token: string) => void;
        "expired-callback": () => void;
        "error-callback": () => void;
      }) => string;
      remove: (id: string) => void;
    };
  }
}

export function EmailChallenge({ siteKey, action, onToken }: { siteKey: string; action: string; onToken: (token: string | null) => void }) {
  const { t } = useT();
  const target = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!ready || !target.current || !window.turnstile) return;
    const widget = window.turnstile;
    const id = widget.render(target.current, {
      sitekey: siteKey,
      action,
      size: "compact",
      appearance: "interaction-only",
      "response-field": false,
      callback(token) {
        setFailed(false);
        onToken(token);
      },
      "expired-callback": () => onToken(null),
      "error-callback": () => {
        onToken(null);
        setFailed(true);
      },
    });
    return () => widget.remove(id);
  }, [action, onToken, ready, siteKey]);

  return (
    <div>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" onReady={() => setReady(true)} onError={() => setFailed(true)} />
      <div ref={target} />
      {failed && <p role="alert" className="text-[13.5px] font-semibold text-high">{t("signin.challengeUnavailable")}</p>}
    </div>
  );
}
