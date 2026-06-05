import { RoomsShellContent } from "@/components/rooms/RoomsShellContent";
import { ToastProvider } from "@/components/ui/toast";

export default function RoomsShell() {
  return (
    <ToastProvider>
      <RoomsShellContent />
    </ToastProvider>
  );
}
