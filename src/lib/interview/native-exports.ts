import { Capacitor, registerPlugin } from "@capacitor/core";

interface NativeInterviewPlugin {
  isBiometricAvailable(): Promise<{ available: boolean; reason?: string }>;
  authenticateBiometric(): Promise<{ authenticated: boolean }>;
  savePdf(options: { fileName: string; html: string }): Promise<{ uri: string }>;
  sharePdf(options: { fileName: string; html: string }): Promise<{ chooserOpened: boolean }>;
  saveFile(options: { fileName: string; mimeType: string; data: string }): Promise<{ uri: string; fileName: string }>;
}
const NativeInterview = registerPlugin<NativeInterviewPlugin>("NativeInterview");

export function isNativeAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export async function biometricAvailable(): Promise<boolean> {
  if (!isNativeAndroid()) return false;
  try { return (await NativeInterview.isBiometricAvailable()).available; }
  catch { return false; }
}

export async function authenticateBiometric(): Promise<boolean> {
  if (!isNativeAndroid()) return false;
  const result = await NativeInterview.authenticateBiometric();
  return result.authenticated;
}

export async function savePdfToPublicStorage(fileName: string, html: string): Promise<string> {
  if (!isNativeAndroid()) throw new Error("ذخیره در پوشه عمومی فقط در نسخه اندروید پشتیبانی می‌شود.");
  return (await NativeInterview.savePdf({ fileName, html })).uri;
}

export async function sharePdf(fileName: string, html: string): Promise<void> {
  if (!isNativeAndroid()) throw new Error("اشتراک‌گذاری بومی فقط در نسخه اندروید پشتیبانی می‌شود.");
  const result = await NativeInterview.sharePdf({ fileName, html });
  if (!result.chooserOpened) throw new Error("منوی اشتراک‌گذاری باز نشد.");
}


/** Opens Android's system "Create document" picker and writes the selected export there. */
export async function saveFileWithPicker(fileName: string, mimeType: string, base64Data: string): Promise<string> {
  if (!isNativeAndroid()) throw new Error("انتخاب پوشه ذخیره فقط در نسخه اندروید پشتیبانی می‌شود.");
  const result = await NativeInterview.saveFile({ fileName, mimeType, data: base64Data });
  return result.uri;
}
