import "./styles/global.css";
import { createDistributionApp } from "./app/createDistributionApp.js";

const app = createDistributionApp(document);

app.init().catch((error) => {
  console.error("Failed to initialize app", error);
});
