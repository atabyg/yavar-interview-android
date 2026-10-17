import { InterviewProvider, useInterview } from "@/components/interview/context";
import { LockScreen, WorkspaceScreen } from "@/components/interview/views";
import { V5Toolbar } from "@/components/interview/v5-shell";

function Frame() {
  const { state } = useInterview();
  if (!state.unlocked) return <LockScreen />;
  return (
    <div dir="rtl" className="min-h-dvh bg-bg text-ink">
      <V5Toolbar />
      <main className="mx-auto w-full max-w-3xl px-4 pb-16">
        <WorkspaceScreen />
      </main>
    </div>
  );
}

export function Workstation() {
  return (
    <InterviewProvider>
      <Frame />
    </InterviewProvider>
  );
}
