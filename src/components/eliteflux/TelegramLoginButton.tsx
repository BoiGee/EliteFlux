import { useEffect, useRef } from "react";

export interface TelegramAuthPayload {
  id: string | number;
  auth_date: string | number;
  hash: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}

let counter = 0;

/**
 * Official Telegram Login widget. The script injects an iframe button and
 * calls a global callback with the signed payload, which we hand straight
 * to the server for verification.
 */
export function TelegramLoginButton({
  botUsername,
  onAuth,
  authUrl,
  radius = 8,
}: {
  botUsername: string;
  onAuth?: (payload: TelegramAuthPayload) => void;
  /** When set, Telegram redirects here with the signed payload instead of calling back into the page. */
  authUrl?: string;
  radius?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const handler = useRef(onAuth);
  handler.current = onAuth;

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    const cbName = `__tgAuth${++counter}`;
    if (!authUrl) {
      (window as unknown as Record<string, unknown>)[cbName] = (user: TelegramAuthPayload) =>
        handler.current?.(user);
    }

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-userpic", "false");
    script.setAttribute("data-radius", String(radius));
    script.setAttribute("data-request-access", "write");
    if (authUrl) {
      script.setAttribute("data-auth-url", authUrl);
    } else {
      script.setAttribute("data-onauth", `${cbName}(user)`);
    }
    host.appendChild(script);

    return () => {
      host.innerHTML = "";
      delete (window as unknown as Record<string, unknown>)[cbName];
    };
  }, [botUsername, radius, authUrl]);


  return <div ref={ref} className="flex justify-center [&_iframe]:!w-full" />;
}
