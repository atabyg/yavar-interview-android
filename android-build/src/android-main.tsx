import "./styles.css";
import { createRoot } from "react-dom/client";
import { Workstation } from "@/components/interview/workstation";
import { installNativeBridge } from "./native-bridge";

installNativeBridge();

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(<Workstation />);
}
