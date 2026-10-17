import { InterviewProvider } from "@/components/interview/context";
import { LockScreen, TopBar, WorkspaceScreen } from "@/components/interview/views";
import { useInterview } from "@/components/interview/context";

function Frame() {
  const { state } = useInterview();
  if (!state.unlocked) return <LockScreen />;
  return (
    <div className="min-h-dvh bg-bg text-ink">
      <TopBar />
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
