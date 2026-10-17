import { Capacitor, registerPlugin } from "@capacitor/core";

interface NativeInterviewPlugin {
  isBiometricAvailable(): Promise<{ available: boolean; reason?: string }>;
  authenticateBiometric(): Promise<{ authenticated: boolean }>;
  savePdf(options: { fileName: string; html: string }): Promise<{ uri: string }>;
  sharePdf(options: { fileName: string; html: string }): Promise<{ shared: boolean }>;
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
  await NativeInterview.sharePdf({ fileName, html });
}
