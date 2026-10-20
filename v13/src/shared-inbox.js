// Receives text / .txt / .docx shared from other Android apps (Share or Open-with).
import { Capacitor, registerPlugin } from "@capacitor/core";

export const SharedInbox = registerPlugin("SharedInbox");

export async function startSharedInbox(onPayload) {
  if (!Capacitor.isNativePlatform()) return () => {};
  const pull = async () => {
    try {
      const p = await SharedInbox.consume();
      if (p && (p.text || p.base64 || p.error)) onPayload(p);
    } catch (e) { /* plugin not installed in this build */ }
  };
  let handle = null;
  try { handle = await SharedInbox.addListener("sharedContent", pull); } catch (e) { /* ignore */ }
  await pull();
  return () => { try { if (handle) handle.remove(); } catch (e) { /* ignore */ } };
}
